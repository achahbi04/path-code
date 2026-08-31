/**
 * Project configuration representation — load only, never apply in Phase 1E.
 */

import type { ActionClass } from "../domain/authority.js";
import type { Provenance } from "../domain/knowledge.js";

/** Explicit trust classification for repository-authored guidance prose. */
export type RepositoryGuidanceTrust = "UNTRUSTED_REPOSITORY";

/**
 * Repository-authored prose carried as explicitly untrusted data.
 * Must not be mistaken for user intent in later phases.
 */
export type RepositoryGuidance = {
  readonly trust: RepositoryGuidanceTrust;
  readonly provenance: Provenance;
  readonly text: string;
};

/** Narrowing-only restrictions representable from known directives. */
export type ProjectRestrictions = {
  readonly deniedPaths: readonly string[];
  readonly disabledActions: readonly ActionClass[];
};

export type UnknownDirective = {
  readonly name: string;
  readonly value: string;
};

export type ProjectConfigSource =
  | { readonly kind: "ABSENT" }
  | { readonly kind: "REPOSITORY_FILE" };

type ProjectConfigCommon = {
  readonly restrictions: ProjectRestrictions;
  readonly unknownDirectives: readonly UnknownDirective[];
};

export type ProjectConfig =
  | (ProjectConfigCommon & {
      readonly source: { readonly kind: "ABSENT" };
    })
  | (ProjectConfigCommon & {
      readonly source: { readonly kind: "REPOSITORY_FILE" };
      readonly guidance: RepositoryGuidance;
    });

export function defaultProjectConfig(): ProjectConfig {
  return {
    source: { kind: "ABSENT" },
    restrictions: {
      deniedPaths: [],
      disabledActions: [],
    },
    unknownDirectives: [],
  };
}
