/**
 * Approved exceptions for the public authority-surface standing guard.
 *
 * Each entry must name: function + parameter, governing frozen contract,
 * reason it is ordinary behavior (not mechanism substitution), and targeted test.
 *
 * Empty by design after Stage 3 internalization — no unjustified entries.
 */
export type PublicAuthorityApprovedException = {
  readonly functionName: string;
  readonly parameterName: string;
  readonly governingContract: string;
  readonly reason: string;
  readonly targetedTest: string;
};

export const PUBLIC_AUTHORITY_APPROVED_EXCEPTIONS: readonly PublicAuthorityApprovedException[] =
  Object.freeze([]);
