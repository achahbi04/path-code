import { mkdir } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildRepositoryMap,
  MANIFEST_REGISTRY,
  MAX_MANIFEST_CONTENT_BYTES,
  MAX_MANIFESTS_PER_METADATA_OPERATION,
  validateMetadataOptions,
} from "../../src/metadata/index.js";
import { collectManifestCandidates } from "../../src/metadata/observe.js";
import { observedDependencyClaim } from "../../src/metadata/identity.js";
import { cleanupInventoryFixtures } from "../inventory/fixture-helpers.js";
import { inventory } from "../../src/inventory/index.js";
import { collectGitStateBaseline } from "../../src/git/index.js";
import {
  boundaryFor,
  claimsAtScope,
  createCanonicalTempRoot,
  gitBaselineFor,
  initGitRepo,
  mapAt,
  observedDeps,
  resolvedConfigAt,
  writePackageJson,
  writePathCodeConfig,
  writeRelative,
} from "./helpers.js";

afterEach(async () => {
  await cleanupInventoryFixtures();
});

describe("manifest registry", () => {
  it("contains exactly the locked Phase 2D manifest set", () => {
    expect(MANIFEST_REGISTRY.map((entry) => entry.basename)).toEqual([
      "package.json",
      "composer.json",
      "tsconfig.json",
      "pyproject.toml",
      "requirements.txt",
      "Cargo.toml",
      "go.mod",
      "pom.xml",
      "Gemfile",
    ]);
  });
});

describe("metadata options validation", () => {
  it("rejects widening manifest count above the hard ceiling", () => {
    const result = validateMetadataOptions({
      maxManifests: MAX_MANIFESTS_PER_METADATA_OPERATION + 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_METADATA_OPTIONS");
    }
  });

  it("rejects widening manifest bytes above the hard ceiling", () => {
    const result = validateMetadataOptions({
      maxManifestBytes: MAX_MANIFEST_CONTENT_BYTES + 1,
    });
    expect(result.ok).toBe(false);
  });

  it("accepts narrowing bounds", () => {
    const result = validateMetadataOptions({ maxManifests: 2, maxManifestBytes: 1024 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.maxManifests).toBe(2);
      expect(result.value.maxManifestBytes).toBe(1024);
    }
  });
});

describe("manifest observation", () => {
  it("reads and parses a root package.json", async () => {
    const root = await createCanonicalTempRoot("meta-pkg-");
    await writePackageJson(root, "package.json", {
      name: "demo",
      dependencies: { next: "14.0.0" },
    });

    const { map } = await mapAt(root);
    const obs = map.manifestObservations.find(
      (item) => item.relativePath === "package.json",
    );
    expect(obs?.kind).toBe("PARSED_JSON");
    expect(observedDeps(map, "", "next")).toBeDefined();
  });

  it("recognizes nested package.json with nested scope", async () => {
    const root = await createCanonicalTempRoot("meta-nested-");
    await writePackageJson(root, "packages/web/package.json", {
      name: "web",
      dependencies: { react: "18.0.0" },
    });

    const { map } = await mapAt(root);
    expect(observedDeps(map, "packages/web", "react")).toBeDefined();
    expect(observedDeps(map, "", "react")).toBeUndefined();
  });

  it("does not treat packages.json or package.json.bak as manifests", async () => {
    const root = await createCanonicalTempRoot("meta-similar-");
    await writeRelative(root, "packages.json", "{}");
    await writeRelative(root, "package.json.bak", "{}");

    const { inventory, map } = await mapAt(root);
    const candidates = collectManifestCandidates(inventory);
    expect(candidates.map((item) => item.relativePath)).toEqual([]);
    expect(map.manifestObservations.length).toBe(0);
  });

  it("records TOO_LARGE without parsing", async () => {
    const root = await createCanonicalTempRoot("meta-large-");
    const big = "x".repeat(MAX_MANIFEST_CONTENT_BYTES + 64);
    await writeRelative(root, "package.json", big);

    const { map } = await mapAt(root, { maxManifestBytes: 1024 });
    const obs = map.manifestObservations[0];
    expect(obs?.kind).toBe("READ_TOO_LARGE");
    expect(map.metadataCompletion.kind).toBe("PARTIAL");
  });

  it("records binary manifest without parse", async () => {
    const root = await createCanonicalTempRoot("meta-binary-");
    await writeRelative(root, "package.json", "\0binary\n");

    const { map } = await mapAt(root);
    expect(map.manifestObservations[0]?.kind).toBe("READ_BINARY");
  });

  it("records UNPARSED_BY_DESIGN for Cargo.toml with ecosystem inference only", async () => {
    const root = await createCanonicalTempRoot("meta-cargo-");
    await writeRelative(root, "Cargo.toml", '[package]\nname = "demo"\n');

    const { map } = await mapAt(root);
    expect(map.manifestObservations[0]?.kind).toBe("UNPARSED_BY_DESIGN");
    const inferred = claimsAtScope(map, "").find(
      (claim): claim is Extract<typeof claim, { confidence: "INFERRED" }> =>
        claim.confidence === "INFERRED" &&
        claim.inference.kind === "ECOSYSTEM_MAY_BE_PRESENT",
    );
    expect(inferred?.inference.kind).toBe("ECOSYSTEM_MAY_BE_PRESENT");
    if (inferred?.confidence === "INFERRED" && inferred.inference.kind === "ECOSYSTEM_MAY_BE_PRESENT") {
      expect(inferred.inference.ecosystem).toContain("Rust");
    }
    expect(
      claimsAtScope(map, "").some(
        (claim) =>
          claim.confidence === "OBSERVED" &&
          claim.fact.kind === "DECLARED_PACKAGE_DEPENDENCY",
      ),
    ).toBe(false);
  });

  it("records parse failure for malformed JSON without failing the operation", async () => {
    const root = await createCanonicalTempRoot("meta-bad-json-");
    await writeRelative(root, "package.json", "{ not json");

    const { map } = await mapAt(root);
    expect(map.manifestObservations[0]?.kind).toBe("PARSE_FAILED");
    expect(map.metadataCompletion.kind).toBe("PARTIAL");
  });

  it("records tsconfig JSONC parse failure explicitly", async () => {
    const root = await createCanonicalTempRoot("meta-tsconfig-");
    await writeRelative(root, "tsconfig.json", '{ "compilerOptions": {} // comment\n}');

    const { map } = await mapAt(root);
    expect(map.manifestObservations[0]?.kind).toBe("PARSE_FAILED");
  });

  it("returns explicit UNKNOWN dimensions when no manifests exist", async () => {
    const root = await createCanonicalTempRoot("meta-empty-");
    await writeRelative(root, "readme.txt", "hello\n");

    const { map } = await mapAt(root);
    const rootClaims = claimsAtScope(map, "");
    expect(rootClaims.some((claim) => claim.confidence === "UNKNOWN")).toBe(true);
  });
});

describe("OBSERVED evidence binding", () => {
  it("binds next declaration to actual ContentObservation fingerprint", async () => {
    const root = await createCanonicalTempRoot("meta-next-");
    await writePackageJson(root, "package.json", {
      dependencies: { next: "14.0.0" },
    });

    const { map } = await mapAt(root);
    const claim = observedDeps(map, "", "next");
    expect(claim?.confidence).toBe("OBSERVED");
    if (
      claim?.confidence === "OBSERVED" &&
      claim.fact.kind === "DECLARED_PACKAGE_DEPENDENCY" &&
      claim.evidence.fact.kind === "DECLARED_PACKAGE_DEPENDENCY"
    ) {
      expect(claim.evidence.observation.fingerprint.algorithm).toBe("sha256");
      expect(claim.evidence.observation.entry.relativePath).toBe("package.json");
      expect(claim.evidence.fact.packageName).toBe("next");
    }
  });

  it("does not produce next declaration when package.json lacks it", async () => {
    const root = await createCanonicalTempRoot("meta-no-next-");
    await writePackageJson(root, "package.json", { name: "demo" });

    const { map } = await mapAt(root);
    expect(observedDeps(map, "", "next")).toBeUndefined();
  });

  it("records type module as observed declaration not running-system claim", async () => {
    const root = await createCanonicalTempRoot("meta-module-");
    await writePackageJson(root, "package.json", { type: "module" });

    const { map } = await mapAt(root);
    const claim = claimsAtScope(map, "").find(
      (item) =>
        item.confidence === "OBSERVED" && item.fact.kind === "DECLARED_MODULE_TYPE",
    );
    expect(claim?.confidence).toBe("OBSERVED");
    if (claim?.confidence === "OBSERVED" && claim.fact.kind === "DECLARED_MODULE_TYPE") {
      expect(claim.fact.value).toBe("module");
    }
  });
});

describe("INFERRED and directory-name controls", () => {
  it("infers TypeScript from .ts without ManifestEvidence", async () => {
    const root = await createCanonicalTempRoot("meta-ts-");
    await writeRelative(root, "src/index.ts", "export {}\n");

    const { map } = await mapAt(root);
    const claim = claimsAtScope(map, "src").find(
      (item) =>
        item.confidence === "INFERRED" &&
        item.inference.kind === "LANGUAGE_SOURCE_MAY_BE_PRESENT",
    );
    expect(claim?.confidence).toBe("INFERRED");
    expect(claim && "evidence" in claim).toBe(false);
  });

  it("does not infer identity from directory name pages/", async () => {
    const root = await createCanonicalTempRoot("meta-pages-");
    await mkdir(path.join(root, "pages"), { recursive: true });
    await writeRelative(root, "pages/index.tsx", "export {}\n");

    const { map } = await mapAt(root);
    const pageDirClaims = claimsAtScope(map, "pages").filter(
      (claim) => claim.confidence !== "UNKNOWN",
    );
    expect(
      pageDirClaims.some(
        (claim) =>
          claim.confidence === "INFERRED" &&
          claim.inference.kind === "ECOSYSTEM_MAY_BE_PRESENT" &&
          /next/i.test(claim.inference.ecosystem),
      ),
    ).toBe(false);
  });
});

describe("bounds and ordering", () => {
  it("marks metadata PARTIAL when manifest limit truncates candidates", async () => {
    const root = await createCanonicalTempRoot("meta-limit-");
    for (let i = 0; i < 5; i += 1) {
      await writePackageJson(root, `pkg${i}/package.json`, { name: `p${i}` });
    }

    const { map } = await mapAt(root, { maxManifests: 2 });
    expect(map.metadataCompletion.kind).toBe("PARTIAL");
    if (map.metadataCompletion.kind === "PARTIAL") {
      expect(
        map.metadataCompletion.reasons.some(
          (reason) => reason.kind === "MANIFEST_LIMIT_REACHED",
        ),
      ).toBe(true);
    }
  });

  it("selects manifest candidates deterministically by depth then path", async () => {
    const root = await createCanonicalTempRoot("meta-order-");
    await writePackageJson(root, "z/package.json", { name: "z" });
    await writePackageJson(root, "package.json", { name: "root" });
    await writePackageJson(root, "a/package.json", { name: "a" });

    const { inventory } = await mapAt(root);
    const candidates = collectManifestCandidates(inventory);
    expect(candidates.map((item) => item.relativePath)).toEqual([
      "package.json",
      "a/package.json",
      "z/package.json",
    ]);
  });

  it("attempts manifests in deterministic order until maxManifests bound", async () => {
    const root = await createCanonicalTempRoot("meta-order-limit-");
    await writePackageJson(root, "z/package.json", { name: "z" });
    await writePackageJson(root, "package.json", { name: "root" });
    await writePackageJson(root, "a/package.json", { name: "a" });

    const { map } = await mapAt(root, { maxManifests: 2 });
    expect(map.manifestObservations.map((item) => item.relativePath)).toEqual([
      "package.json",
      "a/package.json",
    ]);
  });
});

describe("repository map structure", () => {
  it("uses workspace-relative lexical paths in topology", async () => {
    const root = await createCanonicalTempRoot("meta-topology-");
    await writeRelative(root, "src/main.ts", "export {}\n");

    const { map } = await mapAt(root);
    expect(map.entries.every((entry) => !path.isAbsolute(entry.relativePath))).toBe(
      true,
    );
    expect(map.entries.some((entry) => entry.relativePath === "src/main.ts")).toBe(true);
  });

  it("inherits inventory PARTIAL completion separately from metadata completion", async () => {
    const root = await createCanonicalTempRoot("meta-partial-inv-");
    await writeRelative(root, "a.txt", "a\n");
    await writeRelative(root, "b.txt", "b\n");

    const { map } = await mapAt(root, undefined, { maxEntries: 1 });
    expect(map.inventoryTraversalCompletion.kind).toBe("PARTIAL");
    expect(map.metadataCompletion.kind).toBe("COMPLETE");
  });

  it("shows denied boundary without denied child names", async () => {
    const root = await createCanonicalTempRoot("meta-deny-");
    await writePathCodeConfig(root, ["secrets/"]);
    await writeRelative(root, "secrets/key.txt", "secret\n");
    await writeRelative(root, "public.txt", "ok\n");

    const { map } = await mapAt(root);
    expect(map.boundaries.some((item) => item.kind === "DENIED")).toBe(true);
    expect(JSON.stringify(map)).not.toContain("key.txt");
  });
});

describe("Git enrichment compatibility", () => {
  it("works without Git baseline", async () => {
    const root = await createCanonicalTempRoot("meta-no-git-");
    await writeRelative(root, "file.txt", "x\n");
    const { map } = await mapAt(root);
    expect(map.gitAvailability).toBeUndefined();
    expect(map.sidecarUnmappedGit).toEqual([]);
  });

  it("attaches Git annotations by inventory entry reference identity", async () => {
    const root = await createCanonicalTempRoot("meta-git-");
    await initGitRepo(root);

    const workspace = await boundaryFor(root);
    const config = await resolvedConfigAt(root);
    const inv = await inventory(workspace, config);
    expect(inv.ok).toBe(true);
    if (!inv.ok) {
      return;
    }

    const baseline = await collectGitStateBaseline(workspace, inv.value, config);
    expect(baseline.ok).toBe(true);
    if (!baseline.ok) {
      return;
    }

    const result = await buildRepositoryMap(workspace, inv.value, config, {
      gitBaseline: baseline.value,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const map = result.value;
    const entry = inv.value.observations.find(
      (item) => item.disposition === "ADMITTED" && item.relativePath === "README.md",
    );
    expect(entry?.disposition).toBe("ADMITTED");
    if (entry?.disposition !== "ADMITTED") {
      return;
    }
    const mapEntry = map.entries.find((item) => item.relativePath === "README.md");
    expect(mapEntry?.gitAnnotation?.entry).toBe(entry.entry);
  });

  it("rejects incompatible Git baseline from a different inventory", async () => {
    const rootA = await createCanonicalTempRoot("meta-git-a-");
    const rootB = await createCanonicalTempRoot("meta-git-b-");
    await writeRelative(rootA, "a.txt", "a\n");
    await writeRelative(rootB, "b.txt", "b\n");

    const baselineA = await gitBaselineFor(rootA);
    const workspaceB = await boundaryFor(rootB);
    const configB = await resolvedConfigAt(rootB);
    const invB = await inventory(workspaceB, configB);
    expect(invB.ok).toBe(true);
    if (!invB.ok) {
      return;
    }

    const result = await buildRepositoryMap(workspaceB, invB.value, configB, {
      gitBaseline: baselineA,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("GIT_BASELINE_INCOMPATIBLE");
    }
  });
});

describe("nested scope isolation", () => {
  it("does not promote nested example manifest claims to root scope", async () => {
    const root = await createCanonicalTempRoot("meta-nested-promo-");
    await writePackageJson(root, "package.json", { name: "root" });
    await writePackageJson(root, "examples/demo/package.json", {
      dependencies: { next: "14.0.0" },
    });

    const { map } = await mapAt(root);
    expect(observedDeps(map, "examples/demo", "next")).toBeDefined();
    expect(observedDeps(map, "", "next")).toBeUndefined();
  });
});

describe("claim lookup helpers", () => {
  it("finds observed dependency through scoped claims", async () => {
    const root = await createCanonicalTempRoot("meta-lookup-");
    await writePackageJson(root, "package.json", {
      dependencies: { lodash: "4.0.0" },
    });
    const { map } = await mapAt(root);
    const claims = claimsAtScope(map, "");
    expect(observedDependencyClaim(claims, "lodash")).toBeDefined();
    expect(observedDependencyClaim(claims, "next")).toBeUndefined();
  });
});
