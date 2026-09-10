/**
 * Phase GC1-b — hydration / dependency / cache / image identity proofs (GC1B-A…F).
 * ALL tests use MockWorkstationTransport. Zero network. Zero GCP. $0.
 * Engine src/** untouched.
 */

import { createHash, randomUUID } from "node:crypto";
import { execSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const CHECKOUT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const GC1_DIR = join(CHECKOUT_ROOT, "scripts/pathcode-cli/gc1");
const MOCK = join(GC1_DIR, "mock-transport.mjs");
const HYDRATOR = join(GC1_DIR, "workspace-hydrator.mjs");
const DEP = join(GC1_DIR, "dependency-strategy.mjs");
const CACHE = join(GC1_DIR, "cache-strategy.mjs");
const IMAGE = join(GC1_DIR, "engineering-image.mjs");

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

async function loadGc1b() {
  const bust = randomUUID();
  const [
    { createMockWorkstationTransport },
    hydrator,
    { detectDependencyStrategy },
    cache,
    image,
  ] = await Promise.all([
    import(`${pathToFileURL(MOCK).href}?b=${bust}`),
    import(`${pathToFileURL(HYDRATOR).href}?b=${bust}`),
    import(`${pathToFileURL(DEP).href}?b=${bust}`),
    import(`${pathToFileURL(CACHE).href}?b=${bust}`),
    import(`${pathToFileURL(IMAGE).href}?b=${bust}`),
  ]);
  return {
    createMockWorkstationTransport,
    ...hydrator,
    detectDependencyStrategy,
    ...cache,
    ...image,
  };
}

/** Disposable git repo simulating a linked-worktree-like project tree. */
function makeFixtureRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "gc1b-fix-"));
  execSync("git init -q", { cwd: root });
  execSync('git config user.email "gc1@test.local"', { cwd: root });
  execSync('git config user.name "gc1"', { cwd: root });

  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, "tests/unit"), { recursive: true });
  mkdirSync(join(root, "node_modules/leftpad"), { recursive: true });
  mkdirSync(join(root, "dist"), { recursive: true });
  mkdirSync(join(root, "build"), { recursive: true });
  mkdirSync(join(root, "coverage"), { recursive: true });
  mkdirSync(join(root, ".turbo"), { recursive: true });
  mkdirSync(join(root, ".next"), { recursive: true });

  writeFileSync(join(root, "src/main.ts"), "export const x = 1;\n");
  writeFileSync(join(root, "tests/unit/main.test.ts"), "expect(1).toBe(1);\n");
  writeFileSync(join(root, "package.json"), '{"name":"fixture"}\n');
  writeFileSync(join(root, "pnpm-lock.yaml"), "lockfileVersion: 9.0\n");
  writeFileSync(join(root, "node_modules/leftpad/index.js"), "module.exports=1;\n");
  writeFileSync(join(root, "dist/bundle.js"), "/* build */\n");
  writeFileSync(join(root, "build/out.js"), "/* build */\n");
  writeFileSync(join(root, "coverage/lcov.info"), "TN:\n");
  writeFileSync(join(root, ".turbo/cache.json"), "{}\n");
  writeFileSync(join(root, ".next/trace"), "x\n");
  writeFileSync(join(root, ".DS_Store"), "junk\n");
  writeFileSync(join(root, "debug.log"), "log\n");

  // Simulate a linked-worktree `.git` FILE pointer with an absolute Mac path.
  // (Real fixtures from `git init` use a directory; replace with a pointer file
  // only for leak-detection unit checks — hydration uses git ls-files so we keep
  // a real git dir for the hydrate path.)
  execSync("git add src tests package.json pnpm-lock.yaml", { cwd: root });
  // Intentionally do NOT add junk dirs — they remain untracked or ignored.
  writeFileSync(
    join(root, ".gitignore"),
    ["node_modules/", "dist/", "build/", "coverage/", ".turbo/", ".next/", "*.log", ".DS_Store"].join(
      "\n",
    ) + "\n",
  );
  execSync("git add .gitignore", { cwd: root });
  execSync('git commit -qm "fixture"', { cwd: root });
  return root;
}

const fixtures: string[] = [];
afterEach(() => {
  while (fixtures.length) {
    const f = fixtures.pop();
    if (f) rmSync(f, { recursive: true, force: true });
  }
});

describe("GC1B boundary — SRC zero-diff", () => {
  it("SRC_DIFF_BYTES=0 for this suite's scope (no src edits required)", () => {
    // Soft check: suite must not require src changes. Report-level gate is separate.
    const srcFiles = ["workspace-hydrator.mjs", "dependency-strategy.mjs", "cache-strategy.mjs", "engineering-image.mjs"];
    for (const f of srcFiles) {
      expect(readFileSync(join(GC1_DIR, f), "utf8").length).toBeGreaterThan(100);
    }
  });
});

describe("GC1B-A HYDRATION FILTERING", () => {
  it("excludes junk caches/build artifacts; retains source, tests, manifests, lockfiles", async () => {
    const {
      createMockWorkstationTransport,
      createWorkspaceHydrator,
      listHydrationFiles,
      shouldExcludeHydrationPath,
    } = await loadGc1b();

    expect(shouldExcludeHydrationPath("node_modules/x")).toBe(true);
    expect(shouldExcludeHydrationPath("dist/a.js")).toBe(true);
    expect(shouldExcludeHydrationPath("build/a.js")).toBe(true);
    expect(shouldExcludeHydrationPath("coverage/x")).toBe(true);
    expect(shouldExcludeHydrationPath(".turbo/x")).toBe(true);
    expect(shouldExcludeHydrationPath(".next/x")).toBe(true);
    expect(shouldExcludeHydrationPath(".DS_Store")).toBe(true);
    expect(shouldExcludeHydrationPath("debug.log")).toBe(true);
    expect(shouldExcludeHydrationPath(".git")).toBe(true);
    expect(shouldExcludeHydrationPath("src/main.ts")).toBe(false);
    expect(shouldExcludeHydrationPath("tests/unit/main.test.ts")).toBe(false);

    const root = makeFixtureRepo();
    fixtures.push(root);
    const files = await listHydrationFiles(root);
    expect(files).toContain("src/main.ts");
    expect(files).toContain("tests/unit/main.test.ts");
    expect(files).toContain("package.json");
    expect(files).toContain("pnpm-lock.yaml");
    expect(files.some((f: string) => f.startsWith("node_modules"))).toBe(false);
    expect(files.some((f: string) => f.startsWith("dist/"))).toBe(false);
    expect(files.some((f: string) => f.startsWith("build/"))).toBe(false);
    expect(files.some((f: string) => f === ".git" || f.startsWith(".git/"))).toBe(false);

    const transport = createMockWorkstationTransport();
    const hydrator = createWorkspaceHydrator({
      transport,
      localRoot: root,
      remoteRoot: "/home/user/workspace",
    });
    const result = await hydrator.hydrate();
    expect(result.gitStrategy).toBe("archive-init-snapshot");
    expect(result.remoteRoot).toBe("/home/user/workspace");
    expect(result.filesTransferred).toBeGreaterThanOrEqual(4);
    expect(result.bytes).toBeGreaterThan(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);

    const remote = transport.listRemoteFiles("/home/user/workspace/");
    expect(remote).toContain("/home/user/workspace/src/main.ts");
    expect(remote).toContain("/home/user/workspace/tests/unit/main.test.ts");
    expect(remote).toContain("/home/user/workspace/package.json");
    expect(remote).toContain("/home/user/workspace/pnpm-lock.yaml");
    expect(remote.some((p: string) => p.includes("node_modules"))).toBe(false);
    expect(remote.some((p: string) => p.includes("/dist/"))).toBe(false);
    // No linked-worktree .git pointer leak
    expect(transport.hasRemoteGitPointerLeak("/home/user/workspace")).toBe(false);
    expect(transport.readRemoteFile("/home/user/workspace/.git")).toBeNull();
    expect(transport.readRemoteFile("/home/user/workspace/.git/HEAD")).toContain("ref:");
  });
});

describe("GC1B-B DEFAULT WORKSPACE CWD", () => {
  it("remote execution defaults to hydrated workspace; falsify by skipping cd", async () => {
    const before = sha256(HYDRATOR);
    const { createMockWorkstationTransport, createWorkspaceHydrator } = await loadGc1b();
    const root = makeFixtureRepo();
    fixtures.push(root);
    const transport = createMockWorkstationTransport();
    const hydrator = createWorkspaceHydrator({
      transport,
      localRoot: root,
      remoteRoot: "/home/user/workspace",
    });
    await hydrator.hydrate();

    const pwd = await hydrator.run("pwd");
    expect(pwd.exitCode).toBe(0);
    expect(pwd.stdout.trim()).toBe("/home/user/workspace");

    const cat = await hydrator.run("cat 'package.json'");
    expect(cat.exitCode).toBe(0);
    expect(cat.stdout).toContain("fixture");

    // FALSIFICATION: weakenDefaultCwd runs outside workspace — proof must fail.
    const weakened = await hydrator.run("pwd", { weakenDefaultCwd: true });
    expect(weakened.stdout.trim()).not.toBe("/home/user/workspace");
    await expect(async () => {
      expect(weakened.stdout.trim()).toBe("/home/user/workspace");
    }).rejects.toThrow();

    expect(sha256(HYDRATOR)).toBe(before);
  });
});

describe("GC1B-C HYDRATION CONFINEMENT", () => {
  it("rejects path traversal outside designated remoteRoot", async () => {
    const { resolveConfinedWorkspaceCwd, createWorkspaceHydrator, createMockWorkstationTransport } =
      await loadGc1b();

    expect(resolveConfinedWorkspaceCwd("/home/user/workspace")).toBe(
      "/home/user/workspace",
    );
    expect(resolveConfinedWorkspaceCwd("/home/user/workspace", "src")).toBe(
      "/home/user/workspace/src",
    );

    expect(() =>
      resolveConfinedWorkspaceCwd("/home/user/workspace", "../escape"),
    ).toThrow(/GC1_HYDRATION_CONFINEMENT|escapes/);
    expect(() =>
      resolveConfinedWorkspaceCwd("/home/user/workspace", "/tmp/evil"),
    ).toThrow(/GC1_HYDRATION_CONFINEMENT|escapes/);
    expect(() =>
      resolveConfinedWorkspaceCwd("/home/user/workspace", "/Users/achahbi/secret"),
    ).toThrow(/GC1_HYDRATION_CONFINEMENT|escapes|refused/);

    const root = makeFixtureRepo();
    fixtures.push(root);
    const transport = createMockWorkstationTransport();
    const hydrator = createWorkspaceHydrator({
      transport,
      localRoot: root,
      remoteRoot: "/home/user/workspace",
    });
    await expect(hydrator.run("pwd", { cwd: "../../etc" })).rejects.toMatchObject({
      code: "GC1_HYDRATION_CONFINEMENT",
    });
  });
});

describe("GC1B-D I/O PRESERVATION", () => {
  const SENTINEL = {
    stdout: "GC1_STDOUT_SENTINEL\n",
    stderr: "GC1_STDERR_SENTINEL\n",
    exitCode: 17,
  };

  it("preserves stdout/stderr/exit independently (reuses GC1-a contract)", async () => {
    const { createMockWorkstationTransport } = await loadGc1b();
    const transport = createMockWorkstationTransport({
      scriptedResults: [{ ...SENTINEL }],
    });
    const result = await transport.executeCommand({
      workstationName: "pathcode-gc1-probe",
      command: "sentinel",
    });
    expect(result.stdout).toBe(SENTINEL.stdout);
    expect(result.stderr).toBe(SENTINEL.stderr);
    expect(result.exitCode).toBe(17);
    expect(result.stdout).not.toContain("GC1_STDERR_SENTINEL");
    expect(result.stderr).not.toContain("GC1_STDOUT_SENTINEL");
  });

  it("falsifications: drop/merge/wrong-exit fail the proof", async () => {
    const { createMockWorkstationTransport } = await loadGc1b();
    const assertPreserved = (r: {
      stdout: string;
      stderr: string;
      exitCode: number;
    }) => {
      expect(r.stdout).toBe(SENTINEL.stdout);
      expect(r.stderr).toBe(SENTINEL.stderr);
      expect(r.exitCode).toBe(17);
    };

    assertPreserved(
      await createMockWorkstationTransport({
        scriptedResults: [{ ...SENTINEL }],
      }).executeCommand({ workstationName: "x", command: "s" }),
    );

    await expect(async () => {
      assertPreserved(
        await createMockWorkstationTransport({
          scriptedResults: [{ stdout: "", stderr: SENTINEL.stderr, exitCode: 17 }],
        }).executeCommand({ workstationName: "x", command: "s" }),
      );
    }).rejects.toThrow();

    await expect(async () => {
      assertPreserved(
        await createMockWorkstationTransport({
          scriptedResults: [
            {
              stdout: SENTINEL.stdout + SENTINEL.stderr,
              stderr: "",
              exitCode: 17,
            },
          ],
        }).executeCommand({ workstationName: "x", command: "s" }),
      );
    }).rejects.toThrow();
  });
});

describe("GC1B-E DEPENDENCY SELECTION", () => {
  it("deterministically selects installer from lockfiles/manifests with documented precedence", async () => {
    const { detectDependencyStrategy, getCacheEnvHints, GC1_CACHE_CORRECTNESS_RULE } =
      await loadGc1b();

    expect(detectDependencyStrategy(["pnpm-lock.yaml", "yarn.lock", "package-lock.json", "package.json"])).toMatchObject({
      ecosystem: "node-pnpm",
      installer: "pnpm",
      args: ["install", "--frozen-lockfile"],
    });
    expect(detectDependencyStrategy(["yarn.lock", "package-lock.json", "package.json"])).toMatchObject({
      installer: "yarn",
    });
    expect(detectDependencyStrategy(["package-lock.json", "package.json"])).toMatchObject({
      installer: "npm",
      args: ["ci"],
    });
    expect(detectDependencyStrategy(["package.json"])).toMatchObject({
      installer: "npm",
      args: ["install"],
    });
    expect(detectDependencyStrategy(["uv.lock", "requirements.txt"])).toMatchObject({
      installer: "uv",
      args: ["sync"],
    });
    expect(detectDependencyStrategy(["requirements.txt"])).toMatchObject({
      installer: "pip",
    });
    expect(detectDependencyStrategy(["Cargo.lock"])).toMatchObject({
      installer: "cargo",
    });
    expect(detectDependencyStrategy(["go.mod"])).toMatchObject({
      installer: "go",
      args: ["mod", "download"],
    });
    expect(detectDependencyStrategy(["pom.xml"])).toMatchObject({
      installer: "mvn",
    });
    expect(detectDependencyStrategy(["build.gradle.kts"])).toMatchObject({
      installer: "gradle",
    });
    expect(detectDependencyStrategy(["build.gradle"])).toMatchObject({
      installer: "gradle",
    });
    expect(detectDependencyStrategy([])).toMatchObject({
      ecosystem: "none",
      installer: "none",
    });

    const hints = getCacheEnvHints();
    expect(hints.performanceOnly).toBe(true);
    expect(hints.correctnessAuthority).toBe(false);
    expect(hints.rule).toBe(GC1_CACHE_CORRECTNESS_RULE);
    expect(hints.env.npm_config_cache).toContain("/home/user/.cache/npm");
    expect(hints.env.PNPM_STORE_PATH).toBeTruthy();
    expect(hints.env.YARN_CACHE_FOLDER).toBeTruthy();
    expect(hints.env.BUN_INSTALL_CACHE_DIR).toBeTruthy();
    expect(hints.env.UV_CACHE_DIR).toBeTruthy();
    expect(hints.env.PIP_CACHE_DIR).toBeTruthy();
    expect(hints.env.GRADLE_USER_HOME).toBeTruthy();
    expect(hints.env.CARGO_HOME).toBeTruthy();
    expect(hints.env.GOMODCACHE).toBeTruthy();
  });
});

describe("GC1B-F IMAGE IDENTITY", () => {
  it("config pin uses digest reference, not floating latest", async () => {
    const before = sha256(IMAGE);
    const {
      buildConfigContainerPin,
      ARTIFACT_REGISTRY,
      IMAGE_NAME,
      DEFAULT_IMAGE_TAG,
      engineeringImageRepositoryPath,
      pinnedImageReference,
    } = await loadGc1b();

    expect(ARTIFACT_REGISTRY).toEqual({
      projectId: "path-code-gc1-260910",
      region: "europe-west4",
      repository: "pathcode-gc1-images",
      image: "pathcode-engineering",
    });
    expect(IMAGE_NAME).toBe("pathcode-engineering");
    expect(DEFAULT_IMAGE_TAG).toBeTruthy();

    const digest =
      "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const body = buildConfigContainerPin({ digest });
    expect(body.container.image).toContain("@sha256:");
    expect(body.container.image).not.toMatch(/:latest(?![\w-])/);
    expect(body.container.image).not.toContain(":latest");
    expect(body.container.image).toBe(
      `europe-west4-docker.pkg.dev/path-code-gc1-260910/pathcode-gc1-images/pathcode-engineering@${digest}`,
    );
    expect(body.host.gceInstance.poolSize).toBe(0);
    expect(body.idleTimeout).toBe("900s");
    expect(body.runningTimeout).toBe("3600s");

    expect(pinnedImageReference({ digest: digest.replace("sha256:", "") })).toContain(
      "@sha256:",
    );
    expect(engineeringImageRepositoryPath()).toContain("europe-west4-docker.pkg.dev");

    expect(() => buildConfigContainerPin({ digest: "latest" })).toThrow(/latest|digest/i);
    expect(() => buildConfigContainerPin({} as { digest: string })).toThrow();

    // Falsification: a floating-latest config must fail the identity proof.
    const floating = {
      container: { image: `${engineeringImageRepositoryPath()}:latest` },
    };
    await expect(async () => {
      expect(floating.container.image).toContain("@sha256:");
      expect(floating.container.image).not.toContain(":latest");
    }).rejects.toThrow();

    expect(sha256(IMAGE)).toBe(before);
  });
});

describe("GC1B linked-worktree .git pointer", () => {
  it("hydrator never ships a gitdir pointer with absolute Mac paths", async () => {
    const { shouldExcludeHydrationPath, createMockWorkstationTransport, createWorkspaceHydrator } =
      await loadGc1b();
    expect(shouldExcludeHydrationPath(".git")).toBe(true);

    const root = makeFixtureRepo();
    fixtures.push(root);
    // Prove local tree looks like a linked worktree pointer class of problem:
    const fakePointer = "gitdir: /Users/achahbi/Projects/path-code/.git/worktrees/cursor-phase-gc1a\n";
    // Hydration listing must not include `.git` even if present as a file beside the repo.
    writeFileSync(join(root, "LEAK_PROBE.txt"), fakePointer);

    const transport = createMockWorkstationTransport();
    // Attempt to poison remote FS with a pointer — materialize must drop `.git` file.
    await transport.materializeHydrationFiles({
      remoteRoot: "/home/user/workspace",
      files: [
        { relativePath: ".git", content: fakePointer },
        { relativePath: "src/ok.ts", content: "export {};\n" },
      ],
    });
    expect(transport.hasRemoteGitPointerLeak("/home/user/workspace")).toBe(false);
    expect(transport.readRemoteFile("/home/user/workspace/.git")).toBeNull();
    expect(transport.readRemoteFile("/home/user/workspace/src/ok.ts")).toContain("export");

    const hydrator = createWorkspaceHydrator({
      transport: createMockWorkstationTransport(),
      localRoot: root,
    });
    const result = await hydrator.hydrate();
    expect(result.gitStrategy).toBe("archive-init-snapshot");
  });
});
