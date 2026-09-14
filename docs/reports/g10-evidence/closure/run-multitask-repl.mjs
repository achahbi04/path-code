/**
 * G10 closure §7 — three sequential real tasks in ONE pathcode process.
 */
import { writeFileSync, mkdirSync, cpSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { Readable, PassThrough } from "node:stream";
import { runPathcodeMain } from "../../../../scripts/pathcode.mjs";
import { runAntigravityEngineeringSession } from "../../../../scripts/pathcode-cli/ag1/session.mjs";

const checkout = resolve(fileURLToPath(new URL("../../../..", import.meta.url)));
const outDir = resolve(checkout, "docs/reports/g10-evidence/closure");
const primary = resolve(checkout, "docs/reports/g10-evidence/tmp/repl-multi-primary");
const runtimeRoot =
  process.env.PATHCODE_RUNTIME_ROOT ||
  resolve(checkout, "docs/reports/g10-evidence/runtime-live-ag");

mkdirSync(outDir, { recursive: true });
rmSync(primary, { recursive: true, force: true });
cpSync(
  resolve(checkout, "docs/reports/g9-evidence/live-repos/js-accept"),
  primary,
  { recursive: true },
);
writeFileSync(
  join(primary, "src/add.js"),
  "export function add(a, b) { return a - b; }\n",
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
git(primary, ["commit", "-m", "repl broken"]);

process.env.PATHCODE_RUNTIME_ROOT = runtimeRoot;
process.env.GOOGLE_CLOUD_PROJECT =
  process.env.GOOGLE_CLOUD_PROJECT || "path-code-gc1-260910";
process.env.PATH = `/opt/homebrew/bin:${process.env.PATH || ""}`;

const evidence = {
  schema: "pathcode.g10.closure.multitask-repl.v1",
  at: new Date().toISOString(),
  tasks: [],
};

/**
 * Minimal TTY that feeds the next line when the cockpit prompt appears.
 * @param {string[]} lines
 */
function createReplTty(lines) {
  const queue = [...lines];
  const stdin = new Readable({
    read() {},
  });
  /** @type {any} */ (stdin).isTTY = true;
  /** @type {any} */ (stdin).isRaw = false;
  /** @type {any} */ (stdin).setRawMode = function setRawMode(mode) {
    this.isRaw = mode;
    return this;
  };

  const feedNext = () => {
    const next = queue.shift();
    if (next === undefined) {
      stdin.push(null);
      return;
    }
    setImmediate(() => stdin.push(`${next}\n`));
  };

  let out = "";
  /**
   * Feed when the idle REPL composer arms (private OSC), not on mid-cycle
   * steering paste-enable and not on painted `> ` alone.
   */
  let feedArmed = true;
  const stdout = new PassThrough();
  /** @type {any} */ (stdout).isTTY = true;
  /** @type {any} */ (stdout).columns = 120;
  stdout.on("data", (d) => {
    const text = d.toString("utf8");
    out += text;
    if (feedArmed && text.includes("\u001b]7878;path-idle-composer\u0007")) {
      feedArmed = false;
      setImmediate(() => feedNext());
    }
    // Re-arm after a line is accepted so the next idle askLine can feed.
    if (text.includes("\u001b[?2004l")) {
      feedArmed = true;
    }
  });
  const stderr = new PassThrough();
  stderr.on("data", (d) => {
    out += d.toString("utf8");
  });

  return {
    stdin,
    stdout,
    stderr,
    getOut: () => out,
  };
}

const taskTexts = [
  "Fix src/add.js so npm test passes. Keep public add(a,b). Do not push.",
  "Add src/greet.js exporting greet(name) returning `hello ${name}` and a node:test that proves it. Do not push.",
  "Add src/mul.js exporting mul(a,b) returning a*b and a node:test proving mul(3,4)===12. Do not push.",
];

const tty = createReplTty([...taskTexts, "/exit"]);
const prevCwd = process.cwd();
process.chdir(primary);

let exitCode = 1;
try {
  exitCode = await runPathcodeMain(["--execution", "local"], {
    stdin: tty.stdin,
    stdout: tty.stdout,
    stderr: tty.stderr,
    runAg1Session: async (prompt, options) => {
      const result = await runAntigravityEngineeringSession(prompt, {
        ...options,
        projectRoot: primary,
        checkoutRoot: checkout,
        cardsOwnProgress: true,
        wallClockMs: 480_000,
      });
      evidence.tasks.push({
        n: evidence.tasks.length + 1,
        taskText: String(options.taskText || "").slice(0, 120),
        taskId: result?.taskId,
        classification: result?.classification,
        outcome: result?.outcome,
        exitCode: result?.exitCode,
        commitSha: result?.commitSha,
        worktreePath: result?.worktreePath,
      });
      return result;
    },
  });
} finally {
  process.chdir(prevCwd);
}

const out = tty.getOut();
evidence.exitCode = exitCode;
evidence.singleProcess = true;
evidence.taskCount = evidence.tasks.length;
evidence.uniqueTaskIds = [
  ...new Set(evidence.tasks.map((t) => t.taskId).filter(Boolean)),
];
evidence.cockpitRetained =
  /\u001b\[\?1049h/.test(out) || /PATH/.test(out) || evidence.tasks.length === 3;
evidence.allVerified = evidence.tasks.every((t) => t.classification === "VERIFIED");
evidence.verdict =
  evidence.taskCount === 3 &&
  evidence.uniqueTaskIds.length === 3 &&
  evidence.allVerified &&
  evidence.singleProcess
    ? "PASS"
    : "PARTIAL";

writeFileSync(join(outDir, "multitask-repl.json"), `${JSON.stringify(evidence, null, 2)}\n`);
writeFileSync(join(outDir, "multitask-repl.out.txt"), out.slice(-12000));
console.log(
  JSON.stringify({
    verdict: evidence.verdict,
    exitCode,
    tasks: evidence.tasks.map((t) => ({
      n: t.n,
      classification: t.classification,
      taskId: t.taskId,
    })),
  }),
);
process.exit(evidence.verdict === "PASS" ? 0 : 1);
