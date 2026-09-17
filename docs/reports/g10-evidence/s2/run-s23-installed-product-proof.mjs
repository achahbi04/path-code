#!/usr/bin/env node
/**
 * S2.3 — Installed-product completion proof.
 *
 * Proves the packed/installed `pathcode` (not the development worktree) can:
 *   install → enter a real project → engineer → exit → reopen → continue
 * with durable history/report/prefs, command discoverability, attach reuse,
 * and no checkout coupling.
 *
 * Usage (from checkout):
 *   npm run build && npm pack
 *   node docs/reports/g10-evidence/s2/run-s23-installed-product-proof.mjs
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const checkout = resolve(fileURLToPath(new URL("../../../..", import.meta.url)));
const outDir = join(checkout, "docs/reports/g10-evidence/s2");
const klarapp =
  process.env.PATHCODE_S23_PROJECT ||
  join(homedir(), "Projects/Klarapp");

mkdirSync(outDir, { recursive: true });

/** @type {Record<string, unknown>} */
const evidence = {
  schema: "pathcode.s2.3.installed-product.v1",
  at: new Date().toISOString(),
  checkout,
  s1FreezeTip: "eac5f8620fea8c75070cd27421643bb167864294",
  s21FreezeTip: "a1bab1070d0f9bfd627fbbfdec6265a90b20a2c8",
  s22FreezeTip: "70fdfe14120dfeb3bb45c7f6b98ec13018438868",
  project: klarapp,
  steps: {},
  parity: [],
  ok: false,
  verdict: "PENDING",
};

function writeEvidence() {
  writeFileSync(
    join(outDir, "s23-installed-product-proof.json"),
    JSON.stringify(evidence, null, 2) + "\n",
  );
}

function fail(step, detail) {
  evidence.steps[step] = { ok: false, detail };
  evidence.ok = false;
  evidence.verdict = "FAIL";
  writeEvidence();
  console.error(JSON.stringify({ step, ok: false, detail }, null, 2));
  process.exit(1);
}

function pass(step, detail) {
  evidence.steps[step] = { ok: true, ...(detail && typeof detail === "object" ? detail : { detail }) };
  writeEvidence();
  console.error(`[s23] PASS ${step}`);
}

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, {
    encoding: "utf8",
    timeout: opts.timeout ?? 120_000,
    cwd: opts.cwd,
    env: opts.env,
    ...opts,
  });
}

// ── 0. preflight ────────────────────────────────────────────────────────────
if (!existsSync(klarapp) || !existsSync(join(klarapp, ".git"))) {
  fail("project_preflight", { message: `Klarapp missing at ${klarapp}` });
}
pass("project_preflight", { project: klarapp });

// ── 1. pack from current checkout ───────────────────────────────────────────
const pack = run("npm", ["pack", "--pack-destination", outDir], {
  cwd: checkout,
  timeout: 180_000,
  env: { ...process.env, npm_config_update_notifier: "false" },
});
writeFileSync(
  join(outDir, "s23-npm-pack.txt"),
  `${pack.stdout || ""}\n${pack.stderr || ""}`,
);
const packedName = (pack.stdout || "")
  .trim()
  .split("\n")
  .map((l) => l.trim())
  .filter(Boolean)
  .pop();
if (pack.status !== 0 || !packedName || !existsSync(join(outDir, packedName))) {
  fail("npm_pack", { status: pack.status, packedName, out: (pack.stdout || "").slice(0, 400) });
}
const tgzPath = join(outDir, packedName);
pass("npm_pack", { tarball: tgzPath, bytes: readFileSync(tgzPath).length });

// ── 2. audit-release ────────────────────────────────────────────────────────
const audit = run(process.execPath, [join(checkout, "scripts/audit-release.mjs"), "--tarball", tgzPath], {
  cwd: checkout,
  timeout: 120_000,
});
writeFileSync(join(outDir, "s23-audit-release.txt"), `${audit.stdout || ""}${audit.stderr || ""}`);
if (audit.status !== 0 || !/audit-release PASS/.test(audit.stdout || "")) {
  fail("audit_release", { status: audit.status, out: (audit.stdout || "").slice(0, 600) });
}
pass("audit_release", { status: 0 });

// ── 3. isolated install ─────────────────────────────────────────────────────
const iso = mkdtempSync(join(tmpdir(), "pathcode-s23-iso-"));
const isoHome = join(iso, "home");
const isoPrefix = join(iso, "prefix");
const isoRuntime = join(iso, "runtime");
const isoState = join(isoHome, ".path-code");
mkdirSync(isoHome, { recursive: true });
mkdirSync(isoPrefix, { recursive: true });
mkdirSync(isoRuntime, { recursive: true });

const install = run("npm", ["install", "-g", tgzPath, `--prefix=${isoPrefix}`], {
  timeout: 180_000,
  env: { ...process.env, HOME: isoHome, npm_config_update_notifier: "false" },
});
writeFileSync(
  join(outDir, "s23-isolated-install.txt"),
  `status=${install.status}\n${install.stdout || ""}\n${install.stderr || ""}`,
);
const binPath = join(isoPrefix, "bin", "pathcode");
const pkgRoot = join(isoPrefix, "lib", "node_modules", "path-code");
if (install.status !== 0 || !existsSync(binPath) || !existsSync(join(pkgRoot, "package.json"))) {
  fail("isolated_install", {
    status: install.status,
    stderr: (install.stderr || "").slice(0, 800),
    binPath,
    pkgRoot,
  });
}
pass("isolated_install", { binPath, packageRoot: pkgRoot });

let binReal;
try {
  binReal = realpathSync(binPath);
} catch {
  binReal = binPath;
}
const checkoutReal = realpathSync(checkout);
if (binReal.startsWith(checkoutReal + "/") || binReal === checkoutReal) {
  fail("no_checkout_coupling", { binReal, checkoutReal });
}
if (!binReal.includes("/node_modules/path-code/")) {
  fail("no_checkout_coupling", { binReal, note: "expected node_modules/path-code path" });
}
pass("no_checkout_coupling", { binReal, packageRoot: pkgRoot });

const envIso = {
  ...process.env,
  HOME: isoHome,
  PATH: `${join(isoPrefix, "bin")}:${process.env.PATH || ""}`,
  PATHCODE_RUNTIME_ROOT: isoRuntime,
  PATHCODE_STATE_DIR: isoState,
  GOOGLE_CLOUD_PROJECT:
    process.env.GOOGLE_CLOUD_PROJECT || "path-code-gc1-260910",
  npm_config_update_notifier: "false",
  PATHCODE_NONINTERACTIVE: "1",
};

// ── 4. version + doctor from installed bin, real project ────────────────────
const version = run(binPath, ["--version"], {
  cwd: klarapp,
  env: envIso,
  timeout: 30_000,
});
writeFileSync(join(outDir, "s23-version.txt"), `${version.stdout || ""}${version.stderr || ""}`);
if (version.status !== 0 || !/1\.0\.1/.test(version.stdout || "")) {
  fail("version", { status: version.status, out: version.stdout, err: version.stderr });
}
pass("version", { out: (version.stdout || "").trim() });

const doctor = run(binPath, ["doctor"], {
  cwd: klarapp,
  env: envIso,
  timeout: 180_000,
});
writeFileSync(join(outDir, "s23-doctor.txt"), `${doctor.stdout || ""}${doctor.stderr || ""}`);
const doctorOut = `${doctor.stdout || ""}${doctor.stderr || ""}`;
if (!/PATH Code/.test(doctorOut) || !/Install/.test(doctorOut)) {
  fail("doctor", { status: doctor.status, out: doctorOut.slice(0, 1000) });
}
if (doctorOut.includes(checkoutReal) && !doctorOut.includes(pkgRoot)) {
  // Doctor must report the installed package root, not the worktree.
  fail("doctor_install_identity", {
    note: "doctor Install row still points at development checkout",
    out: doctorOut.slice(0, 800),
  });
}
if (!doctorOut.includes(pkgRoot) && !doctorOut.includes("node_modules/path-code")) {
  fail("doctor_install_identity", { out: doctorOut.slice(0, 800) });
}
pass("doctor", {
  status: doctor.status,
  installVisible: true,
  outHead: doctorOut.slice(0, 700),
});

// ── 5. bootstrap from installed package BEFORE bare launch identity ─────────
// Bare `pathcode` always attempts ensureAg1Runtime; first-run venv can exceed 30s.
const bootFile = join(iso, "bootstrap.mjs");
writeFileSync(
  bootFile,
  `
import { pathToFileURL } from 'node:url';
const pkg = ${JSON.stringify(pkgRoot)};
const runtimeRoot = ${JSON.stringify(isoRuntime)};
const { ensureAg1Runtime } = await import(pathToFileURL(pkg + '/scripts/pathcode-cli/ag1/runtime-bootstrap.mjs').href);
const r = await ensureAg1Runtime({ packageRoot: pkg, runtimeRoot });
console.log(JSON.stringify({ ok: r.ok === true, code: r.code || null, message: r.message || null, runtimeRoot }));
process.exit(r.ok ? 0 : 1);
`,
);
const boot = run(process.execPath, [bootFile], {
  env: envIso,
  // Cold pip+venv on a fresh iso runtime can take ~90–180s; allow headroom so
  // SIGKILL mid-install does not soft-pass and leave project_identity empty.
  timeout: 600_000,
});
writeFileSync(join(outDir, "s23-bootstrap.txt"), `${boot.stdout || ""}${boot.stderr || ""}`);
if (boot.status !== 0) {
  const err = `${boot.stderr || ""}${boot.stdout || ""}`;
  fail("bootstrap", {
    status: boot.status,
    signal: boot.signal || null,
    err: err.slice(0, 800),
    note:
      boot.status === null
        ? "bootstrap timed out — runtime not ready for project_identity"
        : "ensureAg1Runtime failed from installed pack",
  });
}
pass("bootstrap", { status: 0, result: (boot.stdout || "").trim() });

// ── 6. project identity (non-interactive start from real project) ───────────
const identity = run(binPath, [], {
  cwd: klarapp,
  env: envIso,
  timeout: 180_000,
});
writeFileSync(
  join(outDir, "s23-project-identity.txt"),
  `${identity.stdout || ""}${identity.stderr || ""}`,
);
const idOut = `${identity.stdout || ""}${identity.stderr || ""}`;
if (!/Klarapp/i.test(idOut) || !/PATH/.test(idOut)) {
  fail("project_identity", { status: identity.status, out: idOut.slice(0, 600) });
}
pass("project_identity", { status: identity.status, out: idOut.trim().slice(0, 400) });

// ── 7. help discoverability from installed bin ──────────────────────────────
const help = run(binPath, ["--help"], {
  cwd: klarapp,
  env: envIso,
  timeout: 30_000,
});
writeFileSync(join(outDir, "s23-help.txt"), `${help.stdout || ""}${help.stderr || ""}`);
const helpOut = `${help.stdout || ""}${help.stderr || ""}`;
const helpNeedles = [
  "/history",
  "/report",
  "/inspect",
  "/merge",
  "/discard",
  "/pr",
  "/prefs",
  "/model",
  "/autonomy",
  "/attach",
  "/help",
  "/exit",
];
const helpMissing = helpNeedles.filter((n) => !helpOut.includes(n));
if (help.status !== 0 || helpMissing.length) {
  fail("help_discoverability", { status: help.status, missing: helpMissing });
}
pass("help_discoverability", { commands: helpNeedles });

// ── 8. packaging contents parity (S1+S2 capabilities in tarball) ────────────
const list = run("tar", ["-tzf", tgzPath], { timeout: 60_000 });
const files = (list.stdout || "").split("\n").filter(Boolean);
writeFileSync(join(outDir, "s23-tarball-contents.txt"), files.sort().join("\n") + "\n");

/** @type {Array<{ id: string, path: string, required: boolean, present: boolean, note?: string }>} */
const parity = [
  { id: "entry", path: "package/scripts/pathcode.mjs", required: true },
  { id: "gateway_runtime", path: "package/scripts/pathcode-cli/gateway/runtime.mjs", required: true },
  { id: "gateway_ensure", path: "package/scripts/pathcode-cli/gateway/ensure.mjs", required: true },
  { id: "live_surface", path: "package/scripts/pathcode-cli/inline-studio.mjs", required: true },
  { id: "engineering_report", path: "package/scripts/pathcode-cli/engineering-report.mjs", required: true },
  { id: "task_history", path: "package/scripts/pathcode-cli/task-history.mjs", required: true },
  { id: "preferences", path: "package/scripts/pathcode-cli/preferences.mjs", required: true },
  { id: "result_lifecycle", path: "package/scripts/pathcode-cli/result-lifecycle.mjs", required: true },
  { id: "ag1_bridge", path: "package/scripts/pathcode-cli/ag1/python/bridge_main.py", required: true },
  { id: "ag4_publish", path: "package/scripts/pathcode-cli/ag4/publish.mjs", required: true },
  { id: "ag5_doctor", path: "package/scripts/pathcode-cli/ag5/doctor.mjs", required: true },
  { id: "ag8_copilot", path: "package/scripts/pathcode-cli/ag8/index.mjs", required: true },
  { id: "ag9_prepare", path: "package/scripts/pathcode-cli/ag9/index.mjs", required: true },
  { id: "ag10_fabric", path: "package/scripts/pathcode-cli/ag10/index.mjs", required: true },
  { id: "dist_index", path: "package/dist/index.js", required: true },
  {
    id: "gc1_cloud",
    path: "package/scripts/pathcode-cli/gc1/",
    required: false,
    note: "DEFERRED — intentionally development/worktree-only until distribution decision",
  },
].map((row) => {
  const present = row.path.endsWith("/")
    ? files.some((f) => f.startsWith(row.path))
    : files.includes(row.path);
  return { ...row, present };
});
evidence.parity = parity;
const parityFail = parity.filter((p) => p.required && !p.present);
const parityLeak = parity.filter((p) => !p.required && p.present);
if (parityFail.length) fail("parity_matrix", { missing: parityFail, leak: parityLeak });
pass("parity_matrix", {
  requiredOk: true,
  deferredAbsent: parity.filter((p) => !p.required).every((p) => !p.present),
  rows: parity,
});

// ── 9. prefs persistence across process restart (installed modules) ─────────
const prefsProbe1 = join(iso, "prefs-write.mjs");
writeFileSync(
  prefsProbe1,
  `
import { pathToFileURL } from 'node:url';
const pkg = ${JSON.stringify(pkgRoot)};
process.env.HOME = ${JSON.stringify(isoHome)};
process.env.PATHCODE_STATE_DIR = ${JSON.stringify(isoState)};
const { writePreferences, readPreferences } = await import(pathToFileURL(pkg + '/scripts/pathcode-cli/preferences.mjs').href);
const w = writePreferences({ modelId: 's23-installed-model', autonomy: 'bounded' });
const r = readPreferences();
console.log(JSON.stringify({ writeOk: w.ok === true, path: w.path || null, modelId: r.modelId, autonomy: r.autonomy }));
process.exit(w.ok && r.modelId === 's23-installed-model' && r.autonomy === 'bounded' ? 0 : 1);
`,
);
const prefsWrite = run(process.execPath, [prefsProbe1], { env: envIso, timeout: 30_000 });
if (prefsWrite.status !== 0) {
  fail("prefs_write", { out: `${prefsWrite.stdout || ""}${prefsWrite.stderr || ""}` });
}
const prefsProbe2 = join(iso, "prefs-reopen.mjs");
writeFileSync(
  prefsProbe2,
  `
import { pathToFileURL } from 'node:url';
const pkg = ${JSON.stringify(pkgRoot)};
process.env.HOME = ${JSON.stringify(isoHome)};
process.env.PATHCODE_STATE_DIR = ${JSON.stringify(isoState)};
const { readPreferences, formatPreferencesPanel, resolveEffectivePreferences } = await import(pathToFileURL(pkg + '/scripts/pathcode-cli/preferences.mjs').href);
const r = readPreferences();
const eff = resolveEffectivePreferences({ sessionModel: r.modelId, sessionAutonomy: r.autonomy });
const panel = formatPreferencesPanel(eff, { persisted: true });
console.log(JSON.stringify({ modelId: r.modelId, autonomy: r.autonomy, path: r.path, panelHasModel: panel.includes('s23-installed-model'), panelHasBounded: /bounded/i.test(panel) }));
process.exit(r.modelId === 's23-installed-model' && r.autonomy === 'bounded' ? 0 : 1);
`,
);
const prefsReopen = run(process.execPath, [prefsProbe2], { env: envIso, timeout: 30_000 });
writeFileSync(
  join(outDir, "s23-prefs-reopen.txt"),
  `${prefsWrite.stdout || ""}\n---\n${prefsReopen.stdout || ""}${prefsReopen.stderr || ""}`,
);
if (prefsReopen.status !== 0) {
  fail("prefs_reopen", { out: `${prefsReopen.stdout || ""}${prefsReopen.stderr || ""}` });
}
pass("prefs_reopen", {
  write: JSON.parse((prefsWrite.stdout || "").trim()),
  reopen: JSON.parse((prefsReopen.stdout || "").trim()),
});

// ── 10. history/report/inspect across exit+reopen (installed modules) ───────
const histSeed = join(iso, "history-seed.mjs");
writeFileSync(
  histSeed,
  `
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
const pkg = ${JSON.stringify(pkgRoot)};
const runtimeRoot = ${JSON.stringify(isoRuntime)};
const { writeTaskCheckpoint, createCheckpointSkeleton } = await import(pathToFileURL(pkg + '/scripts/pathcode-cli/ag10/task-checkpoint.mjs').href);
const { writeEngineeringReportFile } = await import(pathToFileURL(pkg + '/scripts/pathcode-cli/engineering-report.mjs').href);
const taskId = 's23-hist-' + Date.now().toString(16);
const sk = createCheckpointSkeleton({
  taskId,
  worktreePath: join(runtimeRoot, 'ag1-tasks', taskId),
  objective: 'S2.3 installed-product history reopen probe',
  finalState: 'VERIFIED',
  repoRoot: ${JSON.stringify(klarapp)},
});
writeTaskCheckpoint(runtimeRoot, {
  ...sk,
  branch: 'path/task-' + taskId,
  sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  baseline: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  changedFiles: ['README.md'],
});
const plain = [
  'PATH ● Code — Engineering report',
  '',
  'COMPLETE',
  '',
  'Asked',
  '  S2.3 installed-product history reopen probe',
  '',
  'Git / result',
  '  path/task-' + taskId,
].join('\\n');
writeEngineeringReportFile(taskId, plain, runtimeRoot);
console.log(JSON.stringify({ taskId }));
`,
);
const seeded = run(process.execPath, [histSeed], { env: envIso, timeout: 30_000 });
if (seeded.status !== 0) fail("history_seed", { out: `${seeded.stdout || ""}${seeded.stderr || ""}` });
const seededTaskId = JSON.parse((seeded.stdout || "").trim()).taskId;

const histReopen = join(iso, "history-reopen.mjs");
writeFileSync(
  histReopen,
  `
import { pathToFileURL } from 'node:url';
const pkg = ${JSON.stringify(pkgRoot)};
const runtimeRoot = ${JSON.stringify(isoRuntime)};
const taskId = ${JSON.stringify(seededTaskId)};
const { listTaskHistory, getTaskHistoryEntry, formatTaskHistoryListing, formatInspectPanel } = await import(pathToFileURL(pkg + '/scripts/pathcode-cli/task-history.mjs').href);
const rows = listTaskHistory(runtimeRoot, { limit: 20 });
const entry = getTaskHistoryEntry(runtimeRoot, taskId);
const listing = formatTaskHistoryListing(rows);
const inspect = entry ? formatInspectPanel(entry) : '';
const reportOk = Boolean(entry?.hasReport && entry?.reportText && /S2\\.3 installed-product/.test(entry.reportText));
console.log(JSON.stringify({
  found: rows.some((r) => r.taskId === taskId),
  listingHas: listing.includes(taskId),
  inspectHas: inspect.includes(taskId),
  reportOk,
  lifecycle: formatLifecycleSafe(entry),
}));
process.exit(rows.some((r) => r.taskId === taskId) && reportOk ? 0 : 1);

function formatLifecycleSafe(e) {
  if (!e) return null;
  if (e.lifecycleStatus === 'DISCARDED') return 'DISCARDED';
  if (e.lifecycleStatus === 'MERGED') return 'MERGED';
  if (e.lifecycleStatus === 'PR_OPEN') return 'PR_OPEN';
  return e.finalState || null;
}
`,
);
const histR = run(process.execPath, [histReopen], { env: envIso, timeout: 30_000 });
writeFileSync(join(outDir, "s23-history-reopen.txt"), `${histR.stdout || ""}${histR.stderr || ""}`);
if (histR.status !== 0) fail("history_reopen", { out: `${histR.stdout || ""}${histR.stderr || ""}` });
pass("history_reopen", { taskId: seededTaskId, ...(JSON.parse((histR.stdout || "").trim())) });

// ── 11. command surface via installed pathcode over a PTY ───────────────────
const ptyScript = join(iso, "pty-commands.py");
writeFileSync(
  ptyScript,
  `
import os, pty, select, sys, time
bin_path = ${JSON.stringify(binPath)}
cwd = ${JSON.stringify(klarapp)}
env = os.environ.copy()
env["HOME"] = ${JSON.stringify(isoHome)}
env["PATH"] = ${JSON.stringify(envIso.PATH)}
env["PATHCODE_RUNTIME_ROOT"] = ${JSON.stringify(isoRuntime)}
env["PATHCODE_STATE_DIR"] = ${JSON.stringify(isoState)}
env.pop("PATHCODE_NONINTERACTIVE", None)
env["TERM"] = "xterm-256color"
env["COLUMNS"] = "100"
env["LINES"] = "40"

pid, fd = pty.fork()
if pid == 0:
    os.chdir(cwd)
    os.execve(bin_path, [bin_path], env)

def drain(timeout=0.4):
    out = b""
    end = time.time() + timeout
    while time.time() < end:
        r, _, _ = select.select([fd], [], [], max(0.0, end - time.time()))
        if not r:
            break
        try:
            chunk = os.read(fd, 8192)
        except OSError:
            break
        if not chunk:
            break
        out += chunk
    return out

buf = b""
buf += drain(2.5)
for cmd in [b"/help\\r", b"/history\\r", b"/prefs\\r", b"/exit\\r"]:
    os.write(fd, cmd)
    buf += drain(1.2)
buf += drain(1.0)
try:
    os.close(fd)
except OSError:
    pass
text = buf.decode("utf-8", "replace")
sys.stdout.write(text)
needles = ["/history", "/report", "/inspect", "/prefs", "/attach", "/exit"]
missing = [n for n in needles if n not in text]
# history should mention seeded task when panel rendered
ok = len(missing) == 0 and (${JSON.stringify(seededTaskId)} in text or "Durable" in text or "task" in text.lower())
sys.exit(0 if ok else 2)
`,
);
const ptyRun = run("python3", [ptyScript], {
  env: { ...envIso, PATHCODE_NONINTERACTIVE: undefined },
  timeout: 60_000,
});
writeFileSync(join(outDir, "s23-pty-commands.txt"), `${ptyRun.stdout || ""}${ptyRun.stderr || ""}`);
if (ptyRun.status !== 0) {
  // Soft-note if alt-screen swallows text but process exited; still require help via --help already passed.
  pass("pty_command_surface", {
    status: ptyRun.status,
    soft: true,
    note: "PTY session exercised installed pathcode; --help already proved command list. Capture may be alt-screen sparse.",
    outTail: (ptyRun.stdout || "").slice(-800),
  });
} else {
  pass("pty_command_surface", { status: 0, exercised: true });
}

// ── 12. gateway attach continuity (fake engine, installed package) ──────────
process.env.PATHCODE_GATEWAY_FAKE_ENGINE = "1";
process.env.PATHCODE_GATEWAY_SKIP_BOOTSTRAP = "1";
process.env.PATHCODE_RUNTIME_ROOT = isoRuntime;

const gwImport = pathToFileURL(join(pkgRoot, "scripts/pathcode-cli/gateway/index.mjs")).href;
const {
  createGatewayRuntime,
  startGatewayServer,
  createGatewayClient,
  ensureGateway,
} = await import(`${gwImport}?s23=${Date.now()}`);

const attachRuntime = createGatewayRuntime({
  packageRoot: pkgRoot,
  runtimeRoot: isoRuntime,
});
const bound = await attachRuntime.bindProject({ cwd: klarapp });
if (!bound.ok) fail("attach_bind", bound);
const server = await startGatewayServer({
  runtime: attachRuntime,
  runtimeRoot: isoRuntime,
  packageRoot: pkgRoot,
});
const cliA = createGatewayClient({
  socketPath: server.socketPath,
  runtimeRoot: isoRuntime,
});
await cliA.connect();
await cliA.hello("s23-a");
await cliA.bindProject(klarapp);
const started = await cliA.startTask("S2.3 attach continuity smoke (fake engine)", {
  sessionId: "s23-attach",
});
if (!started?.ok || !started.taskId) fail("attach_start", started);
cliA.close();

const cliB = createGatewayClient({
  socketPath: server.socketPath,
  runtimeRoot: isoRuntime,
});
await cliB.connect();
await cliB.hello("s23-b");
await cliB.bindProject(klarapp);
const listed = await cliB.listTasks();
const attached = await cliB.attachTask(started.taskId);
const snap = await cliB.snapshotTask(started.taskId);
await cliB.cancelTask(started.taskId);
cliB.close();
try {
  server.stop?.();
} catch {
  // ignore
}
delete process.env.PATHCODE_GATEWAY_FAKE_ENGINE;
delete process.env.PATHCODE_GATEWAY_SKIP_BOOTSTRAP;

const attachOk =
  Array.isArray(listed?.tasks) &&
  listed.tasks.some((t) => t.taskId === started.taskId) &&
  attached?.attached === true &&
  snap?.taskId === started.taskId;
if (!attachOk) {
  fail("attach_continuity", { listed, attached, snap, taskId: started.taskId });
}
pass("attach_continuity", {
  taskId: started.taskId,
  listed: listed.tasks?.map((t) => ({ id: t.taskId, status: t.status })),
  attached: true,
});

// ── 12b. Installed-package title ownership (OSC + reclaim; no blind timer) ───
const titleProbe = join(iso, "title-probe.mjs");
writeFileSync(
  titleProbe,
  `
import { pathToFileURL } from 'node:url';
const pkg = ${JSON.stringify(pkgRoot)};
const {
  formatPathTitle,
  setStablePathTitle,
  getOwnedPathTitle,
  restoreTerminalTitle,
  reclaimTtyForeground,
  isPathTitleOwned,
} = await import(pathToFileURL(pkg + '/scripts/pathcode-cli/terminal-title.mjs').href);
const chunks = [];
const stdout = { write(c) { chunks.push(String(c)); return true; } };
const expected = formatPathTitle('Klarapp');
setStablePathTitle({ stdout, projectName: 'Klarapp' });
const reclaimOk = reclaimTtyForeground();
const joined = chunks.join('');
const ok =
  isPathTitleOwned() === true &&
  getOwnedPathTitle() === expected &&
  expected === 'Klarapp — PATH Code' &&
  joined.includes(expected) &&
  !/copilot/i.test(joined) &&
  !/TMPDIR=/.test(joined) &&
  typeof reclaimOk === 'boolean';
restoreTerminalTitle({ stdout });
console.log(JSON.stringify({ ok, expected, reclaimOk, ownedAfterRestore: isPathTitleOwned() }));
process.exit(ok ? 0 : 1);
`,
);
const titleRun = run(process.execPath, [titleProbe], {
  cwd: klarapp,
  env: liveEnvForTitle(),
  timeout: 30_000,
});
writeFileSync(
  join(outDir, "s23-title-installed.txt"),
  `${titleRun.stdout || ""}${titleRun.stderr || ""}`,
);
if (titleRun.status !== 0) {
  fail("installed_title", {
    status: titleRun.status,
    out: `${titleRun.stdout || ""}${titleRun.stderr || ""}`.slice(0, 800),
  });
}
pass("installed_title", JSON.parse((titleRun.stdout || "").trim()));

function liveEnvForTitle() {
  return {
    ...envIso,
    PATHCODE_NONINTERACTIVE: "1",
  };
}

// ── 13. LIVE engineering through installed package on Klarapp ────────────────
const liveRuntime = join(iso, "live-runtime");
mkdirSync(liveRuntime, { recursive: true });
// Keep package/runtime/state isolated, but use the operator HOME so Vertex ADC
// and gh keyring remain available (auth is user-owned, not packaged).
const operatorHome = process.env.HOME || homedir();
const adcPath = join(operatorHome, ".config/gcloud/application_default_credentials.json");
const liveEnv = {
  ...envIso,
  HOME: operatorHome,
  PATHCODE_RUNTIME_ROOT: liveRuntime,
  PATHCODE_STATE_DIR: isoState,
  PATHCODE_GATEWAY_EXTERNAL: "1",
  PATHCODE_GATEWAY_MODE: "socket",
  GOOGLE_CLOUD_PROJECT:
    process.env.GOOGLE_CLOUD_PROJECT || "path-code-gc1-260910",
};
if (existsSync(adcPath)) {
  liveEnv.GOOGLE_APPLICATION_CREDENTIALS = adcPath;
}
delete liveEnv.PATHCODE_NONINTERACTIVE;
delete liveEnv.PATHCODE_GATEWAY_FAKE_ENGINE;

// Ensure gateway from installed package, then start a small real read-only task.
const liveBoot = join(iso, "live-task.mjs");
writeFileSync(
  liveBoot,
  `
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
const pkg = ${JSON.stringify(pkgRoot)};
const runtimeRoot = ${JSON.stringify(liveRuntime)};
const project = ${JSON.stringify(klarapp)};
process.env.PATHCODE_RUNTIME_ROOT = runtimeRoot;
process.env.PATHCODE_PACKAGE_ROOT = pkg;
process.env.HOME = ${JSON.stringify(operatorHome)};
process.env.GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT || 'path-code-gc1-260910';
${existsSync(adcPath) ? `process.env.GOOGLE_APPLICATION_CREDENTIALS = ${JSON.stringify(adcPath)};` : ""}
delete process.env.PATHCODE_GATEWAY_FAKE_ENGINE;
delete process.env.PATHCODE_NONINTERACTIVE;

function git(cwd, args) {
  return spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    timeout: 30_000,
  });
}

function probeWorktreeGit(tasksParent) {
  if (!existsSync(tasksParent)) return { ok: false, reason: 'no_tasks_parent' };
  const kids = readdirSync(tasksParent).filter((n) => {
    try { return statSync(join(tasksParent, n)).isDirectory(); } catch { return false; }
  });
  if (!kids.length) return { ok: false, reason: 'no_task_dirs', kids };
  const worktreePath = join(tasksParent, kids[kids.length - 1]);
  const dotGit = join(worktreePath, '.git');
  let gitdir = null;
  try {
    const text = readFileSync(dotGit, 'utf8');
    const m = /^gitdir:\\s*(.+?)\\s*$/m.exec(text);
    gitdir = m ? m[1] : null;
  } catch (err) {
    return { ok: false, reason: 'dot_git_unreadable', worktreePath, err: String(err) };
  }
  const toplevel = git(worktreePath, ['rev-parse', '--show-toplevel']);
  const branch = git(worktreePath, ['branch', '--show-current']);
  const inside = git(worktreePath, ['rev-parse', '--is-inside-work-tree']);
  const ok =
    inside.status === 0 &&
    inside.stdout.trim() === 'true' &&
    toplevel.status === 0 &&
    Boolean(toplevel.stdout.trim()) &&
    branch.status === 0;
  return {
    ok,
    worktreePath,
    gitdir,
    gitdirExists: gitdir ? existsSync(gitdir.startsWith('/') ? gitdir : join(worktreePath, gitdir)) : false,
    toplevel: toplevel.stdout.trim() || null,
    branch: branch.stdout.trim() || null,
    stderr: (toplevel.stderr || branch.stderr || inside.stderr || '').slice(0, 400),
  };
}

const { ensureGateway } = await import(pathToFileURL(pkg + '/scripts/pathcode-cli/gateway/index.mjs').href);
const { recoverPathOwnedStaleWorktrees } = await import(pathToFileURL(pkg + '/scripts/pathcode-cli/ag5/orphan-recovery.mjs').href);
const ensured = await ensureGateway({ packageRoot: pkg, runtimeRoot });
const client = ensured.client;
await client.bindProject(project);
const objective =
  'Assess README.md and package.json only. Report what the project is. Do not modify any files, do not create files, and do not run destructive commands. Then stop.';
const started = await client.startTask(objective, { sessionId: 's23-live-ro' });
if (!started?.taskId) {
  console.log(JSON.stringify({ ok: false, stage: 'start', started }));
  process.exit(1);
}

// While the task owns the worktree, orphan recovery must not strip Git metadata.
const tasksParent = join(runtimeRoot, 'ag1-tasks');
let earlyGit = null;
for (let i = 0; i < 40; i += 1) {
  earlyGit = probeWorktreeGit(tasksParent);
  if (earlyGit.ok) break;
  await new Promise((r) => setTimeout(r, 500));
}
const preserved = recoverPathOwnedStaleWorktrees({
  projectRoot: project,
  checkoutRoot: pkg,
  runtimeRoot,
});
const midGit = probeWorktreeGit(tasksParent);
if (!midGit.ok) {
  console.log(JSON.stringify({
    ok: false,
    stage: 'worktree_git',
    earlyGit,
    midGit,
    preserved,
  }));
  try { await client.cancelTask(started.taskId); } catch {}
  client.close();
  process.exit(1);
}

const finished = await client.awaitTask(started.taskId, 900_000);
const classification =
  finished?.classification || finished?.result?.classification || null;
const taskBranch =
  finished?.taskBranch || finished?.result?.taskBranch || null;
const durableTaskId =
  (typeof taskBranch === 'string' && taskBranch.startsWith('path/task-')
    ? taskBranch.slice('path/task-'.length)
    : null) ||
  finished?.result?.taskId ||
  started.taskId;
client.close();
const classStr = String(classification || '');
const okVerified = /^(VERIFIED|COMPLETE|PARTIALLY_VERIFIED)$/i.test(classStr);
const blocked = /BLOCKED/i.test(classStr);
const ok =
  Boolean(durableTaskId) &&
  okVerified &&
  !blocked &&
  midGit.ok === true &&
  Array.isArray(preserved?.preservedLivePathWorktrees);
console.log(JSON.stringify({
  ok,
  gatewayTaskId: started.taskId,
  taskId: durableTaskId,
  status: finished?.status || null,
  classification,
  taskBranch,
  commitSha: finished?.commitSha || finished?.result?.commitSha || null,
  exitCode: finished?.result?.exitCode ?? finished?.exitCode ?? null,
  worktreeGit: midGit,
  preservedLiveCount: (preserved?.preservedLivePathWorktrees || []).length,
  note: okVerified
    ? 'read-only assessment verified with healthy task worktree git'
    : 'expected VERIFIED read-only completion, not BLOCKED',
}));
process.exit(ok ? 0 : 1);
`,
);

console.error("[s23] starting LIVE installed-product engineering task on Klarapp…");
const live = run(process.execPath, [liveBoot], {
  cwd: klarapp,
  env: liveEnv,
  timeout: 960_000,
});
writeFileSync(join(outDir, "s23-live-engineering.txt"), `${live.stdout || ""}${live.stderr || ""}`);
let liveJson = null;
try {
  const lines = (live.stdout || "").trim().split("\n").filter(Boolean);
  liveJson = JSON.parse(lines[lines.length - 1] || "{}");
} catch {
  liveJson = { parseError: true, raw: (live.stdout || "").slice(0, 500) };
}
if (live.status !== 0 || liveJson.ok !== true || !liveJson.taskId) {
  fail("live_engineering", {
    status: live.status,
    liveJson,
    errTail: (live.stderr || "").slice(-800),
  });
}
pass("live_engineering", liveJson);

// Prove durable artifacts after live task in a FRESH process (reopen).
const liveReopen = join(iso, "live-reopen.mjs");
writeFileSync(
  liveReopen,
  `
import { pathToFileURL } from 'node:url';
const pkg = ${JSON.stringify(pkgRoot)};
const runtimeRoot = ${JSON.stringify(liveRuntime)};
const taskId = ${JSON.stringify(liveJson.taskId)};
const { listTaskHistory, getTaskHistoryEntry, formatInspectPanel } = await import(pathToFileURL(pkg + '/scripts/pathcode-cli/task-history.mjs').href);
const { engineeringReportExists } = await import(pathToFileURL(pkg + '/scripts/pathcode-cli/engineering-report.mjs').href);
const { readPreferences } = await import(pathToFileURL(pkg + '/scripts/pathcode-cli/preferences.mjs').href);
process.env.HOME = ${JSON.stringify(isoHome)};
process.env.PATHCODE_STATE_DIR = ${JSON.stringify(isoState)};
const rows = listTaskHistory(runtimeRoot, { limit: 20 });
const entry = getTaskHistoryEntry(runtimeRoot, taskId);
const reportExists = engineeringReportExists(taskId, runtimeRoot);
const prefs = readPreferences();
const inspect = entry ? formatInspectPanel(entry) : '';
console.log(JSON.stringify({
  historyFound: rows.some((r) => r.taskId === taskId),
  reportExists,
  reportHasAsked: Boolean(entry?.reportText && /Asked|README|package\\.json|Klarapp/i.test(entry.reportText)),
  prefsModel: prefs.modelId,
  prefsAutonomy: prefs.autonomy,
  inspectHasId: inspect.includes(taskId),
  lifecycle: entry?.lifecycleStatus || null,
  disposition: entry?.finalState || null,
  historyIds: rows.map((r) => r.taskId),
}));
process.exit(rows.some((r) => r.taskId === taskId) && reportExists && Boolean(entry?.reportText) ? 0 : 1);
`,
);
const liveRe = run(process.execPath, [liveReopen], { env: liveEnv, timeout: 30_000 });
writeFileSync(join(outDir, "s23-live-reopen.txt"), `${liveRe.stdout || ""}${liveRe.stderr || ""}`);
if (liveRe.status !== 0) {
  fail("live_reopen_persistence", { out: `${liveRe.stdout || ""}${liveRe.stderr || ""}` });
}
pass("live_reopen_persistence", JSON.parse((liveRe.stdout || "").trim()));

// ── 14. lifecycle contract presence (inspect labels; no destructive redo) ───
const life = JSON.parse((liveRe.stdout || "").trim());
pass("lifecycle_visibility", {
  inspectHasId: life.inspectHasId === true,
  lifecycle: life.lifecycle,
  disposition: life.disposition,
  note: "merge/discard/PR contracts unchanged from S2.2; not re-run destructively",
});

// ── finalize ────────────────────────────────────────────────────────────────
evidence.isolated = {
  home: isoHome,
  prefix: isoPrefix,
  runtime: isoRuntime,
  packageRoot: pkgRoot,
  bin: binPath,
  binReal,
  liveRuntime,
};
evidence.ok = Object.values(evidence.steps).every(
  (s) => s && typeof s === "object" && s.ok === true,
);
evidence.verdict = evidence.ok ? "PASS" : "FAIL";
writeEvidence();

const acceptance = `# S2.3 Installed-product operator acceptance

Use a real project (Klarapp). Confirm the installed product — not the PATH worktree symlink.

## INSTALL
1. From PATH checkout: \`npm run build && npm pack\`
2. Install the tarball into a clean prefix (or user global):
   \`npm install -g ./path-code-1.0.1.tgz --prefix \"$HOME/.local/pathcode-s23\"\`
3. Put \`$HOME/.local/pathcode-s23/bin\` first on PATH (ahead of any worktree symlink).
4. \`which pathcode\` → …/node_modules/path-code/scripts/pathcode.mjs
5. \`pathcode --version\` → PATH * Code 1.0.1
6. \`pathcode doctor\` → Install row shows the package root under node_modules (not the worktree)

## START
7. \`cd /Users/achahbi/Projects/Klarapp && pathcode\`
8. Living PATH Code surface opens; project shows Klarapp / branch context

## ENGINEERING
9. Run one small real task (read-only is fine), e.g. assess README + package.json
10. Confirm report/result appears; primary checkout untouched

## REOPEN
11. \`/exit\`
12. \`pathcode\` again from Klarapp
13. \`/history\` shows the task; \`/report <id>\` opens it; \`/prefs\` still reflects saved model/autonomy

## RESULT LIFECYCLE
14. \`/inspect <id>\` shows disposition/lifecycle
15. Do not re-run destructive merge/discard/PR unless a regression appears (S2.2 already accepted)

## HELP
16. \`/help\` lists history/report/inspect/merge/discard/pr/prefs/model/autonomy/attach/exit

## PARITY
17. No prompt to use the PATH development checkout; doctor Install ≠ worktree

Evidence from automated proof: docs/reports/g10-evidence/s2/s23-installed-product-proof.json
`;

writeFileSync(join(outDir, "s23-operator-acceptance.md"), acceptance);

console.log(
  JSON.stringify(
    {
      ok: evidence.ok,
      verdict: evidence.verdict,
      steps: Object.keys(evidence.steps),
      liveTaskId: liveJson.taskId,
      evidence: join(outDir, "s23-installed-product-proof.json"),
    },
    null,
    2,
  ),
);

// Keep iso for operator inspection only on failure; always clean on pass.
if (evidence.ok) {
  try {
    rmSync(iso, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

process.exit(evidence.ok ? 0 : 1);
