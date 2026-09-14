/**
 * G10 — Antigravity session bind / native resume / rehydration.
 *
 * Do NOT recreate mature Antigravity session internals.
 * Provider session IDs are not the sole source of PATH task continuity.
 */

/**
 * @typedef {'NONE'|'ACTIVE'|'NATIVE_RESUME'|'REHYDRATED_SESSION'} AgSessionMode
 */

/**
 * Classify how Antigravity continuity was established for this PATH task.
 *
 * @param {{
 *   hadLiveAgent: boolean,
 *   continueSucceeded: boolean,
 *   restartedBridge: boolean,
 *   checkpointAgTaskId?: string | null,
 *   currentTaskId: string,
 * }} input
 * @returns {{ mode: AgSessionMode, detail: string }}
 */
export function classifyAgSessionContinuity(input) {
  if (input.hadLiveAgent && input.continueSucceeded && !input.restartedBridge) {
    return {
      mode: "NATIVE_RESUME",
      detail: "continued same Antigravity conversation",
    };
  }
  if (input.restartedBridge || !input.hadLiveAgent) {
    return {
      mode: "REHYDRATED_SESSION",
      detail:
        "new Antigravity conversation established from current PATH task reality",
    };
  }
  if (
    input.checkpointAgTaskId &&
    input.checkpointAgTaskId === input.currentTaskId &&
    input.continueSucceeded
  ) {
    return {
      mode: "NATIVE_RESUME",
      detail: "task id matched; continue on live agent",
    };
  }
  return {
    mode: "REHYDRATED_SESSION",
    detail: "could not prove native conversation continuity",
  };
}

/**
 * Build rehydration prompt that carries PATH task reality (never stale snapshot).
 *
 * @param {{
 *   objective: string,
 *   resumeBrief: string,
 *   steeringText?: string,
 * }} input
 */
export function buildAgRehydratePrompt(input) {
  return [
    "PATH task rehydration — continue engineering from CURRENT repository reality.",
    "Do not revert newer filesystem/Git state to an older model snapshot.",
    "",
    `Objective: ${String(input.objective || "").slice(0, 3_000)}`,
    "",
    input.resumeBrief,
    input.steeringText
      ? `\nOperator steering:\n${String(input.steeringText).slice(0, 2_000)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Bind PATH task identity to the live Antigravity agent handle.
 *
 * @param {{
 *   taskId: string,
 *   agent: {
 *     startTask: Function,
 *     continueTask: Function,
 *     cancel?: Function,
 *     close?: Function,
 *   },
 *   emit?: (e: object) => void,
 * }} input
 */
export function bindAntigravitySession(input) {
  const emit = typeof input.emit === "function" ? input.emit : () => {};
  /** @type {AgSessionMode} */
  let mode = "NONE";
  let live = false;
  let lastError = "";

  /**
   * Start or rehydrate.
   * @param {{
   *   workspace: string,
   *   defaultCwd?: string,
   *   task: string,
   *   allowShell?: boolean,
   *   budget?: object,
   *   mcpServers?: object[],
   *   capabilityBrief?: string,
   *   toolEnv?: Record<string, string>,
   *   resumeFromCheckpoint?: boolean,
   *   resumeBrief?: string,
   * }} start
   */
  async function startOrRehydrate(start) {
    const taskText =
      start.resumeFromCheckpoint && start.resumeBrief
        ? buildAgRehydratePrompt({
            objective: start.task,
            resumeBrief: start.resumeBrief,
          })
        : start.task;

    const result = await input.agent.startTask({
      taskId: input.taskId,
      workspace: start.workspace,
      defaultCwd: start.defaultCwd,
      task: taskText,
      allowShell: start.allowShell,
      budget: start.budget,
      mcpServers: start.mcpServers,
      capabilityBrief: start.capabilityBrief,
      toolEnv: start.toolEnv,
    });

    if (result?.ok) {
      live = true;
      mode = start.resumeFromCheckpoint ? "REHYDRATED_SESSION" : "ACTIVE";
      emit({
        type: "session.engineering.bridge",
        stage: "ag_session",
        detail:
          mode === "REHYDRATED_SESSION"
            ? "Antigravity REHYDRATED_SESSION"
            : "Antigravity session ACTIVE",
        mode,
      });
      return { ok: true, mode, result };
    }

    live = false;
    mode = "NONE";
    lastError = String(result?.message || result?.code || "start_failed");
    return { ok: false, mode, result, detail: lastError };
  }

  /**
   * Native continue on the same conversation when the bridge is still live.
   * @param {{ text: string }} cont
   */
  function continueNative(cont) {
    if (!live) {
      return {
        ok: false,
        mode: /** @type {AgSessionMode} */ ("NONE"),
        detail: "no live Antigravity session",
      };
    }
    try {
      input.agent.continueTask({ text: cont.text });
      mode = "NATIVE_RESUME";
      emit({
        type: "session.engineering.bridge",
        stage: "ag_continue",
        detail: "Antigravity NATIVE_RESUME",
        mode,
      });
      return { ok: true, mode: /** @type {AgSessionMode} */ ("NATIVE_RESUME") };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      live = false;
      return {
        ok: false,
        mode: /** @type {AgSessionMode} */ ("NONE"),
        detail: lastError,
      };
    }
  }

  /**
   * Attempt native resume; if impossible, rehydrate from PATH reality.
   * @param {{
   *   text?: string,
   *   rehydrate: Parameters<typeof startOrRehydrate>[0],
   * }} inputResume
   */
  async function resumeOrRehydrate(inputResume) {
    if (live && inputResume.text) {
      const native = continueNative({ text: inputResume.text });
      if (native.ok) {
        return {
          ok: true,
          mode: /** @type {AgSessionMode} */ ("NATIVE_RESUME"),
          detail: "native continue",
        };
      }
    }
    const rehydrated = await startOrRehydrate({
      ...inputResume.rehydrate,
      resumeFromCheckpoint: true,
      resumeBrief:
        inputResume.rehydrate.resumeBrief ||
        "Resume from current PATH task / Git reality.",
    });
    return {
      ok: rehydrated.ok,
      mode: /** @type {AgSessionMode} */ (
        rehydrated.ok ? "REHYDRATED_SESSION" : "NONE"
      ),
      detail: rehydrated.detail,
      result: rehydrated.result,
    };
  }

  function markDead() {
    live = false;
  }

  function cancel() {
    try {
      input.agent.cancel?.();
    } catch {
      /* ignore */
    }
    live = false;
  }

  return {
    getMode: () => mode,
    isLive: () => live,
    getLastError: () => lastError,
    startOrRehydrate,
    continueNative,
    resumeOrRehydrate,
    markDead,
    cancel,
    classify: classifyAgSessionContinuity,
  };
}
