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
  capturePrimaryFingerprint,
  collectWorktreeResult,
  createTaskWorktree,
  primaryUntouched,
  removeTaskWorktree,
} from "./task-worktree.mjs";
import {
  classifyAg1Result,
  runIndependentFinalValidation,
  setFinalValidationProgressHook,
} from "./final-validation.mjs";

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
  complete: "Complete",
  failed: "Failed",
  cancelled: "Cancelled",
});

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
 *   sessionEventEmit?: (type: string, fields?: Record<string, unknown>) => void,
 *   signal?: AbortSignal,
 *   wallClockMs?: number,
 *   cardsOwnProgress?: boolean,
 *   unicode?: boolean,
 *   sessionBaseCommit?: string | null,
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

  const taskText =
    typeof options.taskText === "string" ? options.taskText.trim() : "";
  const projectRoot = resolve(options.projectRoot || process.cwd());
  const taskId = randomUUID();
  const startedAt = Date.now();

  if (taskText.length === 0) {
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

  emit("session.task.received", {
    taskId,
    preview: taskText.slice(0, 200),
    mode: "ag1",
  });

  const boot = await ensureAg1Runtime({
    ...(options.checkoutRoot ? { packageRoot: options.checkoutRoot } : {}),
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

  const sessionBaseCommit =
    typeof options.sessionBaseCommit === "string" &&
    options.sessionBaseCommit.trim() !== ""
      ? options.sessionBaseCommit.trim()
      : admission.head;

  const primaryBefore = capturePrimaryFingerprint(projectRoot);
  emit("session.preflight", {
    branch: admission.branch,
    head: admission.head,
    sessionBaseCommit,
    dirtySummary: "clean",
    projectName: basename(projectRoot),
  });

  const worktree = createTaskWorktree({
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

  emit("session.engineering.workspace", {
    taskId: worktree.taskId,
    taskBranch: worktree.taskBranch,
    workspace: worktree.worktreePath,
    baselineHead: worktree.baseline.head,
    status: "ready",
  });
  emit("session.recovery.checkpoint", {
    id: `ag1-baseline:${worktree.baseline.head}`,
    kind: "task-worktree-baseline",
  });

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
  const waitForTerminal = new Promise((resolveWait) => {
    resolveTerminal = resolveWait;
  });

  const wallTimer = setTimeout(() => {
    agent.cancel();
    resolveTerminal({ type: "failed", code: "BUDGET_WALL_CLOCK" });
  }, options.wallClockMs ?? AG1_DEFAULT_WALL_CLOCK_MS);
  if (typeof wallTimer.unref === "function") wallTimer.unref();

  const agent = createAntigravityEngineeringAgent({
    ...(options.checkoutRoot ? { checkoutRoot: options.checkoutRoot } : {}),
    onEvent: (msg) => {
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
        emit("session.engineering.activity", {
          activity,
          label: labelActivity(activity),
          tool: typeof msg.tool === "string" ? msg.tool : undefined,
        });
        if (activity === "editing") {
          emit("session.applying", { summary: "editing in task workspace" });
        } else if (activity === "inspecting") {
          emit("session.reading", { files: [] });
        }
      } else if (type === "tool") {
        engineActivityCount += 1;
        emit("session.engineering.tool", {
          kind: msg.kind,
          tool: msg.tool,
          summary: scrubEngineIdentity(String(msg.summary ?? "")),
        });
        if (msg.kind === "file_edit") {
          emit("session.edit.summary", {
            path: String(msg.summary ?? "").slice(0, 120),
            kind: "edit",
          });
        }
      } else if (type === "finished") {
        agentFinished = true;
        emit("session.engineering.activity", {
          activity: "complete",
          label: "Finishing",
        });
        resolveTerminal(msg);
      } else if (type === "failed") {
        agentFailed = true;
        emit("session.engineering.activity", {
          activity: "failed",
          label: "Failed",
          detail: scrubEngineIdentity(String(msg.message ?? msg.code ?? "")),
        });
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

  const startResult = await agent.startTask({
    taskId,
    workspace: worktree.worktreePath,
    task: taskText,
    allowShell,
    budget: {
      maxModelCalls: AG1_DEFAULT_MAX_MODEL_CALLS,
      maxToolCalls: AG1_DEFAULT_MAX_TOOL_CALLS,
      wallClockMs: options.wallClockMs ?? AG1_DEFAULT_WALL_CLOCK_MS,
    },
  });
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

  const terminalMsg = await waitForTerminal;
  clearTimeout(wallTimer);
  clearInterval(pollCancel);

  if (terminalMsg?.type === "cancelled" || ac.signal.aborted) {
    agentCancelled = true;
  }

  /** @type {Awaited<ReturnType<typeof runIndependentFinalValidation>> | null} */
  let validation = null;
  if (!agentCancelled && (agentFinished || terminalMsg?.type === "finished")) {
    emit("session.engineering.activity", {
      activity: "verifying",
      label: "Verifying",
    });
    emit("session.validation.plan", {
      summary: "independent final validation",
    });
    setFinalValidationProgressHook((check) => {
      emit("session.validation.running", {
        id: check.id,
        kind: check.kind,
        check: check.id,
      });
    });
    try {
      validation = await runIndependentFinalValidation({
        worktreePath: worktree.worktreePath,
        signal: ac.signal,
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
    } finally {
      setFinalValidationProgressHook(null);
    }
  } else if (agentCancelled) {
    emit("session.validation.skipped", { reason: "cancelled" });
  } else if (agentFailed) {
    emit("session.validation.skipped", {
      reason: String(terminalMsg?.code ?? "engine_failed"),
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

  emit("session.engineering.result", {
    classification:
      terminalDisposition === "GIT_IDENTITY_REQUIRED"
        ? classification
        : classification,
    changedFiles: gitResult.changedFiles,
    primaryUntouched: untouched,
    durationMs: Date.now() - startedAt,
    allowShell,
    sandbox: sandbox.code,
    taskBranch: worktree.taskBranch,
    commitSha,
    commitStatus,
    advancesSession,
    checks: checkSummaries,
  });

  const durableSummary = formatAg2ResultBanner({
    classification:
      terminalDisposition === "CANCELLED"
        ? "CANCELLED"
        : terminalDisposition === "GIT_IDENTITY_REQUIRED"
          ? "GIT_IDENTITY_REQUIRED"
          : classification,
    changedFiles: gitResult.changedFiles,
    validation,
    taskBranch: worktree.taskBranch,
    commitSha,
    commitStatus,
    primaryUntouched: untouched,
    preservedPath,
    cleanup,
  });
  // When the living TUI owns stdout, defer the durable summary until after
  // alternate-screen exit (pathcode prints durableSummary).
  if (!options.cardsOwnProgress) {
    write(`\n${durableSummary}`);
  }

  emit("session.terminal", {
    disposition:
      terminalDisposition === "CANCELLED"
        ? "CANCELLED"
        : terminalDisposition === "GIT_IDENTITY_REQUIRED"
          ? "GIT_IDENTITY_REQUIRED"
          : classification,
    summary: terminalSummary,
    taskBranch: worktree.taskBranch,
    commitSha,
  });

  try {
    await agent.close();
  } catch {
    // Cancellation/close races must not crash the REPL.
  }

  const exitCode = agentCancelled
    ? 130
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
    changedFiles: gitResult.changedFiles,
    diff: gitResult.diff,
    validation,
    primaryUntouched: untouched,
    allowShell,
    durationMs: Date.now() - startedAt,
    engineActivityCount,
    modelCalls: 0,
    diagFile: typeof agent.getDiagFile === "function" ? agent.getDiagFile() : null,
  };
}

/**
 * Product-facing result banner (no engine branding).
 * @param {Record<string, any>} r
 */
function formatAg2ResultBanner(r) {
  const lines = [];
  const label =
    r.classification === "VERIFIED"
      ? "✓ VERIFIED"
      : r.classification === "PARTIALLY_VERIFIED"
        ? "◐ PARTIALLY VERIFIED"
        : r.classification === "CANCELLED"
          ? "— CANCELLED"
          : r.classification === "GIT_IDENTITY_REQUIRED"
            ? "✕ GIT IDENTITY REQUIRED"
            : r.classification === "FAILED"
              ? "✕ FAILED"
              : "— NOT VERIFIED";
  lines.push(`Result: ${label}`);
  lines.push(`Files changed: ${r.changedFiles?.length ?? 0}`);
  if (Array.isArray(r.validation?.checks)) {
    for (const c of r.validation.checks) {
      const mark = c.ok ? "✓" : "✕";
      const kind =
        c.kind === "TYPECHECK"
          ? "Typecheck"
          : c.kind === "TARGETED_TEST" || /test/i.test(String(c.id))
            ? "Tests"
            : c.kind === "BUILD" || /build/i.test(String(c.id))
              ? "Build"
              : String(c.id || c.kind || "Check");
      lines.push(`${kind}: ${mark}`);
    }
  }
  if (r.taskBranch) lines.push(`Task branch: ${r.taskBranch}`);
  if (r.commitSha) lines.push(`Commit: ${r.commitSha}`);
  if (r.commitStatus && r.commitStatus !== "VERIFIED" && r.commitStatus !== "NO_CHANGES") {
    lines.push(`Status: ${r.commitStatus}`);
  }
  lines.push(
    `Primary checkout untouched: ${r.primaryUntouched ? "yes" : "NO"}`,
  );
  if (r.classification === "VERIFIED" && r.taskBranch && r.commitSha) {
    lines.push("");
    lines.push("To merge this work:");
    lines.push(`git merge ${r.taskBranch}`);
  }
  if (r.preservedPath) {
    lines.push(`Preserved worktree: ${r.preservedPath}`);
  }
  if (r.cleanup && r.cleanup.ok === false && r.cleanup.code === "CLEANUP_INCOMPLETE") {
    lines.push("Cleanup: CLEANUP_INCOMPLETE");
  }
  if (r.changedFiles?.length) {
    for (const f of r.changedFiles.slice(0, 40)) {
      lines.push(`  - ${f}`);
    }
  }
  return `${lines.join("\n")}\n`;
}
