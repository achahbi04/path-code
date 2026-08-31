/**
 * Phase 2C-H1: execFile-only check-ignore transport evidence.
 */

import { access, writeFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { failure, success } from "../../src/domain/result.js";
import { gitBaselineFailure } from "../../src/git/baseline-failure.js";
import {
  estimateCheckIgnoreArgvBytes,
  partitionCheckIgnoreBatches,
  reduceCheckIgnoreBatches,
} from "../../src/git/check-ignore.js";
import {
  MAX_CHECK_IGNORE_ARGUMENT_BYTES,
  MAX_CHECK_IGNORE_PATHS_PER_BATCH,
} from "../../src/git/constants.js";
import { discoverGitRepository } from "../../src/git/discovery.js";
import { collectGitStateBaseline } from "../../src/git/index.js";
import { runGitCheckIgnore } from "../../src/git/runner.js";
import { buildGitVisibilityScope } from "../../src/git/visibility.js";
import { prepareDenyPathPlan } from "../../src/inventory/denial.js";
import { initCommitWorktree } from "./fixture-helpers.js";
import {
  annotationFor,
  baselineAt,
  boundaryFor,
  createCanonicalTempRoot,
  inventoryAt,
  resolvedConfigAt,
  writeRelative,
} from "./baseline-helpers.js";

async function emptyVisibilityScope(root: string) {
  const boundary = await boundaryFor(root);
  const plan = await prepareDenyPathPlan(boundary, []);
  expect(plan.ok).toBe(true);
  if (!plan.ok) {
    throw new Error("expected deny plan");
  }
  const discovery = await discoverGitRepository(boundary);
  expect(discovery.ok).toBe(true);
  if (!discovery.ok) {
    throw new Error("expected git discovery");
  }
  return buildGitVisibilityScope(plan.value, discovery.value.root, ".");
}

describe("check-ignore exit protocol", () => {
  it("TEST A — exit 0: admitted ignored path is reported ignored", async () => {
    const root = await createCanonicalTempRoot("check-ignore-match-");
    await initCommitWorktree(root);
    await writeFile(path.join(root, ".gitignore"), "noise.log\n", "utf8");
    await writeRelative(root, "noise.log", "ignored\n");

    const fixture = await baselineAt(root);
    const ignored = annotationFor(fixture.baseline, "noise.log");
    expect(ignored?.observation.state.kind).toBe("IGNORED");

    const direct = await runGitCheckIgnore({
      cwd: root,
      paths: ["noise.log"],
    });
    expect(direct.ok).toBe(true);
    if (direct.ok) {
      expect(direct.value.stdout).toContain("noise.log");
    }
  });

  it("TEST B — exit 1: no ignored paths yields successful empty set and successful baseline", async () => {
    const root = await createCanonicalTempRoot("check-ignore-nomatch-");
    await initCommitWorktree(root);
    await writeRelative(root, "visible.txt", "not ignored\n");

    const direct = await runGitCheckIgnore({
      cwd: root,
      paths: ["README.md", "visible.txt"],
    });
    expect(direct.ok).toBe(true);
    if (direct.ok) {
      expect(direct.value.stdout).toBe("");
    }

    const fixture = await baselineAt(root);
    expect(fixture.baseline.availability.kind).toBe("GIT_REPOSITORY");
    const visible = annotationFor(fixture.baseline, "visible.txt");
    expect(visible?.observation.state.kind).toBe("UNTRACKED");
  });

  it("fatal check-ignore against a non-Git directory fails closed", async () => {
    const root = await createCanonicalTempRoot("check-ignore-fatal-");
    await writeRelative(root, "file.txt", "x\n");

    const result = await runGitCheckIgnore({
      cwd: root,
      paths: ["file.txt"],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.error.code === "NOT_A_GIT_REPOSITORY" ||
          result.error.code === "GIT_STATE_FAILED",
      ).toBe(true);
    }
  });
});

describe("check-ignore argv batching", () => {
  it("partitions into multiple deterministic batches by path count", () => {
    const paths = Array.from(
      { length: MAX_CHECK_IGNORE_PATHS_PER_BATCH + 3 },
      (_, i) => `f${String(i).padStart(4, "0")}.txt`,
    );
    const first = partitionCheckIgnoreBatches(paths);
    const second = partitionCheckIgnoreBatches(paths);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) {
      return;
    }
    expect(first.value.length).toBeGreaterThan(1);
    expect(first.value).toEqual(second.value);
    expect(first.value.flat()).toEqual(paths);
    expect(first.value[0]?.length).toBe(MAX_CHECK_IGNORE_PATHS_PER_BATCH);
  });

  it("fails explicitly when a single pathname exceeds the argv byte ceiling", () => {
    const oversized = "x".repeat(MAX_CHECK_IGNORE_ARGUMENT_BYTES);
    const result = partitionCheckIgnoreBatches([oversized]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("GIT_STATE_FAILED");
      expect(result.error.message).toMatch(/stdin byte ceiling/i);
    }
  });

  it("byte accounting counts NUL-framed pathname payloads", () => {
    const empty = estimateCheckIgnoreArgvBytes([]);
    const one = estimateCheckIgnoreArgvBytes(["a"]);
    expect(empty).toBe(0);
    expect(one).toBe(Buffer.byteLength("a", "utf8") + 1);
  });

  it("merges ignored results across batches and treats empty batches as success", async () => {
    const root = await createCanonicalTempRoot("check-ignore-merge-");
    await initCommitWorktree(root);
    const scope = await emptyVisibilityScope(root);

    const batches = [["ignored-a.txt"], ["kept.txt"], ["ignored-b.txt"]] as const;
    const requested = new Set(batches.flat());
    let call = 0;
    const reduced = await reduceCheckIgnoreBatches(
      batches,
      async (paths) => {
        call += 1;
        if (paths[0] === "kept.txt") {
          return success({ stdout: "", stderr: "" });
        }
        return success({ stdout: `${paths[0]}\0`, stderr: "" });
      },
      scope,
      requested,
    );
    expect(reduced.ok).toBe(true);
    expect(call).toBe(3);
    if (reduced.ok) {
      expect([...reduced.value].sort()).toEqual([
        "ignored-a.txt",
        "ignored-b.txt",
      ]);
    }
  });

  it("later-batch execution failure fails the whole operation without partial success", async () => {
    const root = await createCanonicalTempRoot("check-ignore-fail-batch-");
    await initCommitWorktree(root);
    const scope = await emptyVisibilityScope(root);

    const reduced = await reduceCheckIgnoreBatches(
      [["a.txt"], ["b.txt"]],
      async (paths) => {
        if (paths[0] === "a.txt") {
          return success({ stdout: "a.txt\0", stderr: "" });
        }
        return failure(
          gitBaselineFailure("GIT_STATE_FAILED", "synthetic later batch failure"),
        );
      },
      scope,
      new Set(["a.txt", "b.txt"]),
    );
    expect(reduced.ok).toBe(false);
    if (!reduced.ok) {
      expect(reduced.error.code).toBe("GIT_STATE_FAILED");
    }
  });

  it("later-batch parse failure fails closed", async () => {
    const root = await createCanonicalTempRoot("check-ignore-parse-fail-");
    await initCommitWorktree(root);
    const scope = await emptyVisibilityScope(root);

    const reduced = await reduceCheckIgnoreBatches(
      [["a.txt"], ["b.txt"]],
      async (paths) => {
        if (paths[0] === "a.txt") {
          return success({ stdout: "a.txt\0", stderr: "" });
        }
        return success({ stdout: "never-requested.txt\0", stderr: "" });
      },
      scope,
      new Set(["a.txt", "b.txt"]),
    );
    expect(reduced.ok).toBe(false);
    if (!reduced.ok) {
      expect(reduced.error.code).toBe("GIT_IGNORE_PARSE_FAILED");
    }
  });

  it("live multi-batch ignore observation covers every admitted candidate once", async () => {
    const root = await createCanonicalTempRoot("check-ignore-live-batches-");
    await initCommitWorktree(root);
    await writeFile(path.join(root, ".gitignore"), "*.tmp\n", "utf8");

    const total = MAX_CHECK_IGNORE_PATHS_PER_BATCH + 5;
    for (let i = 0; i < total; i += 1) {
      await writeRelative(
        root,
        `batch-${String(i).padStart(3, "0")}.tmp`,
        "tmp\n",
      );
    }
    await writeRelative(root, "kept-live.txt", "kept\n");

    const inventory = await inventoryAt(root);
    const config = await resolvedConfigAt(root);
    const baseline = await collectGitStateBaseline(
      await boundaryFor(root),
      inventory,
      config,
    );
    expect(baseline.ok).toBe(true);
    if (!baseline.ok) {
      throw new Error(`baseline failed: ${baseline.error.code}`);
    }

    let ignoredCount = 0;
    for (const annotation of baseline.value.annotations) {
      if (
        annotation.observation.workspaceRelativePath.endsWith(".tmp") &&
        annotation.observation.state.kind === "IGNORED"
      ) {
        ignoredCount += 1;
      }
    }
    expect(ignoredCount).toBe(total);
    const kept = annotationFor(baseline.value, "kept-live.txt");
    expect(kept?.observation.state.kind).toBe("UNTRACKED");
  });
});

describe("check-ignore special pathname data", () => {
  it("treats leading-dash and bracket filenames as argv data", async () => {
    const root = await createCanonicalTempRoot("check-ignore-special-");
    await initCommitWorktree(root);
    await writeFile(
      path.join(root, ".gitignore"),
      "\\-weird.txt\nfile\\[1\\].txt\n",
      "utf8",
    );

    const candidates = ["-weird.txt", "file[1].txt", "ok.txt"];
    const existing: string[] = [];
    for (const name of candidates) {
      try {
        await writeRelative(root, name, "x\n");
        await access(path.join(root, name));
        existing.push(name);
      } catch {
        // Host FS may reject some names.
      }
    }
    expect(existing.length).toBeGreaterThan(0);

    const checked = await runGitCheckIgnore({ cwd: root, paths: existing });
    expect(checked.ok).toBe(true);
    if (!checked.ok) {
      throw new Error(`check-ignore failed: ${checked.error.code}`);
    }
    if (existing.includes("ok.txt")) {
      expect(checked.value.stdout.includes("ok.txt")).toBe(false);
    }
  });

  it("preserves space and Unicode pathnames through argv check-ignore", async () => {
    const root = await createCanonicalTempRoot("check-ignore-unicode-");
    await initCommitWorktree(root);
    await writeFile(
      path.join(root, ".gitignore"),
      "has space.txt\nunicodé.txt\n",
      "utf8",
    );
    await writeRelative(root, "has space.txt", "x\n");
    await writeRelative(root, "unicodé.txt", "x\n");

    const checked = await runGitCheckIgnore({
      cwd: root,
      paths: ["has space.txt", "unicodé.txt"],
    });
    expect(checked.ok).toBe(true);
    if (!checked.ok) {
      throw new Error(`check-ignore failed: ${checked.error.code}`);
    }
    expect(checked.value.stdout).toContain("has space.txt");
    expect(checked.value.stdout).toContain("unicodé.txt");
  });
});
