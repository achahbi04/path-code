/**
 * G9 live compose/service acceptance — start redis, engineer against it, cleanup.
 *
 * Usage: node run-live-service.mjs <label> <projectRoot> <outDir>
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareEngineeringEnvironment } from "../../../scripts/pathcode-cli/ag9/prepare.mjs";
import {
  startDisposableServices,
  stopDisposableServices,
  detectProjectServices,
} from "../../../scripts/pathcode-cli/ag9/services.mjs";
import { runAntigravityEngineeringSession } from "../../../scripts/pathcode-cli/ag1/session.mjs";

const checkout = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const label = process.argv[2] || "compose-redis";
const projectRoot = resolve(
  process.argv[3] ||
    join(checkout, "docs/reports/g9-evidence/live-repos/compose-svc"),
);
const outDir = resolve(
  process.argv[4] || join(checkout, "docs/reports/g9-evidence/live"),
);
const runtimeRoot =
  process.env.PATHCODE_RUNTIME_ROOT ||
  resolve(checkout, "docs/reports/g9-evidence/runtime-live-service");

mkdirSync(outDir, { recursive: true });
process.env.PATHCODE_RUNTIME_ROOT = runtimeRoot;
process.env.GOOGLE_CLOUD_PROJECT =
  process.env.GOOGLE_CLOUD_PROJECT || "path-code-gc1-260910";
process.env.PATH = `/opt/homebrew/bin:${process.env.PATH || ""}`;
process.env.REDIS_PORT = process.env.REDIS_PORT || "16379";

const detected = detectProjectServices(projectRoot);
const started = startDisposableServices({
  projectRoot,
  runtimeRoot,
  emit: () => {},
});

const prepared = await prepareEngineeringEnvironment({
  projectRoot,
  runtimeRoot,
  taskText: "redis compose engineering",
  startServices: false, // already started above for explicit evidence
});

let session = null;
if (started.status === "STARTED") {
  const prompt = {
    write: () => {},
    isStopped: () => false,
    isCycleCancelRequested: () => false,
  };
  session = await runAntigravityEngineeringSession(prompt, {
    taskText: [
      "A Redis service is running on 127.0.0.1:16379 (compose).",
      "Fix src/ping.js so expectedPong() returns exactly PONG (not PONGX).",
      "Run npm test with REDIS_PORT=16379 until it passes.",
      "Do not push.",
    ].join("\n"),
    projectRoot,
    checkoutRoot: checkout,
    cardsOwnProgress: true,
    wallClockMs: 600_000,
    sessionEventEmit: () => {},
  });
}

const stopped =
  started.projectKey != null
    ? stopDisposableServices({
        runtimeRoot,
        projectKey: started.projectKey,
        projectRoot,
      })
    : { status: "SKIPPED" };

const summary = {
  label,
  detected,
  started,
  preparedServices: prepared.services || null,
  session: {
    classification: session?.classification || null,
    primaryUntouched: session?.primaryUntouched ?? null,
    commitSha: session?.commitSha || null,
  },
  stopped,
  liveServiceOk: started.status === "STARTED",
  engineeringOk: session?.classification === "VERIFIED",
  cleanupOk: stopped.status === "STOPPED" || stopped.status === "SKIPPED",
};

writeFileSync(
  join(outDir, `${label}.summary.json`),
  `${JSON.stringify(summary, null, 2)}\n`,
);
writeFileSync(
  join(outDir, `${label}.json`),
  `${JSON.stringify({ summary, session }, null, 2)}\n`,
);
console.log(JSON.stringify(summary, null, 2));
process.exitCode =
  summary.liveServiceOk && summary.engineeringOk && summary.cleanupOk ? 0 : 1;
