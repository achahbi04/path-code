/**
 * Git environment integrity tests.
 *
 * All process.env mutation for Git discovery lives in THIS FILE ONLY so Vitest
 * worker parallelism cannot race ambient environment across files.
 */

import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createWorkspaceBoundary } from "../../src/workspace/index.js";
import { discoverGitRepository } from "../../src/git/index.js";
import { buildGitChildEnvironment } from "../../src/git/environment.js";
import {
  cleanupGitFixtures,
  createCanonicalTempRoot,
  initCommitWorktree,
} from "./fixture-helpers.js";

afterEach(async () => {
  await cleanupGitFixtures();
});

describe("buildGitChildEnvironment", () => {
  it("removes direct redirection and config injection keys from a host env copy", () => {
    const host: NodeJS.ProcessEnv = {
      PATH: "/usr/bin",
      GIT_DIR: "/evil/git",
      GIT_WORK_TREE: "/evil/wt",
      GIT_COMMON_DIR: "/evil/common",
      GIT_DISCOVERY_ACROSS_FILESYSTEM: "1",
      GIT_CONFIG_GLOBAL: "/evil/global",
      GIT_CONFIG_SYSTEM: "/evil/system",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "core.bare",
      GIT_CONFIG_VALUE_0: "true",
      GIT_CEILING_DIRECTORIES: "/tmp",
      KEEP_ME: "yes",
    };

    const child = buildGitChildEnvironment(host);
    expect(child["PATH"]).toBe("/usr/bin");
    expect(child["KEEP_ME"]).toBe("yes");
    expect(child["GIT_DIR"]).toBeUndefined();
    expect(child["GIT_WORK_TREE"]).toBeUndefined();
    expect(child["GIT_COMMON_DIR"]).toBeUndefined();
    expect(child["GIT_DISCOVERY_ACROSS_FILESYSTEM"]).toBeUndefined();
    expect(child["GIT_CONFIG_GLOBAL"]).toBeUndefined();
    expect(child["GIT_CONFIG_SYSTEM"]).toBeUndefined();
    expect(child["GIT_CONFIG_NOSYSTEM"]).toBeUndefined();
    expect(child["GIT_CONFIG_COUNT"]).toBeUndefined();
    expect(child["GIT_CONFIG_KEY_0"]).toBeUndefined();
    expect(child["GIT_CONFIG_VALUE_0"]).toBeUndefined();
    expect(child["GIT_CEILING_DIRECTORIES"]).toBeUndefined();
    expect(host["GIT_DIR"]).toBe("/evil/git");
  });
});

describe("ambient Git env hijack attempts", () => {
  it("does not let GIT_DIR redirect discovery to an unrelated repository", async () => {
    const repoA = await createCanonicalTempRoot("pc-git-A-");
    const repoB = await createCanonicalTempRoot("pc-git-B-");
    await initCommitWorktree(repoA);
    await initCommitWorktree(repoB);

    const previous = process.env["GIT_DIR"];
    try {
      process.env["GIT_DIR"] = path.join(repoB, ".git");

      const boundary = await createWorkspaceBoundary(repoA);
      expect(boundary.ok).toBe(true);
      if (!boundary.ok) {
        return;
      }

      const discovered = await discoverGitRepository(boundary.value);
      expect(discovered.ok).toBe(true);
      if (discovered.ok) {
        expect(discovered.value.root).toBe(repoA);
        expect(discovered.value.root).not.toBe(repoB);
      }
    } finally {
      if (previous === undefined) {
        delete process.env["GIT_DIR"];
      } else {
        process.env["GIT_DIR"] = previous;
      }
    }
  });

  it("does not let GIT_WORK_TREE redirect discovery to an unrelated repository", async () => {
    const repoA = await createCanonicalTempRoot("pc-git-A-");
    const repoB = await createCanonicalTempRoot("pc-git-B-");
    await initCommitWorktree(repoA);
    await initCommitWorktree(repoB);

    const previous = process.env["GIT_WORK_TREE"];
    try {
      process.env["GIT_WORK_TREE"] = repoB;

      const boundary = await createWorkspaceBoundary(repoA);
      expect(boundary.ok).toBe(true);
      if (!boundary.ok) {
        return;
      }

      const discovered = await discoverGitRepository(boundary.value);
      if (discovered.ok) {
        expect(discovered.value.root).toBe(repoA);
        expect(discovered.value.root).not.toBe(repoB);
      } else {
        expect(discovered.error.code).not.toBeUndefined();
      }
    } finally {
      if (previous === undefined) {
        delete process.env["GIT_WORK_TREE"];
      } else {
        process.env["GIT_WORK_TREE"] = previous;
      }
    }
  });

  it("does not let GIT_CONFIG_COUNT injection redirect discovery", async () => {
    const repoA = await createCanonicalTempRoot("pc-git-A-");
    const repoB = await createCanonicalTempRoot("pc-git-B-");
    await initCommitWorktree(repoA);
    await initCommitWorktree(repoB);

    const keys = [
      "GIT_CONFIG_COUNT",
      "GIT_CONFIG_KEY_0",
      "GIT_CONFIG_VALUE_0",
      "GIT_CONFIG_GLOBAL",
      "GIT_CONFIG_SYSTEM",
    ] as const;
    const previous: Record<string, string | undefined> = {};
    for (const key of keys) {
      previous[key] = process.env[key];
    }

    try {
      process.env["GIT_CONFIG_COUNT"] = "1";
      process.env["GIT_CONFIG_KEY_0"] = "core.worktree";
      process.env["GIT_CONFIG_VALUE_0"] = repoB;
      process.env["GIT_CONFIG_GLOBAL"] = "/nonexistent-pathcode-global";
      process.env["GIT_CONFIG_SYSTEM"] = "/nonexistent-pathcode-system";

      const boundary = await createWorkspaceBoundary(repoA);
      expect(boundary.ok).toBe(true);
      if (!boundary.ok) {
        return;
      }

      const discovered = await discoverGitRepository(boundary.value);
      if (discovered.ok) {
        expect(discovered.value.root).toBe(repoA);
        expect(discovered.value.root).not.toBe(repoB);
      }
    } finally {
      for (const key of keys) {
        const value = previous[key];
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  });

  it("leaves process.env unchanged after successful discovery", async () => {
    const repo = await createCanonicalTempRoot("pc-git-env-");
    await initCommitWorktree(repo);
    const snapshot = { ...process.env };

    const boundary = await createWorkspaceBoundary(repo);
    expect(boundary.ok).toBe(true);
    if (!boundary.ok) {
      return;
    }

    await discoverGitRepository(boundary.value);
    expect(process.env).toEqual(snapshot);
  });
});

describe("GIT_COMMON_DIR sanitation", () => {
  it("removes GIT_COMMON_DIR from child env without mutating host", async () => {
    const host: NodeJS.ProcessEnv = {
      PATH: process.env["PATH"],
      GIT_COMMON_DIR: "/tmp/evil-common",
    };
    const child = buildGitChildEnvironment(host);
    expect(child["GIT_COMMON_DIR"]).toBeUndefined();
    expect(host["GIT_COMMON_DIR"]).toBe("/tmp/evil-common");

    const repo = await createCanonicalTempRoot("pc-git-common-");
    await initCommitWorktree(repo);
    const previous = process.env["GIT_COMMON_DIR"];
    try {
      process.env["GIT_COMMON_DIR"] = path.join(repo, ".git");
      const boundary = await createWorkspaceBoundary(repo);
      expect(boundary.ok).toBe(true);
      if (!boundary.ok) {
        return;
      }
      const discovered = await discoverGitRepository(boundary.value);
      expect(discovered.ok).toBe(true);
      if (discovered.ok) {
        expect(discovered.value.root).toBe(repo);
      }
    } finally {
      if (previous === undefined) {
        delete process.env["GIT_COMMON_DIR"];
      } else {
        process.env["GIT_COMMON_DIR"] = previous;
      }
    }
  });
});
