/**
 * Approved exceptions for the public authority-surface standing guard.
 *
 * Each entry must name: function + parameter (+ optional exact memberPath),
 * governing frozen contract, reason it is ordinary behavior (not mechanism
 * substitution), and targeted test.
 *
 * Empty by design after Stage 3 internalization — no unjustified entries.
 * Wildcards are forbidden by the canonical analyzer.
 */

export type PublicAuthorityApprovedException = {
  readonly functionName: string;
  readonly parameterName: string;
  /** Exact member path when the exception is member-scoped (2-F6). */
  readonly memberPath?: string;
  readonly governingContract: string;
  readonly reason: string;
  readonly targetedTest: string;
};

export const PUBLIC_AUTHORITY_APPROVED_EXCEPTIONS: readonly PublicAuthorityApprovedException[] =
  Object.freeze([]);
