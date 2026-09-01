import { afterEach, describe, expect, it } from "vitest";

import {
  canonicalInventoryEntrySet,
  isEntryBearingInventoryObservation,
  repositoryEntries,
} from "../../src/inventory/index.js";
import { inventory } from "../../src/inventory/index.js";
import {
  cleanupInventoryFixtures,
  createCanonicalTempRoot,
  hasDisposition,
  inventoryAt,
  mkdirp,
  resolvedConfigAt,
  writeRelative,
} from "./fixture-helpers.js";

afterEach(async () => {
  await cleanupInventoryFixtures();
});

describe("canonical RepositoryEntry membership", () => {
  it("includes every entry-bearing InventoryObservation variant", async () => {
    const root = await createCanonicalTempRoot("membership-nested-");
    await writeRelative(root, "src/example.ts", "export const x = 1;\n");
    const inv = await inventoryAt(root);

    const descended = inv.observations.find(
      (item) => item.disposition === "DESCENDED" && item.relativePath === "src",
    );
    expect(descended?.disposition).toBe("DESCENDED");

    const admitted = inv.observations.find(
      (item) =>
        item.disposition === "ADMITTED" && item.relativePath === "src/example.ts",
    );
    expect(admitted?.disposition).toBe("ADMITTED");

    const canonical = canonicalInventoryEntrySet(inv);
    if (descended?.disposition === "DESCENDED") {
      expect(canonical.has(descended.entry)).toBe(true);
    }
    if (admitted?.disposition === "ADMITTED") {
      expect(canonical.has(admitted.entry)).toBe(true);
    }
    expect(repositoryEntries(inv).length).toBeGreaterThanOrEqual(2);
  });

  it("excludes non-entry observation variants from canonical membership", async () => {
    const root = await createCanonicalTempRoot("membership-nonentry-");
    await mkdirp(".git/objects/pack", root);
    await writeRelative(root, ".git/HEAD", "ref: refs/heads/main\n");
    await writeRelative(root, "src/example.ts", "x\n");
    const inv = await inventoryAt(root);
    const canonical = canonicalInventoryEntrySet(inv);

    for (const observation of inv.observations) {
      if (!isEntryBearingInventoryObservation(observation)) {
        expect("entry" in observation).toBe(false);
        continue;
      }
      expect(canonical.has(observation.entry)).toBe(true);
    }

    expect(hasDisposition(inv.observations, ".git", "SYSTEM_PRUNED")).toBe(true);
    const pruned = inv.observations.find(
      (item) => item.disposition === "SYSTEM_PRUNED",
    );
    expect(pruned && "entry" in pruned).toBe(false);
  });

  it("includes DEPTH_LIMIT_REACHED entry references when produced", async () => {
    const root = await createCanonicalTempRoot("membership-depth-");
    await writeRelative(root, "a/b/c/file.txt", "deep\n");
    const workspace = await import("./fixture-helpers.js").then((m) => m.boundaryFor(root));
    const config = await resolvedConfigAt(root);
    const result = await inventory(workspace, config, { maxDepth: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const depthLimited = result.value.observations.find(
      (item) => item.disposition === "DEPTH_LIMIT_REACHED",
    );
    expect(depthLimited?.disposition).toBe("DEPTH_LIMIT_REACHED");
    if (depthLimited?.disposition !== "DEPTH_LIMIT_REACHED") {
      return;
    }
    expect(canonicalInventoryEntrySet(result.value).has(depthLimited.entry)).toBe(true);
  });
});
