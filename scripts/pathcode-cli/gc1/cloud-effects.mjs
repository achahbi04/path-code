/**
 * Phase GC1-c — one backend covering workspace + process effects.
 *
 * Primary localPrimaryRoot is NEVER written.
 * Local writes target taskWorkspaceRoot only, then publish to remote.
 * Process observations never fall back to local spawn.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve, relative, isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";

import { DEFAULT_REMOTE_ROOT } from "./workspace-hydrator.mjs";
import {
  assertNoCredentialCanaries,
  installRemoteWorker,
  invokeRemoteWorker,
  toProcessObservation,
  REMOTE_WORKER_VERSION,
} from "./remote-worker.mjs";
import { GC1C_ERROR } from "./cloud-constants.mjs";
import { normalizeHydrationRelativePath } from "./task-snapshot.mjs";

/**
 * @param {{
 *   transport: object,
 *   workstationName: string,
 *   remoteRoot?: string,
 *   taskWorkspaceRoot: string,
 *   localPrimaryRoot: string,
 *   journal?: object,
 *   taskId?: string,
 *   sessionId?: string,
 *   workerInstallReceipt?: object,
 *   ownersDistEditingHostDeps?: object,
 *   scriptedProcessResults?: object[],
 * }} opts
 */
export function createCloudEffectsBackend(opts) {
  const transport = opts.transport;
  const workstationName = opts.workstationName;
  const remoteRoot = String(opts.remoteRoot || DEFAULT_REMOTE_ROOT).replace(/\/+$/, "");
  const taskWorkspaceRoot = resolve(String(opts.taskWorkspaceRoot));
  const localPrimaryRoot = resolve(String(opts.localPrimaryRoot));
  const journal = opts.journal ?? null;
  const taskId = opts.taskId ?? null;
  const sessionId = opts.sessionId || taskId || "default";

  if (!transport) throw new Error("createCloudEffectsBackend requires transport");
  if (!workstationName) throw new Error("createCloudEffectsBackend requires workstationName");
  if (!opts.taskWorkspaceRoot) {
    throw new Error("createCloudEffectsBackend requires taskWorkspaceRoot");
  }
  if (!opts.localPrimaryRoot) {
    throw new Error("createCloudEffectsBackend requires localPrimaryRoot");
  }
  if (taskWorkspaceRoot === localPrimaryRoot) {
    throw new Error("taskWorkspaceRoot must not equal localPrimaryRoot");
  }

  /** @type {object[]} */
  const publishLog = [];
  /** @type {object[]} */
  const processLog = [];
  /** @type {object[]} */
  const writeOrder = [];
  /** @type {object|null} */
  let workerReceipt = opts.workerInstallReceipt
    ? { ...opts.workerInstallReceipt }
    : null;
  /** @type {object[]} */
  const scriptedProcessResults = Array.isArray(opts.scriptedProcessResults)
    ? [...opts.scriptedProcessResults]
    : [];

  function assertNotPrimary(absPath) {
    const rel = relative(localPrimaryRoot, absPath);
    if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) {
      const err = new Error(
        `${GC1C_ERROR.PRIMARY_WRITE_REFUSED}: refused write under primary ${localPrimaryRoot}`,
      );
      err.code = GC1C_ERROR.PRIMARY_WRITE_REFUSED;
      throw err;
    }
  }

  function normalizeRel(relativePath) {
    const norm = normalizeHydrationRelativePath(relativePath);
    if (!norm.ok) {
      const err = new Error(norm.detail);
      err.code = norm.code;
      throw err;
    }
    return norm.path;
  }

  async function ensureWorker() {
    if (workerReceipt?.remotePath && workerReceipt?.sha256) {
      return workerReceipt;
    }
    workerReceipt = await installRemoteWorker(transport, {
      workstationName,
      sessionId,
      taskId,
    });
    return workerReceipt;
  }

  function workerInvokeOpts(extra = {}) {
    if (!workerReceipt?.remotePath) {
      const err = new Error("worker install receipt missing remotePath");
      err.code = "GC1_REMOTE_RUNTIME_PATH_REFUSED";
      throw err;
    }
    return {
      workstationName,
      installReceipt: workerReceipt,
      workerRemotePath: workerReceipt.remotePath,
      expectedSha256: workerReceipt.sha256,
      sessionId,
      taskId,
      ...extra,
    };
  }

  /**
   * @param {string} relativePath
   * @param {Buffer|Uint8Array|string} bytes
   */
  async function publishFile(relativePath, bytes) {
    await ensureWorker();
    const rel = normalizeRel(relativePath);
    const buf = Buffer.isBuffer(bytes)
      ? bytes
      : typeof bytes === "string"
        ? Buffer.from(bytes, "utf8")
        : Buffer.from(bytes);

    // Optional local mirror under task workspace (never primary).
    const localAbs = join(taskWorkspaceRoot, ...rel.split("/"));
    assertNotPrimary(localAbs);
    mkdirSync(dirname(localAbs), { recursive: true });
    writeFileSync(localAbs, buf);

    const request = {
      op: "writeFile",
      root: remoteRoot,
      path: rel,
      bytesBase64: buf.toString("base64"),
    };
    assertNoCredentialCanaries(request);
    if (journal && taskId) {
      journal.appendEvent(taskId, "dispatch.intent", {
        kind: "publishFile",
        path: rel,
        byteLength: buf.length,
      });
    }
    const response = await invokeRemoteWorker(transport, {
      ...workerInvokeOpts(),
      request,
    });
    if (!response?.ok) {
      const err = new Error(
        response?.error?.message || "remote publish failed",
      );
      err.code = GC1C_ERROR.REMOTE_PUBLISH_FAILED;
      err.response = response;
      throw err;
    }
    publishLog.push({ relativePath: rel, byteLength: buf.length, atMs: Date.now() });
    return { ok: true, relativePath: rel, byteLength: buf.length };
  }

  /**
   * @param {string} relativePath
   */
  async function readAuthoritative(relativePath) {
    await ensureWorker();
    const rel = normalizeRel(relativePath);
    const request = {
      op: "readFile",
      root: remoteRoot,
      path: rel,
    };
    assertNoCredentialCanaries(request);
    const response = await invokeRemoteWorker(transport, {
      ...workerInvokeOpts(),
      request,
    });
    if (!response?.ok) {
      const err = new Error(response?.error?.message || "remote read failed");
      err.code = "REMOTE_READ_FAILED";
      err.response = response;
      throw err;
    }
    const buf = Buffer.from(String(response.result.bytesBase64 || ""), "base64");
    return {
      relativePath: rel,
      bytes: buf,
      byteLength: buf.length,
      sha256: response.result.sha256,
      text: buf.toString("utf8"),
    };
  }

  /**
   * Remap local cwd under task/primary roots onto remoteRoot.
   * Refuse absolute Mac paths and model-looking injection.
   * @param {import("../../../src/execution/internal/observation-runner.ts").ProcessObservationRequest} observationRequest
   */
  async function runProcess(observationRequest) {
    await ensureWorker();
    const req = observationRequest;
    const remapped = {
      ...req,
      executable: remapExecutable(req.executable, {
        localPrimaryRoot,
        taskWorkspaceRoot,
        remoteRoot,
      }),
      argv: remapArgv(req.argv ?? [], {
        localPrimaryRoot,
        taskWorkspaceRoot,
        remoteRoot,
      }),
      cwd: remapCwd(req.cwd, {
        localPrimaryRoot,
        taskWorkspaceRoot,
        remoteRoot,
      }),
    };
    // Refuse after remap — host toolchain paths are translated; leftover
    // unre-mapped /Users paths are still injection.
    refuseModelInjection(remapped, {
      localPrimaryRoot,
      taskWorkspaceRoot,
      remoteRoot,
    });

    const remoteCwd = remapped.cwd;
    const env = sanitizeRemoteEnv(req.env);
    assertNoCredentialCanaries({
      executable: remapped.executable,
      argv: remapped.argv,
      cwd: remoteCwd,
      env,
    });

    /** @type {Record<string, unknown>} */
    const request = {
      op: "runProcess",
      root: remoteRoot,
      executable: remapped.executable,
      argv: [...remapped.argv],
      cwd: remoteCwd,
      env,
      timeoutMs: req.timeoutMs,
      maxStdoutBytes: req.maxStdoutBytes,
      maxStderrBytes: req.maxStderrBytes,
    };

    if (scriptedProcessResults.length > 0) {
      const scripted = scriptedProcessResults.shift();
      Object.assign(request, {
        _mockExitCode: scripted.exitCode,
        _mockStdout: scripted.stdout,
        _mockStderr: scripted.stderr,
        _mockSignal: scripted.signal,
        _mockStdoutTruncated: scripted.stdoutTruncated,
        _mockStderrTruncated: scripted.stderrTruncated,
        _mockTimedOut: scripted.timedOut,
      });
      if (typeof transport.setWorkerProcessScript === "function") {
        transport.setWorkerProcessScript(scripted);
      }
    }

    if (journal && taskId) {
      journal.appendEvent(taskId, "dispatch.intent", {
        kind: "runProcess",
        executable: request.executable,
        argv: request.argv,
        cwd: remoteCwd,
      });
    }

    processLog.push({ request, atMs: Date.now() });
    const response = await invokeRemoteWorker(transport, {
      ...workerInvokeOpts(),
      request,
    });
    if (!response?.ok) {
      const err = new Error(response?.error?.message || "remote process failed");
      err.code = "REMOTE_PROCESS_FAILED";
      err.response = response;
      throw err;
    }
    return toProcessObservation(response.result, {
      startedAtMs: response.result?.startedAtMs,
    });
  }

  /**
   * Preferred write-effects approach:
   * 1. production local writes against taskWorkspaceRoot only (never primary)
   * 2. after successful local write, publish same bytes to remote via worker
   * 3. remote publish failure → WRITE_OUTCOME_UNCONFIRMED-style failure
   *
   * @param {object} hostDeps editing barrel and/or host-dependencies exports
   */
  function createProjectWriteEffects(hostDeps) {
    const deps = resolveHostDeps(hostDeps);

    const replaceExistingFile = async (authorization, prepared) => {
      writeOrder.push({
        op: "replaceExistingFile",
        atMs: Date.now(),
        path: prepared?.target?.relativePath,
      });
      assertPreparedNotPrimary(prepared, localPrimaryRoot, taskWorkspaceRoot);
      const result = await deps.replaceExistingFile(authorization, prepared);
      if (result?.outcome === "SUCCESS") {
        try {
          const rel = prepared.target.relativePath;
          const bytes =
            prepared.proposedBytes != null
              ? Buffer.from(prepared.proposedBytes)
              : readFileSync(join(taskWorkspaceRoot, ...rel.split("/")));
          await publishFile(rel, bytes);
        } catch (e) {
          const err = new Error(
            `WRITE_OUTCOME_UNCONFIRMED: remote publish failed after local write: ${e.message}`,
          );
          err.code = "WRITE_OUTCOME_UNCONFIRMED";
          err.cause = e;
          throw err;
        }
      }
      return result;
    };

    const createFile = async (authorization, prepared) => {
      writeOrder.push({
        op: "createFile",
        atMs: Date.now(),
        path: prepared?.target?.relativePath,
      });
      assertPreparedNotPrimary(prepared, localPrimaryRoot, taskWorkspaceRoot);
      const result = await deps.createFile(authorization, prepared);
      if (result?.outcome === "SUCCESS") {
        try {
          const rel = prepared.target.relativePath;
          const bytes =
            prepared.proposedBytes != null
              ? Buffer.from(prepared.proposedBytes)
              : readFileSync(join(taskWorkspaceRoot, ...rel.split("/")));
          await publishFile(rel, bytes);
        } catch (e) {
          const err = new Error(
            `WRITE_OUTCOME_UNCONFIRMED: remote publish failed after local create: ${e.message}`,
          );
          err.code = "WRITE_OUTCOME_UNCONFIRMED";
          err.cause = e;
          throw err;
        }
      }
      return result;
    };

    /** @type {object} */
    const effects = { replaceExistingFile, createFile };
    if (typeof deps.executeMultiFilePlan === "function") {
      effects.executeMultiFilePlan = async (plan, options) => {
        writeOrder.push({ op: "executeMultiFilePlan", atMs: Date.now() });
        return deps.executeMultiFilePlan(plan, options);
      };
    }
    return effects;
  }

  function createProcessObservationRunner() {
    return async (observationRequest) => runProcess(observationRequest);
  }

  /**
   * AuthoritativeContentReader compatible with mutation session.
   */
  function createAuthoritativeContentReader(owners) {
    return async (workspace, config, relativePath, _options) => {
      // Prefer remote; fall back to task workspace mirror if remote lags.
      try {
        const remote = await readAuthoritative(relativePath);
        // Reuse owners.readRepositoryContent against task workspace when available
        // so observation typing stays authentic — here we synthesize a thin result
        // only when owners is absent (unit tests).
        if (owners?.readRepositoryContent) {
          const inventoryEntry = findEntry(workspace, relativePath);
          if (inventoryEntry) {
            return owners.readRepositoryContent(inventoryEntry, workspace, config);
          }
        }
        return {
          ok: true,
          value: {
            kind: "TEXT",
            status: "READ",
            relativePath,
            text: remote.text,
            byteLength: remote.byteLength,
            sha256: remote.sha256,
          },
        };
      } catch (e) {
        return {
          ok: false,
          error: { code: e.code || "REMOTE_READ_FAILED", message: e.message },
        };
      }
    };
  }

  return {
    remoteRoot,
    taskWorkspaceRoot,
    localPrimaryRoot,
    workstationName,
    workerVersion: REMOTE_WORKER_VERSION,
    publishFile,
    readAuthoritative,
    runProcess,
    createProjectWriteEffects,
    createProcessObservationRunner,
    createAuthoritativeContentReader,
    ensureWorker,
    getWorkerInstallReceipt: () =>
      workerReceipt ? { ...workerReceipt } : null,
    getPublishLog: () => [...publishLog],
    getProcessLog: () => [...processLog],
    getWriteOrder: () => [...writeOrder],
  };
}

function resolveHostDeps(hostDeps) {
  if (!hostDeps) {
    throw new Error("createProjectWriteEffects requires ownersDistEditingHostDeps");
  }
  const replaceExistingFile =
    hostDeps.replaceExistingFile ??
    (hostDeps.replaceExistingFileWithDependencies
      ? (auth, prepared) =>
          hostDeps.replaceExistingFileWithDependencies(auth, prepared, {
            fsOps: hostDeps.productionAtomicReplaceFs,
          })
      : null);
  const createFile =
    hostDeps.createFile ??
    (hostDeps.createFileWithDependencies
      ? (auth, prepared) =>
          hostDeps.createFileWithDependencies(auth, prepared, {
            fsOps: hostDeps.productionAtomicCreateFs,
          })
      : null);
  if (typeof replaceExistingFile !== "function" || typeof createFile !== "function") {
    throw new Error(
      "createProjectWriteEffects requires replaceExistingFile and createFile",
    );
  }
  return {
    replaceExistingFile,
    createFile,
    executeMultiFilePlan: hostDeps.executeMultiFilePlan,
  };
}

function assertPreparedNotPrimary(prepared, localPrimaryRoot, taskWorkspaceRoot) {
  const root = prepared?.workspace?.rootDirectory || prepared?.workspaceRoot;
  if (!root) return;
  const resolved = resolve(String(root));
  if (resolved === resolve(localPrimaryRoot)) {
    const err = new Error(
      `${GC1C_ERROR.PRIMARY_WRITE_REFUSED}: prepared write targets primary`,
    );
    err.code = GC1C_ERROR.PRIMARY_WRITE_REFUSED;
    throw err;
  }
  // Soft check: prefer task workspace.
  void taskWorkspaceRoot;
}

/**
 * @param {object} req
 * @param {{ localPrimaryRoot: string, taskWorkspaceRoot: string, remoteRoot: string }} ctx
 */
export function refuseModelInjection(req, ctx) {
  const exe = String(req.executable ?? "");
  const cwd = String(req.cwd ?? "");
  const argv = req.argv ?? [];

  // Absolute Mac /Users paths that aren't remapped roots look like injection.
  const suspicious = [exe, cwd, ...argv].filter(
    (s) => typeof s === "string" && /^\/Users\//.test(s),
  );
  for (const s of suspicious) {
    const remapped =
      s === ctx.localPrimaryRoot ||
      s === ctx.taskWorkspaceRoot ||
      s.startsWith(`${ctx.localPrimaryRoot}/`) ||
      s.startsWith(`${ctx.taskWorkspaceRoot}/`);
    if (!remapped) {
      const err = new Error(
        `${GC1C_ERROR.MODEL_INJECTION}: refused unre-mapped local path ${s}`,
      );
      err.code = GC1C_ERROR.MODEL_INJECTION;
      throw err;
    }
  }

  if (typeof req.backend === "string" || typeof req.workstationName === "string") {
    const err = new Error(
      `${GC1C_ERROR.MODEL_INJECTION}: backend/workstation fields are host-owned`,
    );
    err.code = GC1C_ERROR.MODEL_INJECTION;
    throw err;
  }

  // Refuse shell metacharacters in executable when it looks model-supplied.
  if (/[;&|`$]/.test(exe)) {
    const err = new Error(
      `${GC1C_ERROR.MODEL_INJECTION}: executable contains shell metacharacters`,
    );
    err.code = GC1C_ERROR.MODEL_INJECTION;
    throw err;
  }
}

export function remapCwd(cwd, ctx) {
  const c = resolve(String(cwd));
  if (c === resolve(ctx.taskWorkspaceRoot) || c.startsWith(`${resolve(ctx.taskWorkspaceRoot)}/`)) {
    const rel = relative(ctx.taskWorkspaceRoot, c).replace(/\\/g, "/");
    return rel === "" ? ctx.remoteRoot : `${ctx.remoteRoot}/${rel}`;
  }
  if (c === resolve(ctx.localPrimaryRoot) || c.startsWith(`${resolve(ctx.localPrimaryRoot)}/`)) {
    const rel = relative(ctx.localPrimaryRoot, c).replace(/\\/g, "/");
    return rel === "" ? ctx.remoteRoot : `${ctx.remoteRoot}/${rel}`;
  }
  if (c === ctx.remoteRoot || c.startsWith(`${ctx.remoteRoot}/`)) {
    return c;
  }
  // Already a linux path under /home/user
  if (c.startsWith("/home/user/")) {
    return c;
  }
  const err = new Error(
    `${GC1C_ERROR.MODEL_INJECTION}: cwd cannot be remapped: ${cwd}`,
  );
  err.code = GC1C_ERROR.MODEL_INJECTION;
  throw err;
}

/** NodeSource image pin — remote validation must not keep Mac host node paths. */
export const REMOTE_NODE_EXECUTABLE = "/usr/bin/node";
/** Typical npm-cli.js on the Engineering Image (NodeSource + npm). */
export const REMOTE_NPM_CLI_JS = "/usr/lib/node_modules/npm/bin/npm-cli.js";

/**
 * True when `path` looks like a host (Mac/nvm/homebrew) Node binary rather than
 * a project-local or already-remote executable.
 * @param {string} exe
 */
export function isHostNodeExecutable(exe) {
  const p = String(exe);
  if (p === REMOTE_NODE_EXECUTABLE) return false;
  const base = p.split("/").pop();
  if (base !== "node" && base !== "nodejs") return false;
  return (
    p.startsWith("/Users/") ||
    p.startsWith("/opt/homebrew/") ||
    p.includes("/Cellar/node/") ||
    p.includes("/.nvm/") ||
    p.includes("/.fnm/") ||
    p.includes("/.volta/") ||
    p.includes("/.asdf/") ||
    p.startsWith("/usr/local/bin/node") ||
    p.startsWith("/usr/local/opt/node")
  );
}

/**
 * True when `path` is a host npm CLI entry that must become the image npm.
 * @param {string} path
 */
export function isHostNpmCliJs(path) {
  const p = String(path).replace(/\\/g, "/");
  if (!/(?:^|\/)npm-cli\.js$/.test(p) && !/\/npm\/lib\/cli\.js$/.test(p)) {
    return false;
  }
  // Project-local npm under task/primary is remapped via roots, not this helper.
  return (
    p.startsWith("/Users/") ||
    p.startsWith("/opt/homebrew/") ||
    p.includes("/Cellar/") ||
    p.includes("/.nvm/") ||
    p.includes("/.fnm/") ||
    p.includes("/.volta/") ||
    p.includes("/.asdf/") ||
    p.startsWith("/usr/local/lib/node_modules/npm/") ||
    p.startsWith("/usr/local/libexec/lib/node_modules/npm/")
  );
}

/**
 * Remap one absolute path argument onto the remote workspace / toolchain.
 * @param {string} value
 * @param {{ localPrimaryRoot: string, taskWorkspaceRoot: string, remoteRoot: string }} ctx
 */
export function remapPathArgument(value, ctx) {
  const p = String(value);
  if (!isAbsolute(p)) return p;
  if (isHostNodeExecutable(p)) return REMOTE_NODE_EXECUTABLE;
  if (isHostNpmCliJs(p)) return REMOTE_NPM_CLI_JS;
  const taskRoot = resolve(ctx.taskWorkspaceRoot);
  const primaryRoot = resolve(ctx.localPrimaryRoot);
  const resolved = resolve(p);
  if (resolved === taskRoot || resolved.startsWith(`${taskRoot}/`)) {
    const rel = relative(taskRoot, resolved).replace(/\\/g, "/");
    return rel === "" ? ctx.remoteRoot : `${ctx.remoteRoot}/${rel}`;
  }
  if (resolved === primaryRoot || resolved.startsWith(`${primaryRoot}/`)) {
    const rel = relative(primaryRoot, resolved).replace(/\\/g, "/");
    return rel === "" ? ctx.remoteRoot : `${ctx.remoteRoot}/${rel}`;
  }
  if (resolved === ctx.remoteRoot || resolved.startsWith(`${ctx.remoteRoot}/`)) {
    return resolved;
  }
  if (resolved.startsWith("/home/user/") || resolved.startsWith("/usr/")) {
    return resolved;
  }
  return p;
}

/**
 * @param {readonly string[]} argv
 * @param {{ localPrimaryRoot: string, taskWorkspaceRoot: string, remoteRoot: string }} ctx
 */
export function remapArgv(argv, ctx) {
  return argv.map((arg) =>
    typeof arg === "string" && isAbsolute(arg) ? remapPathArgument(arg, ctx) : arg,
  );
}

export function remapExecutable(executable, ctx) {
  const exe = String(executable);
  if (isHostNodeExecutable(exe)) {
    return REMOTE_NODE_EXECUTABLE;
  }
  // Node/npm absolute paths under Mac project are remapped when under roots.
  if (exe.startsWith(ctx.taskWorkspaceRoot) || exe.startsWith(ctx.localPrimaryRoot)) {
    const base = exe.startsWith(ctx.taskWorkspaceRoot)
      ? ctx.taskWorkspaceRoot
      : ctx.localPrimaryRoot;
    const rel = relative(base, exe).replace(/\\/g, "/");
    return `${ctx.remoteRoot}/${rel}`;
  }
  if (!isAbsolute(exe)) {
    const err = new Error("executable must be absolute");
    err.code = "BAD_EXECUTABLE";
    throw err;
  }
  // System executables on the Engineering Image (/usr/bin/node, /usr/bin/true, …).
  return exe;
}

function sanitizeRemoteEnv(env) {
  /** @type {Record<string, string>} */
  const out = {};
  if (!env || typeof env !== "object") return out;
  const forbiddenKeys = new Set([
    "OPENAI_API_KEY",
    "PATHCODE_OPENAI_API_KEY",
    "PATHCODE_LIVE_OPENAI",
    "PATHCODE_GC1C_SECRET_CANARY",
  ]);
  for (const [k, v] of Object.entries(env)) {
    if (typeof k !== "string" || typeof v !== "string") continue;
    if (forbiddenKeys.has(k)) continue;
    if (/KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|OPENAI|ADC|GOOGLE_APPLICATION/i.test(k)) {
      continue;
    }
    if (/GC1_CANARY_SECRET|PATHCODE_GC1C_SECRET_CANARY/.test(v)) continue;
    out[k] = v;
  }
  return out;
}

export { sanitizeRemoteEnv };

function findEntry(_workspace, _relativePath) {
  return null;
}

/** Lazy loader for dist editing host-dependencies (CLI checkout). */
export async function loadEditingHostDependencies(checkoutRoot) {
  const href = pathToFileURL(
    join(checkoutRoot, "dist/editing/host-dependencies.js"),
  ).href;
  const atomicHref = pathToFileURL(
    join(checkoutRoot, "dist/editing/atomic-fs.js"),
  ).href;
  const [host, atomic] = await Promise.all([
    import(href),
    import(atomicHref),
  ]);
  return {
    ...host,
    productionAtomicReplaceFs: atomic.productionAtomicReplaceFs,
    productionAtomicCreateFs: atomic.productionAtomicCreateFs,
  };
}
