/**
 * S3 — Cursor SDK local engineering executor.
 *
 * Runs official `@cursor/sdk` against the PATH task worktree (local cwd).
 * Preserves native stream / steer / cancel / multi-turn. Does not rebuild
 * Cursor's agent loop.
 */

import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { mapCursorSdkEvent, toSessionEvent } from "./events.mjs";
import { withEngineProvenance } from "./engine-contract.mjs";
import {
  reclaimTtyForeground,
  reassertPathTitle,
} from "../terminal-title.mjs";
import { CURSOR_DEFAULT_PROVIDER_MODEL_ID } from "../model-plane/adapters/cursor-catalog.mjs";
import { resolveCursorEngineModel } from "../model-plane/resolver.mjs";
import { resolveProductionEngineModel } from "../model-plane/production-context.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(HERE, "../../..");

/**
 * Read a macOS Keychain generic password (service name).
 * Used for PATH_CURSOR_API_KEY — never logs the secret.
 * @param {string} service
 * @param {string} [account]
 * @returns {string | null}
 */
export function readMacOsKeychainPassword(service, account) {
  if (process.platform !== "darwin") return null;
  const name = String(service || "").trim();
  if (!name) return null;
  try {
    const args = ["find-generic-password", "-s", name, "-w"];
    if (typeof account === "string" && account.trim()) {
      args.splice(1, 0, "-a", account.trim());
    }
    const r = spawnSync("security", args, {
      encoding: "utf8",
      timeout: 5_000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (r.status !== 0) return null;
    const value = String(r.stdout || "").trim();
    return value || null;
  } catch {
    return null;
  }
}

/**
 * Persist API key into macOS Keychain under PATH_CURSOR_API_KEY.
 * @param {string} apiKey
 * @param {{ account?: string, service?: string }} [opts]
 */
export function storeMacOsKeychainPassword(apiKey, opts = {}) {
  if (process.platform !== "darwin") {
    return { ok: false, reason: "not_darwin" };
  }
  const key = String(apiKey || "").trim();
  if (!key) return { ok: false, reason: "empty_key" };
  const service = opts.service || "PATH_CURSOR_API_KEY";
  const account =
    (typeof opts.account === "string" && opts.account.trim()) ||
    process.env.USER ||
    "pathcode";
  try {
    // Delete prior empty/stale item (ignore failure).
    spawnSync(
      "security",
      ["delete-generic-password", "-a", account, "-s", service],
      { encoding: "utf8", timeout: 5_000, stdio: "ignore" },
    );
    const add = spawnSync(
      "security",
      [
        "add-generic-password",
        "-a",
        account,
        "-s",
        service,
        "-w",
        key,
        "-U",
      ],
      { encoding: "utf8", timeout: 5_000, stdio: ["ignore", "pipe", "pipe"] },
    );
    if (add.status !== 0) {
      return {
        ok: false,
        reason: (add.stderr || add.stdout || "add failed").slice(0, 200),
      };
    }
    return { ok: true, service, account };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Read SDK FileCredentialStore (~/.cursor/sdk/auth.json) without logging secrets.
 * @returns {string | null}
 */
export function readCursorSdkAuthFileKey() {
  try {
    const home = process.env.HOME || "";
    if (!home) return null;
    const authPath = join(home, ".cursor", "sdk", "auth.json");
    if (!existsSync(authPath)) return null;
    const raw = JSON.parse(readFileSync(authPath, "utf8"));
    const key =
      typeof raw?.apiKey === "string" && raw.apiKey.trim() ? raw.apiKey.trim() : "";
    if (!key) return null;
    const exp = raw?.apiKeyExpiresAtMs;
    if (typeof exp === "number" && Number.isFinite(exp) && Date.now() > exp) {
      return null;
    }
    return key;
  } catch {
    return null;
  }
}

/**
 * Resolve Cursor API key from env, Keychain, or SDK login store.
 * Stored credentials are used by default. Pass `{ includeStored: false }`
 * for isolated test env bags that must not see host login state.
 *
 * @param {Record<string, string | undefined>} [base]
 * @param {{ includeStored?: boolean }} [opts]
 * @returns {string | null}
 */
export function resolveCursorApiKey(base = process.env, opts = {}) {
  const fromEnv =
    (typeof base.CURSOR_API_KEY === "string" && base.CURSOR_API_KEY.trim()) ||
    (typeof base.PATHCODE_CURSOR_API_KEY === "string" &&
      base.PATHCODE_CURSOR_API_KEY.trim()) ||
    (typeof base.PATH_CURSOR_API_KEY === "string" &&
      base.PATH_CURSOR_API_KEY.trim()) ||
    "";
  if (fromEnv) return fromEnv;

  if (opts.includeStored === false) return null;

  const fromKeychain =
    readMacOsKeychainPassword("PATH_CURSOR_API_KEY") ||
    readMacOsKeychainPassword(
      "PATH_CURSOR_API_KEY",
      typeof base.USER === "string" ? base.USER : process.env.USER,
    ) ||
    readMacOsKeychainPassword("CURSOR_API_KEY");
  if (fromKeychain) return fromKeychain;

  return readCursorSdkAuthFileKey();
}

/**
 * @param {Record<string, string | undefined>} [base]
 */
export function resolveCursorModel(base = process.env) {
  const resolved = resolveCursorEngineModel({ toolEnv: base });
  if (!resolved.ok) {
    return { id: CURSOR_DEFAULT_PROVIDER_MODEL_ID };
  }
  return { id: resolved.providerModelId };
}

/**
 * Dynamically load @cursor/sdk from the product package root.
 * @returns {Promise<{ ok: true, sdk: any } | { ok: false, reason: string }>}
 */
export async function loadCursorSdk() {
  try {
    const require = createRequire(join(PACKAGE_ROOT, "package.json"));
    const entry = require.resolve("@cursor/sdk");
    // Prefer ESM dist when require.resolve returns the CJS build.
    const esmCandidate = entry.includes("/dist/cjs/")
      ? entry.replace("/dist/cjs/", "/dist/esm/")
      : entry;
    const href = pathToFileURL(
      existsSync(esmCandidate) ? esmCandidate : entry,
    ).href;
    const mod = await import(href);
    const sdk = mod?.Agent ? mod : mod?.default;
    if (!sdk?.Agent) {
      return { ok: false, reason: "sdk_missing_Agent" };
    }
    return { ok: true, sdk };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Classify Cursor / auth errors for truthful degradation.
 * @param {unknown} err
 */
export function classifyCursorFailure(err) {
  const msg = err instanceof Error ? err.message : String(err || "");
  const lower = msg.toLowerCase();
  if (
    /api.?key|auth|unauthorized|401|403|not authenticated|login/i.test(lower)
  ) {
    return { code: "AUTH_REQUIRED", message: msg.slice(0, 300) };
  }
  if (/econn|timeout|network|enotfound|connect/i.test(lower)) {
    return { code: "SDK_CONNECTION", message: msg.slice(0, 300) };
  }
  return { code: "SDK_FAILURE", message: msg.slice(0, 300) };
}

/**
 * Probe whether Cursor can be used as a local executor ( mechan ical readiness ).
 * Does not start an agent.
 *
 * @param {{ cwd?: string, env?: Record<string, string | undefined> }} [opts]
 */
/**
 * Dispatch-compatible Cursor readiness. Same prerequisites as agent init,
 * without spending an engineering generation.
 * @param {{ env?: Record<string, string | undefined> }} [opts]
 */
export function probeCursorDispatchReadiness(opts = {}) {
  const env = opts.env || process.env;
  const [major, minor] = String(process.versions.node || "0")
    .split(".")
    .map((part) => Number(part) || 0);
  const nodeOk = major > 22 || (major === 22 && minor >= 13);
  const apiKeyPresent = Boolean(
    resolveCursorApiKey(env, { includeStored: env === process.env }),
  );
  let sdkResolved = false;
  /** @type {string | null} */
  let sdkReason = null;
  try {
    const require = createRequire(pathToFileURL(join(PACKAGE_ROOT, "package.json")).href);
    const sdk = require("@cursor/sdk");
    const Agent = sdk?.Agent || sdk?.default?.Agent;
    sdkResolved = typeof Agent?.create === "function";
  } catch (error) {
    sdkReason = error instanceof Error ? error.message : String(error);
  }
  /** @type {string | null} */
  let reason = null;
  if (!nodeOk) reason = `unsupported_runtime ${process.version}`;
  else if (!apiKeyPresent) reason = "auth_unavailable";
  else if (!sdkResolved) {
    reason = sdkReason ? `sdk_unavailable ${sdkReason}`.slice(0, 180) : "sdk_unavailable";
  }
  return {
    ready: nodeOk && apiKeyPresent && sdkResolved,
    node: process.version,
    execPath: process.execPath,
    apiKeyPresent,
    sdkResolved,
    reason,
  };
}

export async function detectCursorEngine(opts = {}) {
  /** @type {string[]} */
  const evidence = [];
  const env = opts.env || process.env;
  const apiKey = resolveCursorApiKey(env, {
    // Custom env bags (tests) stay isolated from host Keychain / auth.json.
    includeStored: env === process.env,
  });
  if (!apiKey) {
    evidence.push("CURSOR_API_KEY not set");
    return {
      status: /** @type {const} */ ("unavailable"),
      ready: false,
      reason: "auth_required",
      evidence,
    };
  }
  evidence.push("CURSOR_API_KEY present");

  const loaded = await loadCursorSdk();
  if (!loaded.ok) {
    evidence.push(`sdk load failed: ${loaded.reason}`);
    return {
      status: /** @type {const} */ ("unavailable"),
      ready: false,
      reason: loaded.reason,
      evidence,
    };
  }
  evidence.push("@cursor/sdk Agent export available");
  const model = resolveCursorModel(env);
  evidence.push(`model ${model.id}`);
  return {
    status: /** @type {const} */ ("ready"),
    ready: true,
    reason: null,
    model,
    evidence,
  };
}

/**
 * List changed files under cwd via git porcelain (SDK has no changedFiles field).
 * @param {string} cwd
 * @param {Record<string, string> | undefined} env
 */
function listChangedFiles(cwd, env) {
  const r = spawnSync("git", ["status", "--porcelain", "-uall"], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...(env || {}), GIT_TERMINAL_PROMPT: "0" },
    timeout: 15_000,
  });
  if (r.status !== 0) return [];
  return (r.stdout || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.replace(/^\S+\s+/, "").replace(/^"|"$/g, ""))
    .filter(Boolean)
    .slice(0, 80);
}

/**
 * Create a Cursor engineering handle: local SDK against the task worktree.
 *
 * @param {{
 *   taskId: string,
 *   cwd: string,
 *   sessionId?: string,
 *   toolEnv?: Record<string, string>,
 *   emit?: (event: object) => void,
 *   model?: { id: string },
 *   projectRoot?: string,
 *   checkpoint?: object | null,
 *   modelResolution?: object,
 *   apiKey?: string,
 *   signal?: AbortSignal,
 * }} options
 */
export async function createCursorEngine(options) {
  const emit =
    typeof options.emit === "function" ? options.emit : () => {};
  const cwd = options.cwd;
  const sessionId =
    typeof options.sessionId === "string" && options.sessionId.trim()
      ? options.sessionId.trim()
      : `path-cursor-${options.taskId}`;

  const explicitModelId =
    typeof options.model?.id === "string" && options.model.id.trim()
      ? options.model.id.trim()
      : null;
  const modelPlaneResolution = options.modelResolution || resolveProductionEngineModel({
    engineId: "cursor",
    env: { ...process.env, ...(options.toolEnv || {}) },
    projectRoot: options.projectRoot,
    readUserPreferences: true,
    checkpoint: options.checkpoint,
    providerModelId: explicitModelId,
  });

  /** @type {'native_sdk'|'auth_required'|'unavailable'|'none'} */
  let mode = "none";
  /** @type {any} */
  let agent = null;
  /** @type {string | null} */
  let activeAgentId = null;
  /** @type {any} */
  let activeRun = null;
  /** @type {string | null} */
  let degradeReason = null;
  /** @type {any} */
  let AgentCtor = null;

  /**
   * @param {any} g10
   */
  function emitMapped(g10) {
    if (!g10) return;
    emit(toSessionEvent(g10));
  }

  function reclaimTitle() {
    try {
      reclaimTtyForeground();
      reassertPathTitle();
    } catch {
      /* ignore */
    }
  }

  async function tryStart(resumeId) {
    const apiKey =
      (typeof options.apiKey === "string" && options.apiKey.trim()) ||
      resolveCursorApiKey({ ...process.env, ...(options.toolEnv || {}) });
    if (!apiKey) {
      return { ok: false, reason: "auth_required" };
    }
    const loaded = await loadCursorSdk();
    if (!loaded.ok) {
      return { ok: false, reason: loaded.reason };
    }
    AgentCtor = loaded.sdk.Agent;
    if (!modelPlaneResolution.ok) {
      return {
        ok: false,
        reason: modelPlaneResolution.code || "model_resolution_failed",
      };
    }
    const model = modelPlaneResolution.model;
    if (!existsSync(cwd)) {
      return { ok: false, reason: `cwd_missing:${cwd}` };
    }

    try {
      let next;
      let resumed = false;
      if (resumeId && typeof AgentCtor.resume === "function") {
        try {
          next = await AgentCtor.resume(resumeId, {
            apiKey,
            model,
            local: { cwd },
          });
          resumed = true;
        } catch {
          next = await AgentCtor.create({
            apiKey,
            model,
            local: { cwd },
          });
          resumed = false;
        }
      } else {
        next = await AgentCtor.create({
          apiKey,
          model,
          local: { cwd },
        });
      }
      agent = next;
      activeAgentId =
        typeof next?.agentId === "string"
          ? next.agentId
          : sessionId;
      mode = "native_sdk";
      reclaimTitle();
      return { ok: true, resumed, sessionId: activeAgentId };
    } catch (err) {
      const classified = classifyCursorFailure(err);
      return { ok: false, error: err, reason: classified.code };
    }
  }

  /**
   * @param {{ resumeSessionId?: string, attempts?: number }} [opts]
   */
  async function ensureConnected(opts = {}) {
    if (mode === "native_sdk" && agent) {
      return { ok: true, mode, sessionId: activeAgentId };
    }
    const attempts =
      typeof opts.attempts === "number" && opts.attempts > 0
        ? Math.min(opts.attempts, 2)
        : 1;
    let lastErr = null;
    for (let i = 0; i < attempts; i += 1) {
      const r = await tryStart(opts.resumeSessionId || activeAgentId || undefined);
      if (r.ok) {
        emit({
          type: "session.capability.collaborate",
          engine: "cursor",
          phase: r.resumed ? "sdk_resumed" : "sdk_ready",
          label: "Collaborative engineering",
          detail: r.resumed
            ? "Cursor SDK session resumed"
            : "Cursor SDK local session ready",
        });
        return {
          ok: true,
          mode,
          sessionId: activeAgentId,
          resumed: r.resumed,
        };
      }
      lastErr = r.error || new Error(r.reason || "cursor_sdk_failed");
      if (r.reason === "auth_required") break;
    }
    const classified = classifyCursorFailure(lastErr);
    if (classified.code === "AUTH_REQUIRED") {
      mode = "auth_required";
      degradeReason = classified.message;
      emit({
        type: "session.terminal",
        classification: "AUTH_REQUIRED",
        detail: "Cursor authentication required; task preserved",
      });
      return {
        ok: false,
        mode,
        code: "AUTH_REQUIRED",
        detail: classified.message,
      };
    }
    mode = "unavailable";
    degradeReason = classified.message;
    return {
      ok: false,
      mode,
      code: classified.code,
      detail: classified.message,
    };
  }

  /**
   * @param {{ prompt: string, timeoutMs?: number, signal?: AbortSignal, modelResolution?: object }} turn
   */
  async function runEngineeringTurn(turn) {
    const turnResolution = turn.modelResolution || modelPlaneResolution;
    const ensured = await ensureConnected({
      resumeSessionId: activeAgentId || undefined,
    });
    if (!ensured.ok || mode !== "native_sdk" || !agent) {
      return withEngineProvenance(
        {
          ok: false,
          mode,
          code: ensured.code || "CURSOR_UNAVAILABLE",
          detail: ensured.detail || degradeReason || "Cursor unavailable",
          changedFiles: [],
        },
        "cursor",
      );
    }

    const timeoutMs =
      typeof turn.timeoutMs === "number" && turn.timeoutMs > 0
        ? turn.timeoutMs
        : 300_000;
    const signal = turn.signal || options.signal;

    try {
      // Local SDK requires an explicit model on create and/or send.
      if (!turnResolution.ok) {
        return withEngineProvenance(
          {
            ok: false,
            mode,
            code: turnResolution.code || "MODEL_RESOLUTION_FAILED",
            detail: turnResolution.message || "cursor model resolution failed",
            changedFiles: [],
          },
          "cursor",
        );
      }
      const model = turnResolution.model;
      const run = await agent.send(String(turn.prompt || ""), { model });
      activeRun = run;
      reclaimTitle();

      /** @type {string[]} */
      const narrationChunks = [];
      const streamPromise = (async () => {
        if (!run || typeof run.stream !== "function") return;
        try {
          for await (const ev of run.stream()) {
            const mapped = mapCursorSdkEvent(ev);
            if (mapped) emitMapped(mapped);
            if (ev?.type === "assistant" && Array.isArray(ev?.message?.content)) {
              for (const block of ev.message.content) {
                if (block?.type === "text" && typeof block.text === "string") {
                  narrationChunks.push(block.text);
                }
              }
            }
          }
        } catch {
          /* stream aborted / ended */
        }
      })();

      let cancelWatcher = null;
      if (signal) {
        const onAbort = async () => {
          try {
            if (run && typeof run.supports === "function" && run.supports("cancel")) {
              await run.cancel();
            } else if (run && typeof run.cancel === "function") {
              await run.cancel();
            }
          } catch {
            /* ignore */
          }
        };
        if (signal.aborted) await onAbort();
        else {
          signal.addEventListener("abort", () => {
            void onAbort();
          }, { once: true });
          cancelWatcher = onAbort;
        }
      }

      const waitPromise =
        typeof run.wait === "function"
          ? run.wait()
          : Promise.resolve({ status: "finished", result: "" });

      const timed = await Promise.race([
        waitPromise.then((r) => ({ kind: "done", result: r })),
        new Promise((resolve) =>
          setTimeout(() => resolve({ kind: "timeout" }), timeoutMs),
        ),
      ]);

      if (timed.kind === "timeout") {
        try {
          if (run.supports?.("cancel")) await run.cancel();
          else if (typeof run.cancel === "function") await run.cancel();
        } catch {
          /* ignore */
        }
        await streamPromise.catch(() => {});
        reclaimTitle();
        activeRun = null;
        return withEngineProvenance(
          {
            ok: false,
            mode: "native_sdk",
            code: "TIMEOUT",
            detail: `Cursor turn exceeded ${timeoutMs}ms`,
            changedFiles: listChangedFiles(cwd, options.toolEnv),
            sessionId: activeAgentId,
          },
          "cursor",
        );
      }

      await streamPromise.catch(() => {});
      reclaimTitle();
      activeRun = null;
      void cancelWatcher;

      const result = timed.result || {};
      const status = String(result.status || "");
      const text =
        typeof result.result === "string"
          ? result.result
          : narrationChunks.join("").slice(0, 32_000);
      const changedFiles = listChangedFiles(cwd, options.toolEnv);

      if (status === "cancelled") {
        return withEngineProvenance(
          {
            ok: false,
            mode: "native_sdk",
            code: "CANCELLED",
            detail: "Cursor run cancelled",
            text: text.slice(0, 32_000),
            changedFiles,
            sessionId: activeAgentId,
            runId: typeof result.id === "string" ? result.id : null,
          },
          "cursor",
        );
      }
      if (status === "error") {
        return withEngineProvenance(
          {
            ok: false,
            mode: "native_sdk",
            code: "SDK_FAILURE",
            detail: String(result.error || "Cursor run error").slice(0, 300),
            text: text.slice(0, 32_000),
            changedFiles,
            sessionId: activeAgentId,
            runId: typeof result.id === "string" ? result.id : null,
          },
          "cursor",
        );
      }

      return withEngineProvenance(
        {
          ok: true,
          mode: "native_sdk",
          text: text.slice(0, 32_000),
          detail: "Cursor SDK turn completed",
          changedFiles,
          sessionId: activeAgentId,
          runId: typeof result.id === "string" ? result.id : null,
        },
        "cursor",
      );
    } catch (err) {
      reclaimTitle();
      activeRun = null;
      const classified = classifyCursorFailure(err);
      if (classified.code === "AUTH_REQUIRED") {
        mode = "auth_required";
      }
      return withEngineProvenance(
        {
          ok: false,
          mode,
          code: classified.code,
          detail: classified.message,
          changedFiles: listChangedFiles(cwd, options.toolEnv),
          sessionId: activeAgentId,
        },
        "cursor",
      );
    }
  }

  /**
   * In-flight steer when supported; otherwise caller should send a follow-up turn.
   * @param {string} text
   */
  async function steer(text) {
    const body = String(text || "").trim();
    if (!body) return { ok: false, code: "EMPTY" };
    if (activeRun && typeof activeRun.steer === "function") {
      try {
        const ack = await activeRun.steer(body);
        return { ok: true, mode: "inflight", ack };
      } catch (err) {
        return {
          ok: false,
          code: "STEER_FAILED",
          detail: err instanceof Error ? err.message : String(err),
        };
      }
    }
    return { ok: false, code: "BOUNDARY_ONLY", detail: "no active run to steer" };
  }

  async function cancel() {
    try {
      if (activeRun) {
        if (typeof activeRun.supports === "function" && activeRun.supports("cancel")) {
          await activeRun.cancel();
        } else if (typeof activeRun.cancel === "function") {
          await activeRun.cancel();
        }
      }
    } catch {
      /* ignore */
    }
  }

  async function disconnect() {
    await cancel();
    try {
      if (agent && typeof agent[Symbol.asyncDispose] === "function") {
        await agent[Symbol.asyncDispose]();
      } else if (agent && typeof agent.close === "function") {
        await agent.close();
      }
    } catch {
      /* ignore */
    }
    agent = null;
    activeRun = null;
  }

  return {
    getModelResolution: () => modelPlaneResolution,
    getMode: () => mode,
    getSessionId: () => activeAgentId,
    getDegradeReason: () => degradeReason,
    ensureConnected,
    runEngineeringTurn,
    steer,
    cancel,
    disconnect,
  };
}

export { declareCursorEngineCapability } from "./engine-capabilities.mjs";
