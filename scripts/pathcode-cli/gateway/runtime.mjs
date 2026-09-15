/**
 * S1 — PATH Gateway runtime.
 *
 * Owns engineering tasks independently of any terminal client.
 * Reuses existing ag1/session + ag10 fabric; does not invent a second backend.
 */

import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import { EventEmitter } from "node:events";
import {
  GATEWAY_PROTOCOL_VERSION,
  GatewayMethods,
  makeError,
  makeEventEnvelope,
  makeResult,
  sanitizeEventForClient,
} from "./protocol.mjs";
import { createGatewayPromptAdapter } from "./prompt-adapter.mjs";
import {
  resolvePathPackageRoot,
  resolvePathRuntimeRoot,
  resolveTargetProjectRoot,
} from "../paths.mjs";
import { admitPrimaryCheckout } from "../ag1/admission.mjs";
import { ensureAg1Runtime } from "../ag1/runtime-bootstrap.mjs";
import { recoverPathOwnedStaleWorktrees } from "../ag5/orphan-recovery.mjs";

/**
 * @typedef {{
 *   taskId: string,
 *   sessionId: string,
 *   projectRoot: string,
 *   workingSubdir: string,
 *   objective: string,
 *   status: 'running'|'completed'|'cancelled'|'failed',
 *   seq: number,
 *   createdAt: string,
 *   updatedAt: string,
 *   result: object | null,
 *   worktreePath: string | null,
 *   taskBranch: string | null,
 *   commitSha: string | null,
 *   classification: string | null,
 *   capabilities: object | null,
 *   prompt: ReturnType<typeof createGatewayPromptAdapter>,
 *   abort: AbortController,
 *   runPromise: Promise<void> | null,
 * }} GatewayTask
 */

export function createGatewayRuntime(options = {}) {
  const packageRoot =
    typeof options.packageRoot === "string" && options.packageRoot
      ? options.packageRoot
      : resolvePathPackageRoot();
  const runtimeRoot =
    typeof options.runtimeRoot === "string" && options.runtimeRoot
      ? options.runtimeRoot
      : resolvePathRuntimeRoot({ packageRoot });
  const gatewayId =
    typeof options.gatewayId === "string" && options.gatewayId
      ? options.gatewayId
      : `gw-${randomUUID()}`;

  const bus = new EventEmitter();
  bus.setMaxListeners(100);

  /** @type {{
   *   projectRoot: string | null,
   *   workingSubdir: string,
   *   projectName: string | null,
   *   branch: string | null,
   *   clean: boolean | null,
   *   boundAt: string | null,
   * }} */
  let project = {
    projectRoot: null,
    workingSubdir: "",
    projectName: null,
    branch: null,
    clean: null,
    boundAt: null,
  };

  /** @type {Map<string, GatewayTask>} */
  const tasks = new Map();

  /**
   * @param {GatewayTask} task
   * @param {string} type
   * @param {Record<string, unknown>} [fields]
   */
  function emitTaskEvent(task, type, fields = {}) {
    task.seq += 1;
    task.updatedAt = new Date().toISOString();
    const event = sanitizeEventForClient({
      type,
      sessionId: task.sessionId,
      taskId: task.taskId,
      ...fields,
    });
    const envelope = makeEventEnvelope(task.taskId, task.seq, event);
    bus.emit("event", envelope);
    bus.emit(`task:${task.taskId}`, envelope);
    return envelope;
  }

  /**
   * @param {GatewayTask} task
   */
  function snapshotTask(task) {
    return {
      taskId: task.taskId,
      sessionId: task.sessionId,
      projectRoot: task.projectRoot,
      workingSubdir: task.workingSubdir,
      objective: task.objective,
      status: task.status,
      seq: task.seq,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      worktreePath: task.worktreePath,
      taskBranch: task.taskBranch,
      commitSha: task.commitSha,
      classification: task.classification,
      capabilities: task.capabilities,
      result: task.result
        ? sanitizeEventForClient(task.result)
        : null,
    };
  }

  async function bindProject(params = {}) {
    const cwd =
      typeof params.cwd === "string" && params.cwd.trim()
        ? params.cwd.trim()
        : process.cwd();
    const discovered = resolveTargetProjectRoot(cwd);
    if (!discovered.ok) {
      return { ok: false, code: discovered.code || "PROJECT_BIND_FAILED", message: discovered.message };
    }
    const projectRoot = discovered.projectRoot;
    const workingSubdir =
      typeof discovered.workingSubdir === "string" ? discovered.workingSubdir : "";
    let branch = null;
    let clean = null;
    const admission = admitPrimaryCheckout(projectRoot);
    if (admission.ok) {
      branch = admission.branch;
      clean = true;
    } else if (admission.code === "DIRTY_PRIMARY_TREE") {
      branch = typeof admission.branch === "string" ? admission.branch : null;
      clean = false;
    } else if (admission.code === "DETACHED_HEAD_BLOCKED") {
      branch = null;
      clean = null;
    }

    try {
      if (process.env.PATHCODE_GATEWAY_SKIP_BOOTSTRAP !== "1") {
        await ensureAg1Runtime({ packageRoot, runtimeRoot });
      }
    } catch {
      // non-fatal at bind; task start re-checks
    }
    try {
      if (process.env.PATHCODE_GATEWAY_SKIP_BOOTSTRAP !== "1") {
        recoverPathOwnedStaleWorktrees({
          projectRoot,
          checkoutRoot: packageRoot,
        });
      }
    } catch {
      // non-fatal
    }

    project = {
      projectRoot,
      workingSubdir,
      projectName: basename(projectRoot),
      branch,
      clean,
      boundAt: new Date().toISOString(),
    };
    return {
      ok: true,
      projectRoot,
      workingSubdir,
      projectName: project.projectName,
      branch,
      clean,
      runtimeRoot,
      packageRoot,
      gatewayId,
      protocolVersion: GATEWAY_PROTOCOL_VERSION,
    };
  }

  function listCapabilities() {
    return {
      engines: [
        {
          id: "antigravity",
          role: "engineering_collaborator",
          status: "available",
          native: [
            "bridge",
            "tools",
            "mcp",
            "continue",
            "repair",
            "cancel",
            "hooks",
          ],
        },
        {
          id: "copilot",
          role: "engineering_collaborator",
          status: "available",
          native: [
            "sdk",
            "cli_fallback",
            "tools",
            "lsp",
            "mcp",
            "continue",
            "repair",
            "cancel",
            "stable_cli_path",
          ],
        },
        {
          id: "cursor",
          role: "engineering_collaborator",
          status: "slot_reserved",
          note: "S3 integration attaches through the same gateway registry",
        },
      ],
      environment: [
        "polyglot",
        "mise",
        "lsp",
        "scip",
        "mcp",
        "services_containers",
        "self_provisioning_runtime",
      ],
      collaboration: [
        "shared_worktree",
        "steering",
        "handoff",
        "mutation_leases",
        "checkpoints",
        "background_ops",
      ],
      delivery: ["github_issue_context", "publication_functions_callable"],
      extensibility: {
        workflows: ["path_code", "path_build_slot", "path_studio_slot"],
        clients: ["cli", "headless", "studio_slot", "build_slot"],
      },
      project: project.projectRoot
        ? {
            projectRoot: project.projectRoot,
            workingSubdir: project.workingSubdir,
            branch: project.branch,
            clean: project.clean,
          }
        : null,
    };
  }

  /**
   * @param {Record<string, unknown>} params
   */
  async function startTask(params = {}) {
    if (!project.projectRoot) {
      const bound = await bindProject({
        cwd: typeof params.cwd === "string" ? params.cwd : undefined,
      });
      if (!bound.ok) return bound;
    }
    const objective =
      typeof params.objective === "string" && params.objective.trim()
        ? params.objective.trim()
        : typeof params.taskText === "string" && params.taskText.trim()
          ? params.taskText.trim()
          : "";
    if (!objective) {
      return { ok: false, code: "OBJECTIVE_REQUIRED", message: "objective required" };
    }

    const taskId =
      typeof params.taskId === "string" && params.taskId.trim()
        ? params.taskId.trim()
        : randomUUID();
    if (tasks.has(taskId)) {
      return {
        ok: false,
        code: "TASK_EXISTS",
        message: `task ${taskId} already exists`,
        taskId,
      };
    }

    const sessionId =
      typeof params.sessionId === "string" && params.sessionId.trim()
        ? params.sessionId.trim()
        : `path-${taskId}`;

    const prompt = createGatewayPromptAdapter();
    const abort = new AbortController();
    /** @type {GatewayTask} */
    const task = {
      taskId,
      sessionId,
      projectRoot: project.projectRoot,
      workingSubdir: project.workingSubdir,
      objective,
      status: "running",
      seq: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      result: null,
      worktreePath: null,
      taskBranch: null,
      commitSha: null,
      classification: null,
      capabilities: null,
      prompt,
      abort,
      runPromise: null,
    };
    tasks.set(taskId, task);

    emitTaskEvent(task, "session.task.received", {
      mode: "ag1",
      preview: objective.slice(0, 200),
    });

    const sessionEventEmit = (type, fields = {}) => {
      emitTaskEvent(task, type, fields && typeof fields === "object" ? fields : {});
    };

    task.runPromise = (async () => {
      prompt.beginCycle();
      try {
        if (process.env.PATHCODE_GATEWAY_FAKE_ENGINE === "1") {
          emitTaskEvent(task, "session.capability.preparing", {
            detail: "Preparing environment",
          });
          emitTaskEvent(task, "session.engineering.activity", {
            activity: "implementing",
            label: "Implementing",
          });
          await new Promise((r) => setTimeout(r, 50));
          if (abort.signal.aborted || prompt.isCycleCancelRequested()) {
            task.status = "cancelled";
            task.classification = "CANCELLED";
            task.result = { exitCode: 130, classification: "CANCELLED" };
          } else {
            task.status = "completed";
            task.classification = "VERIFIED";
            task.commitSha = "deadbeefdeadbeef";
            task.taskBranch = `path/task-${task.taskId.slice(0, 8)}`;
            task.result = {
              exitCode: 0,
              classification: "VERIFIED",
              advancesSession: true,
              changedFiles: ["src/demo.js"],
              commitSha: task.commitSha,
              taskBranch: task.taskBranch,
              engineActivityCount: 2,
            };
            emitTaskEvent(task, "session.engineering.result", {
              classification: "VERIFIED",
              changedFiles: ["src/demo.js"],
              commitSha: task.commitSha,
              taskBranch: task.taskBranch,
            });
          }
        } else {
        const { runAntigravityEngineeringSession } = await import(
          "../ag1/session.mjs"
        );
        const sessionResult = await runAntigravityEngineeringSession(prompt, {
          streams: {
            stdin: process.stdin,
            stdout: { write: () => true, isTTY: false },
            stderr: { write: () => true, isTTY: false },
          },
          taskText: objective,
          projectRoot: task.projectRoot,
          workingSubdir: task.workingSubdir,
          unicode: true,
          checkoutRoot: packageRoot,
          sessionEventEmit,
          cardsOwnProgress: true,
          sessionBaseCommit:
            typeof params.sessionBaseCommit === "string"
              ? params.sessionBaseCommit
              : null,
          signal: abort.signal,
        });

        task.result = sessionResult && typeof sessionResult === "object"
          ? sessionResult
          : { exitCode: 1 };
        task.classification =
          typeof sessionResult?.classification === "string"
            ? sessionResult.classification
            : null;
        task.taskBranch =
          typeof sessionResult?.taskBranch === "string"
            ? sessionResult.taskBranch
            : null;
        task.commitSha =
          typeof sessionResult?.commitSha === "string"
            ? sessionResult.commitSha
            : null;
        task.worktreePath =
          typeof sessionResult?.preservedPath === "string"
            ? sessionResult.preservedPath
            : typeof sessionResult?.worktreePath === "string"
              ? sessionResult.worktreePath
              : null;

        if (abort.signal.aborted || sessionResult?.classification === "CANCELLED") {
          task.status = "cancelled";
        } else if (
          sessionResult?.classification === "VERIFIED" ||
          sessionResult?.classification === "PARTIALLY_VERIFIED" ||
          sessionResult?.exitCode === 0
        ) {
          task.status = "completed";
        } else {
          task.status = "failed";
        }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        task.status = "failed";
        task.result = { exitCode: 1, error: message };
        emitTaskEvent(task, "session.internal_error", { message });
      } finally {
        prompt.endCycle();
        task.updatedAt = new Date().toISOString();
        emitTaskEvent(task, "gateway.task.finished", {
          status: task.status,
          classification: task.classification,
        });
      }
    })();

    // Do not await engineering here — clients subscribe while it runs.
    return {
      ok: true,
      taskId,
      sessionId,
      snapshot: snapshotTask(task),
    };
  }

  /**
   * @param {string} taskId
   * @param {string} text
   */
  function steerTask(taskId, text) {
    const task = tasks.get(taskId);
    if (!task) {
      return { ok: false, code: "TASK_NOT_FOUND", message: `unknown task ${taskId}` };
    }
    if (task.status !== "running") {
      return {
        ok: false,
        code: "TASK_NOT_RUNNING",
        message: `task ${taskId} is ${task.status}`,
      };
    }
    const accepted = task.prompt.enqueueSteering(text);
    if (accepted) {
      emitTaskEvent(task, "session.engineering.activity", {
        activity: "steering",
        label: "Steering pending",
        detail: String(text || "").slice(0, 80),
      });
    }
    return { ok: accepted, taskId, queued: accepted };
  }

  /**
   * @param {string} taskId
   */
  function cancelTask(taskId) {
    const task = tasks.get(taskId);
    if (!task) {
      return { ok: false, code: "TASK_NOT_FOUND", message: `unknown task ${taskId}` };
    }
    task.prompt.requestCycleCancel();
    try {
      task.abort.abort();
    } catch {
      // ignore
    }
    emitTaskEvent(task, "session.cancelled", { reason: "gateway_cancel" });
    return { ok: true, taskId, status: task.status };
  }

  /**
   * @param {string} method
   * @param {Record<string, unknown>} params
   * @param {string} reqId
   */
  async function dispatch(method, params = {}, reqId = "0") {
    try {
      switch (method) {
        case GatewayMethods.HELLO:
        case GatewayMethods.PING:
          return makeResult(reqId, {
            gatewayId,
            protocolVersion: GATEWAY_PROTOCOL_VERSION,
            runtimeRoot,
            packageRoot,
            projectBound: Boolean(project.projectRoot),
          });
        case GatewayMethods.PROJECT_BIND: {
          const r = await bindProject(params);
          return r.ok ? makeResult(reqId, r) : makeError(reqId, r.code, r.message);
        }
        case GatewayMethods.PROJECT_STATUS:
          return makeResult(reqId, {
            gatewayId,
            ...project,
            runtimeRoot,
            taskCount: tasks.size,
            running: [...tasks.values()].filter((t) => t.status === "running")
              .length,
          });
        case GatewayMethods.CAPABILITIES:
          return makeResult(reqId, listCapabilities());
        case GatewayMethods.TASK_START: {
          const r = await startTask(params);
          return r.ok ? makeResult(reqId, r) : makeError(reqId, r.code, r.message);
        }
        case GatewayMethods.TASK_SNAPSHOT: {
          const id = String(params.taskId || "");
          const task = tasks.get(id);
          if (!task) {
            return makeError(reqId, "TASK_NOT_FOUND", `unknown task ${id}`);
          }
          return makeResult(reqId, snapshotTask(task));
        }
        case GatewayMethods.TASK_ATTACH: {
          const id = String(params.taskId || "");
          const task = tasks.get(id);
          if (!task) {
            return makeError(reqId, "TASK_NOT_FOUND", `unknown task ${id}`);
          }
          return makeResult(reqId, {
            attached: true,
            snapshot: snapshotTask(task),
            note: "Subscribe to events for this taskId; snapshot is current reality",
          });
        }
        case GatewayMethods.TASK_STEER: {
          const r = steerTask(String(params.taskId || ""), String(params.text || ""));
          return r.ok
            ? makeResult(reqId, r)
            : makeError(reqId, r.code || "STEER_FAILED", r.message || "steer failed");
        }
        case GatewayMethods.TASK_CANCEL: {
          const r = cancelTask(String(params.taskId || ""));
          return r.ok
            ? makeResult(reqId, r)
            : makeError(reqId, r.code || "CANCEL_FAILED", r.message || "cancel failed");
        }
        case GatewayMethods.TASK_LIST:
          return makeResult(reqId, {
            tasks: [...tasks.values()].map(snapshotTask),
          });
        case GatewayMethods.RESULT_GET: {
          const id = String(params.taskId || "");
          const task = tasks.get(id);
          if (!task) {
            return makeError(reqId, "TASK_NOT_FOUND", `unknown task ${id}`);
          }
          return makeResult(reqId, {
            snapshot: snapshotTask(task),
            result: task.result ? sanitizeEventForClient(task.result) : null,
          });
        }
        case GatewayMethods.DELIVERY_INVOKE:
          return makeError(
            reqId,
            "DELIVERY_CLIENT_SIDE",
            "Publication remains a client-invoked business operation (S2 UX). Call ag4 modules from the CLI when requested.",
          );
        case GatewayMethods.SHUTDOWN:
          return makeResult(reqId, { ok: true, shuttingDown: true });
        default:
          return makeError(reqId, "METHOD_UNKNOWN", `unknown method ${method}`);
      }
    } catch (err) {
      return makeError(
        reqId,
        "GATEWAY_INTERNAL",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  /**
   * Wait for a task to finish (tests / headless wait).
   * @param {string} taskId
   * @param {number} [timeoutMs]
   */
  async function awaitTask(taskId, timeoutMs = 1_800_000) {
    const task = tasks.get(taskId);
    if (!task) throw new Error(`unknown task ${taskId}`);
    if (!task.runPromise) return snapshotTask(task);
    let timer;
    try {
      await Promise.race([
        task.runPromise,
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`task ${taskId} timed out`)),
            timeoutMs,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
    return snapshotTask(task);
  }

  return {
    gatewayId,
    packageRoot,
    runtimeRoot,
    bus,
    dispatch,
    bindProject,
    startTask,
    steerTask,
    cancelTask,
    awaitTask,
    snapshotTask: (taskId) => {
      const t = tasks.get(taskId);
      return t ? snapshotTask(t) : null;
    },
    listTasks: () => [...tasks.values()].map(snapshotTask),
    getProject: () => ({ ...project }),
    listCapabilities,
    onEvent: (fn) => {
      bus.on("event", fn);
      return () => bus.off("event", fn);
    },
    onTaskEvent: (taskId, fn) => {
      const key = `task:${taskId}`;
      bus.on(key, fn);
      return () => bus.off(key, fn);
    },
  };
}
