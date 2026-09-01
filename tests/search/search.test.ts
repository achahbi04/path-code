import { afterEach, describe, expect, it } from "vitest";

import {
  buildRepositorySearchCorpus,
  MATCH_STRENGTH,
  MAX_SEARCH_RESULTS,
  searchRepository,
  validateSearchQuery,
} from "../../src/search/index.js";
import { evaluateTermMatch } from "../../src/search/score.js";
import { cleanupInventoryFixtures } from "../inventory/fixture-helpers.js";
import { mapAt } from "../metadata/helpers.js";
import {
  candidatePaths,
  corpusAt,
  createCanonicalTempRoot,
  searchAt,
  writeDenyConfig,
  writeRelative,
} from "./helpers.js";

afterEach(async () => {
  await cleanupInventoryFixtures();
});

describe("corpus compatibility", () => {
  it("builds corpus from compatible inventory and map with reference-identical entries", async () => {
    const root = await createCanonicalTempRoot("search-corpus-");
    await writeRelative(root, "a.txt", "a\n");
    const { corpus, inventory } = await corpusAt(root);
    expect(corpus.admittedEntries.length).toBe(1);
    expect(corpus.admittedEntries[0]).toBe(
      inventory.observations.find((item) => item.disposition === "ADMITTED")?.entry,
    );
  });

  it("rejects incompatible inventory and map with SEARCH_SOURCE_INCOMPATIBLE", async () => {
    const rootA = await createCanonicalTempRoot("search-mismatch-a-");
    const rootB = await createCanonicalTempRoot("search-mismatch-b-");
    await writeRelative(rootA, "a.txt", "a\n");
    await writeRelative(rootB, "b.txt", "b\n");

    const fixtureA = await corpusAt(rootA);
    const fixtureB = await corpusAt(rootB);

    const result = buildRepositorySearchCorpus(fixtureA.inventory, fixtureB.map);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("SEARCH_SOURCE_INCOMPATIBLE");
    }
  });
});

describe("query validation", () => {
  it("rejects empty queries with no effective criterion", () => {
    const result = validateSearchQuery({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_SEARCH_QUERY");
    }
  });

  it("rejects too many terms, oversized terms, and NUL bytes", () => {
    expect(validateSearchQuery({ terms: Array.from({ length: 17 }, (_, i) => `t${i}`) }).ok).toBe(
      false,
    );
    expect(
      validateSearchQuery({ terms: ["x".repeat(65)] }).ok,
    ).toBe(false);
    expect(validateSearchQuery({ terms: ["a\0b"] }).ok).toBe(false);
  });

  it("rejects invalid extensions and scope prefixes", () => {
    expect(validateSearchQuery({ extensions: ["ts"] }).ok).toBe(false);
    expect(validateSearchQuery({ extensions: [".ts/x"] }).ok).toBe(false);
    expect(validateSearchQuery({ scopePrefix: "/abs" }).ok).toBe(false);
    expect(validateSearchQuery({ scopePrefix: "../escape" }).ok).toBe(false);
    expect(validateSearchQuery({ exactBasename: "pkg/json" }).ok).toBe(false);
  });

  it("deduplicates normalized duplicate terms deterministically", () => {
    const result = validateSearchQuery({ terms: ["Auth", "auth", "AUTH"] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.normalizedTerms).toEqual(["auth"]);
    }
  });

  it("accepts valid Unicode terms", () => {
    const result = validateSearchQuery({ terms: ["café"] });
    expect(result.ok).toBe(true);
  });
});

describe("lexical matching", () => {
  it("finds package.json by exact basename filter", async () => {
    const root = await createCanonicalTempRoot("search-pkg-");
    await writeRelative(root, "package.json", "{}\n");
    await writeRelative(root, "package.json.bak", "x\n");

    const { result } = await searchAt(root, { exactBasename: "package.json" });
    expect(candidatePaths(result)).toEqual(["package.json"]);
  });

  it("matches auth token in lexical path without creating identity claims", async () => {
    const root = await createCanonicalTempRoot("search-auth-");
    await writeRelative(root, "src/auth/session.ts", "export {}\n");

    const { result, map, inventory: invBefore } = await searchAt(root, { terms: ["auth"] });
    expect(candidatePaths(result)).toContain("src/auth/session.ts");
    expect(
      result.candidates.some((candidate) =>
        candidate.matchReasons.some((reason) => reason.kind === "PATH_COMPONENT_MATCH"),
      ),
    ).toBe(true);

    const claimsBefore = JSON.stringify(map.scopes);
    const { map: mapAfter } = await corpusAt(root);
    expect(JSON.stringify(mapAfter.scopes)).toBe(claimsBefore);
    expect(
      result.candidates.some((candidate) =>
        JSON.stringify(candidate).toLowerCase().includes("authentication subsystem"),
      ),
    ).toBe(false);
    void invBefore;
  });

  it("requires all terms user and service together", async () => {
    const root = await createCanonicalTempRoot("search-multi-");
    await writeRelative(root, "src/user/service.ts", "export {}\n");
    await writeRelative(root, "src/auth/service.ts", "export {}\n");

    const { result } = await searchAt(root, { terms: ["user", "service"] });
    expect(candidatePaths(result)).toEqual(["src/user/service.ts"]);
  });

  it("filters by extension literally without language identity claims", async () => {
    const root = await createCanonicalTempRoot("search-ext-");
    await writeRelative(root, "a.ts", "export {}\n");
    await writeRelative(root, "a.tsx", "export {}\n");
    await writeRelative(root, "b.js", "export {}\n");

    const { result } = await searchAt(root, { extensions: [".ts"] });
    expect(candidatePaths(result)).toEqual(["a.ts"]);
  });

  it("applies component-aware scopePrefix without matching auth-old", async () => {
    const root = await createCanonicalTempRoot("search-scope-");
    await writeRelative(root, "src/auth/a.ts", "export {}\n");
    await writeRelative(root, "src/auth-old/a.ts", "export {}\n");

    const { result } = await searchAt(root, { scopePrefix: "src/auth" });
    expect(candidatePaths(result)).toEqual(["src/auth/a.ts"]);
  });

  it("filters by observed entry kind without stat or read", async () => {
    const root = await createCanonicalTempRoot("search-kind-");
    await writeRelative(root, "file.txt", "x\n");
    await writeRelative(root, "dir/nested.txt", "y\n");

    const { result } = await searchAt(root, { entryKinds: ["FILE"] });
    expect(result.candidates.every((candidate) => candidate.lexicalKind === "FILE")).toBe(
      true,
    );
    expect(candidatePaths(result)).toContain("file.txt");
  });

  it("treats regex-looking terms as literal substrings", async () => {
    const root = await createCanonicalTempRoot("search-regex-");
    await writeRelative(root, "src/auth/...*.ts", "export {}\n");
    await writeRelative(root, "src/auth/session.ts", "export {}\n");

    const { result } = await searchAt(root, { terms: ["...*"] });
    expect(candidatePaths(result)).toEqual(["src/auth/...*.ts"]);
  });

  it("uses case-insensitive deterministic comparison", async () => {
    const root = await createCanonicalTempRoot("search-case-");
    await writeRelative(root, "src/Auth/Session.ts", "export {}\n");

    const { result } = await searchAt(root, { terms: ["auth"] });
    expect(candidatePaths(result)).toContain("src/Auth/Session.ts");
  });
});

describe("ranking strengths", () => {
  it("orders BASENAME_STEM_EXACT above PATH_COMPONENT_EXACT above substrings", () => {
    expect(evaluateTermMatch("auth", "src/auth.ts").strength).toBe(
      MATCH_STRENGTH.BASENAME_STEM_EXACT,
    );
    expect(evaluateTermMatch("auth", "src/auth/session.ts").strength).toBe(
      MATCH_STRENGTH.PATH_COMPONENT_EXACT,
    );
    expect(evaluateTermMatch("sess", "src/auth/session.ts").strength).toBe(
      MATCH_STRENGTH.BASENAME_SUBSTRING,
    );
    expect(evaluateTermMatch("utils", "src/foo/authentication-utils/deep.ts").strength).toBe(
      MATCH_STRENGTH.PATH_SUBSTRING,
    );
  });

  it("ranks higher-scoring candidates first with deterministic tie-breaks", async () => {
    const root = await createCanonicalTempRoot("search-rank-");
    await writeRelative(root, "src/auth.ts", "export {}\n");
    await writeRelative(root, "src/auth/deep/nested.ts", "export {}\n");
    await writeRelative(root, "src/authentication.ts", "export {}\n");

    const { result } = await searchAt(root, { terms: ["auth"] });
    expect(candidatePaths(result)[0]).toBe("src/auth.ts");
  });
});

describe("result bounds and completeness", () => {
  it("returns PARTIAL_RESULT_LIMIT when matches exceed maxResults", async () => {
    const root = await createCanonicalTempRoot("search-limit-");
    for (let i = 0; i < 5; i += 1) {
      await writeRelative(root, `auth/file${i}.txt`, "x\n");
    }

    const { result } = await searchAt(root, { terms: ["auth"] }, { maxResults: 2 });
    expect(result.candidates.length).toBe(2);
    expect(result.observedMatchCount).toBe(5);
    expect(result.selectionCompletion.kind).toBe("PARTIAL_RESULT_LIMIT");
  });

  it("rejects caller widening above 64 results", async () => {
    const root = await createCanonicalTempRoot("search-widen-");
    await writeRelative(root, "a.txt", "a\n");
    const { corpus } = await corpusAt(root);
    const result = searchRepository(corpus, { terms: ["a"] }, { maxResults: 65 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_SEARCH_OPTIONS");
    }
  });

  it("preserves source and selection completeness independently", async () => {
    const root = await createCanonicalTempRoot("search-complete-");
    for (let i = 0; i < 3; i += 1) {
      await writeRelative(root, `f${i}.txt`, "x\n");
    }

    const partial = await searchAt(root, { entryKinds: ["FILE"] }, { maxResults: 1 }, {
      maxEntries: 2,
    });
    expect(partial.result.sourceCompletion.inventoryTraversalCompletion.kind).toBe("PARTIAL");
    expect(partial.result.observedMatchCount).toBe(2);
    expect(partial.result.selectionCompletion.kind).toBe("PARTIAL_RESULT_LIMIT");
  });

  it("returns identical ordering for repeated searches", async () => {
    const root = await createCanonicalTempRoot("search-determinism-");
    await writeRelative(root, "src/auth/a.ts", "export {}\n");
    await writeRelative(root, "src/auth/b.ts", "export {}\n");

    const first = await searchAt(root, { terms: ["auth"] });
    const second = await searchAt(root, { terms: ["auth"] });
    expect(candidatePaths(first.result)).toEqual(candidatePaths(second.result));
  });
});

describe("candidate reference identity", () => {
  it("returns exact RepositoryEntry references from the source inventory", async () => {
    const root = await createCanonicalTempRoot("search-ref-");
    await writeRelative(root, "src/auth/session.ts", "export {}\n");
    const { result, inventory } = await searchAt(root, { terms: ["auth"] });
    const admitted = inventory.observations.find(
      (item) => item.disposition === "ADMITTED" && item.relativePath === "src/auth/session.ts",
    );
    expect(admitted?.disposition).toBe("ADMITTED");
    if (admitted?.disposition !== "ADMITTED") {
      return;
    }
    expect(result.candidates[0]?.entry).toBe(admitted.entry);
  });
});

describe("denied and pruned boundaries", () => {
  it("signals denied boundary matches without exposing hidden child names", async () => {
    const root = await createCanonicalTempRoot("search-denied-");
    await writeDenyConfig(root, ["secrets/"]);
    await writeRelative(root, "secrets/key.txt", "secret\n");
    await writeRelative(root, "public.txt", "ok\n");

    const { result } = await searchAt(root, { terms: ["secrets"] });
    expect(result.unavailableSignals.some((signal) => signal.kind === "DENIED_BOUNDARY_MATCH")).toBe(
      true,
    );
    expect(result.candidates.some((candidate) => candidate.relativePath.includes("key.txt"))).toBe(
      false,
    );
    expect(JSON.stringify(result)).not.toContain("key.txt");
  });

  it("does not invent hidden child candidates for denied child names", async () => {
    const root = await createCanonicalTempRoot("search-hidden-");
    await writeDenyConfig(root, ["secrets/"]);
    await writeRelative(root, "secrets/key.txt", "secret\n");
    await writeRelative(root, "public.txt", "ok\n");

    const { result } = await searchAt(root, { terms: ["key"] });
    expect(result.candidates).toEqual([]);
    expect(
      result.limitations.some((limitation) => limitation.kind === "DENIED_BOUNDARY_PRESENT"),
    ).toBe(true);
  });

  it("signals system-pruned boundary matches without creating candidates", async () => {
    const root = await createCanonicalTempRoot("search-pruned-");
    await writeRelative(root, "README.md", "hello\n");
    await writeRelative(root, ".git/HEAD", "ref: refs/heads/main\n");

    const { result } = await searchAt(root, { terms: [".git"] });
    expect(
      result.unavailableSignals.some(
        (signal) => signal.kind === "SYSTEM_PRUNED_BOUNDARY_MATCH",
      ),
    ).toBe(true);
    expect(result.candidates.some((candidate) => candidate.relativePath.startsWith(".git"))).toBe(
      false,
    );
  });
});

describe("content-only mismatch", () => {
  it("does not rank files whose bytes contain the term but lexical path does not", async () => {
    const root = await createCanonicalTempRoot("search-content-");
    await writeRelative(root, "src/hidden.ts", "const auth = true;\n");

    const { result } = await searchAt(root, { terms: ["auth"] });
    expect(result.candidates).toEqual([]);
  });
});

describe("identity preservation", () => {
  it("leaves map identity claims unchanged after search", async () => {
    const root = await createCanonicalTempRoot("search-identity-");
    await writeRelative(root, "package.json", '{"dependencies":{"next":"14.0.0"}}\n');
    const { map } = await mapAt(root);
    const claimsBefore = JSON.stringify(map.scopes);

    await searchAt(root, { terms: ["next"] });
    const { map: mapAfter } = await corpusAt(root);
    expect(JSON.stringify(mapAfter.scopes)).toBe(claimsBefore);
  });
});

describe("search options validation", () => {
  it("rejects invalid maxResults values", async () => {
    const root = await createCanonicalTempRoot("search-options-");
    await writeRelative(root, "a.txt", "a\n");
    const { corpus } = await corpusAt(root);

    for (const maxResults of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = searchRepository(corpus, { terms: ["a"] }, { maxResults });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_SEARCH_OPTIONS");
      }
    }
  });
});

describe("hard ceiling constants", () => {
  it("exposes MAX_SEARCH_RESULTS of 64", () => {
    expect(MAX_SEARCH_RESULTS).toBe(64);
  });
});
