/**
 * Shared helpers for Phase 2E search tests.
 */

import { expect } from "vitest";

import { inventory } from "../../src/inventory/index.js";
import type { RepositoryInventory } from "../../src/inventory/types.js";
import { buildRepositoryMap } from "../../src/metadata/index.js";
import type { RepositoryMap } from "../../src/metadata/types.js";
import {
  buildRepositorySearchCorpus,
  searchRepository,
  type RepositorySearchCorpus,
  type RepositorySearchResult,
  type SearchQueryInput,
  type SearchOptions,
} from "../../src/search/index.js";
import {
  boundaryFor,
  createCanonicalTempRoot,
  resolvedConfigAt,
  writeDenyConfig,
  writeRelative,
} from "../inventory/fixture-helpers.js";

export {
  boundaryFor,
  createCanonicalTempRoot,
  resolvedConfigAt,
  writeDenyConfig,
  writeRelative,
};

export async function corpusAt(
  root: string,
  inventoryOptions?: Parameters<typeof inventory>[2],
): Promise<{
  root: string;
  inventory: RepositoryInventory;
  map: RepositoryMap;
  corpus: RepositorySearchCorpus;
}> {
  const workspace = await boundaryFor(root);
  const config = await resolvedConfigAt(root);
  const inv = await inventory(workspace, config, inventoryOptions);
  expect(inv.ok).toBe(true);
  if (!inv.ok) {
    throw new Error(`inventory failed: ${inv.error.code}`);
  }

  const mapResult = await buildRepositoryMap(workspace, inv.value, config);
  expect(mapResult.ok).toBe(true);
  if (!mapResult.ok) {
    throw new Error(`map failed: ${mapResult.error.code}`);
  }

  const corpusResult = buildRepositorySearchCorpus(inv.value, mapResult.value);
  expect(corpusResult.ok).toBe(true);
  if (!corpusResult.ok) {
    throw new Error(`corpus failed: ${corpusResult.error.code}`);
  }

  return {
    root,
    inventory: inv.value,
    map: mapResult.value,
    corpus: corpusResult.value,
  };
}

export async function searchAt(
  root: string,
  query: SearchQueryInput,
  options?: SearchOptions,
  inventoryOptions?: Parameters<typeof inventory>[2],
): Promise<{
  root: string;
  inventory: RepositoryInventory;
  map: RepositoryMap;
  corpus: RepositorySearchCorpus;
  result: RepositorySearchResult;
}> {
  const fixture = await corpusAt(root, inventoryOptions);
  const searchResult = searchRepository(fixture.corpus, query, options);
  expect(searchResult.ok).toBe(true);
  if (!searchResult.ok) {
    throw new Error(`search failed: ${searchResult.error.code}`);
  }
  return {
    ...fixture,
    result: searchResult.value,
  };
}

export function candidatePaths(result: RepositorySearchResult): string[] {
  return result.candidates.map((candidate) => candidate.relativePath);
}
