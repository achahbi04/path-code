/**
 * AG1 — PATH engineering session host.
 * Isolated worktree → Antigravity bridge → independent PATH validation.
 */

import { randomUUID } from "node:crypto";
import { resolve, basename } from "node:path";

import { createAntigravityEngineeringAgent } from "./bridge-client.mjs";
import { assertAg1VenvReady } from "./venv-guard.mjs";
import { ensureAg1Runtime } from "./runtime-bootstrap.mjs";
import { proveLocalSandboxConfinement } from "./sandbox-proof.mjs";
import { detectAg1Auth } from "./auth-detect.mjs";
import { hydrateAg1CloudEnv } from "./cloud-env.mjs";
import { admitPrimaryCheckout } from "./admission.mjs";
import { commitTaskWorktree } from "./task-commit.mjs";
import {
  assertTaskWorktreeGitHealthy,
  capturePrimaryFingerprint,
  captureFileDiffForUi,
  captureFilePreviewForUi,
  collectWorktreeResult,
  createTaskWorktree,
  listCommitChangedFiles,
  primaryUntouched,
  removeTaskWorktree,
  reopenTaskWorktree,
  repairTaskWorktreeGit,
  restoreIncidentalSetupChurn,
} from "./task-worktree.mjs";
import {
  classifyAg1Result,
  runIndependentFinalValidation,
  setFinalValidationProgressHook,
} from "./final-validation.mjs";
import { resolveEngineeringCwd, resolvePathRuntimeRoot } from "../paths.mjs";
import { normalizeObjectiveText } from "../normalize-text.mjs";
import { markTaskInterrupted } from "../ag10/task-checkpoint.mjs";
import {
  buildEngineeringReportModel,
  formatEngineeringReportPlain,
  writeEngineeringReportFile,
  dispositionFromOutcome,
  summarizeTimingMarks,
} from "../engineering-report.mjs";
import {
  buildBoundedDiffPreview,
  buildFullResultInspectCommand,
} from "../ag7/diff-preview.mjs";
import {
  AG8_MAX_REPAIR_ATTEMPTS,
  buildValidationRepairPrompt,
  discoverCapabilityPlane,
  discoverProjectMcpConfigs,
  applyMcpTrustPolicy,
  toAntigravityMcpServers,
  extractEngineeringHandoff,
  extractEngineeringNarration,
  busyLabelFromDetail,
  isOperatorQuestion,
  buildSteeringContinuePrompt,
  shouldAttemptSameSessionRepair,
  runCopilotAdvisory,
} from "../ag8/index.mjs";

/** Default wall clock — finite, not a 5-call micro-budget. */
export const AG1_DEFAULT_WALL_CLOCK_MS = 1_200_000;
export const AG1_DEFAULT_MAX_MODEL_CALLS = 48;
export const AG1_DEFAULT_MAX_TOOL_CALLS = 200;

const ACTIVITY_LABELS = Object.freeze({
  understanding: "Understanding",
  inspecting: "Inspecting",
  editing: "Implementing",
  implementing: "Implementing",
  running_command: "Running command",
  testing: "Testing",
  diagnosing: "Diagnosing",
  correcting: "Correcting",
  verifying: "Verifying",
  repairing: "Repairing",
  mcp: "MCP",
  complete: "Complete",
  failed: "Failed",
  cancelled: "Cancelled",
});

/**
 * Compact capability matrix for session events (no secrets / no env values).
 * @param {any} plane
 */
function compactCapabilityMatrix(plane) {
  if (!plane || typeof plane !== "object") {
    return { languages: [], toolchains: [], languageIntelligence: [] };
  }
  const mapStatus = (arr) =>
    Array.isArray(arr)
      ? arr.map((x) => ({
          id: typeof x?.id === "string" ? x.id : "",
          status: typeof x?.status === "string" ? x.status : "unavailable",
        }))
      : [];
  return {
    languages: mapStatus(plane.languages),
    toolchains: mapStatus(plane.toolchains),
    languageIntelligence: mapStatus(plane.languageIntelligence),
    specialist: {
      copilot: {
        status:
          typeof plane.specialist?.copilot?.status === "string"
            ? plane.specialist.copilot.status
            : "unavailable",
      },
    },
  };
}

/**
 * @param {any} validation
 */
async function runSessionValidation(
  emit,
  worktree,
  engineeringCwd,
  projectRoot,
  signal,
  objective = "",
) {
  emit("session.engineering.activity", {
    activity: "verifying",
    label: "Verifying",
  });
  emit("session.engineering.busy", {
    label: "Running validation checks",
    detail: "independent final validation",
    since: Date.now(),
  });
  emit("session.validation.plan", {
    summary: "independent final validation",
  });
  setFinalValidationProgressHook((check) => {
    const label =
      check.kind === "TEST"
        ? "Running tests"
        : check.kind === "TYPECHECK"
          ? "Checking TypeScript"
          : check.kind === "LINT"
            ? "Linting"
            : check.kind === "BUILD"
              ? "Building"
              : "Running validation checks";
    emit("session.engineering.busy", {
      label,
      detail: String(check.id || check.command || check.kind || "").slice(0, 160),
      since: Date.now(),
    });
    emit("session.validation.running", {
      id: check.id,
      kind: check.kind,
      check: check.id,
    });
  });
  try {
    const validation = await runIndependentFinalValidation({
      worktreePath: worktree.worktreePath,
      engineeringCwd,
      primaryRoot: projectRoot,
      objective,
      signal,
    });
    for (const check of validation.checks) {
      emit("session.validation.result", {
        id: check.id,
        check: check.id,
        kind: check.kind,
        ok: check.ok,
        status: check.ok ? "PASSED" : "FAILED",
        exitCode: check.exitCode,
      });
    }
    return validation;
  } finally {
    emit("session.engineering.busy", { clear: true });
    setFinalValidationProgressHook(null);
  }
}

/**
 * @param {string} activity
 */
function labelActivity(activity) {
  return ACTIVITY_LABELS[activity] ?? activity;
}

/**
 * Strip engine identity from product-facing strings.
 * @param {string} text
 */
export function scrubEngineIdentity(text) {
  if (typeof text !== "string") return "";
  return text
    .replace(/\bgoogle-antigravity\b/gi, "engine")
    .replace(/\bGoogle Antigravity\b/gi, "PATH")
    .replace(/\bAntigravity\b/gi, "PATH")
    .replace(/\bGitHub Copilot\b/gi, "PATH")
    .replace(/\bCopilot\b/gi, "PATH")
    .replace(/\bGemini\b/gi, "model");
}

/**
 * Run one AG1 engineering task against projectRoot (primary checkout).
 *
 * @param {any} prompt
 * @param {{
 *   streams?: any,
 *   taskText: string,
 *   projectRoot: string,
 *   checkoutRoot?: string,
 *   workingSubdir?: string,
 *   sessionEventEmit?: (type: string, fields?: Record<string, unknown>) => void,
 *   signal?: AbortSignal,
 *   wallClockMs?: number,
 *   cardsOwnProgress?: boolean,
 *   unicode?: boolean,
 *   sessionBaseCommit?: string | null,
 *   preferCopilotSdk?: boolean,
 *   preferredEngine?: string | null,
 *   suppressTaskReceived?: boolean,
 *   resumeTaskId?: string,
 *   taskId?: string,
 * }} options
 */
export async function runAntigravityEngineeringSession(prompt, options = {}) {
  const emit =
    typeof options.sessionEventEmit === "function"
      ? options.sessionEventEmit
      : () => {};
  const write = (text) => {
    if (options.cardsOwnProgress) return;
    try {
      prompt.write(text);
    } catch {
      // ignore
    }
  };

  const taskText = normalizeObjectiveText(
    typeof options.taskText === "string" ? options.taskText.trim() : "",
  );
  const projectRoot = resolve(options.projectRoot || process.cwd());
  const resumeTaskId =
    typeof options.resumeTaskId === "string" && options.resumeTaskId.trim()
      ? options.resumeTaskId.trim()
      : "";
  const forcedTaskId =
    typeof options.taskId === "string" && options.taskId.trim()
      ? options.taskId.trim()
      : "";
  const taskId = resumeTaskId || forcedTaskId || randomUUID();
  const startedAt = Date.now();
  /** @type {string[]} */
  const timingMarks = [];
  const markTiming = (name) => {
    timingMarks.push(`${name}:${Date.now() - startedAt}`);
  };
  markTiming("session_start");
  const isResume = Boolean(resumeTaskId);

  if (taskText.length === 0 && !isResume) {
    emit("session.terminal", {
      disposition: "EMPTY_TASK",
      summary: "empty task text",
    });
    return {
      exitCode: 2,
      outcome: "EMPTY_TASK",
      classification: "NOT_VERIFIED",
      engineActivityCount: 0,
    };
  }

  if (options.suppressTaskReceived !== true) {
    emit("session.task.received", {
      taskId,
      task: taskText.slice(0, 4000),
      preview: taskText.slice(0, 4000),
      mode: "ag1",
    });
  }

  emit("session.capability.preparing", {
    detail: "Admitting project and preparing environment",
  });

  // Observe repository state before bootstrap. Ordinary dirty / detached
  // checkouts are admitted — only unusable Git conditions fail closed here.
  const admission = admitPrimaryCheckout(projectRoot);
  if (!admission.ok) {
    write(`${admission.message}\n`);
    emit("session.terminal", {
      disposition: admission.code,
      summary: admission.message,
    });
    return {
      exitCode: 2,
      outcome: admission.code,
      classification: "NOT_VERIFIED",
      blocked: true,
      blocker: admission.message,
      engineActivityCount: 0,
    };
  }

  const boot = await ensureAg1Runtime({
    ...(options.checkoutRoot ? { packageRoot: options.checkoutRoot } : {}),
    ...(typeof options.runtimeRoot === "string" && options.runtimeRoot.trim()
      ? { runtimeRoot: options.runtimeRoot.trim() }
      : {}),
  });
  if (!boot.ok) {
    write(`${boot.message}\n`);
    emit("session.terminal", {
      disposition: boot.code,
      summary: scrubEngineIdentity(boot.message),
    });
    return {
      exitCode: 2,
      outcome: boot.code,
      classification: "NOT_VERIFIED",
    };
  }

  const venv = assertAg1VenvReady({
    ...(options.checkoutRoot ? { checkoutRoot: options.checkoutRoot } : {}),
    ...(boot.runtimeRoot ? { runtimeRoot: boot.runtimeRoot } : {}),
    ...(boot.pythonPath ? { pythonPath: boot.pythonPath } : {}),
  });
  if (!venv.ok) {
    write(`${venv.message}\n`);
    emit("session.terminal", {
      disposition: venv.code,
      summary: scrubEngineIdentity(venv.message),
    });
    return {
      exitCode: 2,
      outcome: venv.code,
      classification: "NOT_VERIFIED",
    };
  }

  hydrateAg1CloudEnv(process.env);
  const auth = detectAg1Auth(process.env);
  if (!auth.ok) {
    write(`${auth.message}\n`);
    emit("session.terminal", {
      disposition: "AG1_AUTH_REQUIRED",
      summary: auth.message,
    });
    return {
      exitCode: 2,
      outcome: "AG1_AUTH_REQUIRED",
      classification: "NOT_VERIFIED",
      blocked: true,
      blocker: auth.message,
    };
  }

  const sessionBaseCommit =
    typeof options.sessionBaseCommit === "string" &&
    options.sessionBaseCommit.trim() !== ""
      ? options.sessionBaseCommit.trim()
      : admission.head;

  const primaryBefore = capturePrimaryFingerprint(projectRoot);
  const branchLabel = admission.unversioned
    ? "unversioned"
    : admission.detached || !admission.branch
      ? "(detached)"
      : admission.branch;
  emit("session.preflight", {
    branch: branchLabel,
    head: admission.head,
    sessionBaseCommit,
    dirtySummary: admission.unversioned
      ? "unversioned"
      : admission.dirty
        ? "dirty"
        : "clean",
    projectName: basename(projectRoot),
    detached: admission.detached === true,
    unversioned: admission.unversioned === true,
  });

  if (admission.unversioned) {
    emit("session.capability.preparing", {
      detail:
        "Unversioned project — engineering in place until source control is established",
    });
  } else if (admission.dirty) {
    emit("session.capability.preparing", {
      detail: "Adopting current working-tree state into the isolated task workspace",
    });
  } else if (admission.detached) {
    emit("session.capability.preparing", {
      detail: "Creating an internal task branch from the current commit",
    });
  }
  const worktree = isResume
    ? reopenTaskWorktree({
        primaryRoot: projectRoot,
        taskId,
        ...(typeof options.resumeWorktreePath === "string"
          ? { worktreePath: options.resumeWorktreePath }
          : {}),
        ...(options.checkoutRoot ? { checkoutRoot: options.checkoutRoot } : {}),
      })
    : createTaskWorktree({
        primaryRoot: projectRoot,
        taskId,
        baselineCommit: sessionBaseCommit,
        ...(options.checkoutRoot ? { checkoutRoot: options.checkoutRoot } : {}),
      });
  if (!worktree.ok) {
    write(`${worktree.message}\n`);
    emit("session.terminal", {
      disposition: worktree.code,
      summary: worktree.message,
    });
    return {
      exitCode: 2,
      outcome: worktree.code,
      classification: "NOT_VERIFIED",
      engineActivityCount: 0,
    };
  }

  // Installed-product invariant: task workspace must be a working Git tree
  // before engines run. Repair dangling gitdir pointers when possible.
  if (worktree.bootstrapMode !== "unversioned_inplace") {
    let health = assertTaskWorktreeGitHealthy(
      worktree.worktreePath,
      projectRoot,
    );
    if (!health.ok) {
      const repaired = repairTaskWorktreeGit(
        projectRoot,
        worktree.worktreePath,
      );
      health = repaired.ok
        ? assertTaskWorktreeGitHealthy(worktree.worktreePath, projectRoot)
        : health;
    }
    if (!health.ok) {
      write(`${health.message}\n`);
      emit("session.terminal", {
        disposition: health.code || "AG1_WORKTREE_GIT_UNHEALTHY",
        summary: health.message,
      });
      return {
        exitCode: 2,
        outcome: health.code || "AG1_WORKTREE_GIT_UNHEALTHY",
        classification: "NOT_VERIFIED",
        engineActivityCount: 0,
      };
    }
  }

  if (isResume) {
    emit("session.hydration", {
      stage: "task_resume",
      detail: `resuming task ${worktree.taskId}`,
      mode: "PATH_RESUME",
    });
  }

  emit("session.engineering.workspace", {
    taskId: worktree.taskId,
    taskBranch: worktree.taskBranch,
    workspace: worktree.worktreePath,
    workingSubdir:
      typeof options.workingSubdir === "string" ? options.workingSubdir : "",
    engineeringCwd: resolveEngineeringCwd(
      worktree.worktreePath,
      typeof options.workingSubdir === "string" ? options.workingSubdir : "",
    ),
    baselineHead: worktree.baseline.head,
    status: "ready",
    bootstrapMode: worktree.bootstrapMode || undefined,
  });
  emit("session.recovery.checkpoint", {
    id: worktree.baseline.head
      ? `ag1-baseline:${worktree.baseline.head}`
      : `ag1-unversioned:${worktree.taskId}`,
    kind: worktree.bootstrapMode === "unversioned_inplace"
      ? "unversioned-bootstrap"
      : "task-worktree-baseline",
  });

  const capabilityPlane = discoverCapabilityPlane(worktree.worktreePath, {
    toolRoots: [worktree.worktreePath, projectRoot],
    primaryRoot: projectRoot,
  });
  markTiming("discovery_done");
  emit("session.capability.discovered", {
    matrix: compactCapabilityMatrix(capabilityPlane),
  });

  const discoveredMcp = discoverProjectMcpConfigs(worktree.worktreePath);
  const policyMcp = (Array.isArray(discoveredMcp) ? discoveredMcp : []).map(
    (server) => applyMcpTrustPolicy(server),
  );
  const enabledMcp = policyMcp.filter((s) => s && s.enabled === true);
  const deniedMcp = policyMcp.filter((s) => !s || s.enabled !== true);
  let mcpServers = toAntigravityMcpServers(enabledMcp);
  emit("session.capability.mcp", {
    enabled: enabledMcp.length,
    denied: deniedMcp.length,
    servers: enabledMcp.map((s) => ({
      name: typeof s?.name === "string" ? s.name : "",
      type: typeof s?.type === "string" ? s.type : "stdio",
      trustClass: typeof s?.trustClass === "string" ? s.trustClass : "",
    })),
  });

  const runtimeRoot =
    typeof options.runtimeRoot === "string" && options.runtimeRoot.trim()
      ? resolve(options.runtimeRoot.trim())
      : resolvePathRuntimeRoot({
          ...(options.checkoutRoot ? { packageRoot: options.checkoutRoot } : {}),
        });
  /** @type {any} */
  let preparedEnv = null;
  /** @type {typeof import("../ag9/prepare.mjs") | null} */
  let ag9Prepare = null;
  /** @type {typeof import("../ag9/services.mjs") | null} */
  let ag9Services = null;
  /** @type {typeof import("../ag9/collaborate.mjs") | null} */
  let ag9Collab = null;
  /** @type {typeof import("../ag9/copilot-engine.mjs") | null} */
  let ag9CopilotEngine = null;
  /** @type {Awaited<ReturnType<typeof import("../ag10/index.mjs").createG10Fabric>> | null} */
  let g10Fabric = null;
  try {
    ag9Prepare = await import("../ag9/prepare.mjs");
    ag9Services = await import("../ag9/services.mjs");
    ag9Collab = await import("../ag9/collaborate.mjs");
    ag9CopilotEngine = await import("../ag9/copilot-engine.mjs");
    preparedEnv = await ag9Prepare.prepareEngineeringEnvironment({
      projectRoot,
      worktreePath: worktree.worktreePath,
      runtimeRoot,
      plane: capabilityPlane,
      taskText,
      signal: options.signal,
      startServices: true,
      emit: (event) => {
        if (event && typeof event.type === "string") {
          emit(event.type, event);
        }
      },
    });
    markTiming("environment_ready");
  } catch (err) {
    markTiming("environment_failed");
    emit("session.capability.preparing", {
      detail: "environment preparation failed; continuing with discovery-only",
      error: scrubEngineIdentity(
        err && typeof err === "object" && "message" in err
          ? String(/** @type {{ message?: unknown }} */ (err).message)
          : String(err),
      ).slice(0, 160),
    });
  }

  try {
    const ag10 = await import("../ag10/index.mjs");
    const resumeObjective =
      taskText ||
      (isResume
        ? ag10.readTaskCheckpoint(runtimeRoot, worktree.taskId)?.objective || ""
        : "");
    g10Fabric = await ag10.createG10Fabric({
      runtimeRoot,
      taskId: worktree.taskId,
      sessionId: worktree.taskId,
      worktreePath: worktree.worktreePath,
      repoRoot: projectRoot,
      objective: resumeObjective || taskText,
      wallClockMs: options.wallClockMs ?? AG1_DEFAULT_WALL_CLOCK_MS,
      toolEnv:
        preparedEnv?.toolEnv && typeof preparedEnv.toolEnv === "object"
          ? /** @type {Record<string, string>} */ (preparedEnv.toolEnv)
          : undefined,
      preferCopilotSdk: options.preferCopilotSdk !== false,
      emit: (event) => {
        if (event && typeof event.type === "string") {
          emit(event.type, event);
        }
      },
    });
    if (isResume) {
      const reconciled = g10Fabric.reconcileResume();
      emit("session.hydration", {
        stage: "reality_reconcile",
        detail: reconciled.status,
        mode: reconciled.agSessionMode,
      });
    }
    // Best-effort Copilot SDK attach (falls back to CLI without failing the task).
    try {
      await g10Fabric.attachCopilot();
    } catch {
      /* optional peer */
    }
    // Best-effort Cursor SDK attach (auth/unavailable without failing the task).
    try {
      await g10Fabric.attachCursor();
    } catch {
      /* optional peer */
    }
  } catch {
    g10Fabric = null;
  }

  const g8Brief =
    typeof capabilityPlane?.briefForEngine === "string"
      ? capabilityPlane.briefForEngine
      : "";
  const capabilityBrief = [
    g8Brief,
    preparedEnv?.capabilityBrief ? String(preparedEnv.capabilityBrief) : "",
    preparedEnv?.mcpServersExtra?.length
      ? "PATH code intelligence MCP (path-scip) is available: use code_search_symbol / code_definition / code_references for cross-package navigation before editing."
      : "",
  ]
    .filter((s) => s.trim())
    .join("\n\n")
    .slice(0, 8000);

  if (preparedEnv && Array.isArray(preparedEnv.mcpServersExtra)) {
    /** @type {object[]} */
    const pathOwnedEnabled = [];
    for (const extra of preparedEnv.mcpServersExtra) {
      const trusted = applyMcpTrustPolicy({
        ...extra,
        tools: Array.isArray(extra?.enabled_tools)
          ? extra.enabled_tools.map((name) => ({
              name,
              description: "read-only code intelligence",
            }))
          : [{ name: "code_search_symbol", description: "read-only symbol search" }],
      });
      if (trusted.enabled) {
        pathOwnedEnabled.push(trusted);
        mcpServers = [
          ...mcpServers,
          ...toAntigravityMcpServers([trusted]),
        ];
      }
    }
    if (pathOwnedEnabled.length > 0) {
      emit("session.capability.mcp", {
        enabled: pathOwnedEnabled.length,
        denied: 0,
        source: "path_runtime",
        servers: pathOwnedEnabled.map((s) => ({
          name: typeof s?.name === "string" ? s.name : "",
          type: typeof s?.type === "string" ? s.type : "stdio",
          trustClass: typeof s?.trustClass === "string" ? s.trustClass : "",
        })),
      });
    }
  }

  /** @type {Record<string, string> | null} */
  const toolEnv =
    preparedEnv?.toolEnv && typeof preparedEnv.toolEnv === "object"
      ? /** @type {Record<string, string>} */ (preparedEnv.toolEnv)
      : null;

  const sandbox = proveLocalSandboxConfinement({
    ...(options.checkoutRoot ? { checkoutRoot: options.checkoutRoot } : {}),
  });
  const allowShell = sandbox.allowShell === true;
  if (!allowShell) {
    write(
      "Local command sandbox not proven — autonomous shell disabled (fail closed).\n",
    );
    emit("session.engineering.activity", {
      activity: "diagnosing",
      label: "Diagnosing",
      detail: "shell confinement unavailable",
    });
  }

  const ac = new AbortController();
  if (options.signal) {
    if (options.signal.aborted) ac.abort();
    else {
      options.signal.addEventListener("abort", () => ac.abort(), { once: true });
    }
  }

  const pollCancel = setInterval(() => {
    if (typeof prompt?.isStopped === "function" && prompt.isStopped()) {
      ac.abort();
      return;
    }
    if (
      typeof prompt?.isCycleCancelRequested === "function" &&
      prompt.isCycleCancelRequested()
    ) {
      ac.abort();
    }
  }, 250);
  if (typeof pollCancel.unref === "function") pollCancel.unref();

  let agentFinished = false;
  let agentFailed = false;
  let agentCancelled = false;
  let lastActivity = "understanding";
  let engineActivityCount = 0;
  /** @type {(value: Record<string, unknown>) => void} */
  let resolveTerminal = () => {};
  /** @type {Promise<Record<string, unknown>>} */
  let waitForTerminal = new Promise((resolveWait) => {
    resolveTerminal = resolveWait;
  });
  function armTerminalWait() {
    agentFinished = false;
    waitForTerminal = new Promise((resolveWait) => {
      resolveTerminal = resolveWait;
    });
    return waitForTerminal;
  }

  const wallMs = options.wallClockMs ?? AG1_DEFAULT_WALL_CLOCK_MS;
  const wallTimer = setTimeout(() => {
    agent.cancel();
    resolveTerminal({ type: "failed", code: "BUDGET_WALL_CLOCK" });
  }, wallMs);
  if (typeof wallTimer.unref === "function") wallTimer.unref();

  /** @type {ReturnType<typeof import("../ag10/ag-session.mjs").bindAntigravitySession> | null} */
  let agBind = null;

  const agent = createAntigravityEngineeringAgent({
    ...(options.checkoutRoot ? { checkoutRoot: options.checkoutRoot } : {}),
    onEvent: (msg) => {
      try {
        g10Fabric?.onAntigravityBridgeEvent?.(msg);
      } catch {
        /* ignore */
      }
      const type = msg.type;
      if (type === "started") {
        emit("session.engineering.bridge", {
          stage: "sdk_session",
          detail: "engineering session started",
        });
        engineActivityCount += 1;
        emit("session.engineering.activity", {
          activity: "understanding",
          label: labelActivity("understanding"),
        });
      } else if (type === "activity") {
        const activity =
          typeof msg.activity === "string" ? msg.activity : "inspecting";
        lastActivity = activity;
        engineActivityCount += 1;
        const detailRaw =
          typeof msg.detail === "string"
            ? msg.detail
            : typeof msg.tool === "string"
              ? msg.tool
              : undefined;
        emit("session.engineering.activity", {
          activity,
          label: labelActivity(activity),
          tool: typeof msg.tool === "string" ? msg.tool : undefined,
          detail: detailRaw,
        });
        // Live busy heartbeat while a real command/tool is in flight.
        if (
          detailRaw &&
          !/^(bash|sh|zsh|run_command|view_file|edit_file|list_directory)$/i.test(
            detailRaw.trim(),
          )
        ) {
          emit("session.engineering.busy", {
            label: busyLabelFromDetail(detailRaw, labelActivity(activity)),
            detail: detailRaw.slice(0, 200),
            since: Date.now(),
          });
        }
        if (activity === "editing") {
          emit("session.applying", { summary: "editing in task workspace" });
        } else if (activity === "inspecting") {
          emit("session.reading", { files: [] });
        }
      } else if (type === "tool") {
        engineActivityCount += 1;
        const summary = scrubEngineIdentity(String(msg.summary ?? ""));
        const toolName = typeof msg.tool === "string" ? msg.tool : "";
        const kind = typeof msg.kind === "string" ? msg.kind : "";
        const eventPath =
          typeof msg.path === "string" && msg.path.trim()
            ? msg.path.trim().replace(/^\.\//, "")
            : "";
        const eventCommand =
          typeof msg.command === "string" && msg.command.trim()
            ? msg.command.trim()
            : "";
        const eventQuery =
          typeof msg.query === "string" && msg.query.trim()
            ? msg.query.trim()
            : "";
        const eventOutput =
          typeof msg.output === "string" && msg.output.trim()
            ? msg.output.trim()
            : "";

        const pathMatch =
          summary.match(
            /(?:view_file|edit_file|create_file|EDIT_FILE|CREATE_FILE|VIEW_FILE)\s+(?:View\s+|Edit\s+|Create\s+)?([^\s]+)/i,
          ) ||
          summary.match(/(?:^|\s)((?:src|test|tests|lib|scripts|docs|app|packages)\/[^\s]+)/) ||
          summary.match(/(?:^|\s)([^\s/]+\/[^\s]+?\.[A-Za-z0-9]{1,12})\b/) ||
          summary.match(/(?:^|\s)([^\s]+?\.[A-Za-z0-9]{1,12})\b/);
        let relPath = eventPath || (pathMatch?.[1] ? String(pathMatch[1]).replace(/^\.\//, "") : "");
        if (
          /^(Code|View|Edit|Create|bash|sh|zsh|run_command|view_file|edit_file|list_directory|find_file|search_directory)$/i.test(
            relPath,
          )
        ) {
          relPath = "";
        }

        /** @type {Record<string, unknown>} */
        const toolFields = {
          kind,
          tool: toolName,
          summary,
        };
        if (relPath) toolFields.path = relPath;
        if (eventQuery) toolFields.query = eventQuery;

        if (kind === "file_edit" || /edit_file|create_file/i.test(toolName)) {
          try {
            const captured = captureFileDiffForUi(
              worktree.worktreePath,
              worktree.baseline?.head || "",
              relPath,
            );
            if (captured.diff) {
              toolFields.diff = captured.diff;
              toolFields.added = captured.added;
              toolFields.removed = captured.removed;
              if (captured.path) toolFields.path = captured.path;
            }
          } catch {
            // presentation only
          }
        } else if (
          kind === "inspect" ||
          /view_file|list_dir|list_directory|find_file|search_dir/i.test(toolName)
        ) {
          if (/view_file/i.test(toolName) && relPath) {
            try {
              const prev = captureFilePreviewForUi(
                worktree.worktreePath,
                relPath,
                { maxLines: 18 },
              );
              if (prev.preview) toolFields.preview = prev.preview;
            } catch {
              // presentation only
            }
          }
          if (eventOutput && !toolFields.preview) {
            // list_dir / search results arrive as tool output.
            toolFields.preview = eventOutput.split("\n").slice(0, 18).join("\n");
          }
        } else if (
          kind === "command" ||
          kind === "test" ||
          /run_command/i.test(toolName)
        ) {
          const cmdMatch =
            summary.match(/CommandLine[=:\s]+([^\n]+)/i) ||
            summary.match(/run_command\s+([^\n]+)/i);
          let command = eventCommand;
          if (!command && cmdMatch?.[1]) {
            const candidate = cmdMatch[1].trim();
            // Reject when "command" is clearly stdout (errors, test banners).
            const looksLikeOutput =
              /^[✔✖ℹ✓✗]/.test(candidate) ||
              /^(PASS|FAIL|ok|tests?\s+\d|suites?\s+\d|env:)/i.test(candidate) ||
              candidate.includes("\n");
            if (!looksLikeOutput) command = candidate.slice(0, 500);
          }
          if (command) toolFields.command = command;
          const out =
            eventOutput ||
            summary
              .replace(/^run_command\s*/i, "")
              .replace(/CommandLine[=:\s]+[^\n]+\n?/i, "")
              .trim();
          if (out && out !== command) {
            toolFields.output = out.slice(0, 4_000);
          }
        } else if (eventOutput) {
          toolFields.output = eventOutput.slice(0, 4_000);
        }

        emit("session.engineering.tool", toolFields);
        // Tool result clears the in-flight busy line.
        emit("session.engineering.busy", { clear: true });
        if (kind === "file_edit" || /edit_file|create_file/i.test(toolName)) {
          emit("session.edit.summary", {
            path: relPath || String(summary).slice(0, 120),
            kind: /create/i.test(toolName) ? "create" : "edit",
            diff: typeof toolFields.diff === "string" ? toolFields.diff : undefined,
            added: toolFields.added,
            removed: toolFields.removed,
          });
        }
      } else if (type === "finished") {
        agentFinished = true;
        emit("session.engineering.busy", { clear: true });
        const finishedText =
          typeof msg.summary === "string" ? msg.summary : "";
        if (finishedText.trim()) {
          const narration = extractEngineeringNarration(finishedText);
          if (narration.text) {
            emit("session.engineering.narration", {
              text: narration.text,
              paragraphs: narration.paragraphs,
            });
          }
        }
        emit("session.engineering.activity", {
          activity: "complete",
          label: "Finishing",
        });
        resolveTerminal(msg);
      } else if (type === "failed") {
        agentFailed = true;
        const interrupted =
          msg.interrupted === true || msg.code === "BRIDGE_EXIT";
        if (interrupted) {
          try {
            agBind?.markDead?.();
          } catch {
            /* ignore */
          }
          try {
            markTaskInterrupted(
              runtimeRoot,
              worktree.taskId,
              String(msg.message || msg.code || "engine process exited"),
            );
            g10Fabric?.persist?.({
              latestEngineTurn: "interrupted",
              continuityDisposition: "interrupted",
              interruptedAt: new Date().toISOString(),
              continuityReason: String(msg.code || "BRIDGE_EXIT").slice(0, 200),
            });
          } catch {
            /* ignore */
          }
          emit("session.engineering.activity", {
            activity: "interrupted",
            label: "Interrupted",
            detail: scrubEngineIdentity(String(msg.message ?? msg.code ?? "")),
          });
          emit("session.hydration", {
            stage: "engine_interrupted",
            detail: String(msg.code || "BRIDGE_EXIT"),
            mode: "antigravity",
          });
        } else {
          emit("session.engineering.activity", {
            activity: "failed",
            label: "Failed",
            detail: scrubEngineIdentity(String(msg.message ?? msg.code ?? "")),
          });
        }
        resolveTerminal(msg);
      } else if (type === "cancelled") {
        agentCancelled = true;
        emit("session.cancelled", { reason: "operator_or_bridge" });
        resolveTerminal(msg);
      }
    },
    onDiagnostic: (kind, text) => {
      // Development evidence file only — never living UI / never secrets.
      if (kind === "stderr" || kind === "bridge_exit" || kind === "spawn_error") {
        emit("session.engineering.bridge", {
          stage: kind,
          detail: scrubEngineIdentity(String(text).slice(0, 120)),
        });
      }
    },
  });

  agBind = g10Fabric?.attachAntigravity?.(agent) || null;

  ac.signal.addEventListener(
    "abort",
    () => {
      agentCancelled = true;
      agent.cancel();
      resolveTerminal({ type: "cancelled" });
    },
    { once: true },
  );

  write("PATH Engineering Session · bounded autonomy\n");
  emit("session.engineering.activity", {
    activity: "understanding",
    label: "Understanding",
  });
  engineActivityCount += 1;

  emit("session.engineering.bridge", {
    stage: "spawn",
    detail: "starting engineering bridge",
  });

  const engineeringCwd = resolveEngineeringCwd(
    worktree.worktreePath,
    typeof options.workingSubdir === "string" ? options.workingSubdir : "",
  );

  const effectiveTaskText =
    (typeof taskText === "string" && taskText.trim()) ||
    g10Fabric?.getCheckpoint?.()?.objective ||
    "Continue PATH engineering from current task reality.";

  const startPayload = {
    taskId,
    workspace: worktree.worktreePath,
    defaultCwd: engineeringCwd,
    task: effectiveTaskText,
    allowShell,
    budget: {
      maxModelCalls: AG1_DEFAULT_MAX_MODEL_CALLS,
      maxToolCalls: AG1_DEFAULT_MAX_TOOL_CALLS,
      wallClockMs: wallMs,
    },
    ...(mcpServers.length > 0 ? { mcpServers } : {}),
    ...(capabilityBrief ? { capabilityBrief } : {}),
    ...(toolEnv ? { toolEnv } : {}),
  };

  /** Prefer Cursor as primary when requested and ready — skip AG startTask. */
  let cursorPrimaryDone = false;
  /** @type {string} */
  let cursorPrimarySummary = "";
  const preferredEngine =
    typeof g10Fabric?.resolvePreferredEngine === "function"
      ? g10Fabric.resolvePreferredEngine({ prefer: options.preferredEngine })
      : null;
  const cursorReadyAtStart =
    g10Fabric?.getCursor?.()?.getMode?.() === "native_sdk";

  if (
    preferredEngine === "cursor" &&
    cursorReadyAtStart &&
    typeof g10Fabric?.runCursorCollabTurn === "function"
  ) {
    emit("session.capability.collaborate", {
      engine: "cursor",
      phase: "primary",
      label: "Collaborative engineering",
      detail: "preferred Cursor engine taking the primary turn",
    });
    try {
      const primaryPrompt = [
        "You are the primary collaborating engineering engine in this PATH task worktree.",
        "You may inspect, edit, build, test, and implement inside this workspace.",
        "Do not push, open PRs, deploy, or leave the worktree.",
        "",
        effectiveTaskText,
        capabilityBrief ? `\nCapability brief:\n${capabilityBrief}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      const turnBudgetMs = Math.min(wallMs - 30_000, 300_000);
      const turn = await g10Fabric.runCursorCollabTurn({
        prompt: primaryPrompt,
        timeoutMs: Math.max(45_000, turnBudgetMs),
        signal: ac.signal,
      });
      if (turn?.ok) {
        cursorPrimaryDone = true;
        cursorPrimarySummary =
          typeof turn.text === "string" && turn.text.trim()
            ? turn.text.trim().slice(0, 8_000)
            : turn.detail || "Cursor primary turn completed";
        const turnNarration = extractEngineeringNarration(cursorPrimarySummary);
        if (turnNarration.text) {
          emit("session.engineering.narration", {
            text: turnNarration.text,
            paragraphs: turnNarration.paragraphs,
          });
        }
        emit("session.capability.collaborate", {
          engine: "cursor",
          phase: "done",
          label: "Primary complete",
          detail: "Cursor primary turn complete",
          mode: turn.mode || undefined,
        });
      } else if (turn?.code === "AUTH_REQUIRED") {
        emit("session.terminal", {
          disposition: "AUTH_REQUIRED",
          summary: "Cursor authentication required; falling back to PATH engine",
        });
        try {
          g10Fabric?.persist?.({
            cursorMode: "auth_required",
            finalState: undefined,
          });
        } catch {
          /* ignore */
        }
      } else {
        emit("session.capability.collaborate", {
          engine: "cursor",
          phase: "fallback",
          label: "Continuing",
          detail: turn?.detail || "Cursor primary unavailable; starting PATH engine",
        });
      }
    } catch {
      emit("session.capability.collaborate", {
        engine: "cursor",
        phase: "error",
        label: "Continuing",
        detail: "Cursor primary error; starting PATH engine",
      });
    }
  }

  /** @type {any} */
  let startResult;
  /** @type {Record<string, unknown>} */
  let terminalMsg;

  if (cursorPrimaryDone) {
    agentFinished = true;
    startResult = { ok: true, pid: null };
    terminalMsg = {
      type: "finished",
      summary: cursorPrimarySummary,
    };
    emit("session.engineering.bridge", {
      stage: "start_written",
      detail: "cursor primary — Antigravity start skipped",
    });
    emit("session.engineering.busy", {
      label: "Waiting for engineering result",
      detail: "cursor primary complete",
      since: Date.now(),
    });
  } else {
    const startEnvelope = agBind
      ? await agBind.startOrRehydrate({
          workspace: startPayload.workspace,
          defaultCwd: startPayload.defaultCwd,
          task: startPayload.task,
          allowShell: startPayload.allowShell,
          budget: startPayload.budget,
          mcpServers: startPayload.mcpServers,
          capabilityBrief: startPayload.capabilityBrief,
          toolEnv: startPayload.toolEnv,
          resumeFromCheckpoint: isResume,
          resumeBrief: isResume
            ? g10Fabric?.reconcileResume?.()?.resumeBrief
            : undefined,
        })
      : null;
    startResult = startEnvelope
      ? startEnvelope.result || {
          ok: false,
          code: "AG_START_FAILED",
          message: startEnvelope.detail || "Antigravity start failed",
        }
      : await agent.startTask(startPayload);
    if (!startResult.ok) {
      clearTimeout(wallTimer);
      clearInterval(pollCancel);
      const diagHint =
        typeof agent.getDiagFile === "function" ? agent.getDiagFile() : "";
      emit("session.engineering.bridge", {
        stage: "spawn_failed",
        detail: scrubEngineIdentity(startResult.message || startResult.code || ""),
      });
      emit("session.terminal", {
        disposition: startResult.code,
        summary: scrubEngineIdentity(
          `${startResult.message || "bridge start failed"}${diagHint ? ` (diag: ${diagHint})` : ""}`,
        ),
      });
      try {
        await agent.close();
      } catch {
        // ignore
      }
      return {
        exitCode: 2,
        outcome: startResult.code,
        classification: "NOT_VERIFIED",
        engineActivityCount,
      };
    }

    emit("session.engineering.bridge", {
      stage: "start_written",
      detail: `pid=${startResult.pid ?? "?"} python=ok`,
    });
    emit("session.engineering.busy", {
      label: "Waiting for engineering result",
      detail: "session started",
      since: Date.now(),
    });

    terminalMsg = await waitForTerminal;
  }
  // Surface operator steering into the stream immediately while the engine works,
  // and queue it for the next safe continue boundary.
  const steerPoll = setInterval(() => {
    if (typeof prompt?.drainSteering !== "function") return;
    for (const line of prompt.drainSteering()) {
      const text = String(line || "").trim();
      if (!text) continue;
      emit("session.operator.note", { text: text.slice(0, 400) });
      try {
        g10Fabric?.acceptSteering?.(text);
      } catch {
        /* ignore */
      }
      const question = isOperatorQuestion(text);
      emit("session.engineering.steer", {
        phase: "queued",
        text: text.slice(0, 400),
        question,
      });
      emit("session.engineering.narration", {
        text: question
          ? "Got your question — I'll answer with concrete evidence at the next safe engineering step."
          : "Guidance received — queued until the next safe engineering step.",
      });
    }
  }, 400);
  if (typeof steerPoll.unref === "function") steerPoll.unref();

  if (terminalMsg?.type === "cancelled" || ac.signal.aborted) {
    agentCancelled = true;
  }

  /** @type {Awaited<ReturnType<typeof runIndependentFinalValidation>> | null} */
  let validation = null;
  /** @type {string} */
  let engineeringHandoffSummary = "";
  let repairAttempts = 0;
  /** @type {string | null} */
  let lastCollabEngine = cursorPrimaryDone ? "cursor" : null;
  /** @type {Set<string>} */
  const enginesSeen = new Set(cursorPrimaryDone ? ["cursor"] : []);
  /** @type {string[]} */
  const fabricRoutingNotes = [];
  markTiming("first_engine_terminal");
  /** Steering continues applied before validation (bounded). */
  let steeringContinues = 0;

  while (
    !agentCancelled &&
    !agentFailed &&
    (agentFinished || terminalMsg?.type === "finished")
  ) {
    const finishedSummary =
      typeof terminalMsg?.summary === "string" ? terminalMsg.summary : "";
    if (finishedSummary) {
      const handoff = extractEngineeringHandoff(finishedSummary);
      if (handoff?.summary) {
        engineeringHandoffSummary = handoff.summary;
        emit("session.engineering.handoff", {
          summary: engineeringHandoffSummary,
        });
      }
    }

    // Apply pending operator steering as a real continue turn BEFORE validation.
    if (
      steeringContinues < 3 &&
      !ac.signal.aborted &&
      !agentCancelled &&
      wallMs - (Date.now() - startedAt) > 20_000
    ) {
      if (typeof prompt?.drainSteering === "function") {
        for (const line of prompt.drainSteering()) {
          const text = String(line || "").trim();
          if (!text) continue;
          emit("session.operator.note", { text: text.slice(0, 400) });
          try {
            g10Fabric?.acceptSteering?.(text);
          } catch {
            /* ignore */
          }
        }
      }
      const steeringApply = g10Fabric?.applySteeringBoundary?.() || null;
      const steerText =
        typeof steeringApply?.combinedText === "string"
          ? steeringApply.combinedText.trim()
          : "";
      if (steerText) {
        steeringContinues += 1;
        markTiming(`steering_continue_${steeringContinues}`);
        const question = isOperatorQuestion(steerText);
        const continuePrompt = buildSteeringContinuePrompt(steerText);
        emit("session.engineering.steer", {
          phase: "applying",
          text: steerText.slice(0, 400),
          question,
        });
        emit("session.engineering.narration", {
          text: question
            ? "Answering your question in the active engineering session now."
            : "Got it — applying your guidance in the active engineering session now.",
        });
        emit("session.engineering.busy", {
          label: question ? "Answering your question" : "Applying your guidance",
          detail: steerText.slice(0, 160),
          since: Date.now(),
        });
        armTerminalWait();
        try {
          // Prefer the same peer that owned the primary turn — do not force
          // Antigravity rehydrate after a successful Cursor primary.
          const cursorLive =
            g10Fabric?.getCursor?.()?.getMode?.() === "native_sdk" &&
            typeof g10Fabric?.runCursorCollabTurn === "function";
          if (
            cursorLive &&
            (cursorPrimaryDone || lastCollabEngine === "cursor")
          ) {
            const turn = await g10Fabric.runCursorCollabTurn({
              prompt: continuePrompt,
              timeoutMs: Math.min(
                180_000,
                Math.max(30_000, wallMs - (Date.now() - startedAt) - 15_000),
              ),
              signal: ac.signal,
            });
            lastCollabEngine = "cursor";
            enginesSeen.add("cursor");
            if (ac.signal.aborted || turn?.code === "CANCELLED") {
              agentCancelled = true;
              terminalMsg = { type: "cancelled" };
              break;
            }
            if (turn?.ok) {
              const summary =
                typeof turn.text === "string" && turn.text.trim()
                  ? turn.text.trim().slice(0, 8_000)
                  : turn.detail || "Cursor steering continue complete";
              terminalMsg = { type: "finished", summary };
              agentFinished = true;
              continue;
            }
            // Soft-fail into validation / repair rotation.
          } else if (agBind?.isLive?.()) {
            const cont = agBind.continueNative({
              text: continuePrompt,
            });
            if (!cont.ok) {
              agent.continueTask({
                text: continuePrompt,
              });
            }
            terminalMsg = await waitForTerminal;
            agentFinished = terminalMsg?.type === "finished";
            if (terminalMsg?.type === "cancelled" || ac.signal.aborted) {
              agentCancelled = true;
              break;
            }
            if (terminalMsg?.type === "failed") {
              agentFailed = true;
              break;
            }
            continue;
          } else if (agBind) {
            await agBind.resumeOrRehydrate({
              text: continuePrompt,
              rehydrate: {
                workspace: worktree.worktreePath,
                defaultCwd: engineeringCwd,
                task: effectiveTaskText,
                allowShell,
                budget: {
                  maxModelCalls: AG1_DEFAULT_MAX_MODEL_CALLS,
                  maxToolCalls: AG1_DEFAULT_MAX_TOOL_CALLS,
                  wallClockMs: wallMs - (Date.now() - startedAt),
                },
                ...(mcpServers.length > 0 ? { mcpServers } : {}),
                ...(capabilityBrief ? { capabilityBrief } : {}),
                ...(toolEnv ? { toolEnv } : {}),
                resumeBrief:
                  g10Fabric?.reconcileResume?.()?.resumeBrief ||
                  (cursorPrimaryDone
                    ? "Peer Cursor already worked this task; apply operator steering from current reality."
                    : undefined),
              },
            });
            terminalMsg = await waitForTerminal;
            agentFinished = terminalMsg?.type === "finished";
            if (terminalMsg?.type === "cancelled" || ac.signal.aborted) {
              agentCancelled = true;
              break;
            }
            if (terminalMsg?.type === "failed") {
              agentFailed = true;
              break;
            }
            continue;
          } else {
            agent.continueTask({
              text: continuePrompt,
            });
            terminalMsg = await waitForTerminal;
            agentFinished = terminalMsg?.type === "finished";
            if (terminalMsg?.type === "cancelled" || ac.signal.aborted) {
              agentCancelled = true;
              break;
            }
            if (terminalMsg?.type === "failed") {
              agentFailed = true;
              break;
            }
            continue;
          }
        } catch {
          // Fall through to validation if continue fails.
        }
      }
    }

    markTiming(`validation_start_${repairAttempts}`);
    validation = await runSessionValidation(
      emit,
      worktree,
      engineeringCwd,
      projectRoot,
      ac.signal,
      effectiveTaskText,
    );
    markTiming(`validation_end_${repairAttempts}`);

    const hasFailingChecks =
      Array.isArray(validation?.checks) &&
      validation.checks.some((c) => c && c.ok !== true);
    const wallBudgetRemainingMs = wallMs - (Date.now() - startedAt);

    // G10: drain mid-cycle operator steering into the fabric queue.
    if (g10Fabric && typeof prompt?.drainSteering === "function") {
      for (const line of prompt.drainSteering()) {
        const text = String(line || "").trim();
        if (text) emit("session.operator.note", { text: text.slice(0, 400) });
        g10Fabric.acceptSteering(line);
      }
      g10Fabric.applySteeringBoundary();
    }
    try {
      g10Fabric?.persist?.({
        latestEngineTurn: "validation",
        validation: {
          classification: validation?.classification,
          failing:
            Array.isArray(validation?.checks)
              ? validation.checks.filter((c) => c && c.ok !== true).length
              : 0,
        },
      });
    } catch {
      /* ignore */
    }
    const attemptRepair = shouldAttemptSameSessionRepair({
      classification: validation?.classification,
      attempts: repairAttempts,
      maxAttempts: AG8_MAX_REPAIR_ATTEMPTS,
      aborted: ac.signal.aborted || agentCancelled,
      hasFailingChecks,
      wallBudgetRemainingMs,
    });

    if (!attemptRepair) {
      break;
    }

    emit("session.engineering.activity", {
      activity: "repairing",
      label: "Repairing",
      detail: "final validation failure",
    });

    const copilotReady = Boolean(
      g10Fabric?.getCopilot?.()?.getMode?.() === "native_sdk" ||
        g10Fabric?.getCopilot?.()?.getMode?.() === "cli_fallback" ||
        ag9CopilotEngine?.isCopilotEngineeringReady?.(),
    );
    const cursorReady =
      g10Fabric?.getCursor?.()?.getMode?.() === "native_sdk";
    const preferred =
      typeof g10Fabric?.resolvePreferredEngine === "function"
        ? g10Fabric.resolvePreferredEngine({ prefer: options.preferredEngine })
        : preferredEngine;
    const turnNeeds =
      typeof g10Fabric?.inferTurnNeeds === "function"
        ? g10Fabric.inferTurnNeeds({
            role: "repair",
            objective: effectiveTaskText,
            validation,
          })
        : { needs: /** @type {string[]} */ (["repair", "code_edit", "shell"]), detail: "repair" };
    const selection =
      typeof g10Fabric?.explainCollabSelection === "function"
        ? g10Fabric.explainCollabSelection({
            role: "repair",
            attempt: repairAttempts,
            ready: {
              antigravity: true,
              copilot: copilotReady,
              cursor: cursorReady,
            },
            prefer: preferred,
            lastEngine: lastCollabEngine,
            preferContinuity: false,
            needs: turnNeeds.needs,
          })
        : null;
    const engineChoice =
      (selection && selection.engine) ||
      g10Fabric?.chooseCollabEngine?.({
        attempt: repairAttempts,
        copilotReady,
        cursorReady,
        prefer: preferred,
        lastEngine: lastCollabEngine,
        needs: turnNeeds.needs,
      }) ||
      ag9Collab?.chooseCollabEngine?.({
        attempt: repairAttempts,
        copilotReady,
        cursorReady,
        prefer: preferred,
        lastEngine: lastCollabEngine,
        needs: turnNeeds.needs,
      }) ||
      "antigravity";
    const previousEngine = lastCollabEngine;
    lastCollabEngine = engineChoice;
    enginesSeen.add(engineChoice);
    const routingReason =
      (selection && selection.reason) ||
      turnNeeds.detail ||
      "collaborative repair";
    fabricRoutingNotes.push(
      `${engineChoice}: ${routingReason}`.slice(0, 160),
    );
    if (fabricRoutingNotes.length > 8) {
      fabricRoutingNotes.splice(0, fabricRoutingNotes.length - 8);
    }
    const journalEntries =
      ag9Collab?.readCollabJournal?.({
        runtimeRoot,
        taskId: worktree.taskId,
      }) || [];
    const fabricPacket =
      typeof g10Fabric?.buildNextHandoff === "function"
        ? g10Fabric.buildNextHandoff({
            toEngine: engineChoice,
            fromEngine: previousEngine,
            needs: turnNeeds.needs,
            reason: routingReason,
            validationSummary:
              typeof validation?.reason === "string" ? validation.reason : "",
          })
        : null;
    const fabricHandoffText =
      typeof g10Fabric?.formatFabricHandoff === "function" && fabricPacket
        ? g10Fabric.formatFabricHandoff(fabricPacket)
        : "";
    const collabHandoff =
      fabricHandoffText ||
      ag9Collab?.formatCollabHandoff?.(journalEntries) ||
      "";
    const baseRepairPrompt = buildValidationRepairPrompt(validation, {
      ...(collabHandoff ? { collabHandoff } : {}),
    });

    /** @type {string | null} */
    let peerNotes = null;

    if (engineChoice === "cursor") {
      emit("session.capability.collaborate", {
        engine: "cursor",
        phase: "repair",
        label: "Repairing",
        detail: routingReason,
        needs: turnNeeds.needs,
        routing: routingReason,
      });
      /** @type {boolean} */
      let cursorTurnOk = false;
      try {
        const turnBudgetMs = Math.min(
          180_000,
          Math.max(45_000, wallBudgetRemainingMs - 20_000),
        );
        const repairPrompt = [
          "You are a full collaborating engineering engine in this PATH task worktree.",
          "You may inspect, edit, build, test, and repair code inside this workspace.",
          "Do not push, open PRs, deploy, or leave the worktree.",
          "Fix the independent validation failures below, then stop.",
          "",
          baseRepairPrompt,
        ].join("\n");

        const turn = g10Fabric
          ? await g10Fabric.runCursorCollabTurn({
              prompt: repairPrompt,
              timeoutMs: turnBudgetMs,
              signal: ac.signal,
            })
          : null;
        if (turn?.ok) {
          cursorTurnOk = true;
          peerNotes =
            typeof turn.text === "string" && turn.text.trim()
              ? turn.text.trim().slice(0, 2_000)
              : turn.detail || "repair turn completed";
          const turnNarration = extractEngineeringNarration(
            typeof turn.text === "string" ? turn.text : peerNotes || "",
          );
          if (turnNarration.text) {
            emit("session.engineering.narration", {
              text: turnNarration.text,
              paragraphs: turnNarration.paragraphs,
            });
          }
          emit("session.capability.collaborate", {
            engine: "cursor",
            phase: "done",
            label: "Repair complete",
            detail: "repair turn complete",
            mode: turn.mode || undefined,
          });
          if (turn.breaker?.action === "stop_auto_bounce") {
            emit("session.terminal", {
              disposition: "NEEDS_DIRECTION",
              summary: "NO_PROGRESS_COLLABORATION",
            });
            break;
          }
        } else if (turn?.code === "AUTH_REQUIRED") {
          emit("session.terminal", {
            disposition: "AUTH_REQUIRED",
            summary: "Engineering authentication required; task preserved",
          });
          try {
            g10Fabric?.persist?.({
              cursorMode: "auth_required",
              finalState: undefined,
            });
          } catch {
            /* ignore */
          }
          // Do not destroy task; fall through to Antigravity peer.
        } else {
          emit("session.capability.collaborate", {
            engine: "cursor",
            phase: "fallback",
            label: "Continuing",
            detail: turn?.detail || "peer unavailable; continuing",
          });
        }
      } catch {
        emit("session.capability.collaborate", {
          engine: "cursor",
          phase: "error",
          label: "Continuing",
          detail: "peer turn error; continuing engineering",
        });
      }

      if (cursorTurnOk) {
        repairAttempts += 1;
        continue;
      }
      // Fall through to Antigravity with any peer notes.
    } else if (engineChoice === "copilot") {
      emit("session.capability.collaborate", {
        engine: "copilot",
        phase: "repair",
        label: "Repairing",
        detail: routingReason,
        needs: turnNeeds.needs,
        routing: routingReason,
      });
      /** @type {boolean} */
      let copilotTurnOk = false;
      try {
        const turnBudgetMs = Math.min(
          180_000,
          Math.max(45_000, wallBudgetRemainingMs - 20_000),
        );
        const repairPrompt = [
          "You are a full collaborating engineering engine in this PATH task worktree.",
          "You may inspect, edit, build, test, and repair code inside this workspace.",
          "Do not push, open PRs, deploy, or leave the worktree.",
          "Fix the independent validation failures below, then stop.",
          "",
          baseRepairPrompt,
        ].join("\n");

        const turn = g10Fabric
          ? await g10Fabric.runCopilotCollabTurn({
              prompt: repairPrompt,
              timeoutMs: turnBudgetMs,
            })
          : await (ag9Collab?.withCollabTurn
              ? ag9Collab.withCollabTurn(
                  {
                    runtimeRoot,
                    taskId: worktree.taskId,
                    engine: "copilot",
                    timeoutMs: turnBudgetMs + 30_000,
                  },
                  async () =>
                    ag9CopilotEngine.runCopilotEngineeringTurn({
                      prompt: repairPrompt,
                      cwd: engineeringCwd,
                      toolEnv: preparedEnv?.toolEnv || undefined,
                      timeoutMs: turnBudgetMs,
                    }),
                )
              : ag9CopilotEngine?.runCopilotEngineeringTurn?.({
                  prompt: repairPrompt,
                  cwd: engineeringCwd,
                  toolEnv: preparedEnv?.toolEnv || undefined,
                  timeoutMs: turnBudgetMs,
                }));
        if (turn?.ok) {
          copilotTurnOk = true;
          peerNotes =
            typeof turn.text === "string" && turn.text.trim()
              ? turn.text.trim().slice(0, 2_000)
              : turn.detail || "repair turn completed";
          const turnNarration = extractEngineeringNarration(
            typeof turn.text === "string" ? turn.text : peerNotes || "",
          );
          if (turnNarration.text) {
            emit("session.engineering.narration", {
              text: turnNarration.text,
              paragraphs: turnNarration.paragraphs,
            });
          }
          emit("session.capability.collaborate", {
            engine: "copilot",
            phase: "done",
            label: "Repair complete",
            detail: "repair turn complete",
            mode: turn.mode || undefined,
          });
          if (turn.breaker?.action === "stop_auto_bounce") {
            emit("session.terminal", {
              disposition: "NEEDS_DIRECTION",
              summary: "NO_PROGRESS_COLLABORATION",
            });
            break;
          }
        } else if (turn?.code === "AUTH_REQUIRED") {
          emit("session.terminal", {
            disposition: "AUTH_REQUIRED",
            summary: "Engineering authentication required; task preserved",
          });
          try {
            g10Fabric?.persist?.({
              copilotMode: "auth_required",
              finalState: undefined,
            });
          } catch {
            /* ignore */
          }
          // Do not destroy task; fall through to Antigravity peer.
        } else {
          emit("session.capability.collaborate", {
            engine: "copilot",
            phase: "fallback",
            label: "Continuing",
            detail: turn?.detail || "peer unavailable; continuing",
          });
          try {
            const advisory = await runCopilotAdvisory({
              question: [
                "Provide concise engineering notes for a collaborating peer (plain text).",
                "Focus on the concrete fix for the validation failures.",
                "",
                baseRepairPrompt.slice(0, 2_000),
              ].join("\n"),
              cwd: engineeringCwd,
              timeoutMs: 60_000,
            });
            if (advisory?.ok && advisory.text?.trim()) {
              peerNotes = advisory.text.trim();
              const notesNarration = extractEngineeringNarration(peerNotes);
              if (notesNarration.text) {
                emit("session.engineering.narration", {
                  text: notesNarration.text,
                  paragraphs: notesNarration.paragraphs,
                });
              }
            }
          } catch {
            /* optional */
          }
        }
      } catch {
        emit("session.capability.collaborate", {
          engine: "copilot",
          phase: "error",
          label: "Continuing",
          detail: "peer turn error; continuing engineering",
        });
      }

      if (copilotTurnOk) {
        // Re-validate after Copilot mutated the shared worktree.
        repairAttempts += 1;
        continue;
      }
      // Fall through to Antigravity with any peer notes.
    }

    // Antigravity collaborative repair turn (lease + continueTask).
    emit("session.capability.collaborate", {
      engine: "antigravity",
      phase: "turn",
      label: "Repairing",
      detail: "repairing validation failures in the task workspace",
    });
    const steeringText = g10Fabric?.applySteeringBoundary?.()?.combinedText || "";
    const mergedPeerNotes = [peerNotes, steeringText].filter(Boolean).join("\n") || null;
    const feedback = buildValidationRepairPrompt(validation, {
      ...(mergedPeerNotes ? { peerNotes: mergedPeerNotes } : {}),
      ...(collabHandoff ? { collabHandoff } : {}),
    });
    try {
      const runAntigravityTurn = async () => {
        armTerminalWait();
        if (agBind?.isLive?.()) {
          const cont = agBind.continueNative({ text: feedback });
          if (!cont.ok) {
            await agBind.resumeOrRehydrate({
              text: feedback,
              rehydrate: {
                workspace: worktree.worktreePath,
                defaultCwd: engineeringCwd,
                task: effectiveTaskText,
                allowShell,
                budget: {
                  maxModelCalls: AG1_DEFAULT_MAX_MODEL_CALLS,
                  maxToolCalls: AG1_DEFAULT_MAX_TOOL_CALLS,
                  wallClockMs: wallBudgetRemainingMs,
                },
                ...(mcpServers.length > 0 ? { mcpServers } : {}),
                ...(capabilityBrief ? { capabilityBrief } : {}),
                ...(toolEnv ? { toolEnv } : {}),
                resumeBrief: g10Fabric?.reconcileResume?.()?.resumeBrief,
              },
            });
          }
        } else if (agBind) {
          // Cursor primary may have skipped AG start — rehydrate on demand.
          await agBind.resumeOrRehydrate({
            text: feedback,
            rehydrate: {
              workspace: worktree.worktreePath,
              defaultCwd: engineeringCwd,
              task: effectiveTaskText,
              allowShell,
              budget: {
                maxModelCalls: AG1_DEFAULT_MAX_MODEL_CALLS,
                maxToolCalls: AG1_DEFAULT_MAX_TOOL_CALLS,
                wallClockMs: wallBudgetRemainingMs,
              },
              ...(mcpServers.length > 0 ? { mcpServers } : {}),
              ...(capabilityBrief ? { capabilityBrief } : {}),
              ...(toolEnv ? { toolEnv } : {}),
              resumeBrief:
                g10Fabric?.reconcileResume?.()?.resumeBrief ||
                (cursorPrimaryDone
                  ? "Peer Cursor already worked this task; continue from current PATH/Git reality."
                  : undefined),
            },
          });
        } else {
          agent.continueTask({ text: feedback });
        }
        terminalMsg = await waitForTerminal;
        return {
          detail: String(terminalMsg?.type || "finished"),
          changedFiles: [],
        };
      };
      if (g10Fabric?.runAntigravityCollabTurn) {
        const leased = await g10Fabric.runAntigravityCollabTurn({
          runTurn: runAntigravityTurn,
          timeoutMs: Math.min(wallBudgetRemainingMs, 240_000),
        });
        if (leased?.breaker?.action === "stop_auto_bounce") {
          emit("session.terminal", {
            disposition: "NEEDS_DIRECTION",
            summary: "NO_PROGRESS_COLLABORATION",
          });
          break;
        }
      } else if (ag9Collab?.withCollabTurn) {
        await ag9Collab.withCollabTurn(
          {
            runtimeRoot,
            taskId: worktree.taskId,
            engine: "antigravity",
            timeoutMs: Math.min(wallBudgetRemainingMs, 240_000),
          },
          runAntigravityTurn,
        );
      } else {
        await runAntigravityTurn();
      }
    } catch {
      armTerminalWait();
      agent.continueTask({ text: feedback });
      terminalMsg = await waitForTerminal;
    }
    emit("session.capability.collaborate", {
      engine: "antigravity",
      phase: "done",
      label: "Repair complete",
      detail:
        terminalMsg?.type === "finished"
          ? "repair turn complete"
          : String(terminalMsg?.type || "repair turn complete"),
    });
    repairAttempts += 1;

    if (terminalMsg?.type === "cancelled" || ac.signal.aborted) {
      agentCancelled = true;
      break;
    }
    if (terminalMsg?.type === "failed") {
      agentFailed = true;
      break;
    }
    if (!(agentFinished || terminalMsg?.type === "finished")) {
      break;
    }
  }

  try {
    agent.signalDone();
  } catch {
    // ignore
  }

  clearTimeout(wallTimer);
  clearInterval(pollCancel);
  clearInterval(steerPoll);

  if (agentCancelled) {
    emit("session.validation.skipped", { reason: "cancelled" });
  } else if (agentFailed && !validation) {
    emit("session.validation.skipped", {
      reason: String(terminalMsg?.code ?? "engine_failed"),
    });
  }

  // Read-only / assessment objectives: restore incidental setup-only churn
  // (e.g. package-lock.json from dependency install) before final diff /
  // classification so setup never becomes the engineering result. Explicit
  // dependency-upgrade intents skip this path.
  const setupRestore = restoreIncidentalSetupChurn({
    worktreePath: worktree.worktreePath,
    baselineHead: worktree.baseline.head,
    objective: effectiveTaskText,
  });
  if (setupRestore.applied) {
    emit("session.engineering.setup_restore", {
      restored: setupRestore.restored,
      reason: setupRestore.reason,
    });
  }

  const gitResult = collectWorktreeResult(
    worktree.worktreePath,
    worktree.baseline.head,
  );
  const primaryAfter = capturePrimaryFingerprint(projectRoot);
  const untouched = primaryUntouched(primaryBefore, primaryAfter);

  /** @type {string} */
  let classification;
  /** @type {string} */
  let terminalDisposition;
  /** @type {string} */
  let terminalSummary;

  if (agentCancelled) {
    classification = "NOT_VERIFIED";
    terminalDisposition = "CANCELLED";
    terminalSummary = "cancelled";
  } else if (
    (agentFailed || terminalMsg?.type === "failed") &&
    (terminalMsg?.interrupted === true ||
      terminalMsg?.code === "BRIDGE_EXIT")
  ) {
    // S4.2 — engine process death is interruption, not a completed failure.
    // Keep the PATH task resumable from durable reality.
    classification = "NOT_VERIFIED";
    terminalDisposition = "INTERRUPTED";
    terminalSummary = scrubEngineIdentity(
      String(
        terminalMsg?.message ||
          terminalMsg?.code ||
          "engineering process interrupted",
      ),
    );
  } else if (agentFailed || terminalMsg?.type === "failed") {
    classification = "FAILED";
    terminalDisposition = String(terminalMsg?.code || "AG1_ENGINE_FAILED");
    terminalSummary = scrubEngineIdentity(
      String(terminalMsg?.message || terminalMsg?.code || "engineering failed"),
    );
  } else {
    classification = classifyAg1Result({
      agentFinished: agentFinished || terminalMsg?.type === "finished",
      validation,
    });
    terminalDisposition = classification;
    terminalSummary =
      validation?.reason ?? String(terminalMsg?.type ?? lastActivity);
  }

  if (
    (agentFinished || terminalMsg?.type === "finished") &&
    !validation &&
    classification === "VERIFIED"
  ) {
    throw new Error("AG1 invariant violated: finished implied VERIFIED");
  }

  const hasChanges = gitResult.changedFiles.length > 0;
  /** @type {string | null} */
  let commitSha = null;
  /** @type {string | null} */
  let commitStatus = null;
  /** @type {string | null} */
  let preservedPath = null;
  let advancesSession = false;

  if (classification === "VERIFIED") {
    if (hasChanges) {
      const committed = commitTaskWorktree({
        worktreePath: worktree.worktreePath,
        message: `PATH: verified task ${worktree.taskId}`,
      });
      if (!committed.ok) {
        if (committed.code === "GIT_IDENTITY_REQUIRED") {
          terminalDisposition = "GIT_IDENTITY_REQUIRED";
          terminalSummary = committed.message;
          preservedPath = worktree.worktreePath;
          commitStatus = "IDENTITY_BLOCKED";
        } else {
          terminalDisposition = String(committed.code || "GIT_COMMIT_FAILED");
          terminalSummary = String(committed.message || "commit failed");
          preservedPath = worktree.worktreePath;
          commitStatus = "COMMIT_FAILED";
        }
      } else if (!committed.skipped && committed.commitSha) {
        commitSha = committed.commitSha;
        commitStatus = "VERIFIED";
        advancesSession = true;
      } else {
        // Verified with no file changes — still a truthful terminal, no commit.
        commitStatus = "NO_CHANGES";
        advancesSession = true;
        commitSha = worktree.baseline.head;
      }
    } else {
      commitStatus = "NO_CHANGES";
      advancesSession = true;
      commitSha = worktree.baseline.head;
    }
  } else if (
    hasChanges &&
    (classification === "PARTIALLY_VERIFIED" ||
      classification === "FAILED" ||
      terminalDisposition === "CANCELLED" ||
      classification === "NOT_VERIFIED")
  ) {
    const label =
      classification === "PARTIALLY_VERIFIED"
        ? "PARTIALLY VERIFIED"
        : "UNVERIFIED";
    const committed = commitTaskWorktree({
      worktreePath: worktree.worktreePath,
      message: `PATH WIP: preserve ${label.toLowerCase()} task ${worktree.taskId}`,
    });
    if (!committed.ok) {
      if (committed.code === "GIT_IDENTITY_REQUIRED") {
        preservedPath = worktree.worktreePath;
        commitStatus = "IDENTITY_BLOCKED";
        write(`${committed.message}\n`);
      } else {
        preservedPath = worktree.worktreePath;
        commitStatus = "COMMIT_FAILED";
      }
    } else if (!committed.skipped && committed.commitSha) {
      commitSha = committed.commitSha;
      commitStatus = label;
    }
  }

  const baselineSha = worktree.baseline.head;
  // Adopt HEAD when the tip already advanced past baseline (Cursor may have
  // committed during the turn) even if pre-commit collect looked empty.
  try {
    const { spawnSync } = await import("node:child_process");
    const head = spawnSync("git", ["rev-parse", "HEAD"], {
      cwd: worktree.worktreePath,
      encoding: "utf8",
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      timeout: 15_000,
    });
    const tip = (head.stdout || "").trim();
    if (
      head.status === 0 &&
      /^[0-9a-f]{7,40}$/i.test(tip) &&
      classification === "VERIFIED" &&
      String(tip).toLowerCase() !== String(baselineSha).toLowerCase()
    ) {
      commitSha = tip;
      if (!commitStatus || commitStatus === "NO_CHANGES") {
        commitStatus = "VERIFIED";
        advancesSession = true;
      }
    }
  } catch {
    /* ignore */
  }

  // Authoritative file list while the worktree still exists.
  const committedFiles =
    commitSha &&
    baselineSha &&
    String(commitSha).toLowerCase() !== String(baselineSha).toLowerCase()
      ? listCommitChangedFiles(worktree.worktreePath, baselineSha, commitSha)
      : [];
  const resultChangedFiles =
    committedFiles.length > 0 ? committedFiles : gitResult.changedFiles;

  /** @type {{ ok: boolean, code?: string } | null} */
  let cleanup = null;
  if (preservedPath) {
    cleanup = {
      ok: false,
      code: "CLEANUP_DEFERRED",
    };
  } else {
    cleanup = removeTaskWorktree(projectRoot, worktree.worktreePath);
    if (!cleanup.ok) {
      emit("session.engineering.cleanup", {
        status: "CLEANUP_INCOMPLETE",
        worktreePath: worktree.worktreePath,
        taskBranch: worktree.taskBranch,
        commitSha,
      });
    }
  }

  const checkSummaries = Array.isArray(validation?.checks)
    ? validation.checks.map((c) => ({
        id: c.id,
        kind: c.kind,
        ok: c.ok,
        exitCode: c.exitCode,
        command: c.command,
      }))
    : [];

  const inspectCommand = buildFullResultInspectCommand({
    baselineSha,
    resultSha: commitSha,
  });
  const preview = buildBoundedDiffPreview(gitResult.diff || "", {
    changedFiles: resultChangedFiles,
  });

  emit("session.engineering.result", {
    classification:
      terminalDisposition === "GIT_IDENTITY_REQUIRED"
        ? classification
        : classification,
    changedFiles: resultChangedFiles,
    primaryUntouched: untouched,
    durationMs: Date.now() - startedAt,
    allowShell,
    sandbox: sandbox.code,
    taskBranch: worktree.taskBranch,
    commitSha,
    baselineSha,
    commitStatus,
    advancesSession,
    checks: checkSummaries,
    inspectCommand,
    preservedArtifact: preservedPath || null,
    diffPreviewLines: preview.lines,
    diffPreviewTruncated: preview.truncated,
    diffPreviewShownFiles: preview.shownFiles,
    timingMarks,
    engineeringHandoff: engineeringHandoffSummary || null,
    preferredEngine: preferredEngine || null,
    engine: lastCollabEngine || null,
    cursorMode: g10Fabric?.getCursor?.()?.getMode?.() || null,
  });

  const outcomeClassification =
    terminalDisposition === "CANCELLED"
      ? "CANCELLED"
      : terminalDisposition === "GIT_IDENTITY_REQUIRED"
        ? "GIT_IDENTITY_REQUIRED"
        : classification;
  const reportDisposition = dispositionFromOutcome(
    outcomeClassification,
    "",
    outcomeClassification,
  );
  const reportModel = buildEngineeringReportModel(
    {
      taskPreview: effectiveTaskText,
      taskObjective: effectiveTaskText,
      taskId: worktree.taskId,
      narrationExcerpts: engineeringHandoffSummary
        ? [engineeringHandoffSummary]
        : [],
      engineeringHandoff: engineeringHandoffSummary || null,
      ag1Checks: checkSummaries,
      projectFiles: resultChangedFiles,
      diffPreviewLines: preview.lines,
      durationMs: Date.now() - startedAt,
      timingSummary: summarizeTimingMarks(timingMarks),
      taskBranch: worktree.taskBranch,
      resultSha: commitSha,
      baselineSha,
      inspectCommand,
      preservedArtifact: preservedPath || null,
      resultClassification: outcomeClassification,
      terminalDisposition: outcomeClassification,
      terminalSummary,
      blockReason: terminalSummary,
      advancesSession,
      preferredEngine: preferredEngine || null,
      engine: lastCollabEngine || null,
      cursorMode: g10Fabric?.getCursor?.()?.getMode?.() || null,
      enginesUsed: [...enginesSeen],
      fabricRouting: fabricRoutingNotes.slice(),
    },
    {
      classification: outcomeClassification,
      disposition: outcomeClassification,
      objective: effectiveTaskText,
      validation,
      changedFiles: resultChangedFiles,
      taskBranch: worktree.taskBranch,
      commitSha,
      baselineSha,
      inspectCommand,
      preservedPath,
      primaryUntouched: untouched,
      durationMs: Date.now() - startedAt,
      engineeringHandoff: engineeringHandoffSummary || null,
      terminalSummary,
      pushPerformed: false,
      timingSummary: summarizeTimingMarks(timingMarks),
      advancesSession,
      preferredEngine: preferredEngine || null,
      engine: lastCollabEngine || null,
      cursorMode: g10Fabric?.getCursor?.()?.getMode?.() || null,
      enginesUsed: [...enginesSeen],
      fabricRouting: fabricRoutingNotes.slice(),
    },
  );
  reportModel.disposition = reportDisposition;
  let durableSummary = formatEngineeringReportPlain(reportModel);
  try {
    const reportPath = writeEngineeringReportFile(
      worktree.taskId,
      durableSummary,
      runtimeRoot,
    );
    if (reportPath) {
      durableSummary = formatEngineeringReportPlain({
        ...reportModel,
        reportPath,
      });
      emit("session.engineering.report", {
        disposition: reportDisposition,
        path: reportPath,
        plain: durableSummary,
      });
    }
  } catch {
    emit("session.engineering.report", {
      disposition: reportDisposition,
      plain: durableSummary,
    });
  }

  // When the living TUI owns stdout, defer the durable summary until after
  // alternate-screen exit (pathcode prints durableSummary). Studio also
  // rematerializes a richer report from streamHistory on terminal.
  if (!options.cardsOwnProgress) {
    write(`\n${durableSummary}`);
  }

  emit("session.terminal", {
    disposition: outcomeClassification,
    summary: terminalSummary,
    taskBranch: worktree.taskBranch,
    commitSha,
  });

  try {
    if (preparedEnv?.services?.projectKey && ag9Services?.stopDisposableServices) {
      ag9Services.stopDisposableServices({
        runtimeRoot,
        projectKey: String(preparedEnv.services.projectKey),
        projectRoot: worktree.worktreePath,
      });
    }
  } catch {
    // Service cleanup must not crash the session.
  }

  try {
    if (terminalDisposition === "INTERRUPTED") {
      // Do not stamp a terminal FAILED finalState — task remains resumable.
      g10Fabric?.persist?.({
        latestEngineTurn: "interrupted",
        continuityDisposition: "interrupted",
        interruptedAt: new Date().toISOString(),
        validation: {
          classification,
          disposition: terminalDisposition,
        },
        branch: worktree.taskBranch || undefined,
        baseline: baselineSha || undefined,
        changedFiles: resultChangedFiles,
      });
    } else {
    const finalState =
      classification === "VERIFIED"
        ? "VERIFIED"
        : agentCancelled
          ? "CANCELLED"
          : terminalDisposition === "NEEDS_DIRECTION" ||
              terminalDisposition === "AUTH_REQUIRED"
            ? "BLOCKED"
            : "FAILED";
    g10Fabric?.markFinal?.(finalState, {
      validation: {
        classification,
        disposition: terminalDisposition,
      },
      agSessionMode: agBind?.getMode?.() || undefined,
      copilotMode: g10Fabric?.getCopilot?.()?.getMode?.() || undefined,
      cursorMode: g10Fabric?.getCursor?.()?.getMode?.() || undefined,
      preferredEngine: preferredEngine || undefined,
      latestEngineTurn: lastCollabEngine || undefined,
      branch: worktree.taskBranch || undefined,
      sha: commitSha || undefined,
      baseline: baselineSha || undefined,
      changedFiles: resultChangedFiles,
    });
    }
    await g10Fabric?.shutdown?.();
  } catch {
    /* ignore */
  }

  try {
    await agent.close();
  } catch {
    // Cancellation/close races must not crash the REPL.
  }

  const exitCode = agentCancelled
    ? 130
    : terminalDisposition === "INTERRUPTED"
      ? 1
    : terminalDisposition === "GIT_IDENTITY_REQUIRED"
      ? 2
      : classification === "VERIFIED" || classification === "PARTIALLY_VERIFIED"
        ? 0
        : 1;

  return {
    exitCode,
    outcome:
      terminalDisposition === "CANCELLED"
        ? "CANCELLED"
        : terminalDisposition === "INTERRUPTED"
          ? "INTERRUPTED"
        : terminalDisposition === "GIT_IDENTITY_REQUIRED"
          ? "GIT_IDENTITY_REQUIRED"
          : classification,
    classification:
      terminalDisposition === "CANCELLED" ? "NOT_VERIFIED" : classification,
    taskId: worktree.taskId,
    taskBranch: worktree.taskBranch,
    commitSha,
    commitStatus,
    advancesSession,
    durableSummary,
    sessionBaseCommit: advancesSession
      ? commitSha || worktree.baseline.head
      : null,
    baselineCommit: worktree.baseline.head,
    worktreePath: preservedPath || (cleanup?.ok ? null : worktree.worktreePath),
    cleanup,
    changedFiles: resultChangedFiles,
    diff: gitResult.diff,
    validation,
    primaryUntouched: untouched,
    allowShell,
    durationMs: Date.now() - startedAt,
    engineActivityCount,
    modelCalls: 0,
    repairAttempts,
    preferredEngine: preferredEngine || null,
    engine: lastCollabEngine || null,
    cursorMode: g10Fabric?.getCursor?.()?.getMode?.() || null,
    enginesUsed: [...enginesSeen],
    diagFile: typeof agent.getDiagFile === "function" ? agent.getDiagFile() : null,
  };
}
