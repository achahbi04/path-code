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

export interface BuildChild {
  taskId: string;
  bindingId: string;
  kind: "brief" | "engineer" | "evaluate" | "challenge";
  actionId: string;
  dispatchState: "selected" | "dispatched" | "terminal_seen" | "consumed";
  objective?: string;
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
  adoptedSha?: string | null;
  sourceSha?: string | null;
  failureReason?: string;
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
  children: BuildChild[];
  loop: {
    status: "running" | "paused" | "blocked" | "complete";
    pendingReinspect: boolean;
    pendingRuntimeRefresh?: boolean;
    pendingConversationSteer?: boolean;
    pendingSelectedElement?: SelectedElement | null;
    forceNextKind?: BuildChild["kind"];
    lastRealityDelta?: object | null;
    lastConsumedActionId?: string | null;
    noProgressCount?: number;
    lastFailureFingerprint?: string | null;
    lastEvaluateTaskId?: string | null;
    lastChallengeTaskId?: string | null;
    blockedReason?: string;
  };
  createdAt: string;
  updatedAt: string;
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
      | "failed";
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
  ): Promise<{ ok: boolean; done: boolean; build: BuildRecord }>;
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
  tick(buildId: string): Promise<{
    ok?: boolean;
    code?: string;
    message?: string;
    action?: string;
    kind?: BuildChild["kind"];
    taskId?: string;
  }>;
  assessCompletion(buildId: string): { complete: boolean; reason?: string };
  patchRuntimeState(
    buildId: string,
    state: {
      previewUrl?: string;
      runtimeHealth?: string;
      browserEvidence?: BuildRecord["browserEvidence"];
      clearRuntimeRefresh?: boolean;
    },
  ): BuildRecord;
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
    },
  ): Promise<RuntimeStartResult>;
  stop(buildId: string): Promise<void>;
  stopAll(): Promise<void>;
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
  stderrTail?: string;
  stdoutTail?: string;
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

export interface BuildSurface {
  url: string;
  stop(): Promise<void>;
}
export function startPathBuildSurface(options: {
  packageRoot: string;
  runtimeRoot: string;
  openBrowser?: boolean;
  fakeMode?: boolean;
  autoLoop?: boolean;
  port?: number;
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
  startBuild(
    outcome: string,
    options: Parameters<BuildController["startBuild"]>[1],
  ): ReturnType<BuildController["startBuild"]>;
  ensureLoop(buildId: string): Promise<{ running: boolean; deduped: boolean }>;
  stopBuild(buildId: string): Promise<{ ok: boolean; build: BuildRecord }>;
  recoverBuild(buildId: string): Promise<{ ok: boolean; build: BuildRecord }>;
  messageBuild(
    buildId: string,
    input: { message: string; element?: SelectedElement },
  ): Promise<{ ok: boolean; build: BuildRecord }>;
}
export function createBuildCoordinatorClient(options: {
  runtimeRoot: string;
  socketPath?: string;
}): BuildCoordinatorClient;
export function startBuildCoordinatorServer(options: {
  runtimeRoot: string;
  packageRoot: string;
  fakeMode?: boolean;
}): Promise<{
  socketPath: string;
  service: { recovered: Array<{ buildId: string; ok: boolean }> };
  stop(): Promise<void>;
}>;
