import { chmod, symlink } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_SYSTEM_PRUNED_DIRECTORIES,
  inventory,
  MAX_INVENTORY_OBSERVATIONS,
  MAX_TRAVERSAL_DEPTH,
} from "../../src/inventory/index.js";
import {
  boundaryFor,
  cleanupInventoryFixtures,
  createCanonicalTempRoot,
  hasDisposition,
  inventoryAt,
  makeUnreadableDir,
  mkdirp,
  observationPaths,
  resolvedConfigAt,
  writeDenyConfig,
  writeRelative,
} from "./fixture-helpers.js";

afterEach(async () => {
  await cleanupInventoryFixtures();
});

describe("inventory — basic admission", () => {
  it("admits flat files at the repository root", async () => {
    const root = await createCanonicalTempRoot("pc-inv-flat-");
    await writeRelative(root, "alpha.txt");
    await writeRelative(root, "beta.txt");

    const result = await inventoryAt(root);
    expect(hasDisposition(result.observations, "alpha.txt", "ADMITTED")).toBe(true);
    expect(hasDisposition(result.observations, "beta.txt", "ADMITTED")).toBe(true);
    expect(result.traversalCompletion.kind).toBe("COMPLETE");
  });

  it("descends nested directories and admits nested files", async () => {
    const root = await createCanonicalTempRoot("pc-inv-nested-");
    await writeRelative(root, "src/lib/util.ts");
    await writeRelative(root, "src/index.ts");

    const result = await inventoryAt(root);
    expect(hasDisposition(result.observations, "src", "DESCENDED")).toBe(true);
    expect(hasDisposition(result.observations, "src/lib", "DESCENDED")).toBe(true);
    expect(hasDisposition(result.observations, "src/lib/util.ts", "ADMITTED")).toBe(true);
    expect(hasDisposition(result.observations, "src/index.ts", "ADMITTED")).toBe(true);
  });

  it("applies independent workspace admission for every observed entry", async () => {
    const root = await createCanonicalTempRoot("pc-inv-independent-");
    const outside = await createCanonicalTempRoot("pc-inv-outside-");
    await writeRelative(outside, "secret.txt");
    await symlink(path.join(outside, "secret.txt"), path.join(root, "escape-file"));
    await writeRelative(root, "inside.txt");

    const result = await inventoryAt(root);
    expect(hasDisposition(result.observations, "inside.txt", "ADMITTED")).toBe(true);
    expect(hasDisposition(result.observations, "escape-file", "OUTSIDE_WORKSPACE")).toBe(
      true,
    );
    expect(observationPaths(result.observations)).not.toContain("secret.txt");
  });
});

describe("inventory — symlink safety", () => {
  it("marks inside symlinks to workspace targets as admitted", async () => {
    const root = await createCanonicalTempRoot("pc-inv-symlink-in-");
    await writeRelative(root, "real.txt");
    await symlink(path.join(root, "real.txt"), path.join(root, "link-inside"));

    const result = await inventoryAt(root);
    expect(hasDisposition(result.observations, "link-inside", "ADMITTED")).toBe(true);
  });

  it("marks symlinks whose physical target is outside the workspace", async () => {
    const root = await createCanonicalTempRoot("pc-inv-symlink-out-");
    const outside = await createCanonicalTempRoot("pc-inv-symlink-out-target-");
    await writeRelative(outside, "secret.txt");
    await symlink(path.join(outside, "secret.txt"), path.join(root, "escape"));

    const result = await inventoryAt(root);
    expect(hasDisposition(result.observations, "escape", "OUTSIDE_WORKSPACE")).toBe(true);
    expect(observationPaths(result.observations)).not.toContain("secret.txt");
  });

  it("records dangling symlinks as unreadable without outside descent", async () => {
    const root = await createCanonicalTempRoot("pc-inv-symlink-dangle-");
    await symlink(path.join(root, "missing-target"), path.join(root, "dangling"));

    const result = await inventoryAt(root);
    expect(hasDisposition(result.observations, "dangling", "UNREADABLE")).toBe(true);
    expect(result.traversalCompletion.kind).toBe("PARTIAL");
    if (result.traversalCompletion.kind === "PARTIAL") {
      expect(result.traversalCompletion.reasons.some((r) => r.kind === "UNREADABLE_SUBTREE")).toBe(
        true,
      );
    }
  });

  it("does not system-prune a .git symlink to an internal directory", async () => {
    const root = await createCanonicalTempRoot("pc-inv-git-symlink-");
    await mkdirp(".git-real/objects", root);
    await writeRelative(root, ".git-real/HEAD", "ref: refs/heads/main\n");
    await symlink(path.join(root, ".git-real"), path.join(root, ".git"));

    const result = await inventoryAt(root);
    expect(hasDisposition(result.observations, ".git", "SYSTEM_PRUNED")).toBe(false);
    expect(
      result.observations.some(
        (observation) =>
          observation.relativePath === ".git" ||
          observation.relativePath.startsWith(".git/"),
      ),
    ).toBe(true);
  });
});

describe("inventory — cycles", () => {
  it("detects ancestor symlink cycles without infinite traversal", async () => {
    const root = await createCanonicalTempRoot("pc-inv-cycle-ancestor-");
    await mkdirp("loop/sub", root);
    await symlink(path.join(root, "loop"), path.join(root, "loop/sub/up"));

    const result = await inventoryAt(root);
    expect(hasDisposition(result.observations, "loop", "DESCENDED")).toBe(true);
    expect(hasDisposition(result.observations, "loop/sub/up", "CYCLE_DETECTED")).toBe(true);
    expect(result.traversalCompletion.kind).toBe("COMPLETE");
  });

  it("detects mutual directory symlink cycles", async () => {
    const root = await createCanonicalTempRoot("pc-inv-cycle-mutual-");
    await mkdirp("a", root);
    await mkdirp("b", root);
    await symlink(path.join(root, "b"), path.join(root, "a/to-b"));
    await symlink(path.join(root, "a"), path.join(root, "b/to-a"));

    const result = await inventoryAt(root);
    expect(hasDisposition(result.observations, "a", "DESCENDED")).toBe(true);
    expect(hasDisposition(result.observations, "b", "DESCENDED")).toBe(true);
    expect(
      result.observations.some((observation) => observation.disposition === "CYCLE_DETECTED"),
    ).toBe(true);
    expect(result.traversalCompletion.kind).toBe("COMPLETE");
  });

  it("detects duplicate physical aliases to the same directory", async () => {
    const root = await createCanonicalTempRoot("pc-inv-cycle-alias-");
    await mkdirp("real/nested", root);
    await writeRelative(root, "real/nested/file.txt");
    await symlink(path.join(root, "real"), path.join(root, "alias-one"));
    await symlink(path.join(root, "real"), path.join(root, "alias-two"));

    const result = await inventoryAt(root);
    expect(hasDisposition(result.observations, "alias-one", "DESCENDED")).toBe(true);
    expect(hasDisposition(result.observations, "alias-two", "CYCLE_DETECTED")).toBe(true);
    expect(hasDisposition(result.observations, "alias-one/nested/file.txt", "ADMITTED")).toBe(true);
  });
});

describe("inventory — denial", () => {
  it("denies configured boundaries and never emits their descendants", async () => {
    const root = await createCanonicalTempRoot("pc-inv-deny-boundary-");
    await writeRelative(root, "secrets/key.txt");
    await writeRelative(root, "public/readme.txt");
    await writeDenyConfig(root, ["secrets"]);

    const config = await resolvedConfigAt(root);
    const result = await inventoryAt(root, config);
    expect(hasDisposition(result.observations, "secrets", "DENIED_BY_PROJECT_RESTRICTION")).toBe(
      true,
    );
    expect(observationPaths(result.observations)).not.toContain("secrets/key.txt");
    expect(hasDisposition(result.observations, "public/readme.txt", "ADMITTED")).toBe(true);
  });

  it("matches deny-path boundaries by path components, not naive prefixes", async () => {
    const root = await createCanonicalTempRoot("pc-inv-deny-components-");
    await writeRelative(root, "secrets/token.txt");
    await writeRelative(root, "secrets-public/page.txt");
    await writeDenyConfig(root, ["secrets"]);

    const result = await inventoryAt(root);
    expect(hasDisposition(result.observations, "secrets", "DENIED_BY_PROJECT_RESTRICTION")).toBe(
      true,
    );
    expect(observationPaths(result.observations)).not.toContain("secrets/token.txt");
    expect(hasDisposition(result.observations, "secrets-public/page.txt", "ADMITTED")).toBe(true);
  });

  it("physically denies symlink aliases to configured deny roots", async () => {
    const root = await createCanonicalTempRoot("pc-inv-deny-alias-");
    await mkdirp("secrets", root);
    await writeRelative(root, "secrets/private.txt");
    await symlink(path.join(root, "secrets"), path.join(root, "public-link"));
    await writeDenyConfig(root, ["secrets"]);

    const result = await inventoryAt(root);
    expect(hasDisposition(result.observations, "public-link", "DENIED_BY_PROJECT_RESTRICTION")).toBe(
      true,
    );
    expect(observationPaths(result.observations)).not.toContain("public-link/private.txt");
    expect(observationPaths(result.observations)).not.toContain("secrets/private.txt");
  });

  it("retains non-existent deny-path rules with NOT_FOUND physical status", async () => {
    const root = await createCanonicalTempRoot("pc-inv-deny-missing-");
    await writeDenyConfig(root, ["future/nope"]);

    const result = await inventoryAt(root);
    expect(result.denyPathRules).toEqual([
      {
        configuredPath: "future/nope",
        physicalRootStatus: { kind: "NOT_FOUND" },
      },
    ]);
    await writeRelative(root, "future/nope/file.txt");
    const afterCreate = await inventoryAt(root, await resolvedConfigAt(root));
    expect(hasDisposition(afterCreate.observations, "future/nope", "DENIED_BY_PROJECT_RESTRICTION")).toBe(
      true,
    );
    expect(observationPaths(afterCreate.observations)).not.toContain("future/nope/file.txt");
  });

  it("starts with no denials when configuration source is ABSENT", async () => {
    const root = await createCanonicalTempRoot("pc-inv-deny-absent-");
    await writeRelative(root, "src/main.ts");

    const config = await resolvedConfigAt(root);
    expect(config.source.kind).toBe("ABSENT");
    expect(config.restrictions.deniedPaths).toEqual([]);

    const result = await inventoryAt(root, config);
    expect(result.denyPathRules).toEqual([]);
    expect(hasDisposition(result.observations, "src/main.ts", "ADMITTED")).toBe(true);
  });
});

describe("inventory — system pruning", () => {
  it("system-prunes .git directories without descending into them", async () => {
    const root = await createCanonicalTempRoot("pc-inv-prune-git-dir-");
    await mkdirp(".git/objects/pack", root);
    await writeRelative(root, ".git/HEAD", "ref: refs/heads/main\n");
    await writeRelative(root, "src/main.ts");

    const result = await inventoryAt(root);
    expect(hasDisposition(result.observations, ".git", "SYSTEM_PRUNED")).toBe(true);
    expect(observationPaths(result.observations).some((p) => p.startsWith(".git/"))).toBe(false);
    expect(hasDisposition(result.observations, "src/main.ts", "ADMITTED")).toBe(true);
  });

  it("admits a regular .git file without system pruning", async () => {
    const root = await createCanonicalTempRoot("pc-inv-prune-git-file-");
    await writeRelative(root, ".git", "gitdir: ../ elsewhere\n");

    const result = await inventoryAt(root);
    expect(hasDisposition(result.observations, ".git", "ADMITTED")).toBe(true);
    expect(hasDisposition(result.observations, ".git", "SYSTEM_PRUNED")).toBe(false);
  });

  it("traverses node_modules, dist, build, and vendor directories", async () => {
    const root = await createCanonicalTempRoot("pc-inv-prune-heuristic-dirs-");
    await writeRelative(root, "node_modules/pkg/index.js");
    await writeRelative(root, "dist/out.js");
    await writeRelative(root, "build/output.js");
    await writeRelative(root, "vendor/lib.js");

    const result = await inventoryAt(root);
    expect(hasDisposition(result.observations, "node_modules", "DESCENDED")).toBe(true);
    expect(hasDisposition(result.observations, "node_modules/pkg/index.js", "ADMITTED")).toBe(true);
    expect(hasDisposition(result.observations, "dist/out.js", "ADMITTED")).toBe(true);
    expect(hasDisposition(result.observations, "build/output.js", "ADMITTED")).toBe(true);
    expect(hasDisposition(result.observations, "vendor/lib.js", "ADMITTED")).toBe(true);
  });

  it("uses exactly .git as the default system-pruned directory name", () => {
    expect(DEFAULT_SYSTEM_PRUNED_DIRECTORIES).toEqual([".git"]);
  });
});

describe("inventory — breadth-first determinism", () => {
  it("returns the same observation order on repeated traversals", async () => {
    const root = await createCanonicalTempRoot("pc-inv-bfs-repeat-");
    await writeRelative(root, "b/file.txt");
    await writeRelative(root, "a/file.txt");
    await writeRelative(root, "a/nested/deep.txt");

    const first = await inventoryAt(root);
    const second = await inventoryAt(root);
    expect(observationPaths(first.observations)).toEqual(
      observationPaths(second.observations),
    );
  });

  it("observes shallow src entries before deep node_modules paths under a narrow entry budget", async () => {
    const root = await createCanonicalTempRoot("pc-inv-bfs-budget-");
    await writeRelative(root, "src/shallow.txt");
    await writeRelative(root, "wrapper/node_modules/deep/nested/file.txt");

    const result = await inventoryAt(root, undefined, { maxEntries: 3 });
    const paths = observationPaths(result.observations);
    const shallowIndex = paths.indexOf("src/shallow.txt");
    const deepIndex = paths.indexOf("wrapper/node_modules/deep/nested/file.txt");

    expect(shallowIndex).toBeGreaterThanOrEqual(0);
    expect(deepIndex).toBe(-1);
    expect(result.traversalCompletion.kind).toBe("PARTIAL");
  });
});

describe("inventory — hard bounds and options", () => {
  it("uses production default ceilings of depth 64 and 50000 entries", async () => {
    expect(MAX_TRAVERSAL_DEPTH).toBe(64);
    expect(MAX_INVENTORY_OBSERVATIONS).toBe(50_000);

    const root = await createCanonicalTempRoot("pc-inv-default-limits-");
    await writeRelative(root, "only.txt");
    const result = await inventoryAt(root);
    expect(result.traversalCompletion.kind).toBe("COMPLETE");
  });

  it("accepts narrower valid limits below the production ceiling", async () => {
    const root = await createCanonicalTempRoot("pc-inv-narrow-valid-");
    await writeRelative(root, "a.txt");
    await writeRelative(root, "b.txt");

    const result = await inventoryAt(root, undefined, { maxDepth: 2, maxEntries: 2 });
    expect(result.traversalCompletion.kind).toBe("COMPLETE");
  });

  it("rejects options that widen beyond the production ceiling", async () => {
    const root = await createCanonicalTempRoot("pc-inv-widen-reject-");
    const config = await resolvedConfigAt(root);
    const workspace = await boundaryFor(root);

    const depthResult = await inventory(workspace, config, {
      maxDepth: MAX_TRAVERSAL_DEPTH + 1,
    });
    expect(depthResult.ok).toBe(false);
    if (!depthResult.ok) {
      expect(depthResult.error.code).toBe("INVALID_INVENTORY_OPTIONS");
    }

    const entriesResult = await inventory(workspace, config, {
      maxEntries: MAX_INVENTORY_OBSERVATIONS + 1,
    });
    expect(entriesResult.ok).toBe(false);
    if (!entriesResult.ok) {
      expect(entriesResult.error.code).toBe("INVALID_INVENTORY_OPTIONS");
    }
  });

  it("rejects invalid inventory option shapes", async () => {
    const root = await createCanonicalTempRoot("pc-inv-invalid-options-");
    const config = await resolvedConfigAt(root);
    const workspace = await boundaryFor(root);

    const cases = [
      { maxDepth: -1 },
      { maxDepth: 1.5 },
      { maxEntries: 0 },
      { maxEntries: Number.NaN },
    ] as const;

    for (const options of cases) {
      const result = await inventory(workspace, config, options);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_INVENTORY_OPTIONS");
      }
    }
  });

  it("marks traversal PARTIAL when the entry limit is reached", async () => {
    const root = await createCanonicalTempRoot("pc-inv-entry-limit-");
    await writeRelative(root, "a.txt");
    await writeRelative(root, "b.txt");
    await writeRelative(root, "c.txt");

    const result = await inventoryAt(root, undefined, { maxEntries: 2 });
    expect(result.observations.length).toBe(2);
    expect(result.traversalCompletion.kind).toBe("PARTIAL");
    if (result.traversalCompletion.kind === "PARTIAL") {
      expect(result.traversalCompletion.reasons[0]?.kind).toBe("ENTRY_LIMIT_REACHED");
    }
  });

  it("marks traversal PARTIAL when the depth limit is reached", async () => {
    const root = await createCanonicalTempRoot("pc-inv-depth-limit-");
    await writeRelative(root, "one/two/three/file.txt");

    const result = await inventoryAt(root, undefined, { maxDepth: 2 });
    expect(hasDisposition(result.observations, "one/two", "DEPTH_LIMIT_REACHED")).toBe(true);
    expect(observationPaths(result.observations)).not.toContain("one/two/three/file.txt");
    expect(result.traversalCompletion.kind).toBe("PARTIAL");
    if (result.traversalCompletion.kind === "PARTIAL") {
      expect(result.traversalCompletion.reasons.some((r) => r.kind === "DEPTH_LIMIT_REACHED")).toBe(
        true,
      );
    }
  });
});

describe("inventory — completion honesty", () => {
  it("can report COMPLETE when entries are denied or system-pruned", async () => {
    const root = await createCanonicalTempRoot("pc-inv-complete-denied-");
    await mkdirp(".git/objects", root);
    await writeRelative(root, "secrets/key.txt");
    await writeRelative(root, "public/ok.txt");
    await writeDenyConfig(root, ["secrets"]);

    const result = await inventoryAt(root);
    expect(hasDisposition(result.observations, ".git", "SYSTEM_PRUNED")).toBe(true);
    expect(hasDisposition(result.observations, "secrets", "DENIED_BY_PROJECT_RESTRICTION")).toBe(
      true,
    );
    expect(observationPaths(result.observations)).not.toContain("secrets/key.txt");
    expect(result.traversalCompletion.kind).toBe("COMPLETE");
  });

  it("reports PARTIAL when an unreadable subtree is encountered", async () => {
    if (process.getuid?.() === 0) {
      return;
    }

    const root = await createCanonicalTempRoot("pc-inv-partial-unreadable-");
    await writeRelative(root, "visible.txt");
    await makeUnreadableDir("locked", root);

    const result = await inventoryAt(root);
    expect(result.traversalCompletion.kind).toBe("PARTIAL");
    if (result.traversalCompletion.kind === "PARTIAL") {
      expect(
        result.traversalCompletion.reasons.some(
          (reason) => reason.kind === "UNREADABLE_SUBTREE" && reason.relativePath === "locked",
        ),
      ).toBe(true);
    }
    expect(hasDisposition(result.observations, "locked", "DESCENDED")).toBe(true);
  });

  it("returns InventoryFailure when the workspace root cannot be enumerated", async () => {
    if (process.getuid?.() === 0) {
      return;
    }

    const root = await createCanonicalTempRoot("pc-inv-root-failure-");
    const config = await resolvedConfigAt(root);
    const workspace = await boundaryFor(root);
    await chmod(root, 0o000);

    try {
      const result = await inventory(workspace, config);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("WORKSPACE_ROOT_UNREADABLE");
      }
    } finally {
      await chmod(root, 0o755);
    }
  });
});

describe("inventory — unreadable entries", () => {
  it("records mode-000 directories as unreadable subtrees with a uid guard for root", async () => {
    if (process.getuid?.() === 0) {
      return;
    }

    const root = await createCanonicalTempRoot("pc-inv-unreadable-dir-");
    await writeRelative(root, "open.txt");
    await makeUnreadableDir("no-access", root);

    const result = await inventoryAt(root);
    expect(hasDisposition(result.observations, "no-access", "DESCENDED")).toBe(true);
    expect(hasDisposition(result.observations, "open.txt", "ADMITTED")).toBe(true);
    expect(result.traversalCompletion.kind).toBe("PARTIAL");
    if (result.traversalCompletion.kind === "PARTIAL") {
      expect(
        result.traversalCompletion.reasons.some(
          (reason) => reason.kind === "UNREADABLE_SUBTREE" && reason.relativePath === "no-access",
        ),
      ).toBe(true);
    }
  });

  it("records vanished symlink targets as UNREADABLE rather than admitting outside content", async () => {
    const root = await createCanonicalTempRoot("pc-inv-vanished-entry-");
    await symlink(path.join(root, "never-created"), path.join(root, "vanished-link"));

    const result = await inventoryAt(root);
    expect(hasDisposition(result.observations, "vanished-link", "UNREADABLE")).toBe(true);
    expect(result.traversalCompletion.kind).toBe("PARTIAL");
  });
});
