/**
 * Phase 5D3 Authorized Mutation Session — staged propose / apply / validate.
 * Never mints EditAuthorization or ValidationAuthorization.
 * In-place policy: no automatic rollback.
 */

import { randomUUID } from "node:crypto";

import { loadProjectConfig } from "../../config/index.js";
import type { Result } from "../../domain/result.js";
import { failure, success } from "../../domain/result.js";
import {
  createFile,
  createMultiFilePlan,
  executeMultiFilePlan,
  prepareCreateFile,
  prepareModifyExistingFile,
  replaceExistingFile,
  validatePreparedBatchBounds,
} from "../../editing/index.js";
import { inspectPreparedEditAuthorizationCompatibility } from "../../editing/binding.js";
import type {
  KnowledgeInvalidation,
  PreparedChange,
} from "../../editing/types.js";
import { inventory } from "../../inventory/index.js";
import { repositoryEntries } from "../../inventory/membership.js";
import type { RepositoryEntry } from "../../inventory/types.js";
import { readRepositoryContent } from "../../reader/index.js";
import type { ContentObservation } from "../../reader/types.js";
import {
  digestBytes,
  persistCheckpoint,
  prepareCheckpoint,
} from "../../recovery/index.js";
import type {
  Checkpoint,
  CheckpointTargetInput,
  RecoveryStore,
} from "../../recovery/types.js";
import {
  bindReasoningProposalJson,
  checkReferenceBoundReasoningApplicability,
  createReferenceCatalog,
  describeReferenceCatalog,
  disposeReferenceCatalog,
  inspectLiveReferenceCatalogAssociation,
} from "../../reasoning/index.js";
import type { ReferenceBoundClaim, ReferenceBoundReasoning } from "../../reasoning/types.js";
import { buildRepositorySnapshot } from "../../snapshot/index.js";
import {
  inspectValidationPlanAuthorizationCompatibility,
  prepareValidationPlan,
} from "../../validation/index.js";
import { openEngineeringCycle } from "../cycle.js";
import {
  DEFAULT_POST_EDIT_BRAIN_ATTEMPTS,
  MAX_MUTATION_TARGETS,
  MAX_POST_EDIT_BRAIN_ATTEMPTS,
  MAX_POST_EDIT_CONTENT_INPUTS,
  MAX_REOBSERVATION_CONTENT_BYTES,
  MIN_MUTATION_TARGETS,
  MIN_POST_EDIT_BRAIN_ATTEMPTS,
  MUTATION_RECORD_SCHEMA_VERSION,
  PATHCODE_POLICY_FILENAME,
  bytesEqual,
  isNonemptyBoundedId,
} from "./bounds.js";
import { parseEditProposalEnvelope } from "./envelope.js";
import {
  configurationFailure,
  sessionFailure,
  type MutationSessionFailure,
} from "./failures.js";
import {
  lookupMutationReview,
  lookupValidationReview,
  nextSessionId,
  registerMutationReview,
  registerValidationReview,
} from "./registry.js";
import type {
  EngineeringMutationSession,
  EngineeringMutationSessionSpec,
  MutationArtifacts,
  MutationControlPhase,
  MutationDisposition,
  MutationGroundingRequirement,
  MutationGroundingRequirementsDocument,
  MutationReview,
  MutationSessionDescriptorView,
  MutationSessionRecord,
  MutationStrongLabel,
  MutationTargetDescription,
  MutationTargetSpec,
  MutationValidationOutcome,
  OpenMutationSessionResult,
  PostEditExecutionClaimRequirement,
  PostEditExecutionClaimRequirementsDocument,
  ReobservationDisposition,
  ValidationDisposition,
} from "./types.js";

type BoundTarget = {
  readonly targetId: string;
  readonly spec: MutationTargetSpec;
  readonly description: MutationTargetDescription;
  readonly grounding: MutationGroundingRequirement;
};

const GROUNDING_RELATIONSHIP = Object.freeze({
  reasoningClaimsMustIncludeRequiredKind: true as const,
  claimProposedSubjectMustCiteRequiredEvidenceReference: true as const,
  changeSupportingClaimIdsMustIncludeThatClaimId: true as const,
});

const POST_EDIT_CLAIM_RELATIONSHIP = Object.freeze({
  claimProposedSubjectMustCiteRequiredEvidenceReference: true as const,
});

function claimKindForSelectedCheckKinds(
  kinds: readonly string[],
): "DEFINES" | "BEHAVES" | null {
  if (kinds.length === 1 && kinds[0] === "TYPECHECK") {
    return "DEFINES";
  }
  if (kinds.length === 1 && kinds[0] === "TARGETED_TEST") {
    return "BEHAVES";
  }
  return null;
}

function buildPostEditExecutionClaimRequirements(input: {
  readonly assignments: EngineeringMutationSessionSpec["validationBlueprint"]["claimCheckAssignments"];
  readonly checks: EngineeringMutationSessionSpec["validationBlueprint"]["checks"];
  readonly catalog: import("../../reasoning/catalog.js").ReferenceCatalog;
  readonly supportingObservations: readonly ContentObservation[];
}):
  | {
      ok: true;
      document: PostEditExecutionClaimRequirementsDocument;
      referenceHandles: readonly string[];
    }
  | { ok: false; message: string } {
  const described = describeReferenceCatalog(input.catalog);
  if (!described.ok) {
    return {
      ok: false,
      message: "post-edit catalog descriptors unavailable for claim requirements",
    };
  }
  const contentByPath = new Map<string, string>();
  for (const descriptor of described.value) {
    if (
      descriptor.evidenceKind === "CONTENT" &&
      typeof descriptor.relativePath === "string" &&
      typeof descriptor.handle === "string"
    ) {
      contentByPath.set(descriptor.relativePath, descriptor.handle);
    }
  }

  let requiredEvidenceReference: string | null = null;
  for (const observation of input.supportingObservations) {
    const handle = contentByPath.get(observation.entry.relativePath);
    if (handle !== undefined) {
      requiredEvidenceReference = handle;
      break;
    }
  }
  if (requiredEvidenceReference === null) {
    return {
      ok: false,
      message:
        "post-edit CONTENT evidence handle missing for supporting observations",
    };
  }

  const checkById = new Map(
    input.checks.map((check) => [check.id, check] as const),
  );
  const requiredClaims: PostEditExecutionClaimRequirement[] = [];
  for (const row of input.assignments) {
    const kinds: string[] = [];
    for (const checkId of row.selectedCheckIds) {
      const check = checkById.get(checkId);
      if (check === undefined) {
        return {
          ok: false,
          message: `assignment references unknown check id ${checkId}`,
        };
      }
      kinds.push(check.kind);
    }
    const requiredClaimKind = claimKindForSelectedCheckKinds(kinds);
    if (requiredClaimKind === null) {
      return {
        ok: false,
        message:
          "assignment selected checks do not map to a single DEFINES/BEHAVES obligation",
      };
    }
    requiredClaims.push(
      Object.freeze({
        claimId: row.claimId,
        requiredClaimKind,
        requiredCheckKinds: Object.freeze(
          [...kinds],
        ) as PostEditExecutionClaimRequirement["requiredCheckKinds"],
        requiredEvidenceReference,
        requiredRelationship: POST_EDIT_CLAIM_RELATIONSHIP,
      }),
    );
  }

  return {
    ok: true,
    document: Object.freeze({
      title: "POST_EDIT_EXECUTION_CLAIM_REQUIREMENTS" as const,
      schemaVersion: 1 as const,
      requiredClaims: Object.freeze(requiredClaims),
    }),
    referenceHandles: Object.freeze([requiredEvidenceReference]),
  };
}

/**
 * Build the immutable model-facing grounding score for permitted targets.
 * Provider-neutral; adapters must transport the document unchanged.
 */
export function buildMutationGroundingRequirementsDocument(
  requirements: readonly MutationGroundingRequirement[],
): MutationGroundingRequirementsDocument {
  return Object.freeze({
    title: "GROUNDING REQUIREMENTS" as const,
    schemaVersion: 1 as const,
    targets: Object.freeze([...requirements]),
  });
}

type SessionState = {
  phase: MutationControlPhase;
  busy: boolean;
  stopRequested: boolean;
  proposeConsumed: boolean;
  applyConsumed: boolean;
  validateConsumed: boolean;
  mutationDisposition: MutationDisposition;
  reobservationDisposition: ReobservationDisposition;
  validationDisposition: ValidationDisposition;
  label: MutationStrongLabel;
  mutationArtifacts: MutationArtifacts | null;
  appliedAfterBytes: Map<string, Uint8Array>;
  ownedPostCatalog: ReturnType<typeof createReferenceCatalog> extends Result<infer T, unknown>
    ? T | null
    : never;
  lastAppliedReview: MutationReview | null;
  recoveryProtection: "REQUIRED" | "NONE";
  recoveryCheckpoint: Checkpoint | null;
};

function isPolicyPath(relativePath: string): boolean {
  const normalized = relativePath.replaceAll("\\", "/");
  return (
    normalized === PATHCODE_POLICY_FILENAME ||
    normalized.endsWith(`/${PATHCODE_POLICY_FILENAME}`)
  );
}

function relativePathForTarget(spec: MutationTargetSpec): string {
  if (spec.kind === "REPLACE_TEXT") {
    return spec.entry.relativePath;
  }
  const parent = spec.parentDirectory.relativePath;
  return parent === "." || parent === ""
    ? spec.leafName
    : `${parent.replace(/\/$/, "")}/${spec.leafName}`;
}

function claimById(
  reasoning: ReferenceBoundReasoning,
  claimId: string,
): ReferenceBoundClaim | undefined {
  return reasoning.claims.find((c) => c.claimId === claimId);
}

function buildRecord(
  sessionId: string,
  state: SessionState,
  appliedCount?: number,
  plannedCount?: number,
): MutationSessionRecord {
  void appliedCount;
  void plannedCount;
  return Object.freeze({
    schemaVersion: MUTATION_RECORD_SCHEMA_VERSION,
    sessionId,
    phase: state.phase,
    mutationDisposition: state.mutationDisposition,
    reobservationDisposition: state.reobservationDisposition,
    validationDisposition: state.validationDisposition,
    stopRequested: state.stopRequested,
    label: state.label,
    inPlaceNoRollbackPolicy: true as const,
    noGitCommit: true as const,
    ...(state.recoveryProtection === "REQUIRED"
      ? {
          recoveryProtection: "REQUIRED" as const,
          recoveryCheckpointId:
            state.recoveryCheckpoint === null
              ? null
              : state.recoveryCheckpoint.checkpointId,
        }
      : {}),
  });
}

function failCall(
  sessionId: string,
  state: SessionState,
  error: MutationSessionFailure,
): {
  ok: false;
  error: MutationSessionFailure;
  record: MutationSessionRecord;
} {
  state.phase = "FINALIZED";
  if (
    state.mutationDisposition === "ALL_APPLIED" ||
    state.mutationDisposition === "PARTIAL" ||
    state.mutationDisposition === "COMMITTED_FAILURE" ||
    state.mutationDisposition === "WRITE_OUTCOME_UNCONFIRMED"
  ) {
    if (state.label === "PROPOSAL_ONLY" || state.label === "SESSION_REFUSED") {
      state.label = "MUTATION_APPLIED_VALIDATION_NOT_ESTABLISHED";
    }
  }
  return {
    ok: false,
    error,
    record: buildRecord(sessionId, state),
  };
}

export function openEngineeringMutationSession(
  spec: EngineeringMutationSessionSpec,
): OpenMutationSessionResult {
  const live = inspectLiveReferenceCatalogAssociation(spec.catalog);
  if (!live.ok) {
    return failure(
      configurationFailure("CATALOG_UNAVAILABLE", live.error.message),
    );
  }
  if (
    live.value.workspace !== spec.workspace ||
    live.value.snapshot !== spec.snapshot
  ) {
    return failure(
      configurationFailure(
        "CONTEXT_MISMATCH",
        "workspace/snapshot must match live catalog association",
      ),
    );
  }

  const brainView = spec.brain.describe();
  if (brainView.disposed) {
    return failure(
      configurationFailure("BRAIN_IDENTITY_INVALID", "brain is disposed"),
    );
  }
  const profiles = brainView.capabilities.acceptedResponseProfiles;
  const hasEdit = profiles.some(
    (p) => p.kind === "ENGINEERING_EDIT_PROPOSAL_JSON" && p.schemaVersion === 1,
  );
  const hasReasoning = profiles.some(
    (p) => p.kind === "REASONING_PROPOSAL_JSON" && p.schemaVersion === 1,
  );
  if (!hasEdit || !hasReasoning) {
    return failure(
      configurationFailure(
        "UNSUPPORTED_CAPABILITY",
        "adapter must accept both ENGINEERING_EDIT_PROPOSAL_JSON and REASONING_PROPOSAL_JSON",
      ),
    );
  }

  if (
    !Array.isArray(spec.permittedTargets) ||
    spec.permittedTargets.length < MIN_MUTATION_TARGETS ||
    spec.permittedTargets.length > MAX_MUTATION_TARGETS
  ) {
    return failure(
      configurationFailure(
        "INVALID_TARGETS",
        "permittedTargets must contain 1..4 entries",
      ),
    );
  }

  const snapshotObs = new Set(spec.snapshot.contentObservations);
  const snapshotEntries = new Set(
    repositoryEntries(spec.snapshot.inventory),
  );
  // Also accept directory entries present as inventory observations
  for (const observation of spec.snapshot.inventory.observations) {
    if (
      (observation.disposition === "ADMITTED" ||
        observation.disposition === "DESCENDED") &&
      "entry" in observation
    ) {
      snapshotEntries.add(observation.entry);
    }
  }

  const descriptorsResult = describeReferenceCatalog(spec.catalog);
  if (!descriptorsResult.ok) {
    return failure(
      configurationFailure(
        "CONTEXT_MISMATCH",
        "reference catalog descriptors are unavailable for edit grounding",
      ),
    );
  }
  const catalogDescriptors = descriptorsResult.value;

  const boundTargets: BoundTarget[] = [];
  const pathKeys = new Set<string>();
  const physicalKeys = new Set<string>();

  for (let i = 0; i < spec.permittedTargets.length; i += 1) {
    const target = spec.permittedTargets[i]!;
    const targetId = `target-${i + 1}-${randomUUID().slice(0, 8)}`;
    if (target.kind === "REPLACE_TEXT") {
      if (target.contentObservation.entry !== target.entry) {
        return failure(
          configurationFailure(
            "INVALID_TARGETS",
            "REPLACE_TEXT observation must belong to the supplied entry",
          ),
        );
      }
      if (
        !snapshotObs.has(target.contentObservation) ||
        !snapshotEntries.has(target.entry)
      ) {
        return failure(
          configurationFailure(
            "CONTEXT_MISMATCH",
            "REPLACE_TEXT target is not in the original snapshot",
          ),
        );
      }
      if (target.contentObservation.kind !== "TEXT") {
        return failure(
          configurationFailure(
            "INVALID_TARGETS",
            "REPLACE_TEXT requires a TEXT ContentObservation",
          ),
        );
      }
      if (isPolicyPath(target.entry.relativePath)) {
        return failure(
          configurationFailure(
            "POLICY_TARGET_FORBIDDEN",
            "active PATHCODE.md policy source cannot be a mutation target",
          ),
        );
      }
      const pathKey = target.entry.relativePath;
      if (pathKeys.has(pathKey)) {
        return failure(
          configurationFailure(
            "DUPLICATE_OR_ALIAS_TARGET",
            "duplicate replace target path",
          ),
        );
      }
      pathKeys.add(pathKey);
      const phys = `${target.entry.canonicalPath}`;
      if (physicalKeys.has(phys)) {
        return failure(
          configurationFailure(
            "DUPLICATE_OR_ALIAS_TARGET",
            "duplicate physical replace target",
          ),
        );
      }
      physicalKeys.add(phys);
      const contentHandle = catalogDescriptors.find(
        (d) => d.evidenceKind === "CONTENT" && d.relativePath === pathKey,
      );
      if (contentHandle === undefined) {
        return failure(
          configurationFailure(
            "CONTEXT_MISMATCH",
            "REPLACE_TEXT target lacks a CONTENT catalog handle for edit grounding",
          ),
        );
      }
      const replaceGrounding: MutationGroundingRequirement = Object.freeze({
        targetId,
        mutationKind: "REPLACE_TEXT" as const,
        requiredSupportingClaimKind: "CONTENT" as const,
        requiredEvidenceReference: contentHandle.handle,
        requiredRelationship: GROUNDING_RELATIONSHIP,
      });
      boundTargets.push({
        targetId,
        spec: target,
        description: Object.freeze({
          targetId,
          kind: "REPLACE_TEXT" as const,
          relativePath: pathKey,
          evidenceHandle: contentHandle.handle,
        }),
        grounding: replaceGrounding,
      });
    } else if (target.kind === "CREATE_TEXT") {
      if (!snapshotEntries.has(target.parentDirectory)) {
        return failure(
          configurationFailure(
            "CONTEXT_MISMATCH",
            "CREATE_TEXT parent is not an admitted inventory entry",
          ),
        );
      }
      if (target.parentDirectory.physicalKind !== "DIRECTORY") {
        return failure(
          configurationFailure(
            "INVALID_TARGETS",
            "CREATE_TEXT parent must be a directory entry",
          ),
        );
      }
      if (
        typeof target.leafName !== "string" ||
        target.leafName.length < 1 ||
        target.leafName.includes("/") ||
        target.leafName.includes("\\") ||
        target.leafName.includes("\0") ||
        target.leafName === "." ||
        target.leafName === ".."
      ) {
        return failure(
          configurationFailure(
            "INVALID_TARGETS",
            "CREATE_TEXT leafName is invalid",
          ),
        );
      }
      const rel = relativePathForTarget(target);
      if (isPolicyPath(rel)) {
        return failure(
          configurationFailure(
            "POLICY_TARGET_FORBIDDEN",
            "cannot create PATHCODE.md policy source",
          ),
        );
      }
      if (pathKeys.has(rel)) {
        return failure(
          configurationFailure(
            "DUPLICATE_OR_ALIAS_TARGET",
            "duplicate create target path",
          ),
        );
      }
      pathKeys.add(rel);
      const parentPath = target.parentDirectory.relativePath;
      const parentHandle = catalogDescriptors.find(
        (d) => d.evidenceKind === "ENTRY" && d.relativePath === parentPath,
      );
      if (parentHandle === undefined) {
        return failure(
          configurationFailure(
            "CONTEXT_MISMATCH",
            "CREATE_TEXT parent lacks an ENTRY catalog handle for edit grounding",
          ),
        );
      }
      const createGrounding: MutationGroundingRequirement = Object.freeze({
        targetId,
        mutationKind: "CREATE_TEXT" as const,
        requiredSupportingClaimKind: "EXISTS" as const,
        requiredEvidenceReference: parentHandle.handle,
        requiredRelationship: GROUNDING_RELATIONSHIP,
      });
      boundTargets.push({
        targetId,
        spec: target,
        description: Object.freeze({
          targetId,
          kind: "CREATE_TEXT" as const,
          relativePath: rel,
          evidenceHandle: parentHandle.handle,
        }),
        grounding: createGrounding,
      });
    } else {
      return failure(
        configurationFailure("INVALID_TARGETS", "unknown target kind"),
      );
    }
  }

  for (const observation of spec.disclosedObservations) {
    if (!snapshotObs.has(observation)) {
      return failure(
        configurationFailure(
          "CONTEXT_MISMATCH",
          "disclosed observation is not from the original snapshot",
        ),
      );
    }
  }
  for (const observation of spec.validationBlueprint.supportingObservations) {
    if (!snapshotObs.has(observation)) {
      return failure(
        configurationFailure(
          "CONTEXT_MISMATCH",
          "validation support observation is not from the original snapshot",
        ),
      );
    }
  }

  const bp = spec.validationBlueprint;
  if (!Array.isArray(bp.checks) || bp.checks.length < 1 || bp.checks.length > 8) {
    return failure(
      configurationFailure(
        "INVALID_BLUEPRINT",
        "validation blueprint checks must be 1..8",
      ),
    );
  }
  const attempts =
    bp.maxBrainAttempts === undefined
      ? DEFAULT_POST_EDIT_BRAIN_ATTEMPTS
      : bp.maxBrainAttempts;
  if (
    !Number.isSafeInteger(attempts) ||
    attempts < MIN_POST_EDIT_BRAIN_ATTEMPTS ||
    attempts > MAX_POST_EDIT_BRAIN_ATTEMPTS
  ) {
    return failure(
      configurationFailure(
        "INVALID_BLUEPRINT",
        "maxBrainAttempts must be 1..3",
      ),
    );
  }
  if (typeof bp.postEditInstructionText !== "string" || bp.postEditInstructionText.length < 1) {
    return failure(
      configurationFailure(
        "INVALID_BLUEPRINT",
        "postEditInstructionText is required",
      ),
    );
  }

  // Early structural feasibility: prepare against original subject without writing.
  // Actual post-edit preparation still runs later.
  void attempts;

  if (
    spec.editOutputTokenBudget !== undefined &&
    (!Number.isSafeInteger(spec.editOutputTokenBudget) ||
      spec.editOutputTokenBudget < 1)
  ) {
    return failure(
      configurationFailure(
        "INVALID_BLUEPRINT",
        "editOutputTokenBudget must be a positive safe integer",
      ),
    );
  }

  const recoveryProtection = spec.recoveryProtection ?? "NONE";
  if (recoveryProtection !== "REQUIRED" && recoveryProtection !== "NONE") {
    return failure(
      configurationFailure(
        "RECOVERY_CONFIGURATION_INVALID",
        "recoveryProtection must be REQUIRED or NONE",
      ),
    );
  }
  let recoveryStore: RecoveryStore | null = null;
  if (recoveryProtection === "REQUIRED") {
    if (
      spec.recoveryStore === undefined ||
      typeof spec.recoveryStore.writeCheckpoint !== "function" ||
      typeof spec.recoveryStore.readManifestJson !== "function" ||
      typeof spec.recoveryStore.readBlob !== "function"
    ) {
      return failure(
        configurationFailure(
          "RECOVERY_CONFIGURATION_INVALID",
          "recoveryProtection REQUIRED needs a recoveryStore; refusing to downgrade to NONE",
        ),
      );
    }
    recoveryStore = spec.recoveryStore;
  }

  const sessionId = nextSessionId();
  const targetById = new Map(boundTargets.map((t) => [t.targetId, t]));
  const state: SessionState = {
    phase: "READY",
    busy: false,
    stopRequested: false,
    proposeConsumed: false,
    applyConsumed: false,
    validateConsumed: false,
    mutationDisposition: "NOT_DISPATCHED",
    reobservationDisposition: "NOT_RUN",
    validationDisposition: "NOT_AUTHORIZED",
    label: "PROPOSAL_ONLY",
    mutationArtifacts: null,
    appliedAfterBytes: new Map(),
    ownedPostCatalog: null,
    lastAppliedReview: null,
    recoveryProtection,
    recoveryCheckpoint: null,
  };

  const descriptorHandles = catalogDescriptors.map((d) => ({
    handle: d.handle,
    evidenceKind: d.evidenceKind,
    ...(d.relativePath !== undefined ? { relativePath: d.relativePath } : {}),
  }));

  const groundingDocument = buildMutationGroundingRequirementsDocument(
    boundTargets.map((t) => t.grounding),
  );
  const groundingBlockText = JSON.stringify(groundingDocument, null, 2);
  const groundingReferenceHandles = Object.freeze(
    boundTargets.map((t) => t.grounding.requiredEvidenceReference),
  );

  const session: EngineeringMutationSession = {
    describe(): MutationSessionDescriptorView {
      return {
        sessionId,
        phase: state.phase,
        targetCount: boundTargets.length,
        stopRequested: state.stopRequested,
        proposeConsumed: state.proposeConsumed,
        applyConsumed: state.applyConsumed,
        validateConsumed: state.validateConsumed,
        recoveryProtection: state.recoveryProtection,
        recoveryCheckpointId:
          state.recoveryCheckpoint === null
            ? null
            : state.recoveryCheckpoint.checkpointId,
      };
    },
    close(): void {
      state.stopRequested = true;
      if (state.ownedPostCatalog) {
        disposeReferenceCatalog(state.ownedPostCatalog);
        state.ownedPostCatalog = null;
      }
      if (
        state.phase !== "APPLYING" &&
        state.phase !== "VALIDATING" &&
        state.phase !== "REOBSERVING"
      ) {
        state.phase = "FINALIZED";
      }
    },

    async propose(task, options) {
      if (state.busy) {
        return failCall(
          sessionId,
          state,
          sessionFailure("BUSY", "mutation session is busy"),
        );
      }
      if (state.stopRequested || state.phase === "FINALIZED") {
        return failCall(
          sessionId,
          state,
          sessionFailure("SESSION_CLOSED", "session is closed"),
        );
      }
      if (state.proposeConsumed || state.phase !== "READY") {
        return failCall(
          sessionId,
          state,
          sessionFailure("INVALID_STATE", "propose already consumed or wrong phase"),
        );
      }
      if (
        typeof task.correlationId !== "string" ||
        !isNonemptyBoundedId(task.correlationId) ||
        typeof task.instructionText !== "string" ||
        task.instructionText.length < 1
      ) {
        return failCall(
          sessionId,
          state,
          sessionFailure("INVALID_TASK", "task fields are invalid"),
        );
      }

      state.busy = true;
      state.proposeConsumed = true;
      state.phase = "PROPOSING";

      try {
        if (options?.signal?.aborted || state.stopRequested) {
          return failCall(
            sessionId,
            state,
            sessionFailure("STOP_REQUESTED", "stop before brain dispatch"),
          );
        }

        const targetBlockText = JSON.stringify(
          {
            permittedTargets: boundTargets.map((t) => t.description),
            schema: {
              schemaVersion: 1,
              proposalId: "string",
              reasoningProposalJson: "ReasoningProposal-v1 JSON text",
              changes: [
                {
                  changeId: "string",
                  kind: "REPLACE_TEXT|CREATE_TEXT",
                  targetId: "session target id",
                  supportingClaimIds: ["claim-id"],
                  afterText: "complete UTF-8 after content",
                },
              ],
            },
          },
          null,
          2,
        );

        const disclosedBlocks = spec.disclosedObservations.map((obs, index) => {
          const text =
            obs.kind === "TEXT"
              ? obs.text
              : `[binary observation ${obs.entry.relativePath}]`;
          return {
            blockId: `disclose-${index + 1}`,
            role: "REFERENCE_MATERIAL" as const,
            text: text.slice(0, 32_768),
            referenceHandles: [] as string[],
          };
        });

        const invoke = await spec.brain.invoke(
          {
            correlationId: task.correlationId,
            purpose: "PROPOSE_EDIT",
            taskText: task.instructionText,
            context: {
              references: descriptorHandles,
              blocks: [
                {
                  blockId: "grounding-requirements",
                  role: "REFERENCE_MATERIAL",
                  text: groundingBlockText,
                  referenceHandles: [...groundingReferenceHandles],
                },
                {
                  blockId: "permitted-targets",
                  role: "REFERENCE_MATERIAL",
                  text: targetBlockText,
                  referenceHandles: [],
                },
                ...disclosedBlocks,
              ],
            },
            responseProfile: {
              kind: "ENGINEERING_EDIT_PROPOSAL_JSON",
              schemaVersion: 1,
            },
            ...(spec.editOutputTokenBudget === undefined
              ? {}
              : { maxOutputTokens: spec.editOutputTokenBudget }),
          },
          options?.signal ? { signal: options.signal } : undefined,
        );
        if (!invoke.ok) {
          return failCall(
            sessionId,
            state,
            sessionFailure(
              "PROPOSAL_REFUSED",
              `brain invoke failed: ${invoke.error.code}`,
            ),
          );
        }

        const envelope = parseEditProposalEnvelope(invoke.value.response.text);
        if (!envelope.ok) {
          return failCall(
            sessionId,
            state,
            sessionFailure("ENVELOPE_INVALID", envelope.error.message),
          );
        }

        const bind = await bindReasoningProposalJson(
          envelope.value.reasoningProposalJson,
          spec.catalog,
        );
        if (!bind.ok) {
          const detail =
            bind.error.kind === "REFUSAL"
              ? `${bind.error.refusal.code}:${bind.error.refusal.reason}`
              : `${bind.error.kind}:${"code" in bind.error ? bind.error.code : "?"}`;
          return failCall(
            sessionId,
            state,
            sessionFailure(
              "GATE1_FAILED",
              `Gate 1 refused embedded reasoning (${detail})`,
            ),
          );
        }
        const applicability = await checkReferenceBoundReasoningApplicability(
          bind.value.reasoning,
          spec.catalog,
        );
        if (!applicability.ok) {
          return failCall(
            sessionId,
            state,
            sessionFailure(
              "GATE1_FAILED",
              "bound reasoning is not currently applicable",
            ),
          );
        }

        const configLoad = await loadProjectConfig(spec.workspace);
        if (!configLoad.ok) {
          return failCall(
            sessionId,
            state,
            sessionFailure(
              "PREPARATION_FAILED",
              "failed to load project config for preparation",
            ),
          );
        }

        const preparedList: PreparedChange[] = [];
        const afterTexts: string[] = [];
        const changeIds: string[] = [];
        const targetIds: string[] = [];
        const kinds: Array<"REPLACE_TEXT" | "CREATE_TEXT"> = [];
        const relativePaths: string[] = [];

        for (const change of envelope.value.changes) {
          const bound = targetById.get(change.targetId);
          if (bound === undefined) {
            return failCall(
              sessionId,
              state,
              sessionFailure(
                "ENVELOPE_INVALID",
                `unknown or unselected targetId '${change.targetId}'`,
              ),
            );
          }
          if (bound.spec.kind !== change.kind) {
            return failCall(
              sessionId,
              state,
              sessionFailure(
                "ENVELOPE_INVALID",
                "change kind does not match permitted target kind",
              ),
            );
          }

          // Resolve supporting claims
          for (const claimId of change.supportingClaimIds) {
            const claim = claimById(bind.value.reasoning, claimId);
            if (claim === undefined) {
              return failCall(
                sessionId,
                state,
                sessionFailure(
                  "GATE1_FAILED",
                  `supportingClaimId '${claimId}' not in bound bundle`,
                ),
              );
            }
          }
          const primaryId = change.supportingClaimIds[0]!;
          const primary = claimById(bind.value.reasoning, primaryId)!;
          if (change.kind === "REPLACE_TEXT") {
            if (bound.spec.kind !== "REPLACE_TEXT") {
              return failCall(
                sessionId,
                state,
                sessionFailure(
                  "ENVELOPE_INVALID",
                  "change kind does not match permitted target kind",
                ),
              );
            }
            if (primary.kind !== "CONTENT") {
              return failCall(
                sessionId,
                state,
                sessionFailure(
                  "GATE1_FAILED",
                  "REPLACE_TEXT requires a supporting CONTENT claim",
                ),
              );
            }
            if (primary.subject !== bound.spec.contentObservation) {
              return failCall(
                sessionId,
                state,
                sessionFailure(
                  "GATE1_FAILED",
                  "CONTENT claim is not bound to the selected observation",
                ),
              );
            }
            const prepared = await prepareModifyExistingFile(
              bound.spec.entry,
              change.afterBytes,
              spec.workspace,
              configLoad.value,
            );
            if (!prepared.ok) {
              return failCall(
                sessionId,
                state,
                sessionFailure(
                  "PREPARATION_FAILED",
                  prepared.error.message,
                ),
              );
            }
            preparedList.push(prepared.value);
            relativePaths.push(bound.spec.entry.relativePath);
          } else {
            if (bound.spec.kind !== "CREATE_TEXT") {
              return failCall(
                sessionId,
                state,
                sessionFailure(
                  "ENVELOPE_INVALID",
                  "change kind does not match permitted target kind",
                ),
              );
            }
            if (primary.kind !== "EXISTS") {
              return failCall(
                sessionId,
                state,
                sessionFailure(
                  "GATE1_FAILED",
                  "CREATE_TEXT requires a supporting EXISTS claim",
                ),
              );
            }
            if (primary.subject !== bound.spec.parentDirectory) {
              return failCall(
                sessionId,
                state,
                sessionFailure(
                  "GATE1_FAILED",
                  "EXISTS claim is not bound to the selected parent directory",
                ),
              );
            }
            const prepared = await prepareCreateFile(
              bound.spec.parentDirectory,
              bound.spec.leafName,
              change.afterBytes,
              spec.workspace,
              configLoad.value,
            );
            if (!prepared.ok) {
              return failCall(
                sessionId,
                state,
                sessionFailure(
                  "PREPARATION_FAILED",
                  prepared.error.message,
                ),
              );
            }
            preparedList.push(prepared.value);
            relativePaths.push(prepared.value.targetRelativePath);
          }
          afterTexts.push(change.afterText);
          changeIds.push(change.changeId);
          targetIds.push(change.targetId);
          kinds.push(change.kind);
        }

        const batch = validatePreparedBatchBounds(preparedList);
        if (!batch.ok) {
          return failCall(
            sessionId,
            state,
            sessionFailure("PREPARATION_FAILED", batch.error.message),
          );
        }

        const review = registerMutationReview(sessionId, {
          preparedInOrder: preparedList,
          afterTexts,
          changeIds,
          targetIds,
          kinds,
          relativePaths,
          boundReasoning: bind.value.reasoning,
          brainReceipt: invoke.value.receipt,
          originalCatalog: spec.catalog,
          originalSnapshot: spec.snapshot,
        });

        state.phase = "AWAITING_EDIT_AUTHORIZATION";
        state.label = "PROPOSAL_ONLY";
        return success(review);
      } finally {
        state.busy = false;
      }
    },

    async apply(review, pairs, options) {
      if (state.busy) {
        return failCall(
          sessionId,
          state,
          sessionFailure("BUSY", "mutation session is busy"),
        );
      }
      if (state.stopRequested && state.phase !== "AWAITING_EDIT_AUTHORIZATION") {
        return failCall(
          sessionId,
          state,
          sessionFailure("SESSION_CLOSED", "session is closed"),
        );
      }
      if (state.applyConsumed) {
        return failCall(
          sessionId,
          state,
          sessionFailure("INVALID_STATE", "apply already consumed"),
        );
      }
      if (state.phase !== "AWAITING_EDIT_AUTHORIZATION") {
        return failCall(
          sessionId,
          state,
          sessionFailure("INVALID_STATE", "apply requires awaiting edit authorization"),
        );
      }

      const entry = lookupMutationReview(review, sessionId);
      if (entry === undefined) {
        return failCall(
          sessionId,
          state,
          sessionFailure("INVALID_REVIEW", "review is not authentic for this session"),
        );
      }
      if (
        !Array.isArray(pairs) ||
        pairs.length !== entry.preparedInOrder.length
      ) {
        return failCall(
          sessionId,
          state,
          sessionFailure(
            "INVALID_AUTHORIZATION",
            "authorization pair count must match review order",
          ),
        );
      }

      for (let i = 0; i < pairs.length; i += 1) {
        const pair = pairs[i]!;
        if (pair.prepared !== entry.preparedInOrder[i]) {
          return failCall(
            sessionId,
            state,
            sessionFailure(
              "INVALID_AUTHORIZATION",
              "prepared object identity/order mismatch",
            ),
          );
        }
        const compat = inspectPreparedEditAuthorizationCompatibility(
          pair.authorization,
          pair.prepared,
        );
        if (!compat.ok) {
          return failCall(
            sessionId,
            state,
            sessionFailure(
              "INVALID_AUTHORIZATION",
              compat.error.message,
            ),
          );
        }
      }

      // Reserve apply before awaits
      state.busy = true;
      state.applyConsumed = true;
      state.phase = "APPLYING";

      try {
        if (state.stopRequested || options?.signal?.aborted) {
          state.mutationDisposition = "NOT_DISPATCHED";
          return failCall(
            sessionId,
            state,
            sessionFailure("STOP_REQUESTED", "stop before mutation dispatch"),
          );
        }

        const applicability = await checkReferenceBoundReasoningApplicability(
          entry.boundReasoning,
          spec.catalog,
        );
        if (!applicability.ok) {
          state.mutationDisposition = "NOT_DISPATCHED";
          return failCall(
            sessionId,
            state,
            sessionFailure(
              "MUTATION_REFUSED",
              "Gate 1 applicability failed before mutation",
            ),
          );
        }

        // Phase 6A recovery floor. Nothing below this point may write to the
        // repository until a durable checkpoint has been captured, persisted
        // and read back. A failure here is terminal with ZERO writes.
        if (recoveryProtection === "REQUIRED") {
          if (recoveryStore === null) {
            state.mutationDisposition = "NOT_DISPATCHED";
            state.label = "MUTATION_NOT_DISPATCHED";
            return failCall(
              sessionId,
              state,
              sessionFailure(
                "RECOVERY_CHECKPOINT_NOT_ESTABLISHED",
                "recovery protection is REQUIRED but no recovery store is bound",
              ),
            );
          }
          const established = await establishRecoveryCheckpoint({
            workspace: spec.workspace,
            store: recoveryStore,
            sessionId,
            reviewId: review.reviewId,
            preparedInOrder: entry.preparedInOrder,
          });
          if (!established.ok) {
            state.mutationDisposition = "NOT_DISPATCHED";
            state.label = "MUTATION_NOT_DISPATCHED";
            return failCall(
              sessionId,
              state,
              sessionFailure(
                "RECOVERY_CHECKPOINT_NOT_ESTABLISHED",
                established.message,
              ),
            );
          }
          state.recoveryCheckpoint = established.checkpoint;
        }

        const knowledgeInvalidations: KnowledgeInvalidation[] = [];
        let appliedCount = 0;
        const replaceExistingFileFn =
          spec.projectWriteEffects?.replaceExistingFile ?? replaceExistingFile;
        const createFileFn =
          spec.projectWriteEffects?.createFile ?? createFile;
        const executeMultiFilePlanFn =
          spec.projectWriteEffects?.executeMultiFilePlan ?? executeMultiFilePlan;

        try {
          if (pairs.length === 1) {
            const pair = pairs[0]!;
            if (pair.prepared.action === "MODIFY_EXISTING_FILE") {
              const result = await replaceExistingFileFn(
                pair.authorization,
                pair.prepared,
              );
              if (result.outcome === "SUCCESS") {
                appliedCount = 1;
                knowledgeInvalidations.push(result.knowledgeInvalidation);
                state.mutationDisposition = "ALL_APPLIED";
                state.mutationArtifacts = {
                  disposition: "ALL_APPLIED",
                  singleFile: {
                    kind: "REPLACE",
                    prepared: pair.prepared,
                    result,
                  },
                  knowledgeInvalidations,
                  appliedCount: 1,
                  plannedCount: 1,
                };
                state.appliedAfterBytes.set(
                  entry.targetIds[0]!,
                  Uint8Array.from(pair.prepared.proposedBytes),
                );
              } else if (result.outcome === "COMMITTED_FAILURE") {
                state.mutationDisposition = "COMMITTED_FAILURE";
                state.mutationArtifacts = {
                  disposition: "COMMITTED_FAILURE",
                  singleFile: {
                    kind: "REPLACE",
                    prepared: pair.prepared,
                    result,
                  },
                  knowledgeInvalidations,
                  appliedCount: 0,
                  plannedCount: 1,
                };
                state.label = "MUTATION_PARTIAL_OR_FAILED";
                state.phase = "FINALIZED";
                return failCall(
                  sessionId,
                  state,
                  sessionFailure(
                    "MUTATION_COMMITTED_FAILURE",
                    "single-file replace reached COMMITTED_FAILURE",
                    { mutationOutcome: state.mutationArtifacts },
                  ),
                );
              } else {
                state.mutationDisposition = "REFUSED";
                state.mutationArtifacts = {
                  disposition: "REFUSED",
                  singleFile: {
                    kind: "REPLACE",
                    prepared: pair.prepared,
                    result,
                  },
                  knowledgeInvalidations,
                  appliedCount: 0,
                  plannedCount: 1,
                };
                state.label = "MUTATION_NOT_DISPATCHED";
                state.phase = "FINALIZED";
                return failCall(
                  sessionId,
                  state,
                  sessionFailure(
                    "MUTATION_REFUSED",
                    `replace refused: ${result.outcome}`,
                    { mutationOutcome: state.mutationArtifacts },
                  ),
                );
              }
            } else {
              const result = await createFileFn(pair.authorization, pair.prepared);
              if (result.outcome === "SUCCESS") {
                appliedCount = 1;
                knowledgeInvalidations.push(result.knowledgeInvalidation);
                state.mutationDisposition = "ALL_APPLIED";
                state.mutationArtifacts = {
                  disposition: "ALL_APPLIED",
                  singleFile: {
                    kind: "CREATE",
                    prepared: pair.prepared,
                    result,
                  },
                  knowledgeInvalidations,
                  appliedCount: 1,
                  plannedCount: 1,
                };
                state.appliedAfterBytes.set(
                  entry.targetIds[0]!,
                  Uint8Array.from(pair.prepared.proposedBytes),
                );
              } else if (result.outcome === "COMMITTED_FAILURE") {
                state.mutationDisposition = "COMMITTED_FAILURE";
                state.mutationArtifacts = {
                  disposition: "COMMITTED_FAILURE",
                  singleFile: {
                    kind: "CREATE",
                    prepared: pair.prepared,
                    result,
                  },
                  knowledgeInvalidations,
                  appliedCount: 0,
                  plannedCount: 1,
                };
                state.label = "MUTATION_PARTIAL_OR_FAILED";
                state.phase = "FINALIZED";
                return failCall(
                  sessionId,
                  state,
                  sessionFailure(
                    "MUTATION_COMMITTED_FAILURE",
                    "single-file create reached COMMITTED_FAILURE",
                    { mutationOutcome: state.mutationArtifacts },
                  ),
                );
              } else {
                state.mutationDisposition = "REFUSED";
                state.mutationArtifacts = {
                  disposition: "REFUSED",
                  singleFile: {
                    kind: "CREATE",
                    prepared: pair.prepared,
                    result,
                  },
                  knowledgeInvalidations,
                  appliedCount: 0,
                  plannedCount: 1,
                };
                state.label = "MUTATION_NOT_DISPATCHED";
                state.phase = "FINALIZED";
                return failCall(
                  sessionId,
                  state,
                  sessionFailure(
                    "MUTATION_REFUSED",
                    `create refused: ${result.outcome}`,
                    { mutationOutcome: state.mutationArtifacts },
                  ),
                );
              }
            }
          } else {
            const plan = createMultiFilePlan(
              pairs.map((p) => ({
                prepared: p.prepared,
                authorization: p.authorization,
              })),
            );
            if (!plan.ok) {
              state.mutationDisposition = "REFUSED";
              return failCall(
                sessionId,
                state,
                sessionFailure("MUTATION_REFUSED", plan.error.message),
              );
            }
            const multi = await executeMultiFilePlanFn(plan.value);
            knowledgeInvalidations.push(...multi.knowledgeInvalidations);
            appliedCount = multi.targetOutcomes.filter(
              (t) => t.kind === "APPLIED",
            ).length;
            if (multi.planStatus === "ALL_APPLIED") {
              state.mutationDisposition = "ALL_APPLIED";
              for (let i = 0; i < pairs.length; i += 1) {
                state.appliedAfterBytes.set(
                  entry.targetIds[i]!,
                  Uint8Array.from(pairs[i]!.prepared.proposedBytes),
                );
              }
            } else if (multi.planStatus === "PARTIALLY_COMMITTED") {
              state.mutationDisposition = "PARTIAL";
              state.mutationArtifacts = {
                disposition: "PARTIAL",
                multiFile: multi,
                knowledgeInvalidations,
                appliedCount,
                plannedCount: pairs.length,
              };
              state.label = "MUTATION_PARTIAL_OR_FAILED";
              state.phase = "FINALIZED";
              return failCall(
                sessionId,
                state,
                sessionFailure(
                  "MUTATION_PARTIAL",
                  "multi-file plan partially committed; validation not continued",
                  { mutationOutcome: state.mutationArtifacts },
                ),
              );
            } else {
              state.mutationDisposition = "REFUSED";
              state.mutationArtifacts = {
                disposition: "REFUSED",
                multiFile: multi,
                knowledgeInvalidations,
                appliedCount,
                plannedCount: pairs.length,
              };
              state.label = "MUTATION_NOT_DISPATCHED";
              state.phase = "FINALIZED";
              return failCall(
                sessionId,
                state,
                sessionFailure(
                  "MUTATION_REFUSED",
                  `multi-file plan status ${multi.planStatus}`,
                  { mutationOutcome: state.mutationArtifacts },
                ),
              );
            }
            state.mutationArtifacts = {
              disposition: "ALL_APPLIED",
              multiFile: multi,
              knowledgeInvalidations,
              appliedCount,
              plannedCount: pairs.length,
            };
          }
        } catch (error) {
          state.mutationDisposition = "WRITE_OUTCOME_UNCONFIRMED";
          state.label = "MUTATION_PARTIAL_OR_FAILED";
          state.phase = "FINALIZED";
          return failCall(
            sessionId,
            state,
            sessionFailure(
              "WRITE_OUTCOME_UNCONFIRMED",
              `mutation dispatch threw without confirmed outcome: ${
                error instanceof Error ? error.message : "unknown"
              }`,
              { mutationOutcome: state.mutationArtifacts },
            ),
          );
        }

        if (state.stopRequested) {
          // Drain already completed for the owner operation.
          state.phase = "FINALIZED";
          state.label = "MUTATION_APPLIED_VALIDATION_NOT_ESTABLISHED";
          return failCall(
            sessionId,
            state,
            sessionFailure(
              "STOP_REQUESTED",
              "stop after mutation drain; no re-observation",
              { mutationOutcome: state.mutationArtifacts },
            ),
          );
        }

        if (afterMutationHook !== undefined) {
          await afterMutationHook();
        }

        // Re-observe
        state.phase = "REOBSERVING";
        const reobs = await reobserveAfterApply({
          workspace: spec.workspace,
          blueprint: spec.validationBlueprint,
          reviewEntry: entry,
          appliedAfterBytes: state.appliedAfterBytes,
          originalSupport: spec.validationBlueprint.supportingObservations,
          disclosed: spec.disclosedObservations,
          bypassAfterByteCheck: false,
          authoritativeContentReader: spec.authoritativeContentReader,
        });
        if (!reobs.ok) {
          state.reobservationDisposition = "FAILED";
          state.validationDisposition = "NOT_RUN";
          state.label = "MUTATION_APPLIED_VALIDATION_NOT_ESTABLISHED";
          state.phase = "FINALIZED";
          if (reobs.ownedCatalog) {
            state.ownedPostCatalog = reobs.ownedCatalog;
          }
          return failCall(
            sessionId,
            state,
            sessionFailure("REOBSERVATION_FAILED", reobs.message, {
              mutationOutcome: state.mutationArtifacts,
            }),
          );
        }

        state.reobservationDisposition = "SUCCEEDED";
        state.ownedPostCatalog = reobs.catalog;
        const validationReview = registerValidationReview(sessionId, {
          plan: reobs.plan,
          snapshot: reobs.snapshot,
          catalog: reobs.catalog,
          assignments: spec.validationBlueprint.claimCheckAssignments,
          mutationArtifacts: state.mutationArtifacts!,
          afterByteComparisons: reobs.comparisons,
          ownedCatalog: reobs.catalog,
        });
        state.lastAppliedReview = review;
        state.phase = "AWAITING_VALIDATION_AUTHORIZATION";
        state.validationDisposition = "NOT_AUTHORIZED";
        state.label = "MUTATION_APPLIED_VALIDATION_NOT_ESTABLISHED";
        return success(validationReview);
      } finally {
        state.busy = false;
      }
    },

    async validate(validationReview, authorization, options) {
      if (state.busy) {
        return failCall(
          sessionId,
          state,
          sessionFailure("BUSY", "mutation session is busy"),
        );
      }
      if (state.validateConsumed) {
        return failCall(
          sessionId,
          state,
          sessionFailure("INVALID_STATE", "validate already consumed"),
        );
      }
      if (state.phase !== "AWAITING_VALIDATION_AUTHORIZATION") {
        return failCall(
          sessionId,
          state,
          sessionFailure(
            "INVALID_STATE",
            "validate requires awaiting validation authorization",
          ),
        );
      }
      if (state.stopRequested) {
        return failCall(
          sessionId,
          state,
          sessionFailure("STOP_REQUESTED", "stop before validation"),
        );
      }

      const entry = lookupValidationReview(validationReview, sessionId);
      if (entry === undefined) {
        return failCall(
          sessionId,
          state,
          sessionFailure(
            "INVALID_REVIEW",
            "validation review is not authentic for this session",
          ),
        );
      }
      const compat = inspectValidationPlanAuthorizationCompatibility(
        entry.plan,
        authorization,
      );
      if (!compat.ok) {
        return failCall(
          sessionId,
          state,
          sessionFailure(
            "INVALID_AUTHORIZATION",
            compat.error.message,
          ),
        );
      }

      state.busy = true;
      state.validateConsumed = true;
      state.phase = "VALIDATING";
      state.validationDisposition = "NOT_RUN";

      try {
        if (options?.signal?.aborted || state.stopRequested) {
          state.validationDisposition = "INTERRUPTED";
          return failCall(
            sessionId,
            state,
            sessionFailure("STOP_REQUESTED", "stop before conductor"),
          );
        }

        const claimRequirements = buildPostEditExecutionClaimRequirements({
          assignments: entry.assignments,
          checks: spec.validationBlueprint.checks,
          catalog: entry.catalog,
          supportingObservations:
            spec.validationBlueprint.supportingObservations,
        });
        if (!claimRequirements.ok) {
          state.validationDisposition = "FAILED";
          state.phase = "FINALIZED";
          return failCall(
            sessionId,
            state,
            sessionFailure(
              "VALIDATION_FAILED",
              claimRequirements.message,
              { mutationOutcome: state.mutationArtifacts },
            ),
          );
        }

        const cycleOpen = openEngineeringCycle(
          {
            mode: "BIND_AND_VALIDATE",
            workspace: spec.workspace,
            snapshot: entry.snapshot,
            catalog: entry.catalog,
            brain: spec.brain,
            validationPlan: entry.plan,
            validationAuthorization: authorization,
            claimCheckAssignments: entry.assignments,
          },
          {
            maxBrainAttempts:
              spec.validationBlueprint.maxBrainAttempts ??
              DEFAULT_POST_EDIT_BRAIN_ATTEMPTS,
          },
        );
        if (!cycleOpen.ok) {
          state.validationDisposition = "FAILED";
          state.phase = "FINALIZED";
          return failCall(
            sessionId,
            state,
            sessionFailure(
              "VALIDATION_FAILED",
              cycleOpen.error.message,
              { mutationOutcome: state.mutationArtifacts },
            ),
          );
        }

        const correlationId = `post-edit-${randomUUID().slice(0, 8)}`;
        const run = await cycleOpen.value.run(
          {
            correlationId,
            instructionText: spec.validationBlueprint.postEditInstructionText,
            contextBlocks: [
              {
                blockId: "post-edit-execution-claim-requirements",
                role: "REFERENCE_MATERIAL",
                text: JSON.stringify(claimRequirements.document, null, 2),
                referenceHandles: [...claimRequirements.referenceHandles],
              },
              ...spec.validationBlueprint.postEditContextBlocks,
            ],
          },
          options?.signal ? { signal: options.signal } : undefined,
        );
        cycleOpen.value.close();

        if (!run.ok) {
          state.validationDisposition = "FAILED";
          state.phase = "FINALIZED";
          state.label = "MUTATION_APPLIED_VALIDATION_NOT_ESTABLISHED";
          return failCall(
            sessionId,
            state,
            sessionFailure("VALIDATION_FAILED", run.error.message, {
              mutationOutcome: state.mutationArtifacts,
            }),
          );
        }

        const cycle = run.value;
        const accepted =
          cycle.record.terminalState === "SUBSTANTIATED" &&
          state.mutationDisposition === "ALL_APPLIED" &&
          state.reobservationDisposition === "SUCCEEDED" &&
          !state.stopRequested;

        // P3 defense: require SUBSTANTIATED — do not accept BOUND.
        if (accepted) {
          state.validationDisposition = "ACCEPTED";
          state.label = "MUTATION_APPLIED_AND_CONFIGURED_VALIDATION_ACCEPTED";
        } else {
          state.validationDisposition = "NOT_ACCEPTED";
          state.label = "MUTATION_APPLIED_VALIDATION_NOT_ESTABLISHED";
        }
        state.phase = "FINALIZED";

        const outcome: MutationValidationOutcome = {
          label: state.label,
          record: buildRecord(sessionId, state),
          artifacts: {
            mutation: state.mutationArtifacts!,
            validationReview: validationReview.view,
            cycle,
          },
        };
        return success(outcome);
      } finally {
        state.busy = false;
      }
    },
  };

  return success(session);
}

/**
 * Phase 6A: capture, persist and read-back-verify the durable checkpoint for a
 * review that is about to be applied.
 *
 * For REPLACE the exact current bytes are captured and must still match the
 * before-state the change was prepared against. For CREATE absence is proven
 * again here, not merely inherited from preparation. Any failure is reported to
 * the caller, which refuses the mutation outright — there is no downgrade path.
 */
async function establishRecoveryCheckpoint(input: {
  workspace: EngineeringMutationSessionSpec["workspace"];
  store: RecoveryStore;
  sessionId: string;
  reviewId: string;
  preparedInOrder: readonly PreparedChange[];
}): Promise<
  { ok: true; checkpoint: Checkpoint } | { ok: false; message: string }
> {
  const configLoad = await loadProjectConfig(input.workspace);
  if (!configLoad.ok) {
    return {
      ok: false,
      message: "checkpoint capture could not load project configuration",
    };
  }
  const root = await input.workspace.canonicalize(".");
  if (!root.ok) {
    return {
      ok: false,
      message: "checkpoint capture could not canonicalize the workspace root",
    };
  }

  const targets: CheckpointTargetInput[] = [];
  for (const prepared of input.preparedInOrder) {
    if (prepared.action === "MODIFY_EXISTING_FILE") {
      const relativePath = prepared.target.relativePath;
      const canonical = await input.workspace.canonicalize(relativePath);
      if (!canonical.ok || canonical.value !== prepared.target.canonicalPath) {
        return {
          ok: false,
          message: `checkpoint capture: '${relativePath}' no longer resolves to its prepared canonical path`,
        };
      }
      const read = await readRepositoryContent(
        prepared.target,
        input.workspace,
        configLoad.value,
      );
      if (!read.ok || read.value.status !== "READ") {
        return {
          ok: false,
          message: `checkpoint capture: pre-state of '${relativePath}' is unreadable`,
        };
      }
      const observation = read.value.observation;
      if (observation.kind !== "TEXT") {
        return {
          ok: false,
          message: `checkpoint capture: '${relativePath}' is not TEXT`,
        };
      }
      if (observation.fingerprint.hex !== prepared.beforeFingerprint.hex) {
        return {
          ok: false,
          message: `checkpoint capture: '${relativePath}' changed since preparation`,
        };
      }
      const preBytes = Buffer.from(observation.text, "utf8");
      if (digestBytes(preBytes).hex !== observation.fingerprint.hex) {
        return {
          ok: false,
          message: `checkpoint capture: byte fidelity of '${relativePath}' could not be proved`,
        };
      }
      targets.push({
        kind: "REPLACE_TEXT",
        relativePath,
        targetCanonicalPath: prepared.target.canonicalPath,
        preBytes: new Uint8Array(
          preBytes.buffer,
          preBytes.byteOffset,
          preBytes.byteLength,
        ),
        intendedPostBytes: prepared.proposedBytes,
      });
      continue;
    }

    const absence = await input.workspace.canonicalize(
      prepared.targetRelativePath,
    );
    if (absence.ok || absence.error.code !== "PATH_NOT_FOUND") {
      return {
        ok: false,
        message: `checkpoint capture: create target '${prepared.targetRelativePath}' is no longer absent`,
      };
    }
    const parent = await input.workspace.canonicalize(
      prepared.parent.relativePath,
    );
    if (!parent.ok || parent.value !== prepared.parent.canonicalPath) {
      return {
        ok: false,
        message: `checkpoint capture: parent of '${prepared.targetRelativePath}' no longer resolves to its prepared canonical path`,
      };
    }
    targets.push({
      kind: "CREATE_TEXT",
      relativePath: prepared.targetRelativePath,
      parentCanonicalPath: prepared.parent.canonicalPath,
      leafName: prepared.leafName,
      intendedPostBytes: prepared.proposedBytes,
    });
  }

  const preparedCheckpoint = prepareCheckpoint({
    workspaceRoot: root.value,
    sessionId: input.sessionId,
    reviewId: input.reviewId,
    targets,
  });
  if (!preparedCheckpoint.ok) {
    return {
      ok: false,
      message: `checkpoint capture refused: ${preparedCheckpoint.error.message}`,
    };
  }
  const persisted = await persistCheckpoint(
    preparedCheckpoint.value,
    input.store,
  );
  if (!persisted.ok) {
    return {
      ok: false,
      message: `checkpoint persistence refused: ${persisted.error.message}`,
    };
  }
  return { ok: true, checkpoint: persisted.value };
}

async function reobserveAfterApply(input: {
  workspace: EngineeringMutationSessionSpec["workspace"];
  blueprint: EngineeringMutationSessionSpec["validationBlueprint"];
  reviewEntry: NonNullable<ReturnType<typeof lookupMutationReview>>;
  appliedAfterBytes: Map<string, Uint8Array>;
  originalSupport: readonly ContentObservation[];
  disclosed: readonly ContentObservation[];
  bypassAfterByteCheck: boolean;
  authoritativeContentReader?: EngineeringMutationSessionSpec["authoritativeContentReader"];
}): Promise<
  | {
      ok: true;
      snapshot: import("../../snapshot/types.js").RepositorySnapshot;
      catalog: import("../../reasoning/catalog.js").ReferenceCatalog;
      plan: import("../../validation/types.js").PreparedValidationPlan;
      comparisons: readonly {
        readonly targetId: string;
        readonly matched: true;
        readonly relativePath: string;
      }[];
    }
  | {
      ok: false;
      message: string;
      ownedCatalog?: import("../../reasoning/catalog.js").ReferenceCatalog;
    }
> {
  const configLoad = await loadProjectConfig(input.workspace);
  if (!configLoad.ok) {
    return { ok: false, message: "post-edit config load failed" };
  }
  const inv = await inventory(input.workspace, configLoad.value);
  if (!inv.ok) {
    return { ok: false, message: "post-edit inventory failed" };
  }

  const entriesByPath = new Map<string, RepositoryEntry>();
  for (const observation of inv.value.observations) {
    if (
      (observation.disposition === "ADMITTED" ||
        observation.disposition === "DESCENDED") &&
      "entry" in observation
    ) {
      entriesByPath.set(observation.entry.relativePath, observation.entry);
    }
  }

  const requiredPaths = new Set<string>();
  for (const path of input.reviewEntry.relativePaths) {
    requiredPaths.add(path);
  }
  for (const obs of input.originalSupport) {
    requiredPaths.add(obs.entry.relativePath);
  }
  for (const obs of input.disclosed) {
    requiredPaths.add(obs.entry.relativePath);
  }
  if (requiredPaths.size > MAX_POST_EDIT_CONTENT_INPUTS) {
    return {
      ok: false,
      message: "post-edit required content inputs exceed V1 ceiling",
    };
  }

  const contentObservations: ContentObservation[] = [];
  let totalBytes = 0;
  const comparisons: {
    targetId: string;
    matched: true;
    relativePath: string;
  }[] = [];

  const readAuthoritativeContent = async (
    entry: RepositoryEntry,
  ): Promise<
    | { ok: true; observation: ContentObservation }
    | { ok: false; message: string }
  > => {
    if (input.authoritativeContentReader !== undefined) {
      const read = await input.authoritativeContentReader(
        input.workspace,
        configLoad.value,
        entry.relativePath,
      );
      if (!read.ok) {
        return {
          ok: false,
          message: `failed to re-read '${entry.relativePath}'`,
        };
      }
      return { ok: true, observation: read.value };
    }
    const read = await readRepositoryContent(
      entry,
      input.workspace,
      configLoad.value,
    );
    if (!read.ok || read.value.status !== "READ") {
      return {
        ok: false,
        message: `failed to re-read '${entry.relativePath}'`,
      };
    }
    return { ok: true, observation: read.value.observation };
  };

  for (let i = 0; i < input.reviewEntry.relativePaths.length; i += 1) {
    const relativePath = input.reviewEntry.relativePaths[i]!;
    const targetId = input.reviewEntry.targetIds[i]!;
    const entry = entriesByPath.get(relativePath);
    if (entry === undefined || entry.physicalKind !== "FILE") {
      return {
        ok: false,
        message: `applied target '${relativePath}' not admitted after write`,
      };
    }
    const read = await readAuthoritativeContent(entry);
    if (!read.ok) {
      return {
        ok: false,
        message: `failed to re-read applied target '${relativePath}'`,
      };
    }
    const observation = read.observation;
    if (observation.kind !== "TEXT") {
      return {
        ok: false,
        message: `applied target '${relativePath}' is not TEXT after write`,
      };
    }
    totalBytes += observation.byteLength;
    if (totalBytes > MAX_REOBSERVATION_CONTENT_BYTES) {
      return { ok: false, message: "re-observation content budget exceeded" };
    }
    const expected = input.appliedAfterBytes.get(targetId);
    if (expected === undefined) {
      return { ok: false, message: "missing expected after-bytes for target" };
    }
    const observedBytes = Buffer.from(observation.text, "utf8");
    if (!input.bypassAfterByteCheck && !bytesEqual(expected, observedBytes)) {
      return {
        ok: false,
        message: `after-byte mismatch for '${relativePath}'`,
      };
    }
    // Prefer fingerprint when available from prepared
    const prepared = input.reviewEntry.preparedInOrder[i]!;
    if (
      !input.bypassAfterByteCheck &&
      observation.fingerprint.hex !== prepared.afterFingerprint.hex
    ) {
      return {
        ok: false,
        message: `after-fingerprint mismatch for '${relativePath}'`,
      };
    }
    contentObservations.push(observation);
    comparisons.push({ targetId, matched: true, relativePath });
  }

  // Support / disclosed continuity for unchanged paths
  const changedPaths = new Set(input.reviewEntry.relativePaths);
  for (const original of [...input.originalSupport, ...input.disclosed]) {
    if (changedPaths.has(original.entry.relativePath)) {
      continue;
    }
    const entry = entriesByPath.get(original.entry.relativePath);
    if (entry === undefined) {
      return {
        ok: false,
        message: `support input '${original.entry.relativePath}' missing after edit`,
      };
    }
    const read = await readAuthoritativeContent(entry);
    if (!read.ok) {
      return {
        ok: false,
        message: `support input '${original.entry.relativePath}' unreadable after edit`,
      };
    }
    const observation = read.observation;
    if (
      original.kind === "TEXT" &&
      (observation.kind !== "TEXT" ||
        observation.fingerprint.hex !== original.fingerprint.hex)
    ) {
      return {
        ok: false,
        message: `untouched support input '${original.entry.relativePath}' changed concurrently`,
      };
    }
    totalBytes += observation.byteLength;
    if (totalBytes > MAX_REOBSERVATION_CONTENT_BYTES) {
      return { ok: false, message: "re-observation content budget exceeded" };
    }
    contentObservations.push(observation);
  }

  const snapshotResult = buildRepositorySnapshot({
    workspace: input.workspace,
    config: configLoad.value,
    inventory: inv.value,
    contentObservations,
  });
  if (!snapshotResult.ok) {
    return { ok: false, message: snapshotResult.error.message };
  }

  // Collect entries for catalog: changed files + support
  const catalogEntries: RepositoryEntry[] = [];
  for (const obs of contentObservations) {
    catalogEntries.push(obs.entry);
  }

  const catalogResult = createReferenceCatalog({
    workspace: input.workspace,
    snapshot: snapshotResult.value,
    selection: {
      entries: catalogEntries,
      contentObservations,
    },
  });
  if (!catalogResult.ok) {
    return { ok: false, message: catalogResult.error.message };
  }

  const declared = contentObservations.filter((obs) =>
    input.blueprint.supportingObservations.some(
      (s) => s.entry.relativePath === obs.entry.relativePath,
    ) ||
    input.reviewEntry.relativePaths.includes(obs.entry.relativePath),
  );

  const planResult = await prepareValidationPlan(
    input.blueprint.checks,
    {
      snapshot: snapshotResult.value,
      declaredObservations: declared.length > 0 ? declared : contentObservations,
    },
    input.workspace,
    configLoad.value,
  );
  if (!planResult.ok) {
    disposeReferenceCatalog(catalogResult.value);
    return {
      ok: false,
      message: planResult.error.message,
    };
  }

  return {
    ok: true,
    snapshot: snapshotResult.value,
    catalog: catalogResult.value,
    plan: planResult.value,
    comparisons,
  };
}

export function summarizeMutationSession(
  record: MutationSessionRecord,
  extras?: { appliedCount?: number; plannedCount?: number },
): import("./types.js").MutationSessionSummary {
  return {
    sessionId: record.sessionId,
    phase: record.phase,
    mutationDisposition: record.mutationDisposition,
    reobservationDisposition: record.reobservationDisposition,
    validationDisposition: record.validationDisposition,
    label: record.label,
    stopRequested: record.stopRequested,
    appliedCount: extras?.appliedCount ?? null,
    plannedCount: extras?.plannedCount ?? null,
    inPlaceNoRollbackPolicy: true,
    noGitCommit: true,
  };
}

/** Test-only hook used by P2 falsification. */
export async function __testOnly_reobserveWithBypass(
  ...args: Parameters<typeof reobserveAfterApply>
): Promise<ReturnType<typeof reobserveAfterApply>> {
  const [input] = args;
  return reobserveAfterApply({ ...input, bypassAfterByteCheck: true });
}

/** Test-only: run between mutation commit and re-observation. */
let afterMutationHook: (() => void | Promise<void>) | undefined;

export function __testOnly_setAfterMutationHook(
  hook: (() => void | Promise<void>) | undefined,
): void {
  afterMutationHook = hook;
}
