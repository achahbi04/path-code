import { afterEach, describe, expect, it } from "vitest";

import {
  buildRepositorySearchCorpus,
  searchRepository,
  validateSearchQuery,
} from "../../src/search/index.js";
import { cleanupInventoryFixtures } from "../inventory/fixture-helpers.js";
import { inventory } from "../../src/inventory/index.js";
import {
  boundaryFor,
  corpusAt,
  createCanonicalTempRoot,
  resolvedConfigAt,
  searchAt,
  writeDenyConfig,
  writeRelative,
} from "./helpers.js";

afterEach(async () => {
  await cleanupInventoryFixtures();
});

describe("search adversarial controls", () => {
  it("does not promote pages/ directory names into Next.js identity", async () => {
    const root = await createCanonicalTempRoot("adv-pages-");
    await writeRelative(root, "pages/index.tsx", "export {}\n");

    const { result, map } = await searchAt(root, { terms: ["pages"] });
    expect(candidatePaths(result)).toContain("pages/index.tsx");
    expect(
      map.scopes.some((scope) =>
        scope.identityClaims.some(
          (claim) =>
            claim.confidence !== "UNKNOWN" &&
            JSON.stringify(claim).toLowerCase().includes("next"),
        ),
      ),
    ).toBe(false);
  });

  it("rejects mismatched inventory and map before search", async () => {
    const rootA = await createCanonicalTempRoot("adv-mismatch-a-");
    const rootB = await createCanonicalTempRoot("adv-mismatch-b-");
    await writeRelative(rootA, "a.txt", "a\n");
    await writeRelative(rootB, "b.txt", "b\n");

    const a = await corpusAt(rootA);
    const b = await corpusAt(rootB);
    const corpusResult = buildRepositorySearchCorpus(a.inventory, b.map);
    expect(corpusResult.ok).toBe(false);
  });

  it("handles maximum query bounds without widening", () => {
    const terms = Array.from({ length: 16 }, (_, index) => `t${index}`);
    const result = validateSearchQuery({ terms });
    expect(result.ok).toBe(true);

    const tooMany = validateSearchQuery({
      terms: [...terms, "extra"],
    });
    expect(tooMany.ok).toBe(false);
  });

  it("does not treat regex-looking query input as regex execution", async () => {
    const root = await createCanonicalTempRoot("adv-regex-");
    await writeRelative(root, "a.*.txt", "x\n");
    await writeRelative(root, "a.txt", "x\n");

    const { result } = await searchAt(root, { terms: [".*"] });
    expect(result.candidates.some((candidate) => candidate.relativePath === "a.*.txt")).toBe(
      true,
    );
    expect(result.candidates.some((candidate) => candidate.relativePath === "a.txt")).toBe(
      false,
    );
  });

  it("truncates observed matches while preserving observedMatchCount", async () => {
    const root = await createCanonicalTempRoot("adv-truncate-");
    for (let i = 0; i < 10; i += 1) {
      await writeRelative(root, `match/file${i}.txt`, "x\n");
    }

    const { result } = await searchAt(root, { terms: ["match"] }, { maxResults: 3 });
    expect(result.candidates.length).toBe(3);
    expect(result.observedMatchCount).toBe(10);
    expect(result.selectionCompletion.kind).toBe("PARTIAL_RESULT_LIMIT");
  });

  it("preserves partial source limitations with truncated selection", async () => {
    const root = await createCanonicalTempRoot("adv-partial-");
    for (let i = 0; i < 4; i += 1) {
      await writeRelative(root, `item${i}.txt`, "x\n");
    }

    const { result } = await searchAt(
      root,
      { entryKinds: ["FILE"] },
      { maxResults: 1 },
      { maxEntries: 2 },
    );
    expect(result.sourceCompletion.inventoryTraversalCompletion.kind).toBe("PARTIAL");
    expect(result.selectionCompletion.kind).toBe("PARTIAL_RESULT_LIMIT");
  });

  it("does not expose denied child names when searching denied boundaries", async () => {
    const root = await createCanonicalTempRoot("adv-denied-");
    await writeDenyConfig(root, ["secrets/"]);
    await writeRelative(root, "secrets/token.txt", "secret\n");

    const { result } = await searchAt(root, { terms: ["secrets"] });
    expect(JSON.stringify(result)).not.toContain("token.txt");
    expect(result.candidates.every((candidate) => !candidate.relativePath.includes("secrets/"))).toBe(
      true,
    );
  });

  it("does not rank by file bytes when lexical path lacks the term", async () => {
    const root = await createCanonicalTempRoot("adv-bytes-");
    await writeRelative(root, "lib/core.ts", "export const authSecret = 1;\n");

    const { result } = await searchAt(root, { terms: ["auth"] });
    expect(result.candidates).toEqual([]);
  });

  it("preserves exact candidate entry references", async () => {
    const root = await createCanonicalTempRoot("adv-ref-");
    await writeRelative(root, "src/auth.ts", "export {}\n");
    const { result, inventory } = await searchAt(root, { terms: ["auth"] });
    const admitted = inventory.observations.find(
      (item) => item.disposition === "ADMITTED" && item.relativePath === "src/auth.ts",
    );
    expect(admitted?.disposition).toBe("ADMITTED");
    if (admitted?.disposition !== "ADMITTED") {
      return;
    }
    expect(result.candidates[0]?.entry).toBe(admitted.entry);
  });

  it("does not mutate inventory, map, or identity claims during search", async () => {
    const root = await createCanonicalTempRoot("adv-immutable-");
    await writeRelative(root, "package.json", '{"name":"demo"}\n');
    const fixture = await corpusAt(root);
    const inventorySnapshot = JSON.stringify(fixture.inventory);
    const mapSnapshot = JSON.stringify(fixture.map.scopes);

    const searchResult = searchRepository(fixture.corpus, { terms: ["package"] });
    expect(searchResult.ok).toBe(true);

    expect(JSON.stringify(fixture.inventory)).toBe(inventorySnapshot);
    expect(JSON.stringify(fixture.map.scopes)).toBe(mapSnapshot);
  });
});

function candidatePaths(result: { candidates: readonly { relativePath: string }[] }): string[] {
  return result.candidates.map((candidate) => candidate.relativePath);
}

describe("incompatible corpus from different workspaces", () => {
  it("fails before search when inventory and map come from different workspaces", async () => {
    const rootA = await createCanonicalTempRoot("adv-ws-a-");
    const rootB = await createCanonicalTempRoot("adv-ws-b-");
    await writeRelative(rootA, "a.txt", "a\n");
    await writeRelative(rootB, "b.txt", "b\n");

    const workspaceA = await boundaryFor(rootA);
    const configA = await resolvedConfigAt(rootA);
    const invA = await inventory(workspaceA, configA);
    expect(invA.ok).toBe(true);
    if (!invA.ok) {
      return;
    }

    const fixtureB = await corpusAt(rootB);
    const result = buildRepositorySearchCorpus(invA.value, fixtureB.map);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("SEARCH_SOURCE_INCOMPATIBLE");
    }
  });
});
