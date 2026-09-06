/**
 * Shared helpers for Phase 5B reference-binding tests.
 */

import { expect } from "vitest";

import {
  createReferenceCatalog,
  describeReferenceCatalog,
  type ReferenceCatalog,
  type ReferenceDescriptor,
} from "../../src/reasoning/catalog.js";
import type { ManifestEvidence } from "../../src/metadata/types.js";
import type { ContentObservation } from "../../src/reader/types.js";
import type { RepositoryEntry } from "../../src/inventory/types.js";
import { cleanupInventoryFixtures } from "../inventory/fixture-helpers.js";
import {
  admittedEntry,
  createCanonicalTempRoot,
  snapshotAt,
  writeDenyConfig,
  writePackageJson,
  writeRelative,
  type SnapshotFixture,
} from "../snapshot/helpers.js";

export {
  admittedEntry,
  createCanonicalTempRoot,
  snapshotAt,
  writePackageJson,
  writeRelative,
  writeDenyConfig,
};

export async function cleanupReasoningFixtures(): Promise<void> {
  await cleanupInventoryFixtures();
}

export async function fixtureWithSourceAndManifest(options?: {
  extraSource?: string;
  dependencyName?: string;
  denyPaths?: readonly string[];
}): Promise<{
  root: string;
  fixture: SnapshotFixture;
  sourceEntry: RepositoryEntry;
  sourceObservation: ContentObservation;
  packageEntry: RepositoryEntry;
  packageObservation: ContentObservation;
  typescriptEvidence: ManifestEvidence;
  catalog: ReferenceCatalog;
  descriptors: readonly ReferenceDescriptor[];
}> {
  const root = await createCanonicalTempRoot("phase5b-");
  if (options?.denyPaths) {
    await writeDenyConfig(root, options.denyPaths);
  }
  await writePackageJson(root, "package.json", {
    name: "phase5b-fixture",
    dependencies: {
      [options?.dependencyName ?? "typescript"]: "^5.0.0",
    },
  });
  await writeRelative(
    root,
    "src/hello.ts",
    options?.extraSource ?? "export function hello() { return 1; }\n",
  );

  const fixture = await snapshotAt(root, {
    extraContentPaths: ["src/hello.ts"],
  });

  const sourceEntry = admittedEntry(fixture.inventory, "src/hello.ts");
  const sourceObservation =
    fixture.snapshot.contentObservationByEntry.get(sourceEntry);
  expect(sourceObservation).toBeDefined();

  const packageEntry = admittedEntry(fixture.inventory, "package.json");
  const packageObservation =
    fixture.snapshot.contentObservationByEntry.get(packageEntry);
  expect(packageObservation).toBeDefined();

  let typescriptEvidence: ManifestEvidence | undefined;
  for (const scope of fixture.map.scopes) {
    for (const claim of scope.identityClaims) {
      if (
        claim.confidence === "OBSERVED" &&
        claim.fact.kind === "DECLARED_PACKAGE_DEPENDENCY" &&
        claim.fact.packageName === (options?.dependencyName ?? "typescript")
      ) {
        typescriptEvidence = claim.evidence;
      }
    }
  }
  expect(typescriptEvidence).toBeDefined();

  const catalogResult = createReferenceCatalog({
    workspace: fixture.workspace,
    snapshot: fixture.snapshot,
    selection: {
      entries: [sourceEntry, packageEntry],
      contentObservations: [sourceObservation!, packageObservation!],
      manifestEvidence: [typescriptEvidence!],
    },
  });
  expect(catalogResult.ok).toBe(true);
  if (!catalogResult.ok) {
    throw new Error(catalogResult.error.message);
  }

  const described = describeReferenceCatalog(catalogResult.value);
  expect(described.ok).toBe(true);
  if (!described.ok) {
    throw new Error(described.error.message);
  }

  return {
    root,
    fixture,
    sourceEntry,
    sourceObservation: sourceObservation!,
    packageEntry,
    packageObservation: packageObservation!,
    typescriptEvidence: typescriptEvidence!,
    catalog: catalogResult.value,
    descriptors: described.value,
  };
}

export function handleFor(
  descriptors: readonly ReferenceDescriptor[],
  kind: ReferenceDescriptor["evidenceKind"],
  relativePath: string,
): string {
  const match = descriptors.find(
    (d) => d.evidenceKind === kind && d.relativePath === relativePath,
  );
  if (match === undefined) {
    throw new Error(`missing descriptor ${kind} ${relativePath}`);
  }
  return match.handle;
}

export function proposalJson(body: unknown): string {
  return JSON.stringify(body);
}
