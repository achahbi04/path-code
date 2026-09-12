#!/usr/bin/env node
/**
 * AG5 disposable live driver — one AG1 task without interactive TTY.
 * Usage: node scripts/ag5-live-task.mjs <projectRoot> <taskText> [workingSubdir]
 */
import { runAntigravityEngineeringSession } from "./pathcode-cli/ag1/session.mjs";
import { resolvePathPackageRoot } from "./pathcode-cli/paths.mjs";

const projectRoot = process.argv[2];
const taskText = process.argv[3];
const workingSubdir = process.argv[4] || "";
if (!projectRoot || !taskText) {
  console.error("Usage: node scripts/ag5-live-task.mjs <projectRoot> <taskText> [workingSubdir]");
  process.exit(2);
}

const prompt = {
  write: (t) => {
    process.stderr.write(String(t));
  },
  isStopped: () => false,
  isCycleCancelRequested: () => false,
};

const result = await runAntigravityEngineeringSession(prompt, {
  taskText,
  projectRoot,
  workingSubdir,
  checkoutRoot: resolvePathPackageRoot(),
  cardsOwnProgress: true,
  sessionEventEmit: (type, fields = {}) => {
    console.log(JSON.stringify({ type, ...fields }));
  },
});

console.log(JSON.stringify({ terminal: true, ...result }, null, 2));
process.exit(typeof result.exitCode === "number" ? result.exitCode : 1);
