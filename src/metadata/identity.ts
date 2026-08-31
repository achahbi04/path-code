/**
 * Identity claim construction and fixed inference registries.
 *
 * Observed claims are emitted only by narrow extractors that bind fact + evidence.
 * No generic makeObservedClaim(subject, evidence) API exists.
 */

import type { RepositoryEntry } from "../inventory/types.js";
import type { ContentObservation } from "../reader/types.js";
import type { ManifestKind } from "./manifests.js";
import { fileExtension, parentDirectory } from "./path-utils.js";
import {
  readOwnDependencyObject,
  readOwnStringField,
  readWorkspacePatterns,
} from "./parse.js";
import type {
  DependencySection,
  IdentityDimension,
  ManifestEvidence,
  ManifestEvidenceData,
  ObservedIdentityFact,
  ProjectIdentityClaim,
} from "./types.js";

const DEPENDENCY_SECTIONS: readonly DependencySection[] = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];

const EXTENSION_LANGUAGE: Readonly<Record<string, string>> = {
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".mts": "TypeScript",
  ".cts": "TypeScript",
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".mjs": "JavaScript",
  ".cjs": "JavaScript",
  ".py": "Python",
  ".rs": "Rust",
  ".go": "Go",
  ".java": "Java",
  ".rb": "Ruby",
  ".php": "PHP",
};

const MANIFEST_ECOSYSTEM: Readonly<Record<ManifestKind, string>> = {
  "package.json": "JavaScript/Node package",
  "composer.json": "Composer/PHP",
  "tsconfig.json": "TypeScript configuration",
  "pyproject.toml": "Python",
  "requirements.txt": "Python",
  "Cargo.toml": "Cargo/Rust",
  "go.mod": "Go modules",
  "pom.xml": "Maven/Java",
  "Gemfile": "Bundler/Ruby",
};

function manifestEvidence(data: ManifestEvidenceData): ManifestEvidence {
  return data as ManifestEvidence;
}

function observedClaim(
  scopeRelativePath: string,
  fact: ObservedIdentityFact,
  observation: ContentObservation,
  entry: RepositoryEntry,
  manifestKind: ManifestKind,
): ProjectIdentityClaim {
  return {
    confidence: "OBSERVED",
    scopeRelativePath,
    fact,
    evidence: manifestEvidence({
      observation,
      entry,
      manifestKind,
      fact,
    }),
  };
}

export type PackageJsonExtraction = {
  readonly claims: readonly ProjectIdentityClaim[];
  readonly shapeUnsupported: boolean;
};

export function extractPackageJsonClaims(
  parsed: Record<string, unknown>,
  scopeRelativePath: string,
  observation: ContentObservation,
  entry: RepositoryEntry,
): PackageJsonExtraction {
  const claims: ProjectIdentityClaim[] = [];
  let shapeUnsupported = false;

  for (const section of DEPENDENCY_SECTIONS) {
    const deps = readOwnDependencyObject(parsed, section);
    if (deps === "UNSUPPORTED_SHAPE") {
      shapeUnsupported = true;
      continue;
    }
    if (deps === undefined) {
      continue;
    }
    for (const packageName of Object.keys(deps).sort()) {
      claims.push(
        observedClaim(
          scopeRelativePath,
          {
            kind: "DECLARED_PACKAGE_DEPENDENCY",
            packageName,
            section,
          },
          observation,
          entry,
          "package.json",
        ),
      );
    }
  }

  const moduleType = readOwnStringField(parsed, "type");
  if (moduleType === "module" || moduleType === "commonjs") {
    claims.push(
      observedClaim(
        scopeRelativePath,
        { kind: "DECLARED_MODULE_TYPE", value: moduleType },
        observation,
        entry,
        "package.json",
      ),
    );
  } else if (
    Object.prototype.hasOwnProperty.call(parsed, "type") &&
    moduleType === undefined
  ) {
    shapeUnsupported = true;
  }

  const workspaces = readWorkspacePatterns(parsed);
  if (workspaces === "UNSUPPORTED_SHAPE") {
    shapeUnsupported = true;
  } else if (workspaces !== undefined) {
    claims.push(
      observedClaim(
        scopeRelativePath,
        {
          kind: "DECLARED_WORKSPACE_PATTERNS",
          patterns: [...workspaces],
        },
        observation,
        entry,
        "package.json",
      ),
    );
  }

  return { claims, shapeUnsupported };
}

export function inferLanguageFromExtension(
  entry: RepositoryEntry,
): ProjectIdentityClaim | undefined {
  const extension = fileExtension(entry.relativePath);
  const language = EXTENSION_LANGUAGE[extension];
  if (language === undefined) {
    return undefined;
  }
  return {
    confidence: "INFERRED",
    scopeRelativePath: parentDirectory(entry.relativePath),
    inference: {
      kind: "LANGUAGE_SOURCE_MAY_BE_PRESENT",
      language,
    },
    basis: {
      kind: "SOURCE_EXTENSION",
      extension,
      relativePath: entry.relativePath,
    },
  };
}

export function inferEcosystemFromManifest(
  manifestKind: ManifestKind,
  relativePath: string,
): ProjectIdentityClaim {
  return {
    confidence: "INFERRED",
    scopeRelativePath: parentDirectory(relativePath),
    inference: {
      kind: "ECOSYSTEM_MAY_BE_PRESENT",
      ecosystem: MANIFEST_ECOSYSTEM[manifestKind],
    },
    basis: {
      kind: "MANIFEST_FILENAME",
      manifestKind,
      relativePath,
    },
  };
}

export function unknownClaim(
  scopeRelativePath: string,
  dimension: IdentityDimension,
): ProjectIdentityClaim {
  return {
    confidence: "UNKNOWN",
    scopeRelativePath,
    dimension,
  };
}

export const IDENTITY_DIMENSIONS: readonly IdentityDimension[] = [
  "ECOSYSTEM",
  "LANGUAGE",
  "PACKAGE_DEPENDENCY",
  "MODULE_TYPE",
  "WORKSPACE_PATTERNS",
];

export function hasClaimForDimension(
  claims: readonly ProjectIdentityClaim[],
  dimension: IdentityDimension,
): boolean {
  for (const claim of claims) {
    if (claim.confidence === "UNKNOWN") {
      continue;
    }
    if (claim.confidence === "INFERRED") {
      if (
        dimension === "ECOSYSTEM" &&
        claim.inference.kind === "ECOSYSTEM_MAY_BE_PRESENT"
      ) {
        return true;
      }
      if (
        dimension === "LANGUAGE" &&
        claim.inference.kind === "LANGUAGE_SOURCE_MAY_BE_PRESENT"
      ) {
        return true;
      }
      continue;
    }
    if (
      dimension === "PACKAGE_DEPENDENCY" &&
      claim.fact.kind === "DECLARED_PACKAGE_DEPENDENCY"
    ) {
      return true;
    }
    if (
      dimension === "MODULE_TYPE" &&
      claim.fact.kind === "DECLARED_MODULE_TYPE"
    ) {
      return true;
    }
    if (
      dimension === "WORKSPACE_PATTERNS" &&
      claim.fact.kind === "DECLARED_WORKSPACE_PATTERNS"
    ) {
      return true;
    }
  }
  return false;
}

export function observedDependencyClaim(
  claims: readonly ProjectIdentityClaim[],
  packageName: string,
): ProjectIdentityClaim | undefined {
  return claims.find(
    (claim) =>
      claim.confidence === "OBSERVED" &&
      claim.fact.kind === "DECLARED_PACKAGE_DEPENDENCY" &&
      claim.fact.packageName === packageName,
  );
}
