import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { collectGitStateBaseline } from "../../src/git/index.js";
import { inventory } from "../../src/inventory/index.js";
import {
  admittedInventoryEntry,
  allObservations,
  annotationFor,
  baselineAt,
  boundaryFor,
  inventoryAt,
  resolvedConfigAt,
  writeDenyConfig,
  writeRelative,
} from "./baseline-helpers.js";
import {
  cleanupGitFixtures,
  createCanonicalTempRoot,
  fixtureGit,
  initCommitWorktree,
} from "./fixture-helpers.js";

afterEach(async () => {
  await cleanupGitFixtures();
});

describe("collectGitStateBaseline — tracked file states", () => {
  it("reports a clean tracked file as TRACKED with CLEAN index and worktree", async () => {
    const root = await createCanonicalTempRoot("pc-git-base-clean-");
    await initCommitWorktree(root);

    const { baseline } = await baselineAt(root);
    const annotation = annotationFor(baseline, "README.md");
    expect(annotation).toBeDefined();
    expect(annotation?.observation.state).toEqual({
      kind: "TRACKED",
      indexState: "CLEAN",
      worktreeState: "CLEAN",
      mode: "100644",
    });
  });

  it("reports an unstaged modification as index CLEAN and worktree MODIFIED", async () => {
    const root = await createCanonicalTempRoot("pc-git-base-unstaged-");
    await initCommitWorktree(root);
    await writeFile(path.join(root, "README.md"), "changed\n");

    const { baseline } = await baselineAt(root);
    const annotation = annotationFor(baseline, "README.md");
    expect(annotation?.observation.state).toEqual({
      kind: "TRACKED",
      indexState: "CLEAN",
      worktreeState: "MODIFIED",
    });
  });

  it("reports a staged modification as index MODIFIED and worktree CLEAN", async () => {
    const root = await createCanonicalTempRoot("pc-git-base-staged-");
    await initCommitWorktree(root);
    await writeFile(path.join(root, "README.md"), "staged\n");
    await fixtureGit(root, ["add", "README.md"]);

    const { baseline } = await baselineAt(root);
    const annotation = annotationFor(baseline, "README.md");
    expect(annotation?.observation.state).toEqual({
      kind: "TRACKED",
      indexState: "MODIFIED",
      worktreeState: "CLEAN",
    });
  });

  it("reports staged plus further unstaged changes on both dimensions", async () => {
    const root = await createCanonicalTempRoot("pc-git-base-mm-");
    await initCommitWorktree(root);
    await writeFile(path.join(root, "README.md"), "first\n");
    await fixtureGit(root, ["add", "README.md"]);
    await writeFile(path.join(root, "README.md"), "second\n");

    const { baseline } = await baselineAt(root);
    const annotation = annotationFor(baseline, "README.md");
    expect(annotation?.observation.state).toEqual({
      kind: "TRACKED",
      indexState: "MODIFIED",
      worktreeState: "MODIFIED",
    });
  });

  it("reports a staged new file as index ADDED", async () => {
    const root = await createCanonicalTempRoot("pc-git-base-added-");
    await initCommitWorktree(root);
    await writeRelative(root, "new.txt");
    await fixtureGit(root, ["add", "new.txt"]);

    const { baseline } = await baselineAt(root);
    const annotation = annotationFor(baseline, "new.txt");
    expect(annotation?.observation.state).toEqual({
      kind: "TRACKED",
      indexState: "ADDED",
      worktreeState: "CLEAN",
    });
  });
});

describe("collectGitStateBaseline — untracked and ignored", () => {
  it("reports an admitted untracked file as UNTRACKED", async () => {
    const root = await createCanonicalTempRoot("pc-git-base-untracked-");
    await initCommitWorktree(root);
    await writeRelative(root, "notes.txt");

    const { baseline } = await baselineAt(root);
    const annotation = annotationFor(baseline, "notes.txt");
    expect(annotation?.observation.state).toEqual({ kind: "UNTRACKED" });
  });

  it("reports an admitted ignored file as IGNORED when listed in .gitignore", async () => {
    const root = await createCanonicalTempRoot("pc-git-base-ignored-");
    await initCommitWorktree(root);
    await writeFile(path.join(root, ".gitignore"), "ignored.txt\n");
    await writeRelative(root, "ignored.txt");

    const { baseline } = await baselineAt(root);
    const annotation = annotationFor(baseline, "ignored.txt");
    expect(annotation?.observation.state).toEqual({ kind: "IGNORED" });
  });
});

describe("collectGitStateBaseline — deletions, renames, and directories", () => {
  it("surfaces an unstaged deletion as an unmapped visible observation without a RepositoryEntry", async () => {
    const root = await createCanonicalTempRoot("pc-git-base-delete-");
    await initCommitWorktree(root);
    await rm(path.join(root, "README.md"));

    const { baseline } = await baselineAt(root);
    expect(annotationFor(baseline, "README.md")).toBeUndefined();
    expect(baseline.unmappedVisibleObservations).toHaveLength(1);
    const unmapped = baseline.unmappedVisibleObservations[0]!;
    expect(unmapped.observation.workspaceRelativePath).toBe("README.md");
    expect(unmapped.observation.state).toEqual({
      kind: "TRACKED",
      indexState: "CLEAN",
      worktreeState: "DELETED",
    });
  });

  it("preserves the original path on a rename", async () => {
    const root = await createCanonicalTempRoot("pc-git-base-rename-");
    await initCommitWorktree(root);
    await fixtureGit(root, ["mv", "README.md", "RENAMED.md"]);

    const { baseline } = await baselineAt(root);
    const annotation = annotationFor(baseline, "RENAMED.md");
    expect(annotation?.observation.state).toMatchObject({
      kind: "TRACKED",
      indexState: "RENAMED",
      worktreeState: "CLEAN",
      originalPath: "README.md",
    });
    expect(annotation?.observation.originalGitRelativePath).toBe("README.md");
  });

  it("labels directories as NOT_APPLICABLE_DIRECTORY rather than UNTRACKED", async () => {
    const root = await createCanonicalTempRoot("pc-git-base-dir-");
    await initCommitWorktree(root);
    await mkdir(path.join(root, "src"));
    await writeRelative(root, "src/main.ts");
    await fixtureGit(root, ["add", "src/main.ts"]);

    const { baseline } = await baselineAt(root);
    const srcDir = annotationFor(baseline, "src");
    expect(srcDir?.observation.state).toEqual({ kind: "NOT_APPLICABLE_DIRECTORY" });
    expect(srcDir?.observation.state.kind).not.toBe("UNTRACKED");
  });
});

describe("collectGitStateBaseline — repository availability", () => {
  it("reports detached HEAD availability", async () => {
    const root = await createCanonicalTempRoot("pc-git-base-detached-");
    await initCommitWorktree(root);
    await fixtureGit(root, ["checkout", "--detach", "HEAD"]);

    const { baseline } = await baselineAt(root);
    expect(baseline.availability.kind).toBe("GIT_REPOSITORY");
    if (baseline.availability.kind === "GIT_REPOSITORY") {
      expect(baseline.availability.branch).toEqual({ kind: "DETACHED" });
      expect(baseline.availability.head.kind).toBe("COMMIT");
    }
  });

  it("reports an unborn repository with UNBORN head and ATTACHED branch", async () => {
    const root = await createCanonicalTempRoot("pc-git-base-unborn-");
    await fixtureGit(root, ["-c", "init.templateDir=", "init"]);
    await fixtureGit(root, ["config", "user.email", "pathcode-test@example.com"]);
    await fixtureGit(root, ["config", "user.name", "Path Code Test"]);

    const { baseline } = await baselineAt(root);
    expect(baseline.availability.kind).toBe("GIT_REPOSITORY");
    if (baseline.availability.kind === "GIT_REPOSITORY") {
      expect(baseline.availability.head).toEqual({ kind: "UNBORN" });
      expect(baseline.availability.branch.kind).toBe("ATTACHED");
    }
  });

  it("reports a normal attached branch after the initial commit", async () => {
    const root = await createCanonicalTempRoot("pc-git-base-attached-");
    await initCommitWorktree(root);

    const { baseline } = await baselineAt(root);
    expect(baseline.availability.kind).toBe("GIT_REPOSITORY");
    if (baseline.availability.kind === "GIT_REPOSITORY") {
      expect(baseline.availability.head.kind).toBe("COMMIT");
      expect(baseline.availability.branch.kind).toBe("ATTACHED");
      if (baseline.availability.branch.kind === "ATTACHED") {
        expect(baseline.availability.branch.name.length).toBeGreaterThan(0);
      }
    }
  });

  it("returns NOT_GIT_REPOSITORY for a non-Git workspace", async () => {
    const root = await createCanonicalTempRoot("pc-git-base-nogit-");
    await writeRelative(root, "plain.txt");

    const workspace = await boundaryFor(root);
    const config = await resolvedConfigAt(root);
    const inv = await inventoryAt(root, config);
    const result = await collectGitStateBaseline(workspace, inv, config);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.availability).toEqual({ kind: "NOT_GIT_REPOSITORY" });
      expect(result.value.annotations).toEqual([]);
      expect(result.value.unmappedVisibleObservations).toEqual([]);
    }
  });
});

describe("collectGitStateBaseline — inventory coupling", () => {
  it("maps annotation.entry to the same inventory entry by reference identity", async () => {
    const root = await createCanonicalTempRoot("pc-git-base-identity-");
    await initCommitWorktree(root);
    await writeRelative(root, "extra.txt");

    const { baseline, inventory: inv } = await baselineAt(root);
    const annotation = annotationFor(baseline, "README.md");
    const inventoryEntry = admittedInventoryEntry(inv, "README.md");
    expect(annotation?.entry).toBe(inventoryEntry);
  });

  it("uses PRE_EXISTING provenance throughout and never PATH_CODE_MODIFIED", async () => {
    const root = await createCanonicalTempRoot("pc-git-base-provenance-");
    await initCommitWorktree(root);
    await writeRelative(root, "draft.txt");

    const { baseline } = await baselineAt(root);
    for (const observation of allObservations(baseline)) {
      expect(observation.provenance).toBe("PRE_EXISTING");
      expect(observation.provenance).not.toBe("PATH_CODE_MODIFIED");
    }
    expect(baseline.provenance).toBe("PRE_EXISTING");
  });

  it("records unmapped visible Git paths when inventory is PARTIAL", async () => {
    const root = await createCanonicalTempRoot("pc-git-base-partial-");
    await initCommitWorktree(root);
    await writeRelative(root, "alpha.txt");
    await writeRelative(root, "beta.txt");
    await fixtureGit(root, ["add", "alpha.txt", "beta.txt"]);
    await rm(path.join(root, "beta.txt"));

    const workspace = await boundaryFor(root);
    const config = await resolvedConfigAt(root);
    const inv = await inventory(workspace, config, { maxEntries: 1 });
    expect(inv.ok).toBe(true);
    if (!inv.ok) {
      return;
    }
    expect(inv.value.traversalCompletion.kind).toBe("PARTIAL");

    const result = await collectGitStateBaseline(workspace, inv.value, config);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.inventoryTraversalCompletion.kind).toBe("PARTIAL");
      expect(result.value.unmappedVisibleObservations.length).toBeGreaterThan(0);
      expect(
        result.value.unmappedVisibleObservations.some(
          (item) => item.observation.workspaceRelativePath === "beta.txt",
        ),
      ).toBe(true);
    }
  });
});

describe("collectGitStateBaseline — deny-path visibility", () => {
  it("excludes denied secrets descendants from annotations and unmapped observations", async () => {
    const root = await createCanonicalTempRoot("pc-git-base-deny-");
    await initCommitWorktree(root);
    await writeRelative(root, "secrets/key.txt");
    await writeRelative(root, "public/readme.txt");
    await fixtureGit(root, ["add", "secrets/key.txt", "public/readme.txt"]);
    await fixtureGit(root, [
      "-c",
      "commit.gpgsign=false",
      "commit",
      "--no-gpg-sign",
      "-m",
      "track secrets",
    ]);
    await writeDenyConfig(root, ["secrets"]);

    const { baseline } = await baselineAt(root);
    const paths = [
      ...baseline.annotations.map((a) => a.observation.workspaceRelativePath),
      ...baseline.unmappedVisibleObservations.map(
        (item) => item.observation.workspaceRelativePath,
      ),
    ];
    expect(paths.some((value) => value.startsWith("secrets"))).toBe(false);
    expect(annotationFor(baseline, "public/readme.txt")).toBeDefined();
  });

  it("does not deny secrets-public when only secrets is configured", async () => {
    const root = await createCanonicalTempRoot("pc-git-base-deny-sibling-");
    await initCommitWorktree(root);
    await writeRelative(root, "secrets/token.txt");
    await writeRelative(root, "secrets-public/page.txt");
    await writeDenyConfig(root, ["secrets"]);

    const { baseline } = await baselineAt(root);
    expect(annotationFor(baseline, "secrets-public/page.txt")).toBeDefined();
    expect(
      baseline.annotations.some((annotation) =>
        annotation.observation.workspaceRelativePath.startsWith("secrets/"),
      ),
    ).toBe(false);
  });

  it("physically denies symlink aliases to configured deny roots", async () => {
    const root = await createCanonicalTempRoot("pc-git-base-deny-alias-");
    await initCommitWorktree(root);
    await mkdir(path.join(root, "secrets"));
    await writeRelative(root, "secrets/private.txt");
    await fixtureGit(root, ["add", "secrets/private.txt"]);
    await fixtureGit(root, [
      "-c",
      "commit.gpgsign=false",
      "commit",
      "--no-gpg-sign",
      "-m",
      "track secret",
    ]);
    await symlink(path.join(root, "secrets"), path.join(root, "public-link"));
    await writeDenyConfig(root, ["secrets"]);

    const workspace = await boundaryFor(root);
    const config = await resolvedConfigAt(root);
    const inv = await inventoryAt(root, config);
    const result = await collectGitStateBaseline(workspace, inv, config);

    if (!result.ok) {
      // Git may still emit the alias path; parser/reconciliation must fail closed.
      expect(result.error.code).toBe("GIT_DENIED_PATH_LEAK_DETECTED");
      expect(JSON.stringify(result.error)).not.toContain("private.txt");
      expect(JSON.stringify(result.error)).not.toContain("public-link");
      return;
    }

    const paths = [
      ...result.value.annotations.map(
        (annotation) => annotation.observation.workspaceRelativePath,
      ),
      ...result.value.unmappedVisibleObservations.map(
        (item) => item.observation.workspaceRelativePath,
      ),
    ];
    expect(paths.some((value) => value.includes("private.txt"))).toBe(false);
    expect(paths.some((value) => value.startsWith("public-link"))).toBe(false);
  });
});
