import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import * as gitPublic from "../../src/git/index.js";
import {
  GIT_STATE_COMMAND_TIMEOUT_MS,
  MAX_GIT_STATE_COMMAND_OUTPUT_BYTES,
} from "../../src/git/index.js";

const gitDir = fileURLToPath(new URL("../../src/git", import.meta.url));
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

const GIT_STATE_BASELINE_CONSTRUCTOR_NAMES = [
  "brandGitStateBaseline",
  "unsafeGitStateBaseline",
  "asGitStateBaseline",
  "castGitStateBaseline",
  "gitStateBaseline",
] as const;

const GIT_MUTATION_EXPORTS = [
  "add",
  "commit",
  "checkout",
  "merge",
  "rebase",
  "reset",
  "push",
  "pull",
  "fetch",
  "clone",
  "init",
  "rm",
  "mv",
  "tag",
  "branch",
  "stash",
] as const;

function listTsFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => join(dir, name));
}

function assertNoGitStateBaselineConstructors(mod: object, label: string): void {
  for (const name of GIT_STATE_BASELINE_CONSTRUCTOR_NAMES) {
    expect(
      Object.prototype.hasOwnProperty.call(mod, name),
      `${label} must not export ${name}`,
    ).toBe(false);
  }
}

describe("git baseline architecture", () => {
  it("keeps src/git free of shell: true", () => {
    expect(statSync(gitDir).isDirectory()).toBe(true);
    const violations: string[] = [];
    for (const filePath of listTsFiles(gitDir)) {
      const source = readFileSync(filePath, "utf8");
      if (/shell:\s*true/.test(source)) {
        violations.push(`${filePath}: shell:true`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("does not export Git mutation verbs on the public barrel", () => {
    for (const name of GIT_MUTATION_EXPORTS) {
      expect(Object.prototype.hasOwnProperty.call(gitPublic, name)).toBe(false);
    }
  });

  it("does not export brandGitStateBaseline from the public barrel", () => {
    expect(Object.prototype.hasOwnProperty.call(gitPublic, "brandGitStateBaseline")).toBe(
      false,
    );
    assertNoGitStateBaselineConstructors(gitPublic, "git public barrel");
  });

  it("imports baseline modules without spawning Git or mutating process state", async () => {
    const envSnapshot = { ...process.env };
    const cwdSnapshot = process.cwd();
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      const git = await import("../../src/git/index.js");
      expect(typeof git.collectGitStateBaseline).toBe("function");
      expect(typeof git.parsePorcelainV2Status).toBe("function");
      expect(typeof git.buildGitVisibilityScope).toBe("function");
      expect(Object.prototype.hasOwnProperty.call(git, "runGit")).toBe(false);
      expect(process.cwd()).toBe(cwdSnapshot);
      expect(process.env).toEqual(envSnapshot);
      expect(consoleLog).not.toHaveBeenCalled();
    } finally {
      consoleLog.mockRestore();
    }
  });

  it("exposes the Phase 2C Git state command bounds as fixed constants", () => {
    expect(MAX_GIT_STATE_COMMAND_OUTPUT_BYTES).toBe(16_777_216);
    expect(GIT_STATE_COMMAND_TIMEOUT_MS).toBe(15_000);
  });

  it("does not export runGit from the compiled dist git barrel", async () => {
    const distGit = await import(join(repoRoot, "dist/git/index.js"));
    expect(Object.prototype.hasOwnProperty.call(distGit, "runGit")).toBe(false);
    assertNoGitStateBaselineConstructors(distGit, "dist git barrel");
  });

  it("does not export GitStateBaseline constructor helpers from compiled dist modules", async () => {
    const distGit = await import(join(repoRoot, "dist/git/index.js"));
    const distBaseline = await import(join(repoRoot, "dist/git/baseline.js"));
    const distTypes = await import(join(repoRoot, "dist/git/types.js"));

    assertNoGitStateBaselineConstructors(distGit, "dist git barrel");
    assertNoGitStateBaselineConstructors(distBaseline, "dist git baseline");
    assertNoGitStateBaselineConstructors(distTypes, "dist git types");
  });
});
