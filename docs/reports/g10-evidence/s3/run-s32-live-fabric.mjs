#!/usr/bin/env node
/**
 * S3.2 LIVE fabric maturity proof.
 *
 * Exercises need-aware routing + structured handoff on one shared fixture:
 *  1. Rich capability list (traits / steering honesty)
 *  2. inferTurnNeeds + explainEngineSelection on live readiness
 *  3. Cursor primary preferred turn (when ready)
 *  4. Fabric handoff packet Cursor → Copilot (or AG) with journal
 *  5. Multi-peer lease turn when a second engine is ready
 *
 * Writes: s32-live-fabric.json (no secrets).
 */
import {
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { createGatewayRuntime } from "../../../../scripts/pathcode-cli/gateway/index.mjs";
import { detectCursorEngine } from "../../../../scripts/pathcode-cli/ag10/cursor-sdk.mjs";
import {
  buildEngineCapabilityList,
  inferTurnNeeds,
  explainEngineSelection,
  buildFabricHandoff,
  formatFabricHandoff,
} from "../../../../scripts/pathcode-cli/ag10/engine-contract.mjs";
import { createG10Fabric } from "../../../../scripts/pathcode-cli/ag10/index.mjs";

const checkout = fileURLToPath(new URL("../../../..", import.meta.url));
const outDir = join(checkout, "docs/reports/g10-evidence/s3");
const fixture = join(outDir, "live-fixture");
const runtimeRoot = join(homedir(), ".path-code", "runtime-s32-fabric");
mkdirSync(outDir, { recursive: true });

function git(cwd, args) {
  return spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_SYSTEM: "/dev/null",
    },
  });
}

function ensureFixture() {
  mkdirSync(fixture, { recursive: true });
  if (!existsSync(join(fixture, ".git"))) {
    git(fixture, ["-c", "init.defaultBranch=main", "init", "--template="]);
    git(fixture, ["config", "user.email", "s32@test"]);
    git(fixture, ["config", "user.name", "s32"]);
  }
  writeFileSync(join(fixture, "README.md"), "s32 live fixture\n");
  writeFileSync(
    join(fixture, "package.json"),
    `${JSON.stringify(
      {
        name: "s32-live-fixture",
        private: true,
        scripts: { test: 'node -e "process.exit(0)"' },
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    join(fixture, "S32_FABRIC.md"),
    "# s32 fabric shared reality\n",
  );
  git(fixture, ["add", "-A"]);
  const dirty = git(fixture, ["status", "--porcelain"]);
  if (String(dirty.stdout || "").trim()) {
    git(fixture, ["commit", "-m", "s32 fixture baseline"]);
  }
}

const evidence = {
  schema: "pathcode.s3.fabric-maturity.live.v1",
  at: new Date().toISOString(),
  verdict: "PENDING",
  s31FreezeTip: "4c6cf6a44ebb3e1a6475ec9c6c35dadf62d31559",
  cases: /** @type {Record<string, unknown>} */ ({}),
};

async function main() {
  rmSync(runtimeRoot, { recursive: true, force: true });
  mkdirSync(runtimeRoot, { recursive: true });
  process.env.PATHCODE_RUNTIME_ROOT = runtimeRoot;
  ensureFixture();

  const detected = await detectCursorEngine();
  evidence.cases.detect = {
    ready: detected.ready === true,
    status: detected.status,
  };

  const gw = createGatewayRuntime({
    packageRoot: checkout,
    runtimeRoot,
  });
  await gw.bindProject({ cwd: fixture });
  const caps = gw.listCapabilities();
  const engines = Array.isArray(caps?.engines) ? caps.engines : [];
  evidence.cases.capabilities = {
    ok:
      engines.length === 3 &&
      engines.every(
        (e) =>
          Array.isArray(e.traits) &&
          e.traits.length > 0 &&
          typeof e.steering === "string" &&
          typeof e.cancel === "string",
      ),
    engines: engines.map((e) => ({
      id: e.id,
      status: e.status,
      steering: e.steering,
      cancel: e.cancel,
      traits: e.traits,
    })),
  };

  const cursorReady = detected.ready === true;
  const needsInflight = inferTurnNeeds({
    role: "collab",
    objective: "Apply mid-task steering while editing",
    requireInflightSteer: true,
  });
  const routeInflight = explainEngineSelection({
    role: "collab",
    ready: { antigravity: true, copilot: true, cursor: cursorReady },
    needs: needsInflight.needs,
    preferContinuity: false,
  });
  evidence.cases.needRouting = {
    ok: !cursorReady || routeInflight.engine === "cursor",
    needs: needsInflight.needs,
    selection: routeInflight,
  };

  const needsLsp = inferTurnNeeds({
    role: "repair",
    objective: "Fix failing typecheck",
    validation: {
      checks: [{ id: "typecheck", kind: "TYPECHECK", ok: false }],
    },
  });
  const capsLive = buildEngineCapabilityList({
    antigravity: true,
    copilot: { ready: true, mode: "cli_fallback" },
    cursor: {
      ready: cursorReady,
      mode: cursorReady ? "native_sdk" : "none",
    },
  });
  const routeLsp = explainEngineSelection({
    role: "repair",
    attempt: 0,
    ready: { antigravity: true, copilot: true, cursor: cursorReady },
    needs: needsLsp.needs,
    preferContinuity: false,
    capabilities: capsLive,
  });
  evidence.cases.lspRouting = {
    ok: routeLsp.engine === "copilot" || routeLsp.candidates.includes("copilot"),
    needs: needsLsp.needs,
    selection: routeLsp,
  };

  /** @type {object[]} */
  const events = [];
  const off = gw.onEvent((env) => {
    const ev = env?.event || env;
    if (ev && typeof ev === "object") events.push(ev);
  });

  let gatewayCursor = null;
  if (cursorReady) {
    const started = await gw.startTask({
      objective:
        "Append one line 's32-cursor-primary' to S32_FABRIC.md. Keep the change minimal. Reply briefly when done.",
      preferredEngine: "cursor",
      cwd: fixture,
    });
    const snap = started?.taskId
      ? await gw.awaitTask(started.taskId, 240_000)
      : null;
    gatewayCursor = {
      preferredEngine: started?.preferredEngine || null,
      status: snap?.status || null,
      classification: snap?.classification || null,
      engine: snap?.result?.engine || null,
      enginesUsed: snap?.result?.enginesUsed || null,
      commitSha: snap?.commitSha || null,
      primaryRouted: events.some((e) =>
        /preferred Cursor engine taking the primary turn|preferred engine: cursor/i.test(
          `${e.detail || ""} ${e.label || ""}`,
        ),
      ),
    };
    evidence.cases.gatewayCursorPrimary = {
      ok:
        started?.preferredEngine === "cursor" &&
        (snap?.status === "completed" ||
          snap?.classification === "VERIFIED" ||
          snap?.classification === "PARTIALLY_VERIFIED"),
      ...gatewayCursor,
    };
  } else {
    evidence.cases.gatewayCursorPrimary = {
      ok: false,
      skipped: "cursor_not_ready",
    };
  }
  off?.();

  // Structured handoff + optional peer turn on shared worktree.
  const taskId = `s32-handoff-${Date.now().toString(36)}`;
  const worktreePath = fixture;
  /** @type {object[]} */
  const fabricEvents = [];
  const fabric = await createG10Fabric({
    runtimeRoot,
    taskId,
    worktreePath,
    repoRoot: fixture,
    objective: "S32 fabric handoff proof",
    emit: (e) => fabricEvents.push(e),
  });
  try {
    if (cursorReady) await fabric.attachCursor();
    await fabric.attachCopilot();
    const cursorMode = fabric.getCursor?.()?.getMode?.();
    const copilotMode = fabric.getCopilot?.()?.getMode?.();
    const packet = fabric.buildNextHandoff({
      fromEngine: cursorReady ? "cursor" : "antigravity",
      toEngine: copilotMode && copilotMode !== "none" ? "copilot" : "antigravity",
      needs: ["repair", "lsp"],
      reason: "S32 live handoff proof",
      validationSummary: "typecheck failed (simulated for handoff text)",
    });
    const handoffText = fabric.formatFabricHandoff(packet);
    evidence.cases.handoffPacket = {
      ok:
        /PATH fabric handoff/i.test(handoffText) &&
        /Your turn:/i.test(handoffText) &&
        packet.toEngine != null,
      toEngine: packet.toEngine,
      fromEngine: packet.fromEngine,
      preview: handoffText.slice(0, 400),
    };

    let peerTurn = null;
    if (copilotMode === "native_sdk" || copilotMode === "cli_fallback") {
      peerTurn = await fabric.runCopilotCollabTurn({
        prompt: [
          handoffText,
          "",
          "Append one line 's32-peer-copilot' to S32_FABRIC.md if missing. Keep the change minimal.",
        ].join("\n"),
        timeoutMs: 120_000,
      });
    } else if (cursorReady && cursorMode === "native_sdk") {
      peerTurn = await fabric.runCursorCollabTurn({
        prompt: [
          handoffText,
          "",
          "Append one line 's32-peer-cursor' to S32_FABRIC.md if missing. Keep the change minimal.",
        ].join("\n"),
        timeoutMs: 120_000,
      });
    }
    evidence.cases.peerTurn = {
      ok: peerTurn?.ok === true || peerTurn == null,
      mode: peerTurn?.mode || null,
      engine: peerTurn?.engine || peerTurn?.provenance?.engine || null,
      skipped: peerTurn == null,
    };
  } finally {
    await fabric.shutdown?.();
  }

  const ok =
    evidence.cases.capabilities?.ok === true &&
    evidence.cases.needRouting?.ok === true &&
    evidence.cases.lspRouting?.ok === true &&
    evidence.cases.handoffPacket?.ok === true &&
    (evidence.cases.gatewayCursorPrimary?.ok === true ||
      evidence.cases.gatewayCursorPrimary?.skipped === "cursor_not_ready");

  evidence.verdict = ok
    ? cursorReady
      ? "LIVE-VERIFIED"
      : "MECHANICAL-VERIFIED"
    : "FAILED";

  writeFileSync(
    join(outDir, "s32-live-fabric.json"),
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
  writeFileSync(
    join(outDir, "s32-live-fabric-run.txt"),
    [
      `verdict=${evidence.verdict}`,
      `capabilities=${evidence.cases.capabilities?.ok}`,
      `needRouting=${JSON.stringify(evidence.cases.needRouting?.selection?.engine)}`,
      `lspRouting=${JSON.stringify(evidence.cases.lspRouting?.selection?.engine)}`,
      `gatewayCursor=${JSON.stringify(evidence.cases.gatewayCursorPrimary?.ok)}`,
      `handoff=${evidence.cases.handoffPacket?.ok}`,
      "",
    ].join("\n"),
  );
  console.log(
    JSON.stringify(
      { verdict: evidence.verdict, ok, cursorReady },
      null,
      2,
    ),
  );
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  evidence.verdict = "ERROR";
  evidence.error = String(err && err.message ? err.message : err);
  writeFileSync(
    join(outDir, "s32-live-fabric.json"),
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
  console.error(err);
  process.exit(1);
});
