/**
 * @typedef {'PROVEN'|'UNMET'|'UNKNOWN'} CriterionStatus
 * @typedef {'SATISFIED'|'VIOLATED'|'UNKNOWN'} RequirementStatus
 * @typedef {'brief'|'engineer'|'evaluate'|'challenge'} BuildTaskKind
 * @typedef {'selected'|'dispatched'|'terminal_seen'|'consumed'} ChildDispatchState
 * @typedef {'running'|'paused'|'blocked'|'complete'|'awaiting_review'} BuildLoopStatus
 *
 * @typedef {object} EvidenceRef
 * @property {'git'|'fs'|'check'|'runtime'|'report'|'validation'} kind
 * @property {string} ref
 * @property {string} bindingId
 * @property {string} [taskId]
 * @property {string|null} [headSha]
 * @property {string} [dirtyFingerprint]
 * @property {string} [configFingerprint]
 * @property {string} [toolchainHint]
 * @property {string} [runtimeObservationAt]
 * @property {string[]} [scope]
 * @property {string} observedAt
 *
 * @typedef {object} ExplicitRequirement
 * @property {string} id
 * @property {string} statement
 * @property {boolean} required
 * @property {RequirementStatus} status
 * @property {EvidenceRef[]} evidence
 *
 * @typedef {object} OutcomeCriterion
 * @property {string} id
 * @property {string} statement
 * @property {boolean} required
 * @property {CriterionStatus} status
 * @property {EvidenceRef[]} evidence
 * @property {string} [challengedByTaskId]
 * @property {string} [updatedAt]
 *
 * @typedef {'build-created'|'existing-project'} OriginKind
 *
 * @typedef {object} ProjectBinding
 * @property {string} bindingId
 * @property {string} projectRoot
 * @property {string} [roleHint]
 * @property {string} [createdByTaskId]
 * @property {boolean} [originGitInit]
 * @property {OriginKind} [originKind]
 * @property {string} [activeWorktreePath] Latest engineer task worktree when distinct from projectRoot
 * @property {string} [activeTaskBranch] Task branch carrying unmerged engineer commits (e.g. README)
 *
 * @typedef {object} ConversationMessage
 * @property {string} id
 * @property {'user'|'assistant'|'system'} role
 * @property {string} text
 * @property {string} at
 * @property {object} [element]
 * @property {string} [kind]
 * @property {'queued'|'incorporated'|'preparing'|'applying'|'being_applied'|'applied'|'failed'|'review'|'discarded'|'superseded'} [status]
 * @property {number} [intentRevision]
 *
 * @typedef {object} BuildArtifact
 * @property {string} bindingId
 * @property {string} projectRoot
 * @property {'web'|'api'|'cli'|'desktop'|'mobile'|'service'|'multi_service'|'unknown'} kind
 * @property {string|null} framework
 * @property {string|null} packageManager
 * @property {string|null} startCommand
 * @property {string|null} devCommand
 * @property {string[]} testCommands
 * @property {string|null} buildCommand
 * @property {{ capability: string, mode: string, url?: string|null, port?: number|null, status: string }} preview
 * @property {{ status: string, processId?: string|null, startedAt?: string|null, health?: string|null }} runtime
 * @property {string} [detectedAt]
 * @property {string[]} [signals]
 *
 * @typedef {object} BuildChild
 * @property {string} taskId
 * @property {string} bindingId
 * @property {BuildTaskKind} kind
 * @property {string} actionId
 * @property {ChildDispatchState} dispatchState
 * @property {string} [objective]
 * @property {object[]} [referenceInputs] Factual P7 reference identities selected for this child.
 * @property {string} [resultFingerprint]
 * @property {string} [terminalAt]
 * @property {string} [classification]
 * @property {string} [selectedAt]
 * @property {string} [dispatchedAt]
 * @property {string} [consumedAt]
 * @property {number} [intentRevision]
 * @property {string|null} [authoritativeSha]
 * @property {boolean} [semanticProofAccepted]
 *
 * @typedef {object} BuildHypotheses
 * @property {string} [architectureNotes]
 * @property {string[]} [gapPlan]
 * @property {string[]} [ordering]
 * @property {string} [topologyAssumptions]
 * @property {string} [proposedNextAction]
 * @property {string} [revisedByTaskId]
 * @property {string} [updatedAt]
 *
 * @typedef {object} BuildLoop
 * @property {BuildLoopStatus} status
 * @property {boolean} pendingReinspect
 * @property {object|null} [lastRealityDelta]
 * @property {string|null} [lastConsumedActionId]
 * @property {number} [noProgressCount]
 * @property {string|null} [lastFailureFingerprint]
 * @property {string|null} [lastEvaluateTaskId]
 * @property {string|null} [lastChallengeTaskId]
 * @property {string} [blockedReason]
 *
 * @typedef {object} BuildRecord
 * @property {string} schema
 * @property {string} buildId
 * @property {{
 *   outcome: string,
 *   outcomeRevision: number,
 *   revisedAt?: string,
 *   explicitRequirements: ExplicitRequirement[],
 * }} intent
 * @property {OutcomeCriterion[]} outcomeCriteria
 * @property {BuildHypotheses} hypotheses
 * @property {ProjectBinding[]} projectBindings
 * @property {object} [environments]
 * @property {BuildChild[]} children
 * @property {BuildLoop} loop
 * @property {OriginKind} [originKind]
 * @property {object} [productBrief]
 * @property {'caller'} [criteriaAuthority]
 * @property {ConversationMessage[]} [conversation]
 * @property {string} [productBranch]
 * @property {{ autoRun: boolean, owner: string }} [coordinator]
 * @property {string} [displayTitle]
 * @property {string} [archivedAt]
 * @property {{ syncAdopted?: boolean, lastSyncedSha?: string | null, lastSyncError?: string | null, lastSyncedAt?: string | null, remoteUrl?: string | null, kind?: string, validated?: boolean }} [repository]
 * @property {object} [pendingCandidate]
 * @property {{ operationId: string, expectedAuthoritativeSha: string, targetAdoptionIndex: number, targetSha: string, targetTreeSha: string, candidateSha: string|null, createdAt: string }} [pendingRestore]
 * @property {object} [lastAppliedCandidate]
 * @property {object} [lastDiscardedCandidate]
 * @property {{ embedPath: string, sha: string, at?: string }} [lastGoodPreview]
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {string} [lifecycleActivityAt]
 */

export {};
