#!/usr/bin/env node
/**
 * S5 — operator entrypoint proof: fresh empty directory → unbound PATH shell →
 * /build start (git-init origin) → Gateway bind → real engineer child start.
 *
 * Uses the actual product entrypoint (scripts/pathcode.mjs).
 * No PATHCODE_BUILD_FAKE / PATHCODE_GATEWAY_FAKE_ENGINE.
 *
 * Scripting note: --events ndjson disables the alternate-screen cockpit so the
 * prompt is ordinary scrollback (`> `), matching non-cockpit TTY behavior while
 * still exercising the same admission + /build command path.
 */
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Readable, Writable } from "node:stream";
import { spawnSync } from "node:child_process";

import { resolveCursorApiKey } from "../../../../scripts/pathcode-cli/ag10/cursor-sdk.mjs";
import {
  findLatestActiveBuild,
  readBuildRecord,
  createBuildController,
} from "../../../../scripts/pathcode-cli/build/index.mjs";
import { createGatewayRuntime } from "../../../../scripts/pathcode-cli/gateway/runtime.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(HERE, "../../../..");
const OUT = join(HERE, "s5-operator-entry-proof.json");
const STEP_MS = Number(process.env.PATHCODE_S5_ENTRY_STEP_MS || 420_000);

function which(bin) {
  const r = spawnSync("which", [bin], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : "";
}

function preferEngine() {
  const forced =
    typeof process.env.PATHCODE_PREFERRED_ENGINE === "string"
      ? process.env.PATHCODE_PREFERRED_ENGINE.trim()
      : "";
  if (forced === "cursor" || forced === "copilot") {
    if (forced === "cursor" && !resolveCursorApiKey(process.env)) {
      if (which("copilot")) return "copilot";
      return null;
    }
    if (forced === "copilot" && !which("copilot")) {
      if (resolveCursorApiKey(process.env)) return "cursor";
      return null;
    }
    return forced;
  }
  if (resolveCursorApiKey(process.env)) return "cursor";
  if (which("copilot")) return "copilot";
  return null;
}

function createReplTty(lines) {
  const queue = [...lines];
  const chunks = [];
  const stdin = new Readable({ read() {} });
  stdin.isTTY = true;
  stdin.isRaw = false;
  stdin.setRawMode = function setRawMode(mode) {
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

  let feedArmed = true;
  const stdout = new Writable({
    write(chunk, _enc, cb) {
      const text = String(chunk);
      chunks.push(text);
      if (feedArmed && text.endsWith("> ")) {
        feedArmed = false;
        setImmediate(() => {
          feedNext();
          feedArmed = true;
        });
      }
      cb();
    },
  });
  stdout.isTTY = true;
  stdout.columns = 100;

  const stderr = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(String(chunk));
      cb();
    },
  });

  return { stdin, stdout, stderr, output: () => chunks.join("") };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  delete process.env.PATHCODE_BUILD_FAKE;
  delete process.env.PATHCODE_GATEWAY_FAKE_ENGINE;

  const engine = preferEngine();
  if (!engine) {
    const payload = {
      ok: false,
      verdict: "OPERATOR_ENTRY_NOT_RUN",
      reason: "no CURSOR_API_KEY and no copilot on PATH",
    };
    writeFileSync(OUT, JSON.stringify(payload, null, 2));
    console.error(payload.reason);
    process.exitCode = 2;
    return;
  }
  process.env.PATHCODE_PREFERRED_ENGINE = engine;

  const base = mkdtempSync(join(tmpdir(), "path-s5-op-entry-"));
  const projectDir = join(base, "fresh");
  const runtimeRoot = join(base, "runtime");
  mkdirSync(projectDir, { recursive: true });
  mkdirSync(runtimeRoot, { recursive: true });

  process.env.PATHCODE_RUNTIME_ROOT = runtimeRoot;
  process.chdir(projectDir);

  const { runPathcodeMain } = await import(
    pathToFileURL(join(PACKAGE_ROOT, "scripts/pathcode.mjs")).href
  );

  const tty = createReplTty([
    "please fix the tests",
    "/build help",
    "/build start Build a tiny offline hello CLI that prints hello and includes a short README",
    "/build status",
    "/exit",
  ]);

  // --events ndjson → non-cockpit TTY prompt (same admission + /build path).
  const exitCode = await runPathcodeMain(["--events", "ndjson"], {
    stdin: tty.stdin,
    stdout: tty.stdout,
    stderr: tty.stderr,
  });
  const cliOut = tty.output();
  const plain = cliOut.replace(/\u001b\[[0-9;?]*[a-zA-Z]/g, "");

  const refusedNotAProject =
    /PATH needs an existing project directory/.test(plain);
  const unboundRefusal = /PATH is unbound|no admitted project/i.test(plain);
  const helpReachable = /\/build start <outcome>/i.test(plain);
  const originNote = /Origin: git-init|git-init performed/i.test(plain);
  const gitInit = existsSync(join(projectDir, ".git"));
  const noScaffold = !existsSync(join(projectDir, "package.json"));

  const latest = findLatestActiveBuild(runtimeRoot);
  const buildId = latest?.buildId || "";
  let build = buildId ? readBuildRecord(runtimeRoot, buildId) : null;

  const openedUnbound =
    exitCode === 0 && !refusedNotAProject && unboundRefusal;
  const buildStartWorked =
    gitInit && Boolean(buildId) && Boolean(build?.projectBindings?.[0]);

  /** @type {Record<string, unknown>} */
  const proof = {
    schema: "s5-operator-entry-proof/v1",
    preferredEngine: engine,
    fakeFabric: false,
    fakeGatewayEngine: false,
    pathcodeBuildFake: process.env.PATHCODE_BUILD_FAKE || null,
    pathcodeGatewayFakeEngine: process.env.PATHCODE_GATEWAY_FAKE_ENGINE || null,
    baseDir: base,
    projectDir,
    runtimeRoot,
    cliExitCode: exitCode,
    openedUnbound,
    unboundCodeRefused: unboundRefusal,
    buildHelpReachable: helpReachable,
    buildStartWorked,
    gitInitByOrigin: gitInit,
    originNoteInCli: originNote,
    noScaffoldFromOrigin: noScaffold,
    buildId,
    binding: build?.projectBindings?.[0] || null,
  };

  if (!openedUnbound || !helpReachable || !buildStartWorked || !buildId || !build) {
    proof.ok = false;
    proof.verdict = "OPERATOR_ENTRY_FAILED";
    proof.cliSample = plain.slice(-4000);
    writeFileSync(OUT, JSON.stringify(proof, null, 2));
    console.error(JSON.stringify(proof, null, 2));
    process.exitCode = 1;
    return;
  }

  const runtime = createGatewayRuntime({
    packageRoot: PACKAGE_ROOT,
    runtimeRoot,
  });
  const bound = await runtime.bindProject({ cwd: projectDir });
  if (!bound.ok) {
    proof.ok = false;
    proof.verdict = "OPERATOR_ENTRY_BIND_FAILED";
    proof.bind = bound;
    writeFileSync(OUT, JSON.stringify(proof, null, 2));
    console.error(JSON.stringify(proof, null, 2));
    process.exitCode = 1;
    return;
  }
  proof.gatewayBound = {
    ok: true,
    projectRoot: bound.projectRoot,
    unversioned: bound.unversioned === true,
  };

  const controller = createBuildController({
    runtimeRoot,
    gateway: {
      bindProject: (cwd) => runtime.bindProject({ cwd }),
      startTask: (objective, extra) =>
        runtime.startTask({ objective, ...extra }),
      resumeTask: (taskId, extra) => runtime.resumeTask({ taskId, ...extra }),
      // Prove fabric start only — do not await full engineer completion.
      awaitTask: async (taskId) => {
        const deadline = Date.now() + Math.min(STEP_MS, 180_000);
        while (Date.now() < deadline) {
          const snap = runtime.snapshotTask(taskId);
          if (
            snap &&
            (snap.status === "running" ||
              snap.status === "completed" ||
              snap.status === "failed" ||
              snap.status === "interrupted" ||
              snap.status === "cancelled")
          ) {
            return snap;
          }
          await sleep(750);
        }
        return (
          runtime.snapshotTask(taskId) || {
            status: "running",
            taskId,
            partial: true,
          }
        );
      },
      steerTask: (taskId, text) => runtime.steerTask(taskId, text),
      snapshotTask: (taskId) => runtime.snapshotTask(taskId),
    },
    fakeMode: false,
    preferredEngine: engine,
  });

  console.error(`engineer tick via ${engine} (start-only await, ≤3min)…`);
  const tickStarted = Date.now();
  let tick;
  try {
    tick = await Promise.race([
      controller.tick(buildId),
      sleep(Math.min(STEP_MS, 200_000)).then(() => ({
        ok: false,
        code: "ENGINEER_TICK_TIMEOUT",
        message: "engineer start wait timed out",
      })),
    ]);
  } catch (err) {
    tick = {
      ok: false,
      code: "ENGINEER_TICK_ERROR",
      message: err instanceof Error ? err.message : String(err),
    };
  }
  proof.tickElapsedMs = Date.now() - tickStarted;

  build = readBuildRecord(runtimeRoot, buildId);
  const engineer = (build?.children || []).find((c) => c.kind === "engineer");
  const snap = engineer?.taskId
    ? runtime.snapshotTask(engineer.taskId)
    : null;

  proof.tick = {
    ok: tick.ok === true,
    action: tick.action,
    kind: tick.kind,
    code: tick.code,
    message: tick.message,
  };
  proof.engineerChild = engineer
    ? {
        kind: engineer.kind,
        taskId: engineer.taskId,
        dispatchState: engineer.dispatchState,
        preferredEngine: engineer.preferredEngine || engine,
      }
    : null;
  proof.engineerSnapshot = snap
    ? {
        status: snap.status,
        taskId: snap.taskId,
      }
    : null;

  const engineerStarted =
    Boolean(engineer?.taskId) &&
    (engineer.dispatchState === "dispatched" ||
      engineer.dispatchState === "terminal_seen" ||
      engineer.dispatchState === "consumed" ||
      (snap &&
        (snap.status === "running" ||
          snap.status === "completed" ||
          snap.status === "failed" ||
          snap.status === "interrupted")));

  proof.ok =
    openedUnbound &&
    helpReachable &&
    buildStartWorked &&
    proof.gitInitByOrigin === true &&
    proof.gatewayBound.ok === true &&
    engineerStarted &&
    !process.env.PATHCODE_BUILD_FAKE &&
    !process.env.PATHCODE_GATEWAY_FAKE_ENGINE;
  proof.verdict = proof.ok
    ? "OPERATOR_ENTRY_GREENFIELD_VERIFIED"
    : "OPERATOR_ENTRY_ENGINEER_NOT_STARTED";
  proof.cliSample = plain.slice(-2500);

  writeFileSync(OUT, JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof, null, 2));
  process.exitCode = proof.ok ? 0 : 1;

  try {
    process.chdir(tmpdir());
    rmSync(base, { recursive: true, force: true });
  } catch {
    // keep for diagnosis
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
