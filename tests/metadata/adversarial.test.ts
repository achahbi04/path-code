import { mkdir } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import { buildRepositoryMap } from "../../src/metadata/index.js";
import { inventory } from "../../src/inventory/index.js";
import { cleanupInventoryFixtures } from "../inventory/fixture-helpers.js";
import {
  boundaryFor,
  createCanonicalTempRoot,
  mapAt,
  resolvedConfigAt,
  writePackageJson,
  writePathCodeConfig,
  writeRelative,
} from "./helpers.js";

afterEach(async () => {
  await cleanupInventoryFixtures();
});

describe("metadata adversarial", () => {
  it("does not attribute Next.js from pages/ directory name alone", async () => {
    const root = await createCanonicalTempRoot("adv-pages-");
    await mkdir(`${root}/pages`, { recursive: true });
    await writeRelative(root, "pages/home.tsx", "export {}\n");

    const { map } = await mapAt(root);
    for (const scope of map.scopes) {
      for (const claim of scope.identityClaims) {
        if (claim.confidence === "OBSERVED") {
          expect(JSON.stringify(claim.fact)).not.toMatch(/next/i);
        }
      }
    }
  });

  it("does not promote nested example manifest to root identity", async () => {
    const root = await createCanonicalTempRoot("adv-nested-root-");
    await writePackageJson(root, "package.json", { name: "root" });
    await writePackageJson(root, "examples/demo/package.json", {
      dependencies: { next: "15.0.0" },
    });

    const { map } = await mapAt(root);
    expect(
      map.scopes
        .find((scope) => scope.scopeRelativePath === "")
        ?.identityClaims.some(
          (claim) =>
            claim.confidence === "OBSERVED" &&
            claim.fact.kind === "DECLARED_PACKAGE_DEPENDENCY" &&
            claim.fact.packageName === "next",
        ),
    ).toBe(false);
  });

  it("does not read manifest inside denied subtree", async () => {
    const root = await createCanonicalTempRoot("adv-denied-manifest-");
    await writePathCodeConfig(root, ["secrets/"]);
    await writePackageJson(root, "secrets/package.json", {
      dependencies: { next: "14.0.0" },
    });

    const { map } = await mapAt(root);
    expect(map.manifestObservations.length).toBe(0);
    expect(JSON.stringify(map)).not.toContain("secrets/package.json");
  });

  it("records workspace declaration without resolving globs", async () => {
    const root = await createCanonicalTempRoot("adv-workspaces-");
    await writePackageJson(root, "package.json", {
      workspaces: ["packages/*"],
    });

    const { map } = await mapAt(root);
    const claim = map.scopes
      .find((scope) => scope.scopeRelativePath === "")
      ?.identityClaims.find(
        (item) =>
          item.confidence === "OBSERVED" &&
          item.fact.kind === "DECLARED_WORKSPACE_PATTERNS",
      );
    expect(claim?.confidence).toBe("OBSERVED");
    if (claim?.confidence === "OBSERVED" && claim.fact.kind === "DECLARED_WORKSPACE_PATTERNS") {
      expect(claim.fact.patterns).toEqual(["packages/*"]);
    }
    expect(map.entries.some((entry) => entry.relativePath === "packages")).toBe(
      false,
    );
  });

  it("rejects caller widening metadata bounds before reads", async () => {
    const root = await createCanonicalTempRoot("adv-widen-");
    await writeRelative(root, "package.json", "{}");
    const workspace = await boundaryFor(root);
    const config = await resolvedConfigAt(root);
    const inv = await inventory(workspace, config);
    expect(inv.ok).toBe(true);
    if (!inv.ok) {
      return;
    }

    const result = await buildRepositoryMap(workspace, inv.value, config, {
      maxManifests: 999,
    });
    expect(result.ok).toBe(false);
  });
});
