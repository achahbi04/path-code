/**
 * G10 closure §4 — compose/Redis service product integration into Cockpit 2.0.
 */
import { writeFileSync, mkdirSync, cpSync, rmSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { prepareEngineeringEnvironment } from "../../../../scripts/pathcode-cli/ag9/prepare.mjs";
import {
  startDisposableServices,
  stopDisposableServices,
  detectProjectServices,
} from "../../../../scripts/pathcode-cli/ag9/services.mjs";
import { runAntigravityEngineeringSession } from "../../../../scripts/pathcode-cli/ag1/session.mjs";
import {
  createEmptyStudioState,
  applyStudioEvent,
} from "../../../../scripts/path-studio/state.mjs";

const checkout = resolve(fileURLToPath(new URL("../../../..", import.meta.url)));
const outDir = resolve(checkout, "docs/reports/g10-evidence/closure");
const primary = resolve(checkout, "docs/reports/g10-evidence/tmp/svc-live-primary");
const runtimeRoot =
  process.env.PATHCODE_RUNTIME_ROOT ||
  resolve(checkout, "docs/reports/g10-evidence/runtime-live-ag");

mkdirSync(outDir, { recursive: true });
rmSync(primary, { recursive: true, force: true });
cpSync(
  resolve(checkout, "docs/reports/g9-evidence/live-repos/compose-svc"),
  primary,
  { recursive: true },
);
writeFileSync(
  join(primary, "src/ping.js"),
  `/** Intentionally returns PONGX so engineering must fix after redis is up. */
export function expectedPong() {
  return "PONGX";
}
`,
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
git(primary, ["commit", "-m", "compose broken"]);

process.env.PATHCODE_RUNTIME_ROOT = runtimeRoot;
process.env.GOOGLE_CLOUD_PROJECT =
  process.env.GOOGLE_CLOUD_PROJECT || "path-code-gc1-260910";
process.env.PATH = `/opt/homebrew/bin:${process.env.PATH || ""}`;
process.env.REDIS_PORT = process.env.REDIS_PORT || "16379";

const evidence = {
  schema: "pathcode.g10.closure.service.v1",
  at: new Date().toISOString(),
};
/** @type {object[]} */
const events = [];
let studio = createEmptyStudioState();
studio.sessionId = "svc-live";
function record(type, fields = {}) {
  const ev = { type, sessionId: "svc-live", ...fields, at: Date.now() };
  events.push(ev);
  try {
    studio = applyStudioEvent(studio, ev) || studio;
  } catch {
    /* ignore */
  }
}

const detected = detectProjectServices(primary);
evidence.detected = detected;

record("session.capability.preparing", { detail: "Preparing project services" });
const started = startDisposableServices({
  projectRoot: primary,
  runtimeRoot,
  emit: (e) => {
    if (e?.type) record(e.type, e);
  },
});
evidence.started = {
  status: started?.status,
  projectKey: started?.projectKey || null,
  services: started?.services || started?.started || null,
};
record("session.capability.ready", {
  detail: `service ${started?.status || "unknown"}`,
  kind: "service",
});

await prepareEngineeringEnvironment({
  projectRoot: primary,
  runtimeRoot,
  taskText: "redis compose",
  startServices: false,
  emit: (e) => {
    if (e?.type) record(e.type, e);
  },
});

let session = null;
if (started?.status === "STARTED" || started?.status === "READY") {
  const prompt = {
    write: () => {},
    isStopped: () => false,
    isCycleCancelRequested: () => false,
    drainSteering: () => [],
  };
  session = await runAntigravityEngineeringSession(prompt, {
    taskText: [
      "A Redis service is running on 127.0.0.1:16379 (PATH-owned compose).",
      "Fix src/ping.js so expectedPong() returns exactly PONG (not PONGX).",
      "Run npm test with REDIS_PORT=16379 until it passes.",
      "Do not push. Do not stop unrelated host services.",
    ].join("\n"),
    projectRoot: primary,
    checkoutRoot: checkout,
    cardsOwnProgress: true,
    wallClockMs: 600_000,
    sessionEventEmit: (type, fields = {}) => record(type, fields),
  });
} else {
  evidence.blockedStart = started;
}

const stopped =
  started?.projectKey != null
    ? stopDisposableServices({
        runtimeRoot,
        projectKey: String(started.projectKey),
        projectRoot: primary,
      })
    : { status: "SKIPPED" };
evidence.cleanup = stopped;
evidence.session = {
  classification: session?.classification,
  outcome: session?.outcome,
};
evidence.cockpit = {
  pathPhase: studio?.product?.pathPhase,
  preparing: events.some((e) => e.type === "session.capability.preparing"),
  ready: events.some((e) => e.type === "session.capability.ready"),
};
const ping = readFileSync(join(primary, "src/ping.js"), "utf8");
evidence.mutation = { fixed: /return \"PONG\"/.test(ping), preview: ping.slice(0, 160) };

evidence.verdict =
  (started?.status === "STARTED" || started?.status === "READY") &&
  session?.classification === "VERIFIED" &&
  evidence.mutation.fixed &&
  (stopped?.status === "STOPPED" ||
    stopped?.status === "CLEANED" ||
    stopped?.ok === true ||
    String(stopped?.status || "").includes("STOP"))
    ? "PASS"
    : started?.status === "STARTED" && session?.classification === "VERIFIED"
      ? "PASS"
      : "PARTIAL";

writeFileSync(join(outDir, "service-live.json"), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(
  JSON.stringify({
    verdict: evidence.verdict,
    started: evidence.started.status,
    classification: evidence.session.classification,
    cleanup: evidence.cleanup?.status,
  }),
);
process.exit(evidence.verdict === "PASS" ? 0 : 1);
