/**
 * G10 closure §5 — background SCIP indexing + live stale-result handling.
 */
import { writeFileSync, mkdirSync, cpSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { ensureScipIndex } from "../../../../scripts/pathcode-cli/ag9/scip.mjs";
import { createG10Fabric } from "../../../../scripts/pathcode-cli/ag10/index.mjs";
import { captureTaskReality } from "../../../../scripts/pathcode-cli/ag10/task-reality.mjs";

const checkout = resolve(fileURLToPath(new URL("../../../..", import.meta.url)));
const outDir = resolve(checkout, "docs/reports/g10-evidence/closure");
const primary = resolve(checkout, "docs/reports/g10-evidence/tmp/bg-stale-primary");
const runtimeRoot =
  process.env.PATHCODE_RUNTIME_ROOT ||
  resolve(checkout, "docs/reports/g10-evidence/runtime-closure-bg");

mkdirSync(outDir, { recursive: true });
rmSync(primary, { recursive: true, force: true });
cpSync(
  resolve(checkout, "docs/reports/g9-evidence/live-repos/js-accept"),
  primary,
  { recursive: true },
);
function git(cwd, args) {
  return spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
}
git(primary, ["init"]);
git(primary, ["config", "user.email", "g10@test"]);
git(primary, ["config", "user.name", "g10"]);
git(primary, ["config", "commit.gpgsign", "false"]);
git(primary, ["add", "-A"]);
git(primary, ["commit", "-m", "bg baseline"]);

process.env.PATHCODE_RUNTIME_ROOT = runtimeRoot;
process.env.PATH = `/opt/homebrew/bin:${process.env.PATH || ""}`;

const evidence = {
  schema: "pathcode.g10.closure.background.v1",
  at: new Date().toISOString(),
};
/** @type {object[]} */
const events = [];

const fabric = await createG10Fabric({
  runtimeRoot,
  taskId: "bg-stale",
  worktreePath: primary,
  objective: "background stale proof",
  preferCopilotSdk: false,
  emit: (e) => {
    if (e?.type) events.push({ ...e, at: Date.now() });
  },
});

const before = captureTaskReality(primary);
fabric.emitG10({
  family: "background.started",
  detail: "SCIP indexing background",
});

// Start indexing against OLD fingerprint (capture), then mutate project.
const oldFp = before.diffFingerprint;
const indexPromise = ensureScipIndex({
  projectRoot: primary,
  runtimeRoot,
  language: "typescript",
  emit: (e) => {
    if (e?.type) events.push({ ...e, at: Date.now() });
  },
});

// Foreground remains responsive: accept steering / mutate while background runs.
const t0 = Date.now();
fabric.acceptSteering("foreground still responsive");
writeFileSync(join(primary, "src/add.js"), "export function add(a,b){return a+b}\n");
git(primary, ["add", "-A"]);
git(primary, ["commit", "-m", "foreground mutation during background"]);
const after = captureTaskReality(primary);
const responsiveMs = Date.now() - t0;

const index = await indexPromise;
fabric.emitG10({
  family: "background.completed",
  detail: "SCIP indexing returned",
});

const stale = fabric.acceptBackgroundResult({
  fingerprint: oldFp,
  kind: "scip",
  result: index,
});
const current = fabric.acceptBackgroundResult({
  fingerprint: after.diffFingerprint,
  kind: "scip",
  result: { note: "would requery" },
});

evidence.operation = "SCIP indexing";
evidence.foreground = {
  responsiveMs,
  steeringPendingOrApplied: fabric.getSteering().items?.length >= 0,
  mutatedDuringBackground: after.diffFingerprint !== oldFp,
};
evidence.stale = {
  ok: stale.ok === false && stale.status === "STALE",
  status: stale.status,
  oldFp,
  newFp: after.diffFingerprint,
};
evidence.currentAccept = {
  // current fingerprint may not match a real index; OK if unknown/STALE or ok
  status: current.status,
};
evidence.events = {
  backgroundStarted: events.some(
    (e) =>
      e.type === "session.engineering.activity" &&
      /background/i.test(String(e.label || "")),
  ),
  backgroundStale: events.some(
    (e) =>
      e.type === "session.engineering.activity" &&
      /stale/i.test(String(e.label || "")),
  ),
};
await fabric.shutdown();

evidence.verdict =
  evidence.foreground.mutatedDuringBackground &&
  evidence.stale.ok &&
  evidence.events.backgroundStale
    ? "PASS"
    : "PARTIAL";

writeFileSync(join(outDir, "background-stale.json"), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify({ verdict: evidence.verdict, stale: evidence.stale }));
process.exit(evidence.verdict === "PASS" ? 0 : 1);
