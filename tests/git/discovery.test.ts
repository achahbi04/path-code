import { mkdir, realpath, symlink } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createWorkspaceBoundary } from "../../src/workspace/index.js";
import { discoverGitRepository } from "../../src/git/index.js";
import { runGit } from "../../src/git/runner.js";
import {
  cleanupGitFixtures,
  createCanonicalTempRoot,
  fixtureGit,
  initCommitWorktree,
} from "./fixture-helpers.js";

afterEach(async () => {
  await cleanupGitFixtures();
});

describe("discoverGitRepository — normal", () => {
  it("succeeds when workspace root equals Git worktree root", async () => {
    const root = await createCanonicalTempRoot("pc-git-");
    await initCommitWorktree(root);

    const boundary = await createWorkspaceBoundary(root);
    expect(boundary.ok).toBe(true);
    if (!boundary.ok) {
      return;
    }

    const discovered = await discoverGitRepository(boundary.value);
    expect(discovered.ok).toBe(true);
    if (discovered.ok) {
      expect(discovered.value.root).toBe(root);
      expect(typeof discovered.value.root).toBe("string");
    }
  });

  it("returns a CanonicalPath equal to the physical repository root", async () => {
    const root = await createCanonicalTempRoot("pc-git-");
    await initCommitWorktree(root);
    const boundary = await createWorkspaceBoundary(root);
    expect(boundary.ok).toBe(true);
    if (!boundary.ok) {
      return;
    }

    const discovered = await discoverGitRepository(boundary.value);
    expect(discovered.ok).toBe(true);
    if (discovered.ok) {
      expect(discovered.value.root).toBe(await realpath(root));
    }
  });

  it("succeeds for a repository path containing spaces", async () => {
    const holder = await createCanonicalTempRoot("pc-git-holder-");
    const root = path.join(holder, "my repo");
    await mkdir(root);
    const physicalRoot = await realpath(root);
    await initCommitWorktree(physicalRoot);

    const boundary = await createWorkspaceBoundary(physicalRoot);
    expect(boundary.ok).toBe(true);
    if (!boundary.ok) {
      return;
    }

    const discovered = await discoverGitRepository(boundary.value);
    expect(discovered.ok).toBe(true);
    if (discovered.ok) {
      expect(discovered.value.root).toBe(physicalRoot);
    }
  });

  it("succeeds for a repository path with safe shell metacharacters without shell interpretation", async () => {
    const holder = await createCanonicalTempRoot("pc-git-holder-");
    const root = path.join(holder, "repo;$(id)");
    await mkdir(root);
    const physicalRoot = await realpath(root);
    await initCommitWorktree(physicalRoot);

    const boundary = await createWorkspaceBoundary(physicalRoot);
    expect(boundary.ok).toBe(true);
    if (!boundary.ok) {
      return;
    }

    const discovered = await discoverGitRepository(boundary.value);
    expect(discovered.ok).toBe(true);
    if (discovered.ok) {
      expect(discovered.value.root).toBe(physicalRoot);
      expect(discovered.value.root.includes("$(id)")).toBe(true);
    }
  });

  it("succeeds when workspace root is reached through a symlink to the physical Git root", async () => {
    const physicalRoot = await createCanonicalTempRoot("pc-git-phys-");
    await initCommitWorktree(physicalRoot);
    const holder = await createCanonicalTempRoot("pc-git-link-");
    const link = path.join(holder, "ws-link");
    await symlink(physicalRoot, link);

    const boundary = await createWorkspaceBoundary(link);
    expect(boundary.ok).toBe(true);
    if (!boundary.ok) {
      return;
    }

    const discovered = await discoverGitRepository(boundary.value);
    expect(discovered.ok).toBe(true);
    if (discovered.ok) {
      expect(discovered.value.root).toBe(physicalRoot);
    }
  });
});

describe("discoverGitRepository — failures", () => {
  it("maps a non-Git workspace to NOT_A_GIT_REPOSITORY", async () => {
    const root = await createCanonicalTempRoot("pc-git-none-");
    const boundary = await createWorkspaceBoundary(root);
    expect(boundary.ok).toBe(true);
    if (!boundary.ok) {
      return;
    }

    const discovered = await discoverGitRepository(boundary.value);
    expect(discovered.ok).toBe(false);
    if (!discovered.ok) {
      expect(discovered.error.code).toBe("NOT_A_GIT_REPOSITORY");
    }
  });

  it("maps a bare repository to NOT_A_WORKTREE", async () => {
    const holder = await createCanonicalTempRoot("pc-git-bare-holder-");
    const bare = path.join(holder, "bare.git");
    await fixtureGit(holder, ["-c", "init.templateDir=", "init", "--bare", bare]);
    const physicalBare = await realpath(bare);

    const boundary = await createWorkspaceBoundary(physicalBare);
    expect(boundary.ok).toBe(true);
    if (!boundary.ok) {
      return;
    }

    const discovered = await discoverGitRepository(boundary.value);
    expect(discovered.ok).toBe(false);
    if (!discovered.ok) {
      expect(discovered.error.code).toBe("NOT_A_WORKTREE");
    }
  });

  it("maps a missing executable to GIT_NOT_AVAILABLE (synthetic)", async () => {
    const result = await runGit({
      cwd: await createCanonicalTempRoot("pc-git-enoent-"),
      args: ["rev-parse", "--is-inside-work-tree"],
      executable: path.join(
        await createCanonicalTempRoot("pc-git-no-bin-"),
        "definitely-not-git-executable",
      ),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("GIT_NOT_AVAILABLE");
    }
  });

  it("maps unexpected execution failure to GIT_DISCOVERY_FAILED", async () => {
    const root = await createCanonicalTempRoot("pc-git-bad-");
    await initCommitWorktree(root);
    const result = await runGit({
      cwd: root,
      args: ["this-is-not-a-git-subcommand"],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("GIT_DISCOVERY_FAILED");
      expect(result.error.code).not.toBe("NOT_A_GIT_REPOSITORY");
    }
  });
});

describe("discoverGitRepository — authority", () => {
  it("rejects parent Git root outside a subdirectory WorkspaceBoundary", async () => {
    const repo = await createCanonicalTempRoot("pc-git-parent-");
    await initCommitWorktree(repo);
    const src = path.join(repo, "src");
    await mkdir(src);
    const physicalSrc = await realpath(src);

    const boundary = await createWorkspaceBoundary(physicalSrc);
    expect(boundary.ok).toBe(true);
    if (!boundary.ok) {
      return;
    }

    const discovered = await discoverGitRepository(boundary.value);
    expect(discovered.ok).toBe(false);
    if (!discovered.ok) {
      expect(discovered.error.code).toBe("GIT_ROOT_OUTSIDE_WORKSPACE");
    }
  });
});

describe("discoverGitRepository — linked worktree", () => {
  it("discovers a linked worktree where .git is a file", async () => {
    const main = await createCanonicalTempRoot("pc-git-main-");
    await initCommitWorktree(main);
    const holder = await createCanonicalTempRoot("pc-git-wt-holder-");
    const linked = path.join(holder, "linked-wt");
    await fixtureGit(main, ["worktree", "add", "--detach", linked, "HEAD"]);
    const physicalLinked = await realpath(linked);

    const boundary = await createWorkspaceBoundary(physicalLinked);
    expect(boundary.ok).toBe(true);
    if (!boundary.ok) {
      return;
    }

    const discovered = await discoverGitRepository(boundary.value);
    expect(discovered.ok).toBe(true);
    if (discovered.ok) {
      expect(discovered.value.root).toBe(physicalLinked);
    }
  });
});
