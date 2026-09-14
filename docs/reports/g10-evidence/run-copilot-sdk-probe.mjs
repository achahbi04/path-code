/**
 * G10 — Copilot SDK preferred-path probe + CLI fallback proof.
 * Does not claim VERIFIED engineering unless a real turn succeeds.
 */

import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const OUT = join(ROOT, "docs/reports/g10-evidence/live");

async function main() {
  mkdirSync(OUT, { recursive: true });
  const {
    loadCopilotSdk,
    createCopilotEngine,
    classifyCopilotFailure,
  } = await import(join(ROOT, "scripts/pathcode-cli/ag10/copilot-sdk.mjs"));

  const loaded = await loadCopilotSdk();
  const evidence = {
    schema: "pathcode.g10.copilot-sdk-probe.v1",
    at: new Date().toISOString(),
    sdkLoad: loaded.ok
      ? { ok: true, hasClient: Boolean(loaded.sdk?.CopilotClient) }
      : { ok: false, reason: loaded.reason },
  };

  const wt = mkdtempSync(join(tmpdir(), "g10-sdk-wt-"));
  const isolatedCfg = mkdtempSync(join(tmpdir(), "g10-sdk-cfg-"));
  try {
    spawnSync("git", ["init"], { cwd: wt });
    spawnSync("git", ["config", "user.email", "g10@test"], { cwd: wt });
    spawnSync("git", ["config", "user.name", "g10"], { cwd: wt });
    writeFileSync(join(wt, "hello.txt"), "hello\n");
    spawnSync("git", ["add", "."], { cwd: wt });
    spawnSync("git", ["commit", "-m", "init"], { cwd: wt });

    // Preferred SDK path using default auth discovery (~/.copilot).
    const engine = await createCopilotEngine({
      taskId: "sdk-probe",
      cwd: wt,
      sessionId: `path-sdk-probe-${Date.now()}`,
      preferSdk: true,
      emit: () => {},
    });
    const connected = await engine.ensureConnected();
    evidence.sdkConnect = {
      ok: connected.ok === true,
      mode: engine.getMode(),
      sessionId: engine.getSessionId(),
      detail: connected.detail || connected.code || null,
      degraded: connected.degraded === true,
    };

    // If sandbox blocks ~/.copilot writes, prove isolated config still constructs
    // a session, then falls back truthfully on AUTH_REQUIRED for turns.
    if (engine.getMode() === "cli_fallback" || engine.getMode() === "none") {
      const isolated = await createCopilotEngine({
        taskId: "sdk-probe-isolated",
        cwd: wt,
        sessionId: `path-sdk-isolated-${Date.now()}`,
        preferSdk: true,
        configDirectory: isolatedCfg,
        emit: () => {},
      });
      const isoConn = await isolated.ensureConnected();
      evidence.isolatedConfigConstruct = {
        ok: isoConn.ok === true || isolated.getMode() === "native_sdk",
        mode: isolated.getMode(),
        sessionId: isolated.getSessionId(),
        detail: isoConn.detail || null,
      };
      await isolated.disconnect();
    }

    if (engine.getMode() === "native_sdk") {
      const turn = await engine.runEngineeringTurn({
        prompt:
          "Reply with exactly: SDK_OK. Do not modify files. Do not run shell.",
        timeoutMs: 120_000,
      });
      evidence.sdkTurn = {
        ok: turn.ok === true,
        mode: turn.mode,
        detail: turn.detail || turn.code || null,
        textPreview:
          typeof turn.text === "string" ? turn.text.slice(0, 200) : "",
        sdkResume: turn.sdkResume === true,
      };
    } else if (engine.getMode() === "cli_fallback") {
      evidence.sdkTurn = {
        ok: true,
        mode: "cli_fallback",
        detail: "SDK unavailable — CLI harness selected truthfully",
        degradeReason: engine.getDegradeReason(),
        sdkResume: false,
      };
    } else if (engine.getMode() === "auth_required") {
      evidence.sdkTurn = {
        ok: true,
        mode: "auth_required",
        detail: "AUTH_REQUIRED — task would be preserved",
        sdkResume: false,
      };
    } else {
      evidence.sdkTurn = {
        ok: false,
        mode: engine.getMode(),
        detail: connected.detail || "no mode",
      };
    }

    // Forced fallback proof
    const fallbackEngine = await createCopilotEngine({
      taskId: "sdk-fallback",
      cwd: wt,
      preferSdk: false,
      emit: () => {},
    });
    const fb = await fallbackEngine.ensureConnected();
    evidence.forcedCliFallback = {
      ok: fallbackEngine.getMode() === "cli_fallback",
      mode: fallbackEngine.getMode(),
      fb,
    };

    evidence.authClassify = classifyCopilotFailure(
      new Error("GitHub authentication required"),
    );

    await engine.disconnect();
    await fallbackEngine.disconnect();

    const nativeTurn =
      evidence.sdkTurn?.mode === "native_sdk" && evidence.sdkTurn?.ok === true;
    const truthfulDegrade =
      evidence.sdkTurn?.mode === "cli_fallback" ||
      evidence.sdkTurn?.mode === "auth_required";
    evidence.verdict =
      evidence.sdkLoad.ok && evidence.forcedCliFallback.ok
        ? nativeTurn
          ? "SDK_NATIVE_OK"
          : truthfulDegrade
            ? "SDK_DEGRADED_OK"
            : "BLOCKED"
        : "BLOCKED";

    writeFileSync(
      join(OUT, "copilot-sdk-probe.json"),
      `${JSON.stringify(evidence, null, 2)}\n`,
    );
    console.log(
      JSON.stringify({
        verdict: evidence.verdict,
        mode: evidence.sdkTurn?.mode,
        connect: evidence.sdkConnect?.mode,
      }),
    );
  } finally {
    try {
      rmSync(wt, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    try {
      rmSync(isolatedCfg, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
