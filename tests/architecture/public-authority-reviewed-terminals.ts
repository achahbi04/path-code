/**
 * Reviewed terminal registry for the public authority-surface walker.
 *
 * Fail-closed: keyed by canonical resolved symbol identity
 * (repo-relative declaration path + symbol name + declaration kind).
 * Never keyed by parameter name, type-name pattern, filename glob, or
 * module-wide skip. Anonymous structural types cannot be registered.
 *
 * Populated only with types actually encountered at the audited HEAD that
 * genuinely require terminal treatment (WorkspaceBoundary.canonicalize).
 */

export type ReviewedTerminalReason =
  | "EARNED_OPAQUE_AUTHORITY"
  | "FROZEN_FOUNDATION_OBJECT";

export type ReviewedTerminalGenericPolicy =
  | "SEMANTICALLY_CLOSED"
  | "INSPECT_TYPE_ARGUMENTS";

export type ReviewedTerminalDeclarationKind =
  | "interface"
  | "class"
  | "type-alias"
  | "enum";

export type ReviewedTerminalEntry = {
  readonly declarationPath: string;
  readonly symbolName: string;
  readonly declarationKind: ReviewedTerminalDeclarationKind;
  readonly reason: ReviewedTerminalReason;
  readonly governingContract: string;
  readonly falsificationTestName: string;
  readonly genericPolicy: ReviewedTerminalGenericPolicy;
};

/** Canonical identity string used by the walker. */
export function reviewedTerminalIdentity(
  entry: Pick<
    ReviewedTerminalEntry,
    "declarationPath" | "symbolName" | "declarationKind"
  >,
): string {
  return `${entry.declarationPath}#${entry.symbolName}#${entry.declarationKind}`;
}

/**
 * Sole entry required at the audited HEAD: WorkspaceBoundary carries its own
 * frozen canonicalize method (CALLER_NARROWING_BOUND in the frozen census).
 * Unconditional traversal must not hide it by a naming skip; it is terminal
 * only through this fail-closed registry entry.
 */
export const PUBLIC_AUTHORITY_REVIEWED_TERMINALS: readonly ReviewedTerminalEntry[] =
  Object.freeze([
    Object.freeze({
      declarationPath: "src/domain/workspace.ts",
      symbolName: "WorkspaceBoundary",
      declarationKind: "interface" as const,
      reason: "FROZEN_FOUNDATION_OBJECT" as const,
      governingContract:
        "docs/reports/PHASE_3_PUBLIC_AUTHORITY_SURFACE_CENSUS.md (workspace CALLER_NARROWING_BOUND); docs/FOUNDATION_EXTENSIBILITY_CONSTITUTION_V1_AMENDMENT_1_PUBLIC_AUTHORITY_SURFACE.md §4 D; docs/passes/PHASE_3_R2_H1_PARAMETER_GRAPH_TRAVERSAL_CONTRACT.md §1.4",
      falsificationTestName:
        "H1-F5 — reviewed terminal WorkspaceBoundary removal rejects canonicalize",
      genericPolicy: "SEMANTICALLY_CLOSED" as const,
    }),
  ]);
