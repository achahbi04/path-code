#!/usr/bin/env node
/**
 * Non-Git / unversioned existing-project onboarding proof.
 *
 * Proves PATH admits a Klarapp-shaped project with no .git, launches through
 * Gateway bind + task worktree bootstrap (in-place), and surfaces "unversioned".
 * Does NOT publish to GitHub.
 */
import {
  mkdirSync,
  writeFileSync,
  mkdtempSync,
  existsSync,
  rmSync,
  realpathSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  resolveTargetProjectRoot,
  looksLikeExistingProject,
  resolvePathPackageRoot,
  resolvePathRuntimeRoot,
} from "../../../../scripts/pathcode-cli/paths.mjs";
import { admitPrimaryCheckout } from "../../../../scripts/pathcode-cli/ag1/admission.mjs";
import {
  createTaskWorktree,
  removeTaskWorktree,
} from "../../../../scripts/pathcode-cli/ag1/task-worktree.mjs";
import { createGatewayRuntime } from "../../../../scripts/pathcode-cli/gateway/runtime.mjs";
import {
  createEmptyStudioState,
  applyStudioEvent,
} from "../../../../scripts/path-studio/state.mjs";
import { buildMinimalLivingLines } from "../../../../scripts/pathcode-cli/inline-studio.mjs";

const outDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolvePathPackageRoot();
const runtimeRoot = resolvePathRuntimeRoot({ packageRoot });
mkdirSync(outDir, { recursive: true });

/** @type {Array<Record<string, unknown>>} */
const checks = [];

function stripAnsi(s) {
  return String(s).replace(/\u001b\[[0-9;]*m/g, "");
}

function makeKlarappShape(dir) {
  mkdirSync(join(dir, "src"), { recursive: true });
  mkdirSync(join(dir, "server"), { recursive: true });
  mkdirSync(join(dir, "public"), { recursive: true });
  mkdirSync(join(dir, "migrations"), { recursive: true });
  mkdirSync(join(dir, "scripts"), { recursive: true });
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify(
      {
        name: "klarapp-fixture",
        private: true,
        type: "module",
        scripts: { typecheck: "tsc -p .", build: "vite build" },
      },
      null,
      2,
    ),
  );
  writeFileSync(join(dir, "package-lock.json"), "{}\n");
  writeFileSync(join(dir, "tsconfig.json"), "{ \"compilerOptions\": {} }\n");
  writeFileSync(join(dir, "vite.config.ts"), "export default {};\n");
  writeFileSync(join(dir, "src", "main.ts"), "export const app = 1;\n");
  writeFileSync(join(dir, "server", "index.ts"), "export const server = 1;\n");
  writeFileSync(join(dir, "public", "index.html"), "<html></html>\n");
  writeFileSync(join(dir, ".env.example"), "DATABASE_URL=\n");
}

{
  const empty = mkdtempSync(join(tmpdir(), "path-empty-"));
  const discovered = resolveTargetProjectRoot(empty);
  checks.push({
    id: "empty_dir_refused",
    ok: discovered.ok === false && discovered.code === "NOT_A_PROJECT",
    code: discovered.ok ? null : discovered.code,
  });
  rmSync(empty, { recursive: true, force: true });
}

{
  const proj = mkdtempSync(join(tmpdir(), "path-klarapp-shape-"));
  makeKlarappShape(proj);
  checks.push({
    id: "fixture_has_no_git",
    ok: !existsSync(join(proj, ".git")),
  });
  checks.push({
    id: "looks_like_project",
    ok: looksLikeExistingProject(proj) === true,
  });

  const discovered = resolveTargetProjectRoot(proj);
  const projReal = realpathSync(proj);
  checks.push({
    id: "resolve_unversioned_ok",
    ok:
      discovered.ok === true &&
      discovered.unversioned === true &&
      discovered.projectRoot === projReal,
    discovered,
    projReal,
  });

  const admission = admitPrimaryCheckout(proj);
  checks.push({
    id: "admit_unversioned_ok",
    ok: admission.ok === true && admission.unversioned === true,
    admission,
  });

  const wt = createTaskWorktree({
    primaryRoot: proj,
    checkoutRoot: packageRoot,
    runtimeRoot,
  });
  checks.push({
    id: "bootstrap_inplace_worktree",
    ok:
      wt.ok === true &&
      wt.bootstrapMode === "unversioned_inplace" &&
      wt.worktreePath === proj &&
      wt.taskBranch == null &&
      !existsSync(join(proj, ".git")),
    wt: wt.ok
      ? {
          bootstrapMode: wt.bootstrapMode,
          worktreePath: wt.worktreePath,
          taskId: wt.taskId,
        }
      : wt,
  });

  const cleaned = removeTaskWorktree(proj, wt.ok ? wt.worktreePath : proj);
  checks.push({
    id: "cleanup_keeps_primary",
    ok:
      cleaned.ok === true &&
      cleaned.code === "BOOTSTRAP_INPLACE_KEPT" &&
      existsSync(join(proj, "package.json")) &&
      !existsSync(join(proj, ".git")),
    cleaned,
  });

  // Gateway bind + fake engineering without inventing .git
  process.env.PATHCODE_GATEWAY_FAKE_ENGINE = "1";
  process.env.PATHCODE_GATEWAY_SKIP_BOOTSTRAP = "1";
  const rt = createGatewayRuntime({ packageRoot, runtimeRoot });
  const bound = await rt.bindProject({ cwd: proj });
  checks.push({
    id: "gateway_binds_unversioned",
    ok:
      bound.ok === true &&
      bound.unversioned === true &&
      bound.branch === "unversioned",
    bound,
  });

  const state = createEmptyStudioState();
  state.product.ag1 = true;
  state.product.projectName = "klarapp-fixture";
  /** @type {string[]} */
  const events = [];
  rt.onEvent((env) => {
    const ev = env?.event;
    if (!ev || typeof ev.type !== "string") return;
    events.push(ev.type);
    const { type, ...fields } = ev;
    applyStudioEvent(state, { type, ...fields });
  });
  applyStudioEvent(state, {
    type: "session.preflight",
    branch: "unversioned",
    dirtySummary: "unversioned",
    projectName: "klarapp-fixture",
    unversioned: true,
  });
  const started = await rt.startTask({
    objective:
      "Inspect this unversioned project and prepare source control (.gitignore, git init) when appropriate. Do not push.",
  });
  await rt.awaitTask(started.taskId);
  const frame = stripAnsi(
    buildMinimalLivingLines(state, { rows: 40, columns: 100 }).join("\n"),
  );
  writeFileSync(join(outDir, "unversioned-canvas-preview.txt"), frame);
  checks.push({
    id: "ui_shows_unversioned_and_engineering",
    ok:
      state.product.unversioned === true &&
      state.product.branch === "unversioned" &&
      /Unversioned project|unversioned/i.test(frame) &&
      frame.startsWith("PATH ● Code") &&
      /✓ COMPLETE|Typecheck|Update|Read|Preparing|Unversioned/.test(frame) &&
      !/requires a Git repository/i.test(frame) &&
      !existsSync(join(proj, ".git")),
    productBranch: state.product.branch,
    productUnversioned: state.product.unversioned,
    frameHead: frame.split("\n").slice(0, 24),
  });
  delete process.env.PATHCODE_GATEWAY_FAKE_ENGINE;
  delete process.env.PATHCODE_GATEWAY_SKIP_BOOTSTRAP;

  rmSync(proj, { recursive: true, force: true });
}

// Real Klarapp path — discovery + admit only (no git init, no publish).
{
  const klarapp = "/Users/achahbi/Downloads/Klarapp";
  const reachable = existsSync(klarapp);
  if (!reachable) {
    checks.push({
      id: "klarapp_operator_path",
      ok: true,
      skipped: true,
      reason: "Klarapp path not present on this host",
    });
  } else {
    const hasGit = existsSync(join(klarapp, ".git"));
    const looks = looksLikeExistingProject(klarapp);
    const discovered = resolveTargetProjectRoot(klarapp);
    const admission = admitPrimaryCheckout(klarapp);
    checks.push({
      id: "klarapp_operator_path",
      ok:
        !hasGit &&
        looks === true &&
        discovered.ok === true &&
        discovered.unversioned === true &&
        admission.ok === true &&
        admission.unversioned === true,
      hasGit,
      looks,
      discoveredOk: discovered.ok,
      unversioned: discovered.ok ? discovered.unversioned : null,
      projectRoot: discovered.ok ? discovered.projectRoot : null,
    });
  }
}

const pass = checks.every((c) => c.ok);
const report = {
  phase: "NON_GIT_PROJECT_ONBOARDING",
  at: new Date().toISOString(),
  pass,
  checks,
};
writeFileSync(
  join(outDir, "unversioned-onboarding-proof.json"),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
process.exit(pass ? 0 : 1);
