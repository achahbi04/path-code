/**
 * Build product runtime manager — detect, start, stop, health, preview descriptor.
 * Reuses PATH process-registry ownership keyed by build-runtime:<buildId>.
 */

import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  registerProcess,
  killProcessTree,
  markProcessEnded,
  isProcessRecordAlive,
} from "../../process-registry.mjs";
import {
  detectBuildArtifact,
  resolveArtifactStartPlan,
} from "./artifact.mjs";
import { startStaticPreviewServer } from "./static-serve.mjs";

/**
 * @param {number} [from]
 */
export async function findFreePort(from = 4173) {
  const tryPort = (port) =>
    new Promise((resolve) => {
      const s = createServer();
      s.unref();
      s.on("error", () => resolve(null));
      s.listen(port, "127.0.0.1", () => {
        const p = /** @type {import('node:net').AddressInfo} */ (s.address()).port;
        s.close(() => resolve(p));
      });
    });
  for (let i = 0; i < 40; i += 1) {
    const p = await tryPort(from + i);
    if (typeof p === "number") return p;
  }
  const p = await tryPort(0);
  if (typeof p === "number") return p;
  throw new Error("No free port for Build preview runtime");
}

/**
 * @param {string} url
 * @param {number} [timeoutMs]
 * @param {(() => boolean) | null} [shouldAbort]
 */
export async function waitForHttpReady(url, timeoutMs = 45_000, shouldAbort = null) {
  const start = Date.now();
  let lastErr = "";
  while (Date.now() - start < timeoutMs) {
    if (typeof shouldAbort === "function" && shouldAbort()) {
      return { ok: false, error: lastErr || "process_exited", url, aborted: true };
    }
    try {
      const res = await fetch(url, {
        method: "GET",
        signal: AbortSignal.timeout(3_000),
      });
      if (res.status >= 200 && res.status < 500) {
        return { ok: true, status: res.status, url };
      }
      lastErr = `HTTP ${res.status}`;
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return { ok: false, error: lastErr || "timeout", url };
}

/**
 * Parse a listening URL/port from process output.
 * @param {string} chunk
 * @param {number} [fallbackPort]
 */
export function parseReadyUrl(chunk, fallbackPort) {
  const text = String(chunk || "");
  const m =
    text.match(/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d+)\b/i) ||
    text.match(/Local:\s+(https?:\/\/[^\s]+)/i) ||
    text.match(/listening on\s+(?:port\s+)?(\d+)/i);
  if (m) {
    if (m[1].startsWith("http")) {
      return m[1].replace("0.0.0.0", "127.0.0.1");
    }
    const port = Number(m[1]);
    if (Number.isFinite(port)) return `http://127.0.0.1:${port}/`;
  }
  if (typeof fallbackPort === "number") {
    return `http://127.0.0.1:${fallbackPort}/`;
  }
  return null;
}

/**
 * @param {string} runtimeRoot
 */
function runtimesDir(runtimeRoot) {
  return join(runtimeRoot, "metadata", "build-runtimes");
}

/**
 * @param {string} runtimeRoot
 * @param {string} buildId
 */
function runtimeStatePath(runtimeRoot, buildId) {
  const safe = String(buildId).replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
  return join(runtimesDir(runtimeRoot), `${safe}.runtime.json`);
}

/**
 * @param {{ runtimeRoot: string }} opts
 */
export function createBuildRuntimeManager(opts) {
  const runtimeRoot = opts.runtimeRoot;
  /** @type {Map<string, any>} */
  const live = new Map();

  mkdirSync(runtimesDir(runtimeRoot), { recursive: true });

  /**
   * @param {string} buildId
   * @param {object} state
   */
  function persist(buildId, state) {
    try {
      writeFileSync(
        runtimeStatePath(runtimeRoot, buildId),
        `${JSON.stringify(state, null, 2)}\n`,
        "utf8",
      );
    } catch {
      /* best-effort */
    }
  }

  /**
   * @param {string} buildId
   */
  function loadPersisted(buildId) {
    const p = runtimeStatePath(runtimeRoot, buildId);
    if (!existsSync(p)) return null;
    try {
      return JSON.parse(readFileSync(p, "utf8"));
    } catch {
      return null;
    }
  }

  /**
   * @param {string} buildId
   * @param {string} projectRoot
   * @param {{ bindingId?: string, outcomeHint?: string }} [ctx]
   */
  function detect(buildId, projectRoot, ctx = {}) {
    const artifact = detectBuildArtifact(projectRoot, {
      outcomeHint: ctx.outcomeHint,
    });
    artifact.bindingId = ctx.bindingId || "";
    return artifact;
  }

  /**
   * @param {string} buildId
   */
  async function stop(buildId) {
    const cur = live.get(buildId);
    if (!cur) {
      const persisted = loadPersisted(buildId);
      if (persisted) {
        persist(buildId, {
          ...persisted,
          status: "stopped",
          stoppedAt: new Date().toISOString(),
        });
      }
      return { ok: true, stopped: false };
    }
    try {
      if (cur.staticHandle?.stop) await cur.staticHandle.stop();
    } catch {
      /* ignore */
    }
    if (cur.processRecord?.id) {
      try {
        if (cur.processRecord.child) {
          killProcessTree(cur.processRecord.child, "SIGTERM");
        }
        markProcessEnded(cur.processRecord.id, { cleanup: "ok" });
      } catch {
        /* ignore */
      }
    }
    live.delete(buildId);
    const next = {
      runtimeId: cur.runtimeId,
      buildId,
      bindingId: cur.bindingId,
      projectRoot: cur.projectRoot,
      status: "stopped",
      stoppedAt: new Date().toISOString(),
    };
    persist(buildId, next);
    return { ok: true, stopped: true, runtime: next };
  }

  /**
   * @param {string} buildId
   * @param {string} projectRoot
   * @param {{ bindingId?: string, outcomeHint?: string, forceRestart?: boolean }} [ctx]
   */
  async function start(buildId, projectRoot, ctx = {}) {
    const existing = live.get(buildId);
    if (existing && !ctx.forceRestart) {
      const health = await inspect(buildId);
      if (health.ok && health.runtime?.status === "ready") {
        return { ok: true, runtime: health.runtime, reused: true };
      }
    }
    if (existing) await stop(buildId);

    let root = String(projectRoot || "");
    try {
      const { realpathSync } = await import("node:fs");
      root = realpathSync(root);
    } catch {
      /* keep */
    }

    const artifact = detect(buildId, root, ctx);
    if (artifact.preview.capability === "none" || artifact.preview.mode === "none") {
      const state = {
        runtimeId: `rt-${randomUUID().slice(0, 8)}`,
        buildId,
        bindingId: ctx.bindingId || "",
        projectRoot: root,
        status: "unavailable",
        reason: "no_preview_capability",
        artifact,
        startedAt: new Date().toISOString(),
      };
      persist(buildId, state);
      return { ok: false, code: "NO_PREVIEW", runtime: state, artifact };
    }

    const port = await findFreePort(4173);
    const plan = resolveArtifactStartPlan(artifact, { port });
    const runtimeId = `rt-${randomUUID().slice(0, 8)}`;
    const ownerTaskId = `build-runtime:${buildId}`;

    /** @type {any} */
    const entry = {
      runtimeId,
      buildId,
      bindingId: ctx.bindingId || "",
      projectRoot: root,
      artifact,
      plan,
      port,
      url: `http://127.0.0.1:${port}/`,
      status: "starting",
      startedAt: new Date().toISOString(),
      stdout: "",
      stderr: "",
      processRecord: null,
      staticHandle: null,
      ownerTaskId,
    };

    if (plan.kind === "none") {
      entry.status = "unavailable";
      entry.reason = plan.reason || "no_start_plan";
      persist(buildId, entry);
      return { ok: false, code: "NO_START_PLAN", runtime: entry, artifact };
    }

    live.set(buildId, entry);
    persist(buildId, {
      runtimeId,
      buildId,
      bindingId: entry.bindingId,
      projectRoot: root,
      status: "starting",
      port,
      url: entry.url,
      startedAt: entry.startedAt,
      command: plan.cmd ? `${plan.cmd} ${plan.args.join(" ")}` : "static",
    });

    try {
      if (plan.kind === "static") {
        const staticRoot = plan.cwd || root;
        const handle = await startStaticPreviewServer(staticRoot, port);
        entry.staticHandle = handle;
        entry.url = handle.url;
        entry.port = handle.port;
        entry.status = "ready";
        entry.health = "ok";
        entry.staticRoot = staticRoot;
        persist(buildId, {
          runtimeId,
          buildId,
          bindingId: entry.bindingId,
          projectRoot: root,
          staticRoot,
          status: "ready",
          port: entry.port,
          url: entry.url,
          mode: "static",
          startedAt: entry.startedAt,
          command: "static-serve",
        });
        return { ok: true, runtime: snapshot(entry), artifact };
      }

      const child = spawn(plan.cmd, plan.args, {
        cwd: root,
        env: {
          ...process.env,
          ...plan.env,
          CI: "1",
          BROWSER: "none",
          FORCE_COLOR: "0",
        },
        stdio: ["ignore", "pipe", "pipe"],
        detached: process.platform !== "win32",
      });

      const proc = registerProcess({
        taskId: ownerTaskId,
        kind: "build_preview_runtime",
        command: `${plan.cmd} ${plan.args.join(" ")}`.slice(0, 500),
        child,
        runtimeRoot,
      });
      entry.processRecord = proc;

      const onData = (buf, stream) => {
        const chunk = buf.toString("utf8");
        if (stream === "out") entry.stdout = (entry.stdout + chunk).slice(-12_000);
        else entry.stderr = (entry.stderr + chunk).slice(-12_000);
        const parsed = parseReadyUrl(chunk, port);
        if (parsed) entry.url = parsed.endsWith("/") ? parsed : `${parsed}/`;
      };
      child.stdout?.on("data", (b) => onData(b, "out"));
      child.stderr?.on("data", (b) => onData(b, "err"));
      /** @type {number | null} */
      let earlyExitCode = null;
      child.on("exit", (code) => {
        earlyExitCode = typeof code === "number" ? code : 1;
        if (live.get(buildId) === entry) {
          entry.status = "exited";
          entry.exitCode = earlyExitCode;
          persist(buildId, {
            ...snapshot(entry),
            status: "exited",
            exitCode: earlyExitCode,
          });
          live.delete(buildId);
        }
      });

      const ready = await waitForHttpReady(entry.url, 60_000, () => earlyExitCode !== null);
      if (!ready.ok) {
        const exited = earlyExitCode !== null;
        await stop(buildId);
        return {
          ok: false,
          code: exited ? "RUNTIME_EXITED" : "RUNTIME_START_TIMEOUT",
          message: exited
            ? `Preview process exited with code ${earlyExitCode}`
            : ready.error,
          runtime: {
            ...snapshot(entry),
            status: "failed",
            exitCode: earlyExitCode,
            error: exited
              ? `exited(${earlyExitCode})`
              : ready.error,
            stdoutTail: entry.stdout.slice(-2_000),
            stderrTail: entry.stderr.slice(-2_000),
          },
          artifact,
        };
      }

      entry.status = "ready";
      entry.health = "ok";
      persist(buildId, {
        runtimeId,
        buildId,
        bindingId: entry.bindingId,
        projectRoot: root,
        status: "ready",
        port: entry.port,
        url: entry.url,
        mode: "spawn",
        command: `${plan.cmd} ${plan.args.join(" ")}`,
        processId: proc.id,
        pid: proc.pid,
        startedAt: entry.startedAt,
      });
      return { ok: true, runtime: snapshot(entry), artifact };
    } catch (err) {
      await stop(buildId);
      return {
        ok: false,
        code: "RUNTIME_START_FAILED",
        message: err instanceof Error ? err.message : String(err),
        artifact,
      };
    }
  }

  /**
   * @param {any} entry
   */
  function snapshot(entry) {
    return {
      runtimeId: entry.runtimeId,
      buildId: entry.buildId,
      bindingId: entry.bindingId,
      projectRoot: entry.projectRoot,
      status: entry.status,
      port: entry.port,
      url: entry.url,
      mode: entry.plan?.kind || entry.mode,
      command: entry.plan?.cmd
        ? `${entry.plan.cmd} ${entry.plan.args.join(" ")}`
        : entry.plan?.kind === "static"
          ? "static-serve"
          : null,
      startedAt: entry.startedAt,
      health: entry.health || null,
      processId: entry.processRecord?.id || null,
      pid: entry.processRecord?.pid || null,
      artifactKind: entry.artifact?.kind || null,
      framework: entry.artifact?.framework || null,
      error: entry.error || null,
      reason: entry.reason || null,
      exitCode: typeof entry.exitCode === "number" ? entry.exitCode : null,
      stdoutTail: typeof entry.stdout === "string" ? entry.stdout.slice(-2_000) : null,
      stderrTail: typeof entry.stderr === "string" ? entry.stderr.slice(-2_000) : null,
    };
  }

  /**
   * @param {string} buildId
   */
  async function inspect(buildId) {
    const entry = live.get(buildId);
    if (entry) {
      if (entry.status === "ready" && entry.url) {
        const health = await waitForHttpReady(entry.url, 3_000);
        entry.health = health.ok ? "ok" : "down";
        if (!health.ok) entry.status = "unhealthy";
      }
      if (entry.processRecord && !isProcessRecordAlive(entry.processRecord)) {
        entry.status = "exited";
      }
      return { ok: true, runtime: snapshot(entry), live: true };
    }
    const persisted = loadPersisted(buildId);
    if (!persisted) {
      return { ok: true, runtime: null, live: false };
    }
    return {
      ok: true,
      runtime: { ...persisted, status: persisted.status === "ready" ? "stale" : persisted.status },
      live: false,
    };
  }

  /**
   * @param {string} buildId
   */
  function getPreviewDescriptor(buildId) {
    const entry = live.get(buildId);
    if (entry && entry.status === "ready" && entry.url) {
      return {
        capability: "web",
        mode: entry.plan?.kind === "static" ? "static" : "dev_server",
        url: entry.url,
        port: entry.port,
        status: "ready",
        embedPath: `/preview/${encodeURIComponent(buildId)}/`,
      };
    }
    const persisted = loadPersisted(buildId);
    if (persisted?.url && persisted.status === "ready") {
      return {
        capability: "web",
        mode: persisted.mode || "unknown",
        url: persisted.url,
        port: persisted.port,
        status: "stale",
        embedPath: `/preview/${encodeURIComponent(buildId)}/`,
      };
    }
    return {
      capability: entry?.artifact?.preview?.capability || "none",
      mode: "none",
      url: null,
      port: null,
      status: entry?.status || "idle",
      embedPath: null,
    };
  }

  /**
   * @param {string} buildId
   * @param {string} projectRoot
   * @param {{ bindingId?: string, outcomeHint?: string }} [ctx]
   */
  async function refresh(buildId, projectRoot, ctx = {}) {
    return start(buildId, projectRoot, { ...ctx, forceRestart: true });
  }

  async function stopAll() {
    const ids = [...live.keys()];
    for (const id of ids) {
      await stop(id);
    }
  }

  /**
   * @param {string} buildId
   */
  function getLiveTarget(buildId) {
    return live.get(buildId) || null;
  }

  return {
    detect,
    start,
    stop,
    refresh,
    inspect,
    getPreviewDescriptor,
    getLiveTarget,
    stopAll,
    loadPersisted,
  };
}
