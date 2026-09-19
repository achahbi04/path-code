/**
 * @typedef {'PROVEN'|'UNMET'|'UNKNOWN'} CriterionStatus
 * @typedef {'SATISFIED'|'VIOLATED'|'UNKNOWN'} RequirementStatus
 * @typedef {'engineer'|'evaluate'|'challenge'} BuildTaskKind
 * @typedef {'selected'|'dispatched'|'terminal_seen'|'consumed'} ChildDispatchState
 * @typedef {'running'|'blocked'|'complete'} BuildLoopStatus
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
 * @property {string} [resultFingerprint]
 * @property {string} [terminalAt]
 * @property {string} [classification]
 * @property {string} [selectedAt]
 * @property {string} [dispatchedAt]
 * @property {string} [consumedAt]
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
 * @property {BuildChild[]} children
 * @property {BuildLoop} loop
 * @property {OriginKind} [originKind]
 * @property {object} [productBrief]
 * @property {ConversationMessage[]} [conversation]
 * @property {string} [productBranch]
 * @property {string} createdAt
 * @property {string} updatedAt
 */

export {};
