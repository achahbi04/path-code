/**
 * Bounded ReasoningProposal JSON parser — schema validation only.
 * No coercion, repair, version inference, or prototype-registry merge.
 */

import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import {
  MAX_CITATIONS_PER_CLAIM,
  MAX_CLAIMS,
  MAX_CONTAINS_NEEDLE_UTF8_BYTES,
  MAX_DEPENDENCY_OR_SYMBOL_UTF8_BYTES,
  MAX_HYPOTHESES,
  MAX_INFERENCE_BASIS_LINKS,
  MAX_PROPOSAL_JSON_UTF8_BYTES,
  MAX_RELATIVE_PATH_HINT_UTF8_BYTES,
  MIN_CLAIMS,
  isNonEmptyIdWithinLimit,
  isTextFieldWithinLimit,
  utf8ByteLength,
} from "./bounds.js";
import { inputFailure, type ReasoningInputFailure } from "./failures.js";
import type {
  ProposedClaim,
  ProposedEvidenceReference,
  ReasoningHypothesis,
  ReasoningProposal,
} from "./types.js";

const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

const CLAIM_KINDS = new Set([
  "EXISTS",
  "CONTENT",
  "DEPENDS_DECLARED",
  "CONTAINS",
  "DEFINES",
  "BEHAVES",
]);

function ownKeys(value: object): string[] {
  return Reflect.ownKeys(value).filter(
    (key): key is string => typeof key === "string",
  );
}

function hasForbiddenKeys(value: object): boolean {
  for (const key of ownKeys(value)) {
    if (FORBIDDEN_KEYS.has(key)) {
      return true;
    }
  }
  return false;
}

function expectExactKeys(
  value: object,
  allowed: ReadonlySet<string>,
): ReasoningInputFailure | undefined {
  if (hasForbiddenKeys(value)) {
    return inputFailure("FORBIDDEN_FIELD", "Forbidden object key rejected");
  }
  for (const key of ownKeys(value)) {
    if (!allowed.has(key)) {
      return inputFailure("SCHEMA_INVALID", "Unknown field rejected");
    }
  }
  return undefined;
}

function requireStringField(
  value: unknown,
  field: string,
): Result<string, ReasoningInputFailure> {
  if (typeof value !== "string") {
    return failure(
      inputFailure("SCHEMA_INVALID", `Field ${field} must be a string`),
    );
  }
  return success(value);
}

function parseEvidenceReference(
  value: unknown,
): Result<ProposedEvidenceReference, ReasoningInputFailure> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return failure(
      inputFailure("SCHEMA_INVALID", "Evidence reference must be an object"),
    );
  }
  const obj = value as Record<string, unknown>;
  const kindResult = requireStringField(obj.kind, "kind");
  if (!kindResult.ok) {
    return kindResult;
  }

  if (kindResult.value === "EVIDENCE_ID") {
    const keys = expectExactKeys(obj, new Set(["kind", "id"]));
    if (keys !== undefined) {
      return failure(keys);
    }
    const idResult = requireStringField(obj.id, "id");
    if (!idResult.ok) {
      return idResult;
    }
    if (!isNonEmptyIdWithinLimit(idResult.value)) {
      return failure(
        inputFailure("LIMIT_EXCEEDED", "Evidence id exceeds limit or is empty"),
      );
    }
    return success({ kind: "EVIDENCE_ID", id: idResult.value });
  }

  if (kindResult.value === "REPOSITORY_RELATIVE_PATH") {
    const keys = expectExactKeys(obj, new Set(["kind", "relativePath"]));
    if (keys !== undefined) {
      return failure(keys);
    }
    const pathResult = requireStringField(obj.relativePath, "relativePath");
    if (!pathResult.ok) {
      return pathResult;
    }
    if (
      pathResult.value.length === 0 ||
      utf8ByteLength(pathResult.value) > MAX_RELATIVE_PATH_HINT_UTF8_BYTES
    ) {
      return failure(
        inputFailure(
          "LIMIT_EXCEEDED",
          "Relative path hint exceeds limit or is empty",
        ),
      );
    }
    return success({
      kind: "REPOSITORY_RELATIVE_PATH",
      relativePath: pathResult.value,
    });
  }

  return failure(
    inputFailure("SCHEMA_INVALID", "Unknown evidence reference discriminant"),
  );
}

function parseCitations(
  value: unknown,
): Result<readonly ProposedEvidenceReference[], ReasoningInputFailure> {
  if (!Array.isArray(value)) {
    return failure(
      inputFailure("SCHEMA_INVALID", "proposedCitations must be an array"),
    );
  }
  if (value.length > MAX_CITATIONS_PER_CLAIM) {
    return failure(
      inputFailure("LIMIT_EXCEEDED", "Too many citations on one claim"),
    );
  }
  const citations: ProposedEvidenceReference[] = [];
  for (const item of value) {
    const parsed = parseEvidenceReference(item);
    if (!parsed.ok) {
      return parsed;
    }
    citations.push(parsed.value);
  }
  return success(citations);
}

function parseClaim(
  value: unknown,
): Result<ProposedClaim, ReasoningInputFailure> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return failure(inputFailure("SCHEMA_INVALID", "Claim must be an object"));
  }
  const obj = value as Record<string, unknown>;
  const kindResult = requireStringField(obj.kind, "kind");
  if (!kindResult.ok) {
    return kindResult;
  }
  if (!CLAIM_KINDS.has(kindResult.value)) {
    return failure(inputFailure("SCHEMA_INVALID", "Unknown claim kind"));
  }

  const claimIdResult = requireStringField(obj.claimId, "claimId");
  if (!claimIdResult.ok) {
    return claimIdResult;
  }
  if (!isNonEmptyIdWithinLimit(claimIdResult.value)) {
    return failure(
      inputFailure("LIMIT_EXCEEDED", "claimId exceeds limit or is empty"),
    );
  }

  const statementResult = requireStringField(obj.statement, "statement");
  if (!statementResult.ok) {
    return statementResult;
  }
  if (!isTextFieldWithinLimit(statementResult.value)) {
    return failure(inputFailure("LIMIT_EXCEEDED", "statement exceeds limit"));
  }

  const subject = parseEvidenceReference(obj.proposedSubject);
  if (!subject.ok) {
    return subject;
  }
  const citations = parseCitations(obj.proposedCitations);
  if (!citations.ok) {
    return citations;
  }

  const common = {
    claimId: claimIdResult.value,
    statement: statementResult.value,
    proposedSubject: subject.value,
    proposedCitations: citations.value,
  };

  if (kindResult.value === "EXISTS") {
    const keys = expectExactKeys(
      obj,
      new Set([
        "claimId",
        "kind",
        "statement",
        "proposedSubject",
        "proposedCitations",
      ]),
    );
    if (keys !== undefined) {
      return failure(keys);
    }
    return success({ ...common, kind: "EXISTS" });
  }

  if (kindResult.value === "CONTENT") {
    const keys = expectExactKeys(
      obj,
      new Set([
        "claimId",
        "kind",
        "statement",
        "proposedSubject",
        "proposedCitations",
      ]),
    );
    if (keys !== undefined) {
      return failure(keys);
    }
    return success({ ...common, kind: "CONTENT" });
  }

  if (kindResult.value === "DEPENDS_DECLARED") {
    const keys = expectExactKeys(
      obj,
      new Set([
        "claimId",
        "kind",
        "statement",
        "proposedSubject",
        "proposedCitations",
        "dependencyName",
      ]),
    );
    if (keys !== undefined) {
      return failure(keys);
    }
    const dep = requireStringField(obj.dependencyName, "dependencyName");
    if (!dep.ok) {
      return dep;
    }
    if (
      dep.value.length === 0 ||
      utf8ByteLength(dep.value) > MAX_DEPENDENCY_OR_SYMBOL_UTF8_BYTES
    ) {
      return failure(
        inputFailure(
          "LIMIT_EXCEEDED",
          "dependencyName exceeds limit or is empty",
        ),
      );
    }
    return success({
      ...common,
      kind: "DEPENDS_DECLARED",
      dependencyName: dep.value,
    });
  }

  if (kindResult.value === "CONTAINS") {
    const keys = expectExactKeys(
      obj,
      new Set([
        "claimId",
        "kind",
        "statement",
        "proposedSubject",
        "proposedCitations",
        "needle",
      ]),
    );
    if (keys !== undefined) {
      return failure(keys);
    }
    const needle = requireStringField(obj.needle, "needle");
    if (!needle.ok) {
      return needle;
    }
    if (
      needle.value.length === 0 ||
      utf8ByteLength(needle.value) > MAX_CONTAINS_NEEDLE_UTF8_BYTES
    ) {
      return failure(
        inputFailure("LIMIT_EXCEEDED", "needle exceeds limit or is empty"),
      );
    }
    return success({ ...common, kind: "CONTAINS", needle: needle.value });
  }

  if (kindResult.value === "DEFINES") {
    const keys = expectExactKeys(
      obj,
      new Set([
        "claimId",
        "kind",
        "statement",
        "proposedSubject",
        "proposedCitations",
        "symbolName",
      ]),
    );
    if (keys !== undefined) {
      return failure(keys);
    }
    const symbol = requireStringField(obj.symbolName, "symbolName");
    if (!symbol.ok) {
      return symbol;
    }
    if (
      symbol.value.length === 0 ||
      utf8ByteLength(symbol.value) > MAX_DEPENDENCY_OR_SYMBOL_UTF8_BYTES
    ) {
      return failure(
        inputFailure("LIMIT_EXCEEDED", "symbolName exceeds limit or is empty"),
      );
    }
    return success({ ...common, kind: "DEFINES", symbolName: symbol.value });
  }

  // BEHAVES
  const keys = expectExactKeys(
    obj,
    new Set([
      "claimId",
      "kind",
      "statement",
      "proposedSubject",
      "proposedCitations",
      "scenarioDescription",
    ]),
  );
  if (keys !== undefined) {
    return failure(keys);
  }
  const scenario = requireStringField(
    obj.scenarioDescription,
    "scenarioDescription",
  );
  if (!scenario.ok) {
    return scenario;
  }
  if (
    scenario.value.length === 0 ||
    !isTextFieldWithinLimit(scenario.value)
  ) {
    return failure(
      inputFailure(
        "LIMIT_EXCEEDED",
        "scenarioDescription exceeds limit or is empty",
      ),
    );
  }
  return success({
    ...common,
    kind: "BEHAVES",
    scenarioDescription: scenario.value,
  });
}

function parseHypothesis(
  value: unknown,
  claimIds: ReadonlySet<string>,
): Result<ReasoningHypothesis, ReasoningInputFailure> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return failure(
      inputFailure("SCHEMA_INVALID", "Hypothesis must be an object"),
    );
  }
  const obj = value as Record<string, unknown>;
  const epistemic = requireStringField(obj.epistemic, "epistemic");
  if (!epistemic.ok) {
    return epistemic;
  }

  const hypothesisId = requireStringField(obj.hypothesisId, "hypothesisId");
  if (!hypothesisId.ok) {
    return hypothesisId;
  }
  if (!isNonEmptyIdWithinLimit(hypothesisId.value)) {
    return failure(
      inputFailure("LIMIT_EXCEEDED", "hypothesisId exceeds limit or is empty"),
    );
  }

  const statement = requireStringField(obj.statement, "statement");
  if (!statement.ok) {
    return statement;
  }
  if (!isTextFieldWithinLimit(statement.value)) {
    return failure(
      inputFailure("LIMIT_EXCEEDED", "hypothesis statement exceeds limit"),
    );
  }

  if (epistemic.value === "INFERRED") {
    const keys = expectExactKeys(
      obj,
      new Set([
        "hypothesisId",
        "epistemic",
        "statement",
        "supportingClaimIds",
      ]),
    );
    if (keys !== undefined) {
      return failure(keys);
    }
    if (!Array.isArray(obj.supportingClaimIds)) {
      return failure(
        inputFailure(
          "SCHEMA_INVALID",
          "INFERRED supportingClaimIds must be an array",
        ),
      );
    }
    if (
      obj.supportingClaimIds.length < 1 ||
      obj.supportingClaimIds.length > MAX_INFERENCE_BASIS_LINKS
    ) {
      return failure(
        inputFailure(
          "LIMIT_EXCEEDED",
          "INFERRED supportingClaimIds count is outside allowed range",
        ),
      );
    }
    const ids: string[] = [];
    for (const item of obj.supportingClaimIds) {
      if (typeof item !== "string" || !isNonEmptyIdWithinLimit(item)) {
        return failure(
          inputFailure(
            "SCHEMA_INVALID",
            "supportingClaimIds entries must be nonempty limited strings",
          ),
        );
      }
      if (!claimIds.has(item)) {
        return failure(
          inputFailure(
            "DANGLING_INFERENCE_BASIS",
            "Inference basis references an unknown claimId",
          ),
        );
      }
      ids.push(item);
    }
    return success({
      hypothesisId: hypothesisId.value,
      epistemic: "INFERRED",
      statement: statement.value,
      supportingClaimIds: ids as unknown as readonly [string, ...string[]],
    });
  }

  if (epistemic.value === "UNVERIFIED") {
    const keys = expectExactKeys(
      obj,
      new Set([
        "hypothesisId",
        "epistemic",
        "statement",
        "supportingClaimIds",
      ]),
    );
    if (keys !== undefined) {
      // supportingClaimIds optional — allow exact set without it
      const withoutOptional = expectExactKeys(
        obj,
        new Set(["hypothesisId", "epistemic", "statement"]),
      );
      if (withoutOptional !== undefined) {
        return failure(keys);
      }
    }
    let supportingClaimIds: readonly string[] | undefined;
    if (Object.prototype.hasOwnProperty.call(obj, "supportingClaimIds")) {
      if (!Array.isArray(obj.supportingClaimIds)) {
        return failure(
          inputFailure(
            "SCHEMA_INVALID",
            "UNVERIFIED supportingClaimIds must be an array when present",
          ),
        );
      }
      if (obj.supportingClaimIds.length > MAX_INFERENCE_BASIS_LINKS) {
        return failure(
          inputFailure(
            "LIMIT_EXCEEDED",
            "supportingClaimIds exceeds structural limit",
          ),
        );
      }
      const ids: string[] = [];
      for (const item of obj.supportingClaimIds) {
        if (typeof item !== "string" || !isNonEmptyIdWithinLimit(item)) {
          return failure(
            inputFailure(
              "SCHEMA_INVALID",
              "supportingClaimIds entries must be nonempty limited strings",
            ),
          );
        }
        if (!claimIds.has(item)) {
          return failure(
            inputFailure(
              "DANGLING_INFERENCE_BASIS",
              "Inference basis references an unknown claimId",
            ),
          );
        }
        ids.push(item);
      }
      supportingClaimIds = ids;
    }
    return success(
      supportingClaimIds === undefined
        ? {
            hypothesisId: hypothesisId.value,
            epistemic: "UNVERIFIED",
            statement: statement.value,
          }
        : {
            hypothesisId: hypothesisId.value,
            epistemic: "UNVERIFIED",
            statement: statement.value,
            supportingClaimIds,
          },
    );
  }

  return failure(
    inputFailure("SCHEMA_INVALID", "Unknown hypothesis epistemic label"),
  );
}

/**
 * Parse and validate untrusted proposal JSON text into a normalized proposal.
 */
export function parseReasoningProposalJson(
  jsonText: unknown,
): Result<ReasoningProposal, ReasoningInputFailure> {
  if (typeof jsonText !== "string") {
    return failure(
      inputFailure("NON_STRING_INPUT", "Proposal input must be a string"),
    );
  }
  if (utf8ByteLength(jsonText) > MAX_PROPOSAL_JSON_UTF8_BYTES) {
    return failure(
      inputFailure("LIMIT_EXCEEDED", "Proposal JSON exceeds size ceiling"),
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText) as unknown;
  } catch {
    return failure(inputFailure("INVALID_JSON", "Proposal JSON is invalid"));
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return failure(
      inputFailure("SCHEMA_INVALID", "Proposal top-level must be an object"),
    );
  }

  const obj = parsed as Record<string, unknown>;
  const topKeys = expectExactKeys(
    obj,
    new Set([
      "schemaVersion",
      "proposalId",
      "requestedOutcome",
      "claims",
      "hypotheses",
    ]),
  );
  if (topKeys !== undefined) {
    return failure(topKeys);
  }

  if (obj.schemaVersion !== 1) {
    return failure(
      inputFailure("SCHEMA_INVALID", "Unsupported or missing schemaVersion"),
    );
  }

  const proposalId = requireStringField(obj.proposalId, "proposalId");
  if (!proposalId.ok) {
    return proposalId;
  }
  if (!isNonEmptyIdWithinLimit(proposalId.value)) {
    return failure(
      inputFailure("LIMIT_EXCEEDED", "proposalId exceeds limit or is empty"),
    );
  }

  const requestedOutcome = requireStringField(
    obj.requestedOutcome,
    "requestedOutcome",
  );
  if (!requestedOutcome.ok) {
    return requestedOutcome;
  }
  if (!isTextFieldWithinLimit(requestedOutcome.value)) {
    return failure(
      inputFailure("LIMIT_EXCEEDED", "requestedOutcome exceeds limit"),
    );
  }

  // Reject authority / semantic-upgrade field names if present (already covered
  // by unknown-field rejection via exact keys). Explicit check for clarity.
  for (const forbidden of [
    "authorization",
    "authority",
    "isVerified",
    "trustedSource",
    "semanticVerification",
  ] as const) {
    if (Object.prototype.hasOwnProperty.call(obj, forbidden)) {
      return failure(
        inputFailure("FORBIDDEN_FIELD", "Authority/upgrade field rejected"),
      );
    }
  }

  if (!Array.isArray(obj.claims)) {
    return failure(inputFailure("SCHEMA_INVALID", "claims must be an array"));
  }
  if (obj.claims.length < MIN_CLAIMS || obj.claims.length > MAX_CLAIMS) {
    return failure(
      inputFailure("LIMIT_EXCEEDED", "claims count is outside allowed range"),
    );
  }

  if (!Array.isArray(obj.hypotheses)) {
    return failure(
      inputFailure("SCHEMA_INVALID", "hypotheses must be an array"),
    );
  }
  if (obj.hypotheses.length > MAX_HYPOTHESES) {
    return failure(
      inputFailure("LIMIT_EXCEEDED", "hypotheses count exceeds ceiling"),
    );
  }

  const claims: ProposedClaim[] = [];
  const claimIds = new Set<string>();
  for (const item of obj.claims) {
    const claim = parseClaim(item);
    if (!claim.ok) {
      return claim;
    }
    if (claimIds.has(claim.value.claimId)) {
      return failure(
        inputFailure("DUPLICATE_CLAIM_ID", "Duplicate claimId rejected"),
      );
    }
    claimIds.add(claim.value.claimId);
    claims.push(claim.value);
  }

  const hypotheses: ReasoningHypothesis[] = [];
  const hypothesisIds = new Set<string>();
  for (const item of obj.hypotheses) {
    const hypothesis = parseHypothesis(item, claimIds);
    if (!hypothesis.ok) {
      return hypothesis;
    }
    if (hypothesisIds.has(hypothesis.value.hypothesisId)) {
      return failure(
        inputFailure(
          "DUPLICATE_HYPOTHESIS_ID",
          "Duplicate hypothesisId rejected",
        ),
      );
    }
    hypothesisIds.add(hypothesis.value.hypothesisId);
    hypotheses.push(hypothesis.value);
  }

  const proposal: ReasoningProposal = {
    schemaVersion: 1,
    proposalId: proposalId.value,
    requestedOutcome: requestedOutcome.value,
    claims,
    hypotheses,
  };
  return success(proposal);
}
