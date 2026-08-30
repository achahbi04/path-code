/**
 * Shared disposable Git fixtures for Phase 1D tests.
 *
 * Fixtures MUST live outside this repository's Git worktree. Otherwise upward
 * Git discovery finds the Path Code repo itself and corrupts authority tests.
 */

import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { runGit } from "../../src/git/runner.js";

const fixtures: string[] = [];

export async function createCanonicalTempRoot(prefix: string): Promise<string> {
  const lexical = await mkdtemp(path.join(tmpdir(), prefix));
  const physical = await realpath(lexical);
  fixtures.push(physical);
  return physical;
}

export async function cleanupGitFixtures(): Promise<void> {
  while (fixtures.length > 0) {
    const dir = fixtures.pop();
    if (dir === undefined) {
      continue;
    }
    await rm(dir, { recursive: true, force: true });
  }
}

export async function fixtureGit(
  cwd: string,
  args: readonly string[],
): Promise<void> {
  const result = await runGit({ cwd, args });
  if (!result.ok) {
    throw new Error(
      `fixture git ${args.join(" ")} failed: ${result.error.code} ${result.error.message}`,
    );
  }
}

export async function initCommitWorktree(root: string): Promise<void> {
  await fixtureGit(root, ["-c", "init.templateDir=", "init"]);
  await fixtureGit(root, ["config", "user.email", "pathcode-test@example.com"]);
  await fixtureGit(root, ["config", "user.name", "Path Code Test"]);
  await fixtureGit(root, ["config", "commit.gpgsign", "false"]);
  await writeFile(path.join(root, "README.md"), "init\n");
  await fixtureGit(root, ["add", "README.md"]);
  await fixtureGit(root, [
    "-c",
    "commit.gpgsign=false",
    "commit",
    "--no-gpg-sign",
    "-m",
    "init",
  ]);
}
