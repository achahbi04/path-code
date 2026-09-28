/**
 * G10 — preferred GitHub Copilot SDK integration with G9 CLI harness fallback.
 *
 * Never claim native SDK resume if fallback occurred.
 * Preserve task/worktree on SDK failure; AUTH_REQUIRED when human auth needed.
 */

import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mapCopilotSdkEvent, toSessionEvent } from "./events.mjs";
import { whichBinary } from "../ag8/discover.mjs";
import {
  reclaimTtyForeground,
  reassertPathTitle,
} from "../terminal-title.mjs";
import { resolveCopilotEngineModel } from "../model-plane/resolver.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(HERE, "../../..");

/**
 * Resolve a stable Copilot CLI executable identity for macOS Keychain ACLs.
 *
 * Root cause of repeated Keychain prompts: `@github/copilot-sdk` defaults to
 * materializing `copilot-runtime` under a fingerprint-keyed cache
 * (`~/Library/Caches/github-copilot-sdk/runtime/<fingerprint>/...`). When the
 * npm package mtimes change, the fingerprint changes → new binary path →
 * Keychain asks again for "copilot-runtime" accessing "copilot-cli".
 *
 * Prefer a host-installed `copilot` (or explicit COPILOT_CLI_PATH) and pin the
 * SDK via RuntimeConnection.forStdio({ path }) / COPILOT_CLI_PATH.
 *
 * @param {Record<string, string | undefined>} [base]
 * @returns {string | null}
 */
export function resolveStableCopilotCliPath(base = process.env) {
  const explicit =
    (typeof base.COPILOT_CLI_PATH === "string" && base.COPILOT_CLI_PATH.trim()) ||
    (typeof base.PATHCODE_COPILOT_BIN === "string" &&
      base.PATHCODE_COPILOT_BIN.trim()) ||
    "";
  if (explicit && existsSync(explicit)) return explicit;

  const home = homedir();
  const enrichedPath = [
    join(home, ".local/bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    String(base.PATH || process.env.PATH || ""),
  ]
    .filter(Boolean)
    .join(":");
  const fromWhich = whichBinaryWithPath("copilot", enrichedPath);
  if (fromWhich && existsSync(fromWhich)) return fromWhich;

  const candidates = [
    join(home, ".local/bin/copilot"),
    "/opt/homebrew/bin/copilot",
    "/usr/local/bin/copilot",
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

/**
 * @param {string} bin
 * @param {string} pathEnv
 */
function whichBinaryWithPath(bin, pathEnv) {
  const prev = process.env.PATH;
  try {
    process.env.PATH = pathEnv;
    return whichBinary(bin);
  } finally {
    if (prev != null) process.env.PATH = prev;
    else delete process.env.PATH;
  }
}

/**
 * Enrich env so host `copilot` wins discovery and SDK child ACLs stay stable.
 *
 * @param {Record<string, string | undefined>} [base]
 * @returns {Record<string, string | undefined>}
 */
export function withStableCopilotPath(base = process.env) {
  const env = { ...base };
  const exe = resolveStableCopilotCliPath(env);
  if (!exe) return env;
  const binDir = dirname(exe);
  const parts = String(env.PATH || "")
    .split(":")
    .filter(Boolean)
    .filter((p) => p !== binDir);
  env.PATH = [binDir, ...parts].join(":");
  env.PATHCODE_COPILOT_BIN = exe;
  env.COPILOT_CLI_PATH = exe;
  return env;
}

/**
 * Dynamically load @github/copilot-sdk from the product package root.
 * @returns {Promise<{ ok: true, sdk: any } | { ok: false, reason: string }>}
 */
export async function loadCopilotSdk() {
  try {
    const require = createRequire(join(PACKAGE_ROOT, "package.json"));
    const entry = require.resolve("@github/copilot-sdk");
    const sdk = await import(pathToFileURL(entry).href);
    if (!sdk?.CopilotClient) {
      return { ok: false, reason: "sdk_missing_CopilotClient" };
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
 * Classify SDK / auth errors for truthful degradation.
 * @param {unknown} err
 */
export function classifyCopilotFailure(err) {
  const msg = err instanceof Error ? err.message : String(err || "");
  const lower = msg.toLowerCase();
  if (
    /auth|login|not authenticated|unauthorized|401|403|copilot.*sign/i.test(
      lower,
    )
  ) {
    return { code: "AUTH_REQUIRED", message: msg.slice(0, 300) };
  }
  if (/econn|timeout|network|enotfound|connect/i.test(lower)) {
    return { code: "SDK_CONNECTION", message: msg.slice(0, 300) };
  }
  return { code: "SDK_FAILURE", message: msg.slice(0, 300) };
}

/**
 * Create a Copilot engineering handle: SDK preferred, CLI fallback.
 *
 * @param {{
 *   taskId: string,
 *   cwd: string,
 *   sessionId?: string,
 *   toolEnv?: Record<string, string>,
 *   emit?: (event: object) => void,
 *   preferSdk?: boolean,
 *   model?: string,
 *   configDirectory?: string,
 *   runtimeRoot?: string,
 * }} options
 */
export async function createCopilotEngine(options) {
  const preferSdk = options.preferSdk !== false;
  const emit =
    typeof options.emit === "function" ? options.emit : () => {};
  const sessionId =
    typeof options.sessionId === "string" && options.sessionId.trim()
      ? options.sessionId.trim()
      : `path-${options.taskId}`;
  const modelPlaneResolution = resolveCopilotEngineModel({
    toolEnv: { ...process.env, ...(options.toolEnv || {}) },
    providerModelId:
      typeof options.model === "string" ? options.model : null,
  });

  /** @type {'native_sdk'|'cli_fallback'|'auth_required'|'none'} */
  let mode = "none";
  /** @type {any} */
  let client = null;
  /** @type {any} */
  let session = null;
  /** @type {string | null} */
  let activeSessionId = null;
  /** @type {string | null} */
  let degradeReason = null;

  const cliModule = await import("../ag9/copilot-engine.mjs");

  /**
   * @param {NonNullable<ReturnType<typeof mapCopilotSdkEvent>>} g10
   */
  function emitMapped(g10) {
    if (!g10) return;
    const sessionEvent = toSessionEvent(g10);
    emit(sessionEvent);
  }

  async function tryStartSdk(resumeId) {
    const loaded = await loadCopilotSdk();
    if (!loaded.ok) {
      return { ok: false, reason: loaded.reason };
    }
    const { CopilotClient, approveAll, RuntimeConnection } = loaded.sdk;
    const stable = withStableCopilotPath({
      ...process.env,
      ...(options.toolEnv || {}),
    });
    const cliPath =
      typeof stable.COPILOT_CLI_PATH === "string" && stable.COPILOT_CLI_PATH
        ? stable.COPILOT_CLI_PATH
        : resolveStableCopilotCliPath(stable);

    /** @type {Record<string, any>} */
    const clientOpts = {};
    // Pin executable identity so Keychain ACL binds once across sequential turns.
    if (
      cliPath &&
      RuntimeConnection &&
      typeof RuntimeConnection.forStdio === "function"
    ) {
      clientOpts.connection = RuntimeConnection.forStdio({
        path: cliPath,
        env: stable,
      });
    } else if (cliPath) {
      clientOpts.env = { ...stable, COPILOT_CLI_PATH: cliPath };
    } else if (options.toolEnv) {
      clientOpts.env = stable;
    }
    if (typeof options.configDirectory === "string" && options.configDirectory) {
      clientOpts.baseDirectory = options.configDirectory;
    }

    const nextClient = new CopilotClient(clientOpts);
    // Also pin process env for any SDK code paths that read COPILOT_CLI_PATH late.
    const prevPath = process.env.PATH;
    const prevBin = process.env.PATHCODE_COPILOT_BIN;
    const prevCli = process.env.COPILOT_CLI_PATH;
    if (stable.PATH) process.env.PATH = stable.PATH;
    if (stable.PATHCODE_COPILOT_BIN) {
      process.env.PATHCODE_COPILOT_BIN = stable.PATHCODE_COPILOT_BIN;
    }
    if (cliPath) process.env.COPILOT_CLI_PATH = cliPath;
    try {
      await nextClient.start();
      // Copilot runtime steals tty foreground → Terminal.app appends "copilot"
      // / TMPDIR=... onto the window title. Reclaim immediately after spawn.
      try {
        reclaimTtyForeground();
        reassertPathTitle();
      } catch {
        /* ignore */
      }
    } catch (err) {
      try {
        await nextClient.stop();
      } catch {
        /* ignore */
      }
      if (prevPath != null) process.env.PATH = prevPath;
      else delete process.env.PATH;
      if (prevBin != null) process.env.PATHCODE_COPILOT_BIN = prevBin;
      else delete process.env.PATHCODE_COPILOT_BIN;
      if (prevCli != null) process.env.COPILOT_CLI_PATH = prevCli;
      else delete process.env.COPILOT_CLI_PATH;
      return { ok: false, error: err };
    }

    const baseConfig = {
      sessionId: resumeId || sessionId,
      workingDirectory: options.cwd,
      onPermissionRequest: approveAll,
      clientName: "path-code",
      ...(modelPlaneResolution.ok && modelPlaneResolution.providerModelId
        ? { model: modelPlaneResolution.providerModelId }
        : {}),
      ...(typeof options.configDirectory === "string" && options.configDirectory
        ? { configDirectory: options.configDirectory }
        : {}),
    };

    try {
      let nextSession;
      let resumed = false;
      if (resumeId) {
        try {
          nextSession = await nextClient.resumeSession(resumeId, {
            onPermissionRequest: approveAll,
            workingDirectory: options.cwd,
            clientName: "path-code",
            ...(typeof options.configDirectory === "string"
              ? { configDirectory: options.configDirectory }
              : {}),
          });
          resumed = true;
        } catch {
          nextSession = await nextClient.createSession(baseConfig);
          resumed = false;
        }
      } else {
        nextSession = await nextClient.createSession(baseConfig);
      }

      nextSession.on((event) => {
        const mapped = mapCopilotSdkEvent(event);
        if (mapped) emitMapped(mapped);
      });

      client = nextClient;
      session = nextSession;
      activeSessionId = nextSession.sessionId || baseConfig.sessionId;
      mode = "native_sdk";
      try {
        reclaimTtyForeground();
        reassertPathTitle();
      } catch {
        /* ignore */
      }
      return { ok: true, resumed, sessionId: activeSessionId };
    } catch (err) {
      try {
        await nextClient.stop();
      } catch {
        /* ignore */
      }
      return { ok: false, error: err };
    }
  }

  /**
   * Bounded SDK recovery then CLI fallback.
   * @param {{ resumeSessionId?: string, attempts?: number }} [opts]
   */
  async function ensureConnected(opts = {}) {
    if (!preferSdk) {
      mode = "cli_fallback";
      degradeReason = "prefer_sdk_false";
      emit({
        type: "session.capability.advisory",
        detail: "Copilot CLI harness (SDK not preferred)",
        mode: "cli_fallback",
      });
      return { ok: true, mode };
    }

    if (mode === "native_sdk" && session) {
      return { ok: true, mode, sessionId: activeSessionId };
    }

    const attempts =
      typeof opts.attempts === "number" && opts.attempts > 0
        ? Math.min(opts.attempts, 3)
        : 2;
    let lastErr = null;
    for (let i = 0; i < attempts; i += 1) {
      const r = await tryStartSdk(opts.resumeSessionId || sessionId);
      if (r.ok) {
        emit({
          type: "session.capability.collaborate",
          engine: "copilot",
          phase: r.resumed ? "sdk_resumed" : "sdk_ready",
          label: "Collaborative engineering",
          detail: r.resumed
            ? "Copilot SDK session resumed"
            : "Copilot SDK session ready",
        });
        return { ok: true, mode, sessionId: activeSessionId, resumed: r.resumed };
      }
      lastErr = r.error || new Error(r.reason || "sdk_failed");
    }

    const classified = classifyCopilotFailure(lastErr);
    if (classified.code === "AUTH_REQUIRED") {
      mode = "auth_required";
      degradeReason = classified.message;
      emit({
        type: "session.terminal",
        classification: "AUTH_REQUIRED",
        detail: "Copilot authentication required; task preserved",
      });
      return {
        ok: false,
        mode,
        code: "AUTH_REQUIRED",
        detail: classified.message,
      };
    }

    // Fallback to G9 CLI harness if authenticated/healthy.
    let ready = { ok: false };
    try {
      ready = await Promise.resolve(
        cliModule.isCopilotEngineeringReady({
          cwd: options.cwd,
          toolEnv: options.toolEnv,
        }),
      );
    } catch {
      ready = { ok: false };
    }
    // Treat boolean true or {ok:true} as ready.
    const cliReady =
      ready === true ||
      (ready && typeof ready === "object" && ready.ok === true) ||
      (typeof cliModule.isCopilotEngineeringReady === "function" &&
        cliModule.isCopilotEngineeringReady() === true);

    if (cliReady) {
      mode = "cli_fallback";
      degradeReason = classified.message;
      emit({
        type: "session.capability.advisory",
        detail: "Copilot SDK unavailable — CLI harness fallback",
        mode: "cli_fallback",
      });
      return {
        ok: true,
        mode,
        degraded: true,
        detail: classified.message,
      };
    }

    // Even when detectCopilotCli is uncertain, record degraded visibility and
    // still expose CLI attempt path for the turn runner (G9 proven harness).
    mode = "cli_fallback";
    degradeReason = classified.message || "sdk_failed_cli_attempt";
    emit({
      type: "session.capability.advisory",
      detail: "Copilot SDK failed — attempting CLI harness",
      mode: "cli_fallback",
    });
    return {
      ok: true,
      mode,
      degraded: true,
      detail: degradeReason,
    };
  }

  /**
   * Run one engineering turn against the shared worktree.
   * @param {{ prompt: string, timeoutMs?: number }} turn
   */
  async function runEngineeringTurn(turn) {
    const ensured = await ensureConnected({
      resumeSessionId: activeSessionId || sessionId,
    });
    if (!ensured.ok && mode === "auth_required") {
      return {
        ok: false,
        mode,
        code: "AUTH_REQUIRED",
        detail: ensured.detail || "auth required",
        changedFiles: [],
      };
    }

    if (mode === "native_sdk" && session) {
      try {
        const response = await session.sendAndWait(
          { prompt: turn.prompt },
          typeof turn.timeoutMs === "number" ? turn.timeoutMs : 300_000,
        );
        try {
          reclaimTtyForeground();
          reassertPathTitle();
        } catch {
          /* ignore */
        }
        const text =
          typeof response?.data?.content === "string"
            ? response.data.content
            : "";
        return {
          ok: true,
          mode: "native_sdk",
          text: text.slice(0, 32_000),
          detail: "Copilot SDK turn completed",
          sessionId: activeSessionId,
          changedFiles: [],
        };
      } catch (err) {
        try {
          reclaimTtyForeground();
          reassertPathTitle();
        } catch {
          /* ignore */
        }
        const classified = classifyCopilotFailure(err);
        // Attempt CLI fallback for this turn without destroying task.
        if (classified.code === "AUTH_REQUIRED") {
          mode = "auth_required";
          return {
            ok: false,
            mode,
            code: "AUTH_REQUIRED",
            detail: classified.message,
            changedFiles: [],
          };
        }
        emit({
          type: "session.capability.advisory",
          detail: "Copilot SDK turn failed — attempting CLI fallback",
          mode: "cli_fallback",
        });
        mode = "cli_fallback";
        degradeReason = classified.message;
      }
    }

    // CLI harness path (preferred fallback / forced).
    const cliTurn = await cliModule.runCopilotEngineeringTurn({
      prompt: turn.prompt,
      cwd: options.cwd,
      toolEnv: options.toolEnv,
      timeoutMs: turn.timeoutMs,
      taskId: options.taskId,
      runtimeRoot: options.runtimeRoot,
    });
    return {
      ...cliTurn,
      mode: "cli_fallback",
      /** Truth: not a native SDK resume/session. */
      sdkResume: false,
      degradeReason,
    };
  }

  async function disconnect() {
    try {
      if (session && typeof session.disconnect === "function") {
        await session.disconnect();
      }
    } catch {
      /* ignore */
    }
    try {
      if (client && typeof client.stop === "function") {
        await client.stop();
      }
    } catch {
      /* ignore */
    }
    session = null;
    client = null;
  }

  return {
    getMode: () => mode,
    getSessionId: () => activeSessionId,
    getDegradeReason: () => degradeReason,
    ensureConnected,
    runEngineeringTurn,
    disconnect,
  };
}

export { declareCopilotEngineCapability } from "./engine-capabilities.mjs";
