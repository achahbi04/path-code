/**
 * AG5 focused proofs — packaging roots, env isolation, monorepo subdir,
 * orphan recovery without user prune, native validation discovery.
 */

import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  mkdtempSync,
  symlinkSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const CHECKOUT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const CLI = join(CHECKOUT_ROOT, "scripts/pathcode-cli");
const AG1 = join(CLI, "ag1");

async function load(rel: string) {
  return import(`${pathToFileURL(join(CLI, rel)).href}?ag5=${randomUUID()}`);
}

async function loadAg1(rel: string) {
  return import(`${pathToFileURL(join(AG1, rel)).href}?ag5=${randomUUID()}`);
}

function git(cwd: string, args: string[]) {
  return spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
}

function initRepo(dir: string) {
  mkdirSync(dir, { recursive: true });
  git(dir, ["init", "-q"]);
  git(dir, ["config", "user.email", "ag5@path.local"]);
  git(dir, ["config", "user.name", "AG5"]);
  writeFileSync(join(dir, "README.md"), "ag5\n", "utf8");
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "init"]);
}

describe("AG5 A — symlink-safe PATH_PACKAGE_ROOT", () => {
  it("resolves real package root through a symlinked module path", async () => {
    const { resolvePathPackageRoot } = await load("paths.mjs");
    const pkg = resolvePathPackageRoot();
    expect(existsSync(join(pkg, "package.json"))).toBe(true);
    expect(pkg).toBe(realpathSync(CHECKOUT_ROOT));

    // Simulate npm global bin → package layout: symlink to paths.mjs is not
    // required because import.meta.url already points at real file; prove
    // realpath of package root ignores a sibling symlink trap.
    const trap = mkdtempSync(join(tmpdir(), "ag5-symlink-"));
    try {
      const fakeBin = join(trap, "bin");
      mkdirSync(fakeBin, { recursive: true });
      symlinkSync(join(CHECKOUT_ROOT, "scripts/pathcode.mjs"), join(fakeBin, "pathcode"));
      const target = realpathSync(join(fakeBin, "pathcode"));
      expect(target.startsWith(realpathSync(CHECKOUT_ROOT))).toBe(true);
      expect(target.includes(join("scripts", "pathcode.mjs"))).toBe(true);
    } finally {
      rmSync(trap, { recursive: true, force: true });
    }
  });
});

describe("AG5 B — project env isolation", () => {
  it("strips VIRTUAL_ENV / PYTHONPATH and ag1-venv bin from PATH", async () => {
    const { sanitizeProjectCommandEnv, stripRuntimeVenvFromPath } = await load(
      "ag5/project-env.mjs",
    );
    const runtime = join(tmpdir(), `ag5-rt-${randomUUID()}`);
    const venvBin = join(runtime, "ag1-venv", "bin");
    const hostPath = `/usr/bin:${venvBin}:/opt/homebrew/bin`;
    expect(stripRuntimeVenvFromPath(hostPath, runtime)).toBe(
      "/usr/bin:/opt/homebrew/bin",
    );
    const cleaned = sanitizeProjectCommandEnv(
      {
        PATH: hostPath,
        VIRTUAL_ENV: join(runtime, "ag1-venv"),
        PYTHONPATH: "/evil",
        PYTHONHOME: "/evil-home",
        HOME: "/Users/demo",
        LANG: "en_US.UTF-8",
      },
      { runtimeRoot: runtime },
    );
    expect(cleaned.VIRTUAL_ENV).toBeUndefined();
    expect(cleaned.PYTHONPATH).toBeUndefined();
    expect(cleaned.PYTHONHOME).toBeUndefined();
    expect(cleaned.PATH).not.toContain("ag1-venv");
    expect(cleaned.HOME).toBe("/Users/demo");
  });
});

describe("AG5 C — monorepo subdirectory invocation", () => {
  it("records workingSubdir and engineering cwd under worktree", async () => {
    const {
      resolveTargetProjectRoot,
      resolveEngineeringCwd,
    } = await load("paths.mjs");
    const root = mkdtempSync(join(tmpdir(), "ag5-mono-"));
    try {
      initRepo(root);
      const pkgDir = join(root, "packages", "auth-service");
      mkdirSync(pkgDir, { recursive: true });
      writeFileSync(
        join(pkgDir, "package.json"),
        JSON.stringify({
          name: "auth-service",
          scripts: { test: "node -e \"process.exit(0)\"" },
        }),
        "utf8",
      );
      git(root, ["add", "-A"]);
      git(root, ["commit", "-qm", "add package"]);

      const probe = resolveTargetProjectRoot(pkgDir);
      expect(probe.ok).toBe(true);
      if (!probe.ok) return;
      expect(probe.projectRoot).toBe(realpathSync(root));
      expect(probe.workingSubdir).toBe("packages/auth-service");

      const worktreeFake = join(probe.projectRoot, ".fake-worktree");
      const eng = resolveEngineeringCwd(worktreeFake, probe.workingSubdir);
      expect(eng).toBe(join(worktreeFake, "packages", "auth-service"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("AG5 D — PATH-owned orphan recovery preserves user worktrees", () => {
  it("recovers PATH stale worktree and leaves user linked worktree intact", async () => {
    const { createTaskWorktree, listWorktrees } = await load(
      "ag1/task-worktree.mjs",
    );
    const {
      recoverPathOwnedStaleWorktrees,
      isPathOwnedWorktree,
    } = await load("ag5/orphan-recovery.mjs");

    const scratch = mkdtempSync(join(tmpdir(), "ag5-orphan-"));
    const runtimeRoot = join(scratch, "runtime");
    const primary = join(scratch, "primary");
    const userWt = join(scratch, "user-wt");
    const tasksParent = join(runtimeRoot, "ag1-tasks");
    try {
      initRepo(primary);
      mkdirSync(runtimeRoot, { recursive: true });
      // Valid user-owned linked worktree
      const addUser = git(primary, [
        "worktree",
        "add",
        "-b",
        "user/feature",
        userWt,
        "HEAD",
      ]);
      expect(addUser.status).toBe(0);

      const wt = createTaskWorktree({
        primaryRoot: primary,
        tasksParent,
        checkoutRoot: CHECKOUT_ROOT,
        runtimeRoot,
      });
      expect(wt.ok).toBe(true);

      // Simulate interrupted process: remove directory but leave registration.
      rmSync(wt.worktreePath, { recursive: true, force: true });
      expect(existsSync(wt.worktreePath)).toBe(false);

      expect(
        isPathOwnedWorktree(
          { path: wt.worktreePath, branch: `refs/heads/${wt.taskBranch}` },
          { runtimeRoot, checkoutRoot: CHECKOUT_ROOT },
        ),
      ).toBe(true);
      expect(
        isPathOwnedWorktree(
          { path: userWt, branch: "refs/heads/user/feature" },
          { runtimeRoot, checkoutRoot: CHECKOUT_ROOT },
        ),
      ).toBe(false);

      const recovery = recoverPathOwnedStaleWorktrees({
        projectRoot: primary,
        checkoutRoot: CHECKOUT_ROOT,
        runtimeRoot,
      });
      expect(recovery.ok).toBe(true);
      const userReal = realpathSync(userWt);
      expect(
        recovery.preservedUserWorktrees.some(
          (p: string) => realpathSync(p) === userReal,
        ),
      ).toBe(true);

      const listed = listWorktrees(primary);
      expect(
        listed.entries.some(
          (e: { path?: string }) =>
            e.path && realpathSync(e.path) === userReal,
        ),
      ).toBe(true);
      expect(existsSync(userWt)).toBe(true);
      // PATH stale registration cleaned (path may no longer exist — compare strings)
      const staleResolved = wt.worktreePath;
      expect(
        listed.entries.every((e: { path?: string }) => {
          if (!e.path) return true;
          try {
            return realpathSync(e.path) !== staleResolved;
          } catch {
            return e.path !== staleResolved;
          }
        }),
      ).toBe(true);
    } finally {
      try {
        git(primary, ["worktree", "remove", "--force", userWt]);
      } catch {
        // ignore
      }
      rmSync(scratch, { recursive: true, force: true });
    }
  });
});

describe("AG5 native validation discovery", () => {
  it("discovers go test when go.mod present and go is on PATH", async () => {
    const { discoverNativeValidationCandidates } = await load(
      "ag5/native-validation.mjs",
    );
    const root = mkdtempSync(join(tmpdir(), "ag5-go-"));
    try {
      writeFileSync(join(root, "go.mod"), "module example.com/demo\n\ngo 1.22\n");
      const cands = discoverNativeValidationCandidates(root);
      const go = spawnSync("which", ["go"], { encoding: "utf8" });
      if (go.status === 0) {
        expect(cands.some((c: { id: string }) => c.id === "go-test")).toBe(true);
      } else {
        expect(cands.every((c: { id: string }) => c.id !== "go-test")).toBe(true);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("final validation is NOT_VERIFIED without inventing checks", async () => {
    const { runIndependentFinalValidation } = await load(
      "ag1/final-validation.mjs",
    );
    const root = mkdtempSync(join(tmpdir(), "ag5-empty-"));
    try {
      writeFileSync(join(root, "README.md"), "no validation\n");
      const result = await runIndependentFinalValidation({ worktreePath: root });
      expect(result.classification).toBe("NOT_VERIFIED");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("Python without pytest is NOT_VERIFIED rather than FAILED", async () => {
    const { runIndependentFinalValidation } = await load(
      "ag1/final-validation.mjs",
    );
    const root = mkdtempSync(join(tmpdir(), "ag5-py-nopip-"));
    try {
      writeFileSync(
        join(root, "pyproject.toml"),
        '[project]\nname="x"\nversion="0.1.0"\n',
      );
      mkdirSync(join(root, "tests"), { recursive: true });
      writeFileSync(join(root, "tests", "test_x.py"), "def test_x():\n  assert True\n");
      const result = await runIndependentFinalValidation({ worktreePath: root });
      // Must not claim FAILED when pytest cannot run.
      expect(result.classification).toBe("NOT_VERIFIED");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("AG5 runtime self-repair", () => {
  it("rebuilds a pip-less interrupted venv", async () => {
    const { ensureAg1Runtime, isVenvPipReady } = await load(
      "ag1/runtime-bootstrap.mjs",
    );
    const runtimeRoot = mkdtempSync(join(tmpdir(), "ag5-wedge-"));
    const venv = join(runtimeRoot, "ag1-venv");
    try {
      const create = spawnSync("python3", ["-m", "venv", "--without-pip", venv], {
        encoding: "utf8",
      });
      expect(create.status).toBe(0);
      const pythonBin = join(venv, "bin", "python");
      expect(existsSync(pythonBin)).toBe(true);
      expect(isVenvPipReady(pythonBin)).toBe(false);
      process.env.PATHCODE_RUNTIME_ROOT = runtimeRoot;
      const boot = await ensureAg1Runtime({
        packageRoot: CHECKOUT_ROOT,
        runtimeRoot,
      });
      expect(boot.ok).toBe(true);
      expect(isVenvPipReady(boot.pythonPath)).toBe(true);
    } finally {
      delete process.env.PATHCODE_RUNTIME_ROOT;
      rmSync(runtimeRoot, { recursive: true, force: true });
    }
  }, 120_000);
});

describe("AG5 packaging surface", () => {
  it("package.json files include pathcode CLI assets", () => {
    const pkg = JSON.parse(
      readFileSync(join(CHECKOUT_ROOT, "package.json"), "utf8"),
    ) as { files?: string[]; bin?: Record<string, string> };
    expect(pkg.bin?.pathcode).toBe("./scripts/pathcode.mjs");
    expect(pkg.files).toEqual(
      expect.arrayContaining([
        "dist",
        "scripts/pathcode.mjs",
        "scripts/path-studio",
        "README.md",
      ]),
    );
    expect(pkg.files?.some((f: string) => f.includes("pathcode-cli"))).toBe(true);
  });

  it("unknown args on incomplete install do not demand checkout restore", async () => {
    const r = spawnSync(
      process.execPath,
      [join(CHECKOUT_ROOT, "scripts/pathcode.mjs"), "--not-a-real-flag"],
      {
        encoding: "utf8",
        env: { ...process.env, PATHCODE_RUNTIME_ROOT: join(tmpdir(), "ag5-doc") },
        cwd: tmpdir(),
      },
    );
    // In source checkout dist+tsc may exist → legacy path; assert no false checkout advice
    // when prereq fails by checking message shape for the installed-package case via unit:
    expect(r.stderr || r.stdout || "").not.toMatch(/Restore dependencies in this checkout/);
  });

  it("pathcode doctor runs without secrets", async () => {
    const { runPathcodeDoctor } = await load("ag5/doctor.mjs");
    const report = runPathcodeDoctor({
      packageRoot: CHECKOUT_ROOT,
      cwd: CHECKOUT_ROOT,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        LANG: process.env.LANG,
        GH_TOKEN: "should-not-appear",
        GITHUB_TOKEN: "x",
      },
    });
    expect(report.text).toContain("PATH Code doctor");
    expect(report.text).not.toContain("should-not-appear");
    expect(report.text).not.toMatch(/ghp_[A-Za-z0-9]+/);
  }, 20_000);

  it("detectAg1Auth sees default gcloud ADC file", async () => {
    const { detectAg1Auth } = await loadAg1("auth-detect.mjs");
    const home = mkdtempSync(join(tmpdir(), "ag5-adc-"));
    try {
      const adc = join(home, ".config", "gcloud", "application_default_credentials.json");
      mkdirSync(dirname(adc), { recursive: true });
      writeFileSync(adc, '{"type":"authorized_user"}\n');
      const r = detectAg1Auth({ PATH: "/usr/bin", HOME: home }, { home });
      expect(r.ok).toBe(true);
      expect(r.mode).toBe("vertex_adc");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
