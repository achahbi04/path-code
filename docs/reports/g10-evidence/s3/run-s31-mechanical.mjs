/**
 * S3.1 mechanical evidence: engine fabric + Cursor capability honesty (pack-free).
 * Optional LIVE-VERIFIED when CURSOR_API_KEY is set and a tiny Agent.prompt succeeds.
 */
import {
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createGatewayRuntime } from "../../../../scripts/pathcode-cli/gateway/index.mjs";
import {
  selectEngineForTurn,
  buildEngineCapabilityList,
  normalizeEngineId,
} from "../../../../scripts/pathcode-cli/ag10/engine-contract.mjs";
import {
  detectCursorEngine,
  loadCursorSdk,
  resolveCursorApiKey,
} from "../../../../scripts/pathcode-cli/ag10/cursor-sdk.mjs";

const checkout = fileURLToPath(new URL("../../../..", import.meta.url));
const outDir = join(checkout, "docs/reports/g10-evidence/s3");
/** Workspace-local scratch — avoid /tmp (sandbox hosts deny git there). */
const scratchRoot = join(checkout, ".path-code-tmp", "s31-mechanical");
mkdirSync(outDir, { recursive: true });
mkdirSync(scratchRoot, { recursive: true });

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

function initDisposableRepo(dir) {
  mkdirSync(dir, { recursive: true });
  const init = git(dir, ["-c", "init.defaultBranch=main", "init", "--template="]);
  if (init.status !== 0) {
    throw new Error(`git init failed: ${init.stderr || init.stdout}`);
  }
  git(dir, ["config", "user.email", "s31@test"]);
  git(dir, ["config", "user.name", "s31"]);
  writeFileSync(join(dir, "README.md"), "s31 live fixture\n");
  writeFileSync(
    join(dir, "package.json"),
    `${JSON.stringify({ name: "s31-live-fixture", private: true }, null, 2)}\n`,
  );
  git(dir, ["add", "."]);
  git(dir, ["commit", "-m", "init"]);
}

const evidence = {
  schema: "pathcode.s3.engine-fabric.mechanical.v1",
  at: new Date().toISOString(),
  note: "S3.1 mechanical proof. S2 freeze tip preserved. S4 not started. OPERATOR ACCEPTANCE PENDING.",
  s2FreezeTip: "67200c1551d7dc6beee9bafb495d133ec11dc0ba",
  cases: {},
  live: null,
};

const hasKey = Boolean(resolveCursorApiKey(process.env));

// --- rotation / contract ---
const ready = { antigravity: true, copilot: true, cursor: true };
const rotated = [0, 1, 2].map((attempt) =>
  selectEngineForTurn({
    role: "repair",
    attempt,
    ready,
    preferContinuity: false,
  }),
);
evidence.cases.rotation = {
  ok: rotated.join(",") === "antigravity,copilot,cursor",
  sequence: rotated,
};
evidence.cases.normalize = {
  ok:
    normalizeEngineId("cursor") === "cursor" &&
    normalizeEngineId("ag") === "antigravity",
};

const listFromContract = buildEngineCapabilityList({
  cursor: hasKey
    ? { ready: true, mode: "native_sdk", evidence: ["key present"] }
    : {
        ready: false,
        reason: "auth_required",
        mode: "none",
        evidence: ["CURSOR_API_KEY not set"],
      },
});
const cursorFromContract = listFromContract.find((e) => e.id === "cursor");
evidence.cases.capabilityList = {
  ok:
    cursorFromContract &&
    cursorFromContract.status !== "slot_reserved" &&
    (hasKey
      ? cursorFromContract.status === "available"
      : cursorFromContract.status === "auth_required" ||
        cursorFromContract.status === "unavailable"),
  cursorStatus: cursorFromContract?.status,
  hasKey,
};

// --- gateway listCapabilities ---
const runtimeRoot = mkdtempSync(join(scratchRoot, "ev-"));
const runtime = createGatewayRuntime({
  packageRoot: checkout,
  runtimeRoot,
});
const caps = runtime.listCapabilities();
const cursorCap = caps.engines?.find((e) => e.id === "cursor");
evidence.cases.gatewayCapabilities = {
  ok:
    Boolean(cursorCap) &&
    cursorCap.status !== "slot_reserved" &&
    (hasKey
      ? cursorCap.status === "available"
      : cursorCap.status === "auth_required" ||
        cursorCap.status === "unavailable"),
  cursorStatus: cursorCap?.status,
  engines: caps.engines?.map((e) => ({ id: e.id, status: e.status })),
};

const detected = await detectCursorEngine({
  env: process.env,
});
evidence.cases.detectCursor = {
  ok: hasKey ? detected.ready === true : detected.ready === false,
  ready: detected.ready,
  reason: detected.reason,
  status: detected.status,
};

const loaded = await loadCursorSdk();
evidence.cases.loadSdk = {
  ok: loaded.ok === true,
  reason: loaded.ok ? null : loaded.reason,
};

// --- optional LIVE-VERIFIED: bounded Agent.prompt against disposable fixture ---
const liveFixtureRoot = join(outDir, "live-fixture");
if (hasKey && loaded.ok) {
  try {
    rmSync(liveFixtureRoot, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  try {
    initDisposableRepo(liveFixtureRoot);

    const sdk = loaded.sdk;
    const apiKey = resolveCursorApiKey(process.env);
    let liveOk = false;
    let liveDetail = "";
    let liveApi = "Agent.send";
    try {
      // Prefer Agent.prompt when present; fall back to create+send.
      if (typeof sdk.Agent?.prompt === "function") {
        liveApi = "Agent.prompt";
        const prompted = await Promise.race([
          sdk.Agent.prompt({
            apiKey,
            model: { id: process.env.PATHCODE_CURSOR_MODEL || "composer-2.5" },
            local: { cwd: liveFixtureRoot },
            prompt: "Reply with exactly: ok. Do not modify files.",
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("live_timeout")), 90_000),
          ),
        ]);
        liveOk = String(prompted?.status || "finished") !== "error";
        liveDetail = String(
          prompted?.result || prompted?.status || "done",
        ).slice(0, 200);
      } else {
        const agent = await sdk.Agent.create({
          apiKey,
          model: { id: process.env.PATHCODE_CURSOR_MODEL || "composer-2.5" },
          local: { cwd: liveFixtureRoot },
        });
        try {
          const run = await agent.send(
            "Reply with exactly: ok. Do not modify files.",
          );
          const waited =
            typeof run.wait === "function"
              ? await Promise.race([
                  run.wait(),
                  new Promise((_, reject) =>
                    setTimeout(() => reject(new Error("live_timeout")), 90_000),
                  ),
                ])
              : { status: "finished" };
          liveOk = String(waited?.status || "") !== "error";
          liveDetail = String(
            waited?.result || waited?.status || "done",
          ).slice(0, 200);
        } finally {
          try {
            if (typeof agent[Symbol.asyncDispose] === "function") {
              await agent[Symbol.asyncDispose]();
            } else if (typeof agent.close === "function") {
              await agent.close();
            }
          } catch {
            /* ignore */
          }
        }
      }
    } catch (err) {
      liveOk = false;
      liveDetail = err instanceof Error ? err.message : String(err);
    }
    evidence.live = {
      attempted: true,
      ok: liveOk,
      detail: liveDetail,
      api: liveApi,
      fixture: "docs/reports/g10-evidence/s3/live-fixture",
    };
  } catch (err) {
    evidence.live = {
      attempted: true,
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
      fixture: "docs/reports/g10-evidence/s3/live-fixture",
    };
  }
} else {
  evidence.live = {
    attempted: false,
    ok: false,
    detail: hasKey ? "sdk not loadable" : "CURSOR_API_KEY not set",
  };
}

try {
  rmSync(runtimeRoot, { recursive: true, force: true });
} catch {
  /* ignore */
}

const mechanicalOk = [
  evidence.cases.rotation?.ok,
  evidence.cases.normalize?.ok,
  evidence.cases.capabilityList?.ok,
  evidence.cases.gatewayCapabilities?.ok,
  evidence.cases.detectCursor?.ok,
  evidence.cases.loadSdk?.ok,
].every(Boolean);

evidence.verdict = mechanicalOk
  ? evidence.live?.ok
    ? "LIVE-VERIFIED"
    : "MECHANICALLY TESTED"
  : "FAIL";

writeFileSync(
  join(outDir, "s31-mechanical.json"),
  `${JSON.stringify(evidence, null, 2)}\n`,
);
process.stdout.write(
  `${JSON.stringify({
    verdict: evidence.verdict,
    cases: Object.fromEntries(
      Object.entries(evidence.cases).map(([k, v]) => [k, v.ok]),
    ),
    live: evidence.live,
  })}\n`,
);
process.exitCode = mechanicalOk ? 0 : 1;
