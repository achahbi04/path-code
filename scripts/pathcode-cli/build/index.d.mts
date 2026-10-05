export type JsonScalar = string | number | boolean | null;
export type JsonValue = JsonScalar | JsonValue[] | { [key: string]: JsonValue };

export interface EvidenceRef {
  kind: "git" | "fs" | "check" | "runtime" | "report" | "validation";
  ref: string;
  bindingId: string;
  taskId?: string;
  headSha?: string | null;
  dirtyFingerprint?: string;
  configFingerprint?: string;
  toolchainHint?: string;
  runtimeObservationAt?: string;
  scope?: string[];
  observedAt: string;
}

export interface ExplicitRequirement {
  id: string;
  statement: string;
  required: boolean;
  status: "SATISFIED" | "VIOLATED" | "UNKNOWN";
  evidence: EvidenceRef[];
}

export interface OutcomeCriterion {
  id: string;
  statement: string;
  required: boolean;
  status: "PROVEN" | "UNMET" | "UNKNOWN";
  evidence: EvidenceRef[];
  challengedByTaskId?: string;
  updatedAt?: string;
}

export interface ProjectBinding {
  bindingId: string;
  projectRoot: string;
  roleHint?: string;
  createdByTaskId?: string;
  originGitInit?: boolean;
  originKind?: "build-created" | "existing-project";
  activeWorktreePath?: string;
  activeTaskBranch?: string;
}

export type BuildEnvironmentVariable =
  | { kind: "config"; variableName: string; value: string; createdAt: string; updatedAt: string }
  | { kind: "secret"; variableName: string; secretRef: string;
      backend: "vercel_env" | "local_env_file";
      descriptor: { provider: "vercel"; teamRef: string | null; projectRef: string | null; targetRef: string | null; bindingRef: string | null } |
        { source: ".env.local" };
      bindingState: "configured"; presenceState: "unknown" | "verified_present" | "verified_missing";
      safetyState?: "unknown" | "verified_safe" | "verified_unsafe"; verifiedAt?: string;
      createdAt: string; updatedAt: string };

export interface BuildEnvironments {
  schema: "pathcode.p9.environments.v1";
  revision: number;
  items: Array<{ environmentId: string; name: string; createdAt: string;
    updatedAt: string; variables: BuildEnvironmentVariable[] }>;
}

export interface BuildChild {
  taskId: string;
  bindingId: string;
  kind: "brief" | "engineer" | "evaluate" | "challenge";
  actionId: string;
  dispatchState: "selected" | "dispatched" | "terminal_seen" | "consumed";
  objective?: string;
  referenceInputs?: import("./reference-input.mjs").CreatorReferenceInput[];
  resultFingerprint?: string;
  terminalAt?: string;
  classification?: string;
  selectedAt?: string;
  dispatchedAt?: string;
  consumedAt?: string;
  intentRevision?: number;
  authoritativeSha?: string | null;
  semanticProofAccepted?: boolean;
  provider?: string;
  engineMode?: string | null;
  engineModel?: string | null;
  engineSessionId?: string | null;
  executionProvider?: string | null;
  engineTurns?: Array<{
    engine: string;
    role?: string;
    provider?: string | null;
    model?: string | null;
    mode?: string | null;
    sessionId?: string | null;
    state?: string | null;
  }>;
  adoptedSha?: string | null;
  sourceSha?: string | null;
  failureReason?: string;
  dispatchedBy?: {
    coordinatorSha?: string | null;
    coordinatorDirty?: boolean | null;
    coordinatorPid?: number | null;
    gatewaySha?: string | null;
    gatewayDirty?: boolean | null;
    gatewayPid?: number | null;
    version?: string | null;
  };
}

export interface ProductBrief {
  version?: number;
  buildId?: string;
  intentRevision: number;
  revision?: number;
  source?: "cognitive" | "derived";
  stale?: boolean;
  productKind?: string;
  summary?: string;
  acceptanceCriteria?: Array<{
    id: string;
    statement: string;
    required: boolean;
    evidenceKinds?: string[];
  }>;
}

export interface SelectedElement {
  buildId?: string;
  tag?: string;
  text?: string;
  selector?: string;
  rect?: { x: number; y: number; width: number; height: number };
  sourceFile?: string;
  sourceHint?: string;
}

export interface BuildDeployments {
  schema: "pathcode.p10.deployments.v1";
  revision: number;
  mappings: Array<{ mappingId: string; provider: "vercel"; environmentId: string;
    teamRef: string | null; projectRef: string; targetRef: "preview" | "production"; updatedAt: string }>;
  deployments: Array<Record<string, unknown>>;
  releases: Array<Record<string, unknown>>;
  currentProductionReleaseId: string | null;
  serving: { state: "verified" | "unknown" | "drifted"; observedProviderDeploymentId: string | null; observedAt: string | null };
  pendingOperation: Record<string, unknown> | null;
}

export interface BuildRecord {
  schema: string;
  buildId: string;
  intent: {
    outcome: string;
    outcomeRevision: number;
    revisedAt: string;
    explicitRequirements: ExplicitRequirement[];
  };
  outcomeCriteria: OutcomeCriterion[];
  hypotheses: {
    architectureNotes?: string;
    gapPlan?: string[];
    ordering?: string[];
    topologyAssumptions?: string;
    proposedNextAction?: string;
    revisedByTaskId?: string;
    updatedAt?: string;
  };
  projectBindings: ProjectBinding[];
  environments?: BuildEnvironments;
  deployments?: BuildDeployments;
  children: BuildChild[];
  loop: {
    status: "running" | "paused" | "blocked" | "complete" | "awaiting_review";
    pendingReinspect: boolean;
    pendingRuntimeRefresh?: boolean;
    pendingConversationSteer?: boolean;
    pendingSelectedElement?: SelectedElement | null;
    forceNextKind?: BuildChild["kind"];
    fabricSteps?: string[];
    pauseRequested?: boolean;
    pauseRequestedAt?: string;
    pausedAt?: string;
    resumedAt?: string;
    lastRealityDelta?: object | null;
    lastConsumedActionId?: string | null;
    noProgressCount?: number;
    lastFailureFingerprint?: string | null;
    lastEvaluateTaskId?: string | null;
    lastChallengeTaskId?: string | null;
    blockedReason?: string;
  };
  pendingCandidate?: {
    status?: string;
    taskId?: string;
    actionId?: string;
    intentRevision?: number;
    sourceSha?: string | null;
    taskBranch?: string | null;
    worktreePath?: string | null;
    files?: string[];
    requestText?: string;
    diffSummary?: string;
    capability?: string | null;
    capabilitySource?: string | null;
    resultFingerprint?: string | null;
    createdAt?: string;
  };
  pendingRestore?: {
    operationId: string;
    expectedAuthoritativeSha: string;
    targetAdoptionIndex: number;
    targetSha: string;
    targetTreeSha: string;
    candidateSha: string | null;
    createdAt: string;
  };
  lastAppliedCandidate?: { taskId?: string; adoptedSha?: string; at?: string };
  lastDiscardedCandidate?: { taskId?: string; sourceSha?: string | null; at?: string };
  lastGoodPreview?: { embedPath: string; sha: string; at?: string };
  adoptionHistory?: unknown[];
  createdAt: string;
  updatedAt: string;
  lifecycleActivityAt?: string;
  originKind?: "build-created" | "existing-project";
  productBrief?: ProductBrief;
  criteriaAuthority?: "caller";
  conversation?: Array<{
    id: string;
    role: "user" | "assistant" | "system";
    text: string;
    at: string;
    element?: SelectedElement;
    kind?: string;
    status?:
      | "queued"
      | "preparing"
      | "applying"
      | "being_applied"
      | "incorporated"
      | "applied"
      | "failed"
      | "review"
      | "discarded"
      | "superseded"
      | "paused";
    intentRevision?: number;
  }>;
  productBranch?: string;
  displayTitle?: string;
  archivedAt?: string;
  repository?: {
    syncAdopted?: boolean;
    lastSyncedSha?: string | null;
    lastSyncError?: string | null;
    lastSyncedAt?: string | null;
    remoteUrl?: string | null;
    kind?: string;
    validated?: boolean;
  };
  coordinator?: { autoRun: boolean; owner: string };
  authoritativeSha?: string;
  previewUrl?: string;
  runtimeHealth?: string;
  browserEvidence?: {
    ok: boolean;
    authoritativeSha?: string;
    htmlPath?: string;
  };
}

export interface BuildEvent {
  id: number;
  buildId: string;
  type: string;
  at: string;
  data: JsonValue;
}

export function createBuildRecordSkeleton(input: {
  outcome: string;
  explicitRequirements?: Array<{
    id?: string;
    statement: string;
    required?: boolean;
  }>;
  buildId?: string;
}): BuildRecord;
export function readBuildRecord(runtimeRoot: string, buildId: string): BuildRecord | null;
export function writeBuildRecord(
  runtimeRoot: string,
  record: BuildRecord | Record<string, unknown>,
): BuildRecord;
export function touchLifecycleActivity(
  record: BuildRecord | Record<string, unknown>,
  at?: string,
): BuildRecord | Record<string, unknown>;
export function setLastGoodPreview(
  record: BuildRecord | Record<string, unknown>,
  input: { sha: string; at?: string; embedPath?: string },
): BuildRecord | Record<string, unknown>;
export function projectLastGoodPreview(
  build?: BuildRecord | Record<string, unknown> | null,
): { embedPath: string; sha: string; at: string | null } | null;
export function lifecycleActivityAtFor(
  build?: BuildRecord | Record<string, unknown> | null,
): string | null;
export function listBuildRecords(runtimeRoot: string): BuildRecord[];
export function findLatestActiveBuild(runtimeRoot: string): BuildRecord | null;
export function selectSurfaceBuildId(
  records: Array<{ buildId?: string; loop?: { status?: string } }>,
): string | null;
export function appendPendingConversation(
  runtimeRoot: string,
  buildId: string,
  message: Record<string, unknown>,
): Record<string, unknown>;
export function readPendingConversations(
  runtimeRoot: string,
  buildId: string,
): Array<Record<string, unknown>>;
export function drainPendingConversations(
  runtimeRoot: string,
  buildId: string,
): Array<Record<string, unknown>>;
export function resolveBuildConversationQueuePath(
  runtimeRoot: string,
  buildId: string,
): string;
export function resolveBuildsDir(runtimeRoot: string): string;
export function resolveBuildRecordPath(runtimeRoot: string, buildId: string): string;
export function makeBuildActionId(kind: string, keyMaterial: string): string;

export function appendBuildEvent(
  runtimeRoot: string,
  buildId: string,
  type: string,
  data?: JsonValue,
): BuildEvent;
export function sanitizeBuildEventValue(
  value: unknown,
  depth?: number,
  limits?: { maxItems?: number; maxKeys?: number; maxDepth?: number },
): unknown;
export function surfaceViewSanitizeLimits(): {
  maxItems: number;
  maxKeys: number;
  maxDepth: number;
};
export function readBuildEvents(
  runtimeRoot: string,
  buildId: string,
  options?: { afterId?: number; limit?: number },
): BuildEvent[];

export function ensureBuildOrigin(input: {
  targetDir: string;
  exactRoot?: boolean;
  originKind?: "build-created" | "existing-project";
}): {
  ok: boolean;
  code?: string;
  admission: { unversioned: boolean };
  binding: ProjectBinding;
};
export function isBindableProject(cwd: string): boolean;
export { HOME_BINDING_GUARD, assertAllowedProjectRoot } from "../paths.mjs";

export function captureBindingReality(projectRoot: string): {
  projectRoot: string;
  headSha: string | null;
  dirtyFingerprint: string;
  changedFiles: string[];
  statusPorcelain: string;
  branch: string | null;
  configFingerprint: string;
  exists: boolean;
};
export function makeEvidenceRef(
  input: Omit<EvidenceRef, "observedAt"> & { observedAt?: string },
  reality?: ReturnType<typeof captureBindingReality>,
): EvidenceRef;
export function classifyEvidenceFreshness(
  evidence: EvidenceRef,
  reality: ReturnType<typeof captureBindingReality>,
): { fresh: boolean; reason?: string };
export function changesIndependentOfScope(changed: string[], scope: string[]): boolean;
export function applyStaleInvalidation(
  record: BuildRecord,
  input: {
    bindingId: string;
    changedFiles: string[];
    reality: ReturnType<typeof captureBindingReality>;
  },
): { demoted: string[] };

export function parseStatusDirectives(text: string): Array<{
  id: string;
  status: string;
  note: string;
}>;
export function realityRefreshDepthA(input: {
  runtimeRoot: string;
  record: BuildRecord;
  bindingId: string;
}): { ok: boolean; delta: { depth: string; bindingId: string } };
export function frameEngineerObjective(record: BuildRecord, action?: string): string;
export function frameEvaluateObjective(record: BuildRecord): string;

export function mechanicalProbeBinding(input: {
  record: BuildRecord;
  bindingId: string;
  worktreePath?: string;
  taskBranch?: string;
  changedFiles?: string[];
}): { ok: boolean; observations: Array<{ id: string; [key: string]: unknown }> };

export interface Gateway {
  bindProject?: (...args: unknown[]) => unknown | Promise<unknown>;
  startTask?: (
    objective: string,
    extra: { taskId: string; [key: string]: unknown },
  ) => unknown | Promise<unknown>;
  awaitTask?: (...args: unknown[]) => unknown | Promise<unknown>;
  getResult?: (taskId: string) => unknown | Promise<unknown>;
  snapshotTask?: (taskId: string) => unknown;
  cancelTask?: (taskId: string) => unknown | Promise<unknown>;
}

export interface BuildController {
  startBuild(
    outcome: string,
    options: {
      targetDir: string;
      originKind?: "build-created" | "existing-project";
      autoRun?: boolean;
      explicitRequirements?: Array<{ id?: string; statement: string; required?: boolean }>;
      initialCriteria?: Array<{ id: string; statement: string; required: boolean }>;
    },
  ): Promise<{ ok: boolean; code?: string; projectRoot: string; build: BuildRecord }>;
  runUntilDone(
    buildId: string,
    options?: { maxSteps?: number },
  ): Promise<{
    ok: boolean;
    done: boolean;
    awaitingReview?: boolean;
    build: BuildRecord;
  }>;
  applyCandidate(
    buildId: string,
  ): Promise<{ ok: boolean; deduped?: boolean; build: BuildRecord }>;
  discardCandidate(
    buildId: string,
  ): Promise<{ ok: boolean; deduped?: boolean; build: BuildRecord }>;
  restoreHistoricalVersion(buildId: string, adoptionIndex: number, expectedAuthoritativeSha: string): { ok: boolean; code?: string; adoptedSha?: string; noOp?: boolean; build?: BuildRecord };
  recoverPendingHistoricalRestore(buildId: string): { ok: boolean; code?: string; build?: BuildRecord };
  recover(buildId: string): Promise<{ ok: boolean; build: BuildRecord }>;
  resumeBuild(
    buildId: string,
  ): Promise<{
    ok: boolean;
    awaitingReview?: boolean;
    awaitCreator?: boolean;
    alreadyComplete?: boolean;
    build: BuildRecord;
    decisions?: unknown[];
  }>;
  consumeChildResult(
    buildId: string,
    taskId: string,
  ): Promise<{ ok: boolean; deduped?: boolean; build: BuildRecord }>;
  reviseIntent(
    buildId: string,
    input: {
      addRequirements?: Array<{ id?: string; statement: string; required?: boolean }>;
      note?: string;
    },
  ): Promise<{ ok: boolean; build: BuildRecord }>;
  applyConversation(
    buildId: string,
    input: { message: string; element?: SelectedElement },
  ): Promise<{ ok: boolean; build: BuildRecord }>;
  pauseBuild(buildId: string): Promise<{ ok: boolean; build?: BuildRecord }>;
  tick(buildId: string): Promise<{
    ok?: boolean;
    code?: string;
    message?: string;
    action?: string;
    kind?: BuildChild["kind"];
    taskId?: string;
    paused?: boolean;
    blocked?: boolean;
    done?: boolean;
    awaitCreator?: boolean;
    awaitingReview?: boolean;
  }>;
  assessCompletion(buildId: string): { complete: boolean; reason?: string };
  patchRuntimeState(
    buildId: string,
    state: {
      previewUrl?: string;
      runtimeHealth?: string;
      browserEvidence?: BuildRecord["browserEvidence"];
      authoritativeSha?: string | null;
      clearRuntimeRefresh?: boolean;
    },
  ): { ok: boolean; code?: string; build?: BuildRecord };
  reconcileBuildChildren(
    buildId: string,
  ): Promise<{ ok: boolean; build: BuildRecord }>;
  dispatchChild(
    buildId: string,
    kind: BuildChild["kind"],
    objective: string,
  ): Promise<{ ok: boolean; taskId: string; build: BuildRecord }>;
}

export function createBuildController(options: {
  runtimeRoot: string;
  fakeMode?: boolean;
  gateway?: Gateway;
}): BuildController;

export function ensureBuildProductBranch(input: {
  projectRoot: string;
  productBranch: string;
}): { ok: boolean; code?: string };
export function gitHeadSha(projectRoot: string): string | null;
export function adoptEngineerResultIntoBuild(input: {
  runtimeRoot: string;
  buildId: string;
  projectRoot: string;
  productBranch: string;
  taskId: string;
  taskBranch?: string | null;
  sourceSha: string | null;
  worktreePath?: string | null;
}): {
  ok: boolean;
  code?: string;
  mode?: string;
  adoptedSha?: string;
  sourceSha?: string | null;
};

export interface ProductBriefResult extends ProductBrief {
  productKind: string;
  acceptanceCriteria: NonNullable<ProductBrief["acceptanceCriteria"]>;
}
export function deriveProductBrief(outcome: string): ProductBriefResult;
export function parseProductBriefResult(
  text: string,
  expected: { buildId: string; intentRevision: number },
): { ok: boolean; brief: ProductBrief | null; errors: string[] };

export interface BuildArtifact {
  kind: "web" | "api" | "cli" | "desktop" | "mobile" | "service" | "multi_service" | "unknown";
  preview: { capability: string; mode: string; status: string };
  signals?: string[];
}
export function detectBuildArtifact(projectRoot: string): BuildArtifact;

export interface RuntimeManager {
  start(
    buildId: string,
    projectRoot: string,
    options?: {
      bindingId?: string;
      outcomeHint?: string;
      forceRestart?: boolean;
      authoritativeSha?: string | null;
      descriptor?: object | null;
      restartAllowed?: boolean;
      environmentId?: string | null;
    },
  ): Promise<RuntimeStartResult>;
  stop(buildId: string): Promise<void>;
  stopAll(): Promise<void>;
  inspect(buildId: string): Promise<{ ok: boolean; runtime: RuntimeState | null; live: boolean }>;
  getPreviewDescriptor(buildId: string): {
    capability: string;
    mode: string;
    url: string | null;
    port: number | null;
    status: string;
    embedPath: string | null;
  };
}
export interface RuntimeState {
  runtimeId?: string;
  buildId?: string;
  bindingId?: string;
  projectRoot: string;
  status: string;
  port?: number;
  url: string;
  pid?: number;
  startKey?: string;
  selectedEnvironmentId?: string | null;
  exitCode?: number | null;
}
export type RuntimeStartResult =
  | {
      ok: true;
      runtime: RuntimeState;
      reused?: boolean;
      artifact?: BuildArtifact;
    }
  | {
      ok: false;
      code: string;
      message?: string;
      runtime?: RuntimeState;
      artifact?: BuildArtifact;
    };
export function createBuildRuntimeManager(options: { runtimeRoot: string }): RuntimeManager;
export const PRODUCT_HOST_ENV_KEYS: readonly string[];
export function createProductRuntimeEnv(
  plan: { kind: string; port: number; env: Record<string, string> },
  host?: NodeJS.ProcessEnv,
  selection?: { runtimeRoot: string; buildId: string; environmentId: string; projectRoot: string } | null,
): Record<string, string>;
export function checkLocalEnvGitSafety(projectRoot: string):
  | { ok: true; gitSafety: "ignored_untracked" }
  | { ok: false; code: string };

export interface ServingProcessIdentity {
  role: "surface" | "coordinator" | "gateway";
  pid: number | null;
  version: string | null;
  sha: string | null;
  dirty: boolean | null;
  label: string;
  packageRoot: string | null;
  processStartedAt: string | null;
  currentSha: string | null;
  stale: boolean;
  exact: boolean;
  reasons: string[];
}
export interface ServingIdentity {
  version: string | null;
  sha: string | null;
  label: string;
  processes: ServingProcessIdentity[];
  stale: boolean;
  exact: boolean;
  warnings: string[];
  coordinatorReused: boolean;
}

export interface BuildSurface {
  url: string;
  stop(opts?: { teardownOwned?: boolean }): Promise<void>;
  identity(): Promise<ServingIdentity>;
}
export function startPathBuildSurface(options: {
  packageRoot: string;
  runtimeRoot: string;
  preferredEngine?: string | null;
  openBrowser?: boolean;
  fakeMode?: boolean;
  autoLoop?: boolean;
  port?: number;
  host?: string;
}): Promise<BuildSurface>;
export function projectBuildForSurface(
  record:
    | BuildRecord
    | {
        buildId: string;
        loop: { status: string; [key: string]: unknown };
        intent: {
          outcome: string;
          outcomeRevision: number;
          explicitRequirements?: ExplicitRequirement[];
          [key: string]: unknown;
        };
        outcomeCriteria?: Array<{
          id: string;
          statement: string;
          status: string;
          required?: boolean;
          evidence?: unknown;
        }>;
        projectBindings?: Array<Partial<ProjectBinding>>;
        children?: unknown[];
        hypotheses?: BuildRecord["hypotheses"];
        conversation?: Array<{
          id?: string;
          role: string;
          text: string;
          at?: string;
          status?: string;
          kind?: string;
          intentRevision?: number;
        }>;
        authoritativeSha?: string | null;
        productBranch?: string | null;
        adoptionHistory?: unknown[];
      }
    | null,
  state?: {
    preview?: { status?: string; embedPath?: string; url?: string; revision?: string };
    runtime?: { status: string; url?: string; reason?: string; exitCode?: number };
    events?: Array<{ id?: number; type?: string; at?: string }>;
    checkpoint?: Record<string, unknown>;
    traces?: Array<{ taskId?: string; lines?: object[] }>;
  },
): {
  phase: string;
  headline: string;
  detail?: string;
  buildId?: string;
  projectRoot?: string;
  criteria?: Array<OutcomeCriterion & { creatorStatus?: string }>;
  conversation?: Array<{
    id?: string;
    role?: string;
    text?: string;
    status?: string;
    at?: string;
  }>;
  identity?: {
    buildId?: string;
    productBranch?: string | null;
    previewSha?: string | null;
    currentIntentRevision?: number;
    loopStatus?: string;
  };
  preview: { embedPath?: string };
  uiState?: string;
  handoff?: { projectRoot: string };
  progressLabel?: string;
  displayTitle?: string;
  creatorStatus?: string;
  creatorPhase?: string;
  criteriaSummary?: { met: number; failed: number; pending: number; total: number };
  criteriaProjection?: {
    split: boolean;
    project: { met: number; failed: number; pending: number; total: number };
    request: { met: number; failed: number; pending: number; total: number } | null;
  };
  requestLabel?: string | null;
  archived?: boolean;
  queuedRequest?: string | null;
  canPause?: boolean;
  canResume?: boolean;
  canSteer?: boolean;
  canApply?: boolean;
  canDiscard?: boolean;
  blockedReason?: string | null;
  pendingCandidate?: {
    taskId?: string | null;
    sourceSha?: string | null;
    taskBranch?: string | null;
    files?: string[];
    requestText?: string;
    diffSummary?: string;
  } | null;
  lastDiscardedCandidate?: {
    taskId?: string | null;
    sourceSha?: string | null;
    at?: string | null;
  } | null;
  lastAppliedCandidate?: {
    taskId?: string | null;
    adoptedSha?: string | null;
    at?: string | null;
  } | null;
  lastGoodPreview?: {
    embedPath: string;
    sha: string;
    at?: string | null;
  } | null;
  candidatePreview?: {
    status?: string;
    embedPath?: string;
    kind?: string;
  } | null;
  requestReceipt?: {
    acceptedAt?: string | null;
    intentRevision?: number | null;
    resultingSha?: string | null;
    adopted?: boolean;
    previewUrl?: string | null;
    ready?: boolean;
    tasks?: Array<{
      taskId?: string | null;
      kind?: string | null;
      engine?: string | null;
      model?: string | null;
      mode?: string | null;
      sessionId?: string | null;
      executionProvider?: string | null;
      startedAt?: string | null;
      endedAt?: string | null;
      status?: string | null;
      adoptedSha?: string | null;
    }>;
  };
  previewPreparing?: boolean;
  activeEngineering?: boolean;
  needsRecovery?: boolean;
  engineeringActivity?: {
    engine?: string | null;
    files?: string[];
    adoptedSha?: string | null;
    currentTask?: { taskId?: string | null; files?: string[]; adoptedSha?: string | null };
    latestRevision?: { taskId?: string | null; sha?: string | null; files?: string[] } | null;
    [key: string]: unknown;
  };
  engineeringTimeline?: {
    phases: Array<{ id: string; label: string; status: string; count: number }>;
    entries: Array<{
      sequence: number;
      kind: string;
      summary: string;
      timestamp?: string | null;
      taskId?: string | null;
      engine?: string | null;
    }>;
    turns?: Array<{ taskId?: string | null; clockReversed?: boolean }>;
    current: { summary?: string; kind?: string } | null;
  };
};

export interface BuildCoordinatorClient {
  connect(): Promise<void>;
  close(): void;
  request(method: string, params?: Record<string, unknown>): Promise<any>;
  listEnvironments(buildId: string): Promise<ReturnType<typeof listBuildEnvironments>>;
  listDeployments(buildId: string): Promise<ReturnType<typeof listBuildDeployments>>;
  preflightDeployment(buildId: string, environmentId: string): Promise<ReturnType<typeof preflightDeployment>>;
  mutateDeploymentMapping(buildId: string, input: object): Promise<{ ok: boolean; code?: string; revision?: number; mappingId?: string }>;
  prepareDeployment(buildId: string, input: object): Promise<{ ok: boolean; code?: string; revision?: number; operationId?: string; deploymentId?: string }>;
  transitionDeployment(buildId: string, input: object): Promise<{ ok: boolean; code?: string; revision?: number; state?: string }>;
  readEnvironment(buildId: string, environmentId: string): Promise<ReturnType<typeof readBuildEnvironment>>;
  readSecretBinding(buildId: string, environmentId: string, secretRef: string): Promise<ReturnType<typeof readBuildSecretBinding>>;
  mutateEnvironment(buildId: string, action: string, expectedEnvironmentRevision: number, input: object):
    Promise<{ ok: boolean; code?: string; revision?: number; environmentId?: string; secretRef?: string }>;
  verifyLocalEnvironmentBinding(buildId: string, environmentId: string, variableName: string,
    expectedEnvironmentRevision: number): Promise<{ ok: boolean; code?: string; revision?: number;
      presenceState?: string; safetyState?: string }>;
  startRuntime(buildId: string, environmentId?: string | null): Promise<RuntimeStartResult>;
  restartRuntime(buildId: string, environmentId?: string | null): Promise<RuntimeStartResult>;
  startBuild(
    outcome: string,
    options: Parameters<BuildController["startBuild"]>[1],
  ): ReturnType<BuildController["startBuild"]>;
  ensureLoop(buildId: string): Promise<{ running: boolean; deduped: boolean }>;
  stopBuild(buildId: string): Promise<{ ok: boolean; build: BuildRecord }>;
  recoverBuild(buildId: string): Promise<{ ok: boolean; build: BuildRecord }>;
  applyCandidate(
    buildId: string,
  ): Promise<{ ok: boolean; deduped?: boolean; build: BuildRecord }>;
  discardCandidate(
    buildId: string,
  ): Promise<{ ok: boolean; deduped?: boolean; build: BuildRecord }>;
  restoreHistoricalVersion(buildId: string, adoptionIndex: number, expectedAuthoritativeSha: string): Promise<{ ok: boolean; code?: string; adoptedSha?: string; noOp?: boolean; build?: BuildRecord }>;
  editSurfaceBuild(buildId: string, action: string, input?: object): Promise<{ ok: boolean; code?: string; changed?: boolean; displayTitle?: string; archived?: boolean }>;
  messageBuild(
    buildId: string,
    input: { message: string; element?: SelectedElement },
  ): Promise<{ ok: boolean; build: BuildRecord }>;
}
export function createBuildCoordinatorClient(options: {
  runtimeRoot: string;
  socketPath?: string;
}): BuildCoordinatorClient;
export const ENVIRONMENTS_SCHEMA: "pathcode.p9.environments.v1";
export const DEPLOYMENTS_SCHEMA: "pathcode.p10.deployments.v1";
export const DEPLOY_RECONCILIATION_WINDOW_MISSING: "DEPLOY_RECONCILIATION_WINDOW_MISSING";
export const PROVIDER_CREATION_TIME_SAFETY_ALLOWANCE_MS: number;
export const VERCEL_LIVE_PROOF_GATES: readonly string[];
export function emptyDeploymentAuthority(): BuildDeployments;
export function listBuildDeployments(runtimeRoot: string, buildId: string):
  { ok: boolean; code?: string; schema?: string; revision?: number; mappings?: BuildDeployments["mappings"];
    deployments?: BuildDeployments["deployments"]; releases?: BuildDeployments["releases"];
    currentProductionReleaseId?: string | null; serving?: BuildDeployments["serving"]; pendingOperation?: object | null };
export function preflightDeployment(runtimeRoot: string, buildId: string, environmentId: string):
  { ok: boolean; code?: string; sourceSha?: string; treeSha?: string; framework?: string;
    environmentRevision?: number; mappingId?: string; unknownSecretPresence?: boolean };
export function prepareDeploymentMappingMutation(runtimeRoot: string, buildId: string, request: object):
  { ok: boolean; code?: string; record?: BuildRecord; revision?: number; mappingId?: string | null };
export function prepareDeploymentOperation(runtimeRoot: string, buildId: string, request: object):
  { ok: boolean; code?: string; record?: BuildRecord; revision?: number; operationId?: string; deploymentId?: string };
export type NoDeploymentObservedReconciliationEvidence = {
  buildId: string;
  operationId: string;
  deploymentId: string;
  mappingId: string;
  teamRef: string | null;
  projectRef: string;
  target: "preview";
  pathOperationId: string;
  windowStart: string;
  windowEnd: string;
  metadataFilteredLookup: { completed: true; exhausted: true; nextCursor: null; exactMatchCount: 0 };
  projectWindowLookup: { completed: true; exhausted: true; nextCursor: null; exactOperationMatchCount: 0 };
  completedAt: string;
};
export type NoDeploymentObservedTransitionInput = {
  operationId: string;
  deploymentId: string;
  state: "failed";
  failureCode: "PROVIDER_SUBMISSION_NOT_OBSERVED";
  reconciliationEvidence: NoDeploymentObservedReconciliationEvidence;
};
export function inspectDeploymentSource(input: { runtimeRoot: string; buildId: string }): object;
export function prepareDeploymentSource(input: { runtimeRoot: string; buildId: string }):
  { ok: boolean; code?: string; workspace: string; repositoryRoot: string; authoritativeSha: string; treeSha: string; framework: string };
export function cleanupDeploymentSource(input: { runtimeRoot: string; workspace: string }): { ok: boolean; code?: string };
export function inspectDeploymentTree(root: string, sha: string): object;
export function isUnsafeDeploymentPath(path: string): boolean;
export function canonicalConfigDigest(entries: Array<{ kind: string; variableName: string; value?: string }>): string;
export function validateDeploymentLocator(mapping: object, variables: object[]): { ok: boolean; code?: string; unknownSecretPresence?: boolean };
export function transitionDeploymentOperation(record: BuildRecord, input: object): { ok: boolean; code?: string; record?: BuildRecord };
export function reconcileServing(record: BuildRecord, safeObservation: object | null): { ok: boolean; code?: string; record: BuildRecord; serving: BuildDeployments["serving"] };
export function productionActionEligibility(record: BuildRecord, action: string, deploymentId: string): object;
export function finalizeFixtureRelease(record: BuildRecord, input: object): { ok: boolean; code?: string; record?: BuildRecord; releaseId?: string };
export function prepareFixtureReleaseOperation(record: BuildRecord, input: object): { ok: boolean; code?: string; record: BuildRecord; operationId: string; revision: number };
export function recoverDeploymentFoundation(record: BuildRecord): object;
export function validateOperationSnapshot(runtimeRoot: string, buildId: string, operationId: string): object;
export function parseVercelConfigMetadata(raw: unknown): object;
export function planVercelConfigProjection(input: object): object;
export function makeVercelConfigCommand(input: object): { ok: boolean; code?: string; executable: string; argv: string[]; shell: false; stdinPayload: string; display: string };
export function parseVercelDeploymentReceipt(raw: unknown): object;
export function parseVercelServingObservation(raw: unknown): object;
export function operationMetadata(input: object): object;
export function createVercelChildEnv(parent?: Record<string, string | undefined>): Record<string, string>;
export function makePreviewReadCommands(input: object): object;
export function makePreviewDeployCommand(input: object): object;
export function makePreviewInspectCommand(input: object): object;
export function makePreviewReconcileCommand(input: object): object;
export function parsePreviewAuth(raw: unknown, teamRef?: string | null): object;
export function parsePreviewProjectList(raw: unknown, input: object): object;
export function parsePreviewDeploymentReceipt(raw: unknown): object;
export function parsePreviewDeploymentStatus(raw: unknown, expectedId: string): object;
export function parsePreviewReconciliation(raw: unknown, input: object): object;
export function executeVercelAdapterCommand(spec: object, input: object): Promise<object>;
export const PREVIEW_RECONCILIATION_CODES: Readonly<{
  INVALID: "PROVIDER_RECONCILE_INVALID";
  UNSAFE: "PROVIDER_RECONCILE_UNSAFE";
  AMBIGUOUS: "PROVIDER_RECONCILE_AMBIGUOUS";
  INCOMPLETE: "PROVIDER_RECONCILE_INCOMPLETE";
  CONFLICT: "PROVIDER_RECONCILE_CONFLICT";
}>;
export const MAX_RECONCILIATION_PAGES: number;
export const MAX_RECONCILIATION_INSPECTIONS: number;
export const PREVIEW_DEPLOY_EXECUTION_TIMEOUT_MS: number;
export function makePreviewReconciliationPageCommand(input: object): object;
export function parsePreviewReconciliationPage(raw: unknown, input: object): object;
export function combinePreviewReconciliation(filtered: object, projectWindow: object): object;
export function makeNoDeploymentObservedEvidence(identity: object, filtered: object, projectWindow: object,
  completedAt: string): { ok: boolean; code?: string; evidence?: NoDeploymentObservedReconciliationEvidence };
export function reconcilePreviewWindow(input: object, execution?: object): Promise<object>;
export function listBuildEnvironments(runtimeRoot: string, buildId: string):
  { ok: true; buildId: string; bindingId: string; schema: string; revision: number; items: BuildEnvironments["items"] } |
  { ok: false; code: string };
export function readBuildEnvironment(runtimeRoot: string, buildId: string, environmentId: string):
  { ok: true; buildId: string; bindingId: string; revision: number; environment: BuildEnvironments["items"][number] } |
  { ok: false; code: string };
export function readBuildSecretBinding(runtimeRoot: string, buildId: string, environmentId: string, secretRef: string):
  { ok: true; buildId: string; environmentId: string; binding: Extract<BuildEnvironmentVariable, { kind: "secret" }> } |
  { ok: false; code: string };
export function createBuildCoordinatorService(options: {
  runtimeRoot: string; packageRoot: string; fakeMode?: boolean; preferredEngine?: string | null;
  scopedBuildId?: string;
}): Promise<{
  dispatch(method: string, params?: Record<string, unknown>): Promise<any>;
  whenReady: Promise<unknown>;
  close(): Promise<void>;
}>;
export function startBuildCoordinatorServer(options: {
  runtimeRoot: string;
  packageRoot: string;
  fakeMode?: boolean;
  scopedBuildId?: string;
}): Promise<{
  socketPath: string;
  service: { recovered: Array<{ buildId: string; ok: boolean }> };
  stop(): Promise<void>;
}>;
export { listProductVersions, readProductVersion, compareProductVersions } from "./versions.mjs";
export { restoreHistoricalProductVersion, recoverPendingHistoricalRestore } from "./historical-restore.mjs";
