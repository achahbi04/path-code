import { mkdir, symlink } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { failure } from "../../src/domain/result.js";
import {
  inventory,
  MAX_INVENTORY_OBSERVATIONS,
  MAX_TRAVERSAL_DEPTH,
} from "../../src/inventory/index.js";
import type { WorkspaceBoundary } from "../../src/domain/workspace.js";
import { workspacePathFailure } from "../../src/workspace/failure.js";
import {
  boundaryFor,
  cleanupInventoryFixtures,
  createCanonicalTempRoot,
  hasDisposition,
  inventoryAt,
  observationPaths,
  resolvedConfigAt,
  writeDenyConfig,
  writeRelative,
} from "./fixture-helpers.js";

afterEach(async () => {
  await cleanupInventoryFixtures();
});

describe("inventory adversarial — symlink escape", () => {
  it("does not descend a directory symlink that resolves outside the workspace", async () => {
    const root = await createCanonicalTempRoot("pc-inv-adv-outside-dir-");
    const outside = await createCanonicalTempRoot("pc-inv-adv-outside-dir-target-");
    await mkdir(path.join(outside, "nested"));
    await writeRelative(outside, "nested/loot.txt");
    await symlink(outside, path.join(root, "outside-dir"));

    const result = await inventoryAt(root);
    expect(hasDisposition(result.observations, "outside-dir", "OUTSIDE_WORKSPACE")).toBe(true);
    expect(observationPaths(result.observations)).not.toContain("outside-dir/nested");
    expect(observationPaths(result.observations)).not.toContain("outside-dir/nested/loot.txt");
    expect(
      result.observations.some((observation) => observation.disposition === "ADMITTED"),
    ).toBe(false);
  });
});

describe("inventory adversarial — denial alias bypass", () => {
  it("rejects lexical and physical bypass through alternate symlink routes", async () => {
    const root = await createCanonicalTempRoot("pc-inv-adv-deny-bypass-");
    await mkdir(path.join(root, "secrets"));
    await writeRelative(root, "secrets/crown-jewels.txt");
    await symlink(path.join(root, "secrets"), path.join(root, "public-link"));
    await mkdir(path.join(root, "nested"));
    await symlink(path.join(root, "secrets"), path.join(root, "nested/alias"));
    await writeDenyConfig(root, ["secrets"]);

    const result = await inventoryAt(root);
    expect(hasDisposition(result.observations, "public-link", "DENIED_BY_PROJECT_RESTRICTION")).toBe(
      true,
    );
    expect(hasDisposition(result.observations, "nested/alias", "DENIED_BY_PROJECT_RESTRICTION")).toBe(
      true,
    );
    expect(observationPaths(result.observations)).not.toContain("secrets/crown-jewels.txt");
    expect(observationPaths(result.observations)).not.toContain("public-link/crown-jewels.txt");
  });
});

describe("inventory adversarial — component prefix collision", () => {
  it("does not deny sibling paths that share a string prefix but not path components", async () => {
    const root = await createCanonicalTempRoot("pc-inv-adv-prefix-collision-");
    await writeRelative(root, "sec/readme.txt");
    await writeRelative(root, "secret/data.txt");
    await writeRelative(root, "secrets-public/index.html");
    await writeDenyConfig(root, ["sec"]);

    const result = await inventoryAt(root);
    expect(hasDisposition(result.observations, "sec", "DENIED_BY_PROJECT_RESTRICTION")).toBe(true);
    expect(observationPaths(result.observations)).not.toContain("sec/readme.txt");
    expect(hasDisposition(result.observations, "secret/data.txt", "ADMITTED")).toBe(true);
    expect(hasDisposition(result.observations, "secrets-public/index.html", "ADMITTED")).toBe(true);
  });
});

describe("inventory adversarial — symlink cycles", () => {
  it("terminates on directory symlink cycles without claiming COMPLETE emptiness", async () => {
    const root = await createCanonicalTempRoot("pc-inv-adv-cycle-");
    await mkdir(path.join(root, "a"));
    await mkdir(path.join(root, "b"));
    await symlink(path.join(root, "b"), path.join(root, "a/next"));
    await symlink(path.join(root, "a"), path.join(root, "b/back"));

    const result = await inventoryAt(root);
    expect(result.observations.length).toBeGreaterThan(0);
    expect(
      result.observations.some((observation) => observation.disposition === "CYCLE_DETECTED"),
    ).toBe(true);
    expect(result.traversalCompletion.kind).toBe("COMPLETE");
  });
});

describe("inventory adversarial — budget exhaustion honesty", () => {
  it("does not report COMPLETE with an empty observation list when the tree exceeds the entry budget", async () => {
    const root = await createCanonicalTempRoot("pc-inv-adv-budget-empty-");
    await writeRelative(root, "one.txt");
    await writeRelative(root, "two.txt");
    await writeRelative(root, "three.txt");

    const config = await resolvedConfigAt(root);
    const workspace = await boundaryFor(root);
    const result = await inventory(workspace, config, { maxEntries: 1 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.observations.length).toBe(1);
      expect(result.value.traversalCompletion.kind).toBe("PARTIAL");
      if (result.value.traversalCompletion.kind === "PARTIAL") {
        expect(result.value.traversalCompletion.reasons[0]?.kind).toBe("ENTRY_LIMIT_REACHED");
      }
    }
  });
});

describe("inventory adversarial — denial-root resolution fail-closed", () => {
  it("returns InventoryFailure instead of lexical-only fallback when deny-root resolution fails unexpectedly", async () => {
    const root = await createCanonicalTempRoot("pc-inv-adv-deny-root-fail-");
    await writeDenyConfig(root, ["secrets"]);
    const config = await resolvedConfigAt(root);
    const baseBoundary = await boundaryFor(root);

    const boundary: WorkspaceBoundary = {
      async canonicalize(inputPath) {
        if (inputPath === "secrets") {
          return failure(
            workspacePathFailure(
              "CANONICALIZATION_FAILED",
              "Simulated unexpected deny-root resolution failure",
            ),
          );
        }
        return baseBoundary.canonicalize(inputPath);
      },
    };

    const result = await inventory(boundary, config);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("DENIAL_ROOT_RESOLUTION_FAILED");
    }
  });
});

describe("inventory adversarial — invalid widening options", () => {
  it("rejects hostile attempts to widen traversal beyond hard production ceilings", async () => {
    const root = await createCanonicalTempRoot("pc-inv-adv-widen-");
    const config = await resolvedConfigAt(root);
    const workspace = await boundaryFor(root);

    const depthAttack = await inventory(workspace, config, {
      maxDepth: MAX_TRAVERSAL_DEPTH * 10,
    });
    expect(depthAttack.ok).toBe(false);
    if (!depthAttack.ok) {
      expect(depthAttack.error.code).toBe("INVALID_INVENTORY_OPTIONS");
      expect(depthAttack.error.details?.["hardCeiling"]).toBe(MAX_TRAVERSAL_DEPTH);
    }

    const entryAttack = await inventory(workspace, config, {
      maxEntries: MAX_INVENTORY_OBSERVATIONS * 2,
    });
    expect(entryAttack.ok).toBe(false);
    if (!entryAttack.ok) {
      expect(entryAttack.error.code).toBe("INVALID_INVENTORY_OPTIONS");
      expect(entryAttack.error.details?.["hardCeiling"]).toBe(MAX_INVENTORY_OBSERVATIONS);
    }
  });
});
