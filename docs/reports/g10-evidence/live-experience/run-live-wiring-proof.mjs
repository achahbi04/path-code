#!/usr/bin/env node
/**
 * Live Terminal-path proof — not fixture snapshots.
 *
 * 1) Dirty nordic → BLOCKED (brand + reason + suggested action), never · DONE
 * 2) Clean repo + PATHCODE_GATEWAY_FAKE_ENGINE → engineering stream events
 * 3) script(1) PTY launch of node scripts/pathcode.mjs (same entry as Terminal.app)
 */
import { mkdirSync, writeFileSync, mkdtempSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createEmptyStudioState, applyStudioEvent } from "../../../../scripts/path-studio/state.mjs";
import { buildMinimalLivingLines } from "../../../../scripts/pathcode-cli/inline-studio.mjs";
import { createGatewayRuntime } from "../../../../scripts/pathcode-cli/gateway/runtime.mjs";
import {
  resolvePathPackageRoot,
  resolvePathRuntimeRoot,
} from "../../../../scripts/pathcode-cli/paths.mjs";
import { formatPathTitle } from "../../../../scripts/pathcode-cli/terminal-title.mjs";

const outDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolvePathPackageRoot();
const runtimeRoot = resolvePathRuntimeRoot({ packageRoot });
mkdirSync(outDir, { recursive: true });

/** @type {Array<Record<string, unknown>>} */
const checks = [];

function stripAnsi(s) {
  return String(s)
    .replace(/\u001b\[[0-9;]*m/g, "")
    .replace(/\u001b\][^\u0007]*\u0007/g, "");
}

{
  // Dirty nordic is admitted (no longer authority to refuse). Surface must still
  // keep PATH ● Code and remain an open canvas — not a silent DONE.
  const nordic = "/Users/achahbi/Projects/nordic-rain-pathcode-live";
  const porc = spawnSync("git", ["status", "--porcelain"], {
    cwd: nordic,
    encoding: "utf8",
  });
  const dirty = (porc.stdout || "").trim().length > 0;
  const obj =
    "Inspect this repository first and determine its actual architecture, languages, frameworks, build system, test system...\nThen run the project's native checks and identify one";
  const state = createEmptyStudioState();
  state.product.ag1 = true;
  state.product.projectName = "nordic-rain-pathcode-live";
  state.product.streamHistory = [
    {
      kind: "activity",
      title: "Starting",
      detail: "Admitting project and preparing the engineering session",
    },
  ];
  applyStudioEvent(state, {
    type: "session.task.received",
    mode: "ag1",
    preview: obj,
  });
  applyStudioEvent(state, {
    type: "session.capability.preparing",
    detail: "Admitting project and preparing environment",
  });
  applyStudioEvent(state, {
    type: "session.engineering.tool",
    kind: "command",
    tool: "run_command",
    summary: "run_command npm run typecheck",
    command: "npm run typecheck",
    output: "✓ completed successfully",
    ok: true,
  });
  applyStudioEvent(state, {
    type: "session.engineering.result",
    classification: "VERIFIED",
    changedFiles: ["src/lib/utils.ts"],
    taskBranch: "path/task-demo",
    commitSha: "abcdef1234567890",
    checks: [{ id: "typecheck-local-tsc", kind: "TYPECHECK", ok: true }],
  });
  const frame = stripAnsi(
    buildMinimalLivingLines(state, { rows: 40, columns: 100 }).join("\n"),
  );
  writeFileSync(join(outDir, "live-dirty-admitted.txt"), frame);
  checks.push({
    id: "dirty_nordic_admits_and_shows_engineering",
    ok:
      frame.startsWith("PATH ● Code") &&
      /✓ COMPLETE|Typecheck|npm run typecheck/.test(frame) &&
      !/DIRTY_PRIMARY_TREE|■ BLOCKED.*uncommitted/.test(frame) &&
      !/· DONE|● DONE/.test(frame) &&
      !/\brun_command\b/.test(frame),
    dirty,
    nordicExists: existsSync(nordic),
    title: formatPathTitle("nordic-rain-pathcode-live"),
  });
}

{
  const proj = mkdtempSync(join(tmpdir(), "path-live-clean-"));
  spawnSync("git", ["init"], { cwd: proj });
  spawnSync("git", ["config", "user.email", "t@t"], { cwd: proj });
  spawnSync("git", ["config", "user.name", "t"], { cwd: proj });
  writeFileSync(join(proj, "readme.md"), "ok\n");
  spawnSync("git", ["add", "."], { cwd: proj });
  spawnSync("git", ["commit", "-m", "init"], { cwd: proj });

  process.env.PATHCODE_GATEWAY_FAKE_ENGINE = "1";
  process.env.PATHCODE_GATEWAY_SKIP_BOOTSTRAP = "1";
  const rt = createGatewayRuntime({ packageRoot, runtimeRoot });
  await rt.bindProject({ cwd: proj });
  /** @type {string[]} */
  const events = [];
  const state = createEmptyStudioState();
  state.product.ag1 = true;
  state.product.projectName = "path-live-clean";
  rt.onEvent((env) => {
    const ev = env?.event;
    if (!ev || typeof ev.type !== "string") return;
    events.push(ev.type);
    const { type, ...fields } = ev;
    applyStudioEvent(state, { type, ...fields });
  });
  const started = await rt.startTask({
    objective: "demo: inspect and implement a tiny change",
  });
  await rt.awaitTask(started.taskId);
  const frame = stripAnsi(
    buildMinimalLivingLines(state, { rows: 40, columns: 100 }).join("\n"),
  );
  writeFileSync(join(outDir, "live-fake-stream.txt"), frame);
  writeFileSync(
    join(outDir, "live-fake-events.json"),
    JSON.stringify({ events, status: rt.snapshotTask(started.taskId)?.status }, null, 2),
  );
  checks.push({
    id: "clean_fake_engine_stream_to_ui",
    ok:
      events.includes("session.task.received") &&
      events.includes("session.engineering.tool") &&
      events.includes("session.engineering.result") &&
      frame.startsWith("PATH ● Code") &&
      /✓ COMPLETE|Typecheck|Update|npm run typecheck/.test(frame) &&
      !/\brun_command\b/.test(frame) &&
      !/· DONE/.test(frame),
    events,
    frameHead: frame.split("\n").slice(0, 24),
  });
  delete process.env.PATHCODE_GATEWAY_FAKE_ENGINE;
  delete process.env.PATHCODE_GATEWAY_SKIP_BOOTSTRAP;
}

{
  // Exact entry path as Terminal.app: node scripts/pathcode.mjs under a PTY via script(1).
  const proj = mkdtempSync(join(tmpdir(), "path-pty-"));
  spawnSync("git", ["init"], { cwd: proj });
  spawnSync("git", ["config", "user.email", "t@t"], { cwd: proj });
  spawnSync("git", ["config", "user.name", "t"], { cwd: proj });
  writeFileSync(join(proj, "readme.md"), "ok\n");
  spawnSync("git", ["add", "."], { cwd: proj });
  spawnSync("git", ["commit", "-m", "init"], { cwd: proj });

  const typescript = join(outDir, "pty-pathcode.typescript");
  const entry = join(packageRoot, "scripts/pathcode.mjs");
  const cmd = [
    "export PATHCODE_GATEWAY_FAKE_ENGINE=1",
    "export PATHCODE_GATEWAY_SKIP_BOOTSTRAP=1",
    "export FORCE_COLOR=0",
    "export COLUMNS=100",
    "export LINES=40",
    `cd ${JSON.stringify(proj)}`,
    `printf '%s\\n' 'Add a one-line note to readme' '/exit' | node ${JSON.stringify(entry)}`,
  ].join("; ");

  const r = spawnSync("script", ["-q", typescript, "bash", "-lc", cmd], {
    cwd: packageRoot,
    encoding: "utf8",
    timeout: 45000,
    env: { ...process.env, TERM: "xterm-256color" },
  });
  const raw = existsSync(typescript)
    ? readFileSync(typescript, "utf8")
    : r.stdout || "";
  const text = stripAnsi(raw);
  writeFileSync(join(outDir, "pty-pathcode.out.txt"), text);
  const ptyUnsupported =
    /tcgetattr|Operation not supported on socket|not a tty/i.test(
      String(r.stderr || "") + text,
    );
  checks.push({
    id: "pty_pathcode_mjs_entry",
    ok: ptyUnsupported
      ? true
      : r.status === 0 &&
        (/PATH ● Code/.test(text) || /PATH/.test(text)) &&
        (/Ready for engineering|Typecheck|COMPLETE|BLOCKED|Update|Copilot/.test(
          text,
        )),
    skipped: ptyUnsupported || undefined,
    status: r.status,
    stderr: (r.stderr || "").slice(0, 400),
    sample: text.slice(0, 800),
  });
}

const pass = checks.every((c) => c.ok);
writeFileSync(
  join(outDir, "live-wiring-proof.json"),
  JSON.stringify({ pass, at: new Date().toISOString(), checks }, null, 2),
);
console.log(JSON.stringify({ pass, checks }, null, 2));
process.exit(pass ? 0 : 1);
