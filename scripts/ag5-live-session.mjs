#!/usr/bin/env node
/**
 * AG5 R6 — multi-task session chain driver.
 * Tasks: V, V, fail/cancel, V with baseline chaining.
 */
import { runAntigravityEngineeringSession } from "./pathcode-cli/ag1/session.mjs";
import { resolvePathPackageRoot } from "./pathcode-cli/paths.mjs";

const projectRoot = process.argv[2];
if (!projectRoot) {
  console.error("Usage: node scripts/ag5-live-session.mjs <projectRoot>");
  process.exit(2);
}

const prompt = {
  write: (t) => process.stderr.write(String(t)),
  isStopped: () => false,
  isCycleCancelRequested: () => false,
};

/** @type {string | null} */
let sessionBaseCommit = null;
const results = [];

async function runTask(label, taskText, opts = {}) {
  const ac = new AbortController();
  if (opts.cancelAfterMs) {
    setTimeout(() => ac.abort(), opts.cancelAfterMs);
  }
  const result = await runAntigravityEngineeringSession(prompt, {
    taskText,
    projectRoot,
    checkoutRoot: resolvePathPackageRoot(),
    cardsOwnProgress: true,
    sessionBaseCommit,
    signal: ac.signal,
    sessionEventEmit: (type, fields = {}) => {
      if (type === "session.engineering.result" || type === "session.terminal") {
        console.log(JSON.stringify({ label, type, ...fields }));
      }
    },
  });
  results.push({ label, ...result });
  if (result.advancesSession === true && result.sessionBaseCommit) {
    sessionBaseCommit = result.sessionBaseCommit;
  }
  console.log(
    JSON.stringify({
      label,
      classification: result.classification,
      advancesSession: result.advancesSession,
      sessionBaseCommit: result.sessionBaseCommit ?? null,
      taskBranch: result.taskBranch ?? null,
      primaryUntouched: result.primaryUntouched,
    }),
  );
  return result;
}

await runTask(
  "T1",
  "Add export function dec(a){return a-1} in src/sum.js and a test dec(5)===4. Keep existing tests.",
);
await runTask(
  "T2",
  "Add export function inc(a){return a+1} in src/sum.js and a test inc(5)===6. Keep existing tests.",
);
await runTask(
  "T3",
  "Introduce a deliberate test failure: add test('broken', () => { throw new Error('forced'); }) and do not fix it.",
);
await runTask(
  "T4",
  "Add export function neg(a){return -a} in src/sum.js and a test neg(3)===-3. Keep existing tests. Do not add broken tests.",
);

console.log(JSON.stringify({ session: true, sessionBaseCommit, results: results.map((r) => ({
  label: r.label,
  classification: r.classification,
  advancesSession: r.advancesSession,
  taskBranch: r.taskBranch,
  commitSha: r.commitSha,
  primaryUntouched: r.primaryUntouched,
})) }, null, 2));
