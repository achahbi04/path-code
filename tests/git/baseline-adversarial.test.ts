import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { prepareDenyPathPlan } from "../../src/inventory/index.js";
import {
  assertGitPathVisible,
  buildGitVisibilityScope,
  parsePorcelainV2Status,
} from "../../src/git/index.js";
import {
  boundaryFor,
  createCanonicalTempRoot,
  resolvedConfigAt,
  writeDenyConfig,
} from "./baseline-helpers.js";
import {
  cleanupGitFixtures,
  initCommitWorktree,
} from "./fixture-helpers.js";

afterEach(async () => {
  await cleanupGitFixtures();
});

const SECRET_FILENAME = "secrets/distinct-secret-name.txt";

async function denyScopeFor(root: string, denyPaths: readonly string[]) {
  await writeDenyConfig(root, denyPaths);
  const workspace = await boundaryFor(root);
  const config = await resolvedConfigAt(root);
  const plan = await prepareDenyPathPlan(workspace, config.restrictions.deniedPaths);
  expect(plan.ok).toBe(true);
  if (!plan.ok) {
    throw new Error("expected deny-path plan");
  }
  return buildGitVisibilityScope(
    plan.value,
    root as import("../../src/domain/workspace.js").CanonicalPath,
    "",
  );
}

describe("Git baseline adversarial — denied-path parser leak", () => {
  it("fails closed with GIT_DENIED_PATH_LEAK_DETECTED without echoing secret paths or raw stdout", async () => {
    const root = await createCanonicalTempRoot("pc-git-adv-leak-");
    await initCommitWorktree(root);
    const scope = await denyScopeFor(root, ["secrets"]);

    const syntheticStdout = `? ${SECRET_FILENAME}\0`;
    const parsed = parsePorcelainV2Status(syntheticStdout, scope);

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error.code).toBe("GIT_DENIED_PATH_LEAK_DETECTED");
      expect(parsed.error.message).not.toContain("distinct-secret-name");
      expect(parsed.error.message).not.toContain(SECRET_FILENAME);
      expect(JSON.stringify(parsed.error)).not.toContain("distinct-secret-name");
      expect(JSON.stringify(parsed.error)).not.toContain(syntheticStdout);
    }
  });

  it("marks deny paths containing [ as command exclusions not expressible", async () => {
    const root = await createCanonicalTempRoot("pc-git-adv-bracket-");
    await initCommitWorktree(root);
    const scope = await denyScopeFor(root, ["sec[rets"]);

    expect(
      scope.commandExclusionStatuses.some(
        (status) =>
          status.kind === "COMMAND_EXCLUSION_NOT_EXPRESSIBLE" &&
          status.configuredPath === "sec[rets",
      ),
    ).toBe(true);

    const syntheticStdout = `? sec[rets/leak.txt\0`;
    const parsed = parsePorcelainV2Status(syntheticStdout, scope);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error.code).toBe("GIT_DENIED_PATH_LEAK_DETECTED");
    }
  });
});

describe("Git baseline adversarial — porcelain parse failures", () => {
  it("rejects unknown porcelain record types", async () => {
    const root = await createCanonicalTempRoot("pc-git-adv-unknown-");
    await initCommitWorktree(root);
    const scope = await denyScopeFor(root, []);

    const parsed = parsePorcelainV2Status("x unknown-record\0", scope);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error.code).toBe("GIT_STATUS_PARSE_FAILED");
    }
  });

  it("rejects absolute Git paths", async () => {
    const root = await createCanonicalTempRoot("pc-git-adv-abs-");
    await initCommitWorktree(root);
    const scope = await denyScopeFor(root, []);

    const absolute = path.posix.join("/", "etc", "passwd");
    const visible = assertGitPathVisible(absolute, scope);
    expect(visible.ok).toBe(false);
    if (!visible.ok) {
      expect(visible.error.code).toBe("GIT_PATH_INVALID");
    }

    const parsed = parsePorcelainV2Status(`? ${absolute}\0`, scope);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error.code).toBe("GIT_PATH_INVALID");
    }
  });

  it("rejects parent-segment escape paths", async () => {
    const root = await createCanonicalTempRoot("pc-git-adv-escape-");
    await initCommitWorktree(root);
    const scope = await denyScopeFor(root, []);

    const escaped = "../outside.txt";
    const visible = assertGitPathVisible(escaped, scope);
    expect(visible.ok).toBe(false);
    if (!visible.ok) {
      expect(visible.error.code).toBe("GIT_PATH_INVALID");
    }

    const parsed = parsePorcelainV2Status(`? ${escaped}\0`, scope);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error.code).toBe("GIT_PATH_INVALID");
    }
  });

  it("accepts filenames containing spaces when the filesystem allows them", async () => {
    const root = await createCanonicalTempRoot("pc-git-adv-space-");
    await initCommitWorktree(root);
    const scope = await denyScopeFor(root, []);

    const spaced = "my file.txt";
    await writeFile(path.join(root, spaced), "hello\n");

    const visible = assertGitPathVisible(spaced, scope);
    expect(visible.ok).toBe(true);
    if (visible.ok) {
      expect(visible.value).toBe(spaced);
    }

    const parsed = parsePorcelainV2Status(`? ${spaced}\0`, scope);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value).toEqual([{ kind: "UNTRACKED", gitRelativePath: spaced }]);
    }
  });

  it("accepts filenames containing newlines when the filesystem allows them", async () => {
    const root = await createCanonicalTempRoot("pc-git-adv-newline-");
    await initCommitWorktree(root);
    const scope = await denyScopeFor(root, []);

    const newlineName = "line\nbreak.txt";
    const absolute = path.join(root, newlineName);
    await mkdir(path.dirname(absolute), { recursive: true });
    try {
      await writeFile(absolute, "payload\n");
    } catch {
      return;
    }

    const visible = assertGitPathVisible(newlineName, scope);
    expect(visible.ok).toBe(true);

    const parsed = parsePorcelainV2Status(`? ${newlineName}\0`, scope);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value[0]?.gitRelativePath).toBe(newlineName);
    }
  });
});
