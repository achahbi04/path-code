/**
 * S1 — PATH Gateway runtime.
 *
 * Owns engineering tasks independently of any terminal client.
 * Reuses existing ag1/session + ag10 fabric; does not invent a second backend.
 */

import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { basename, join } from "node:path";
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
import { normalizeObjectiveText } from "../normalize-text.mjs";
import { validateEngineeringModelCommand } from "../model-plane/command-override.mjs";
import {
  cancelTaskProcesses,
  runWithTaskContext,
} from "../process-registry.mjs";
import { appendTaskTrace } from "../task-trace.mjs";
import {
  buildEngineCapabilityList,
  resolvePreferredEngine,
} from "../ag10/engine-contract.mjs";
import { resolveCursorApiKey } from "../ag10/cursor-sdk.mjs";
import { probeCopilotReadiness } from "../ag10/engine-readiness.mjs";
import { loadedCodeIdentity } from "../build/identity.mjs";
import { validateCreatorReferenceInput } from "../build/reference-input.mjs";
import {
  findLatestResumableCheckpoint,
  markTaskInterrupted,
  readTaskCheckpoint,
  writeTaskCheckpoint,
} from "../ag10/task-checkpoint.mjs";
import {
  assessTaskContinuity,
  formatContinuityBrief,
} from "../ag10/task-continuity.mjs";

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
  const skipBootstrap =
    options.skipBootstrap === true ||
    process.env.PATHCODE_GATEWAY_SKIP_BOOTSTRAP === "1";

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
    unversioned: false,
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
    try {
      if (
        type === "session.task.received" ||
        type === "session.cancelled" ||
        type === "gateway.task.finished" ||
        type === "session.engineering.result" ||
        type === "session.engineering.tool" ||
        type === "session.capability.preparing" ||
        type === "session.engine.selected" ||
        type === "session.internal_error"
      ) {
        appendTaskTrace({
          taskId: task.taskId,
          runtimeRoot,
          type,
          engine: typeof fields.engine === "string" ? fields.engine : undefined,
          phase: typeof fields.label === "string" ? fields.label : undefined,
          tool: typeof fields.tool === "string" ? fields.tool : undefined,
          path: typeof fields.path === "string" ? fields.path : undefined,
          command: typeof fields.command === "string" ? fields.command : undefined,
          detail:
            typeof fields.detail === "string"
              ? fields.detail
              : typeof fields.preview === "string"
                ? fields.preview
                : typeof fields.summary === "string"
                  ? fields.summary
                  : typeof fields.message === "string"
                    ? fields.message
                    : undefined,
          exitCode: typeof fields.exitCode === "number" ? fields.exitCode : undefined,
          durationMs: typeof fields.durationMs === "number" ? fields.durationMs : undefined,
          meta: {
            status: task.status,
            classification: fields.classification ?? task.classification,
            ...(typeof fields.kind === "string" ? { kind: fields.kind } : {}),
            ...(typeof fields.query === "string" ? { query: fields.query.slice(0, 200) } : {}),
            ...(typeof fields.added === "number" ? { added: fields.added } : {}),
            ...(typeof fields.removed === "number" ? { removed: fields.removed } : {}),
            ...(typeof fields.ok === "boolean" ? { ok: fields.ok } : {}),
            ...(typeof fields.reason === "string" ? { reason: fields.reason.slice(0, 300) } : {}),
            ...(typeof fields.selected === "string" ? { selected: fields.selected } : {}),
            ...(fields.preferred === null || typeof fields.preferred === "string"
              ? { preferred: fields.preferred ?? null }
              : {}),
            ...(Array.isArray(fields.ready) ? { ready: fields.ready.slice(0, 4).map(String) } : {}),
            ...(Array.isArray(fields.fit) ? { fit: fields.fit.slice(0, 4).map(String) } : {}),
            ...(typeof fields.exitCode === "number" ? { exitCode: fields.exitCode } : {}),
          },
        });
      }
    } catch {
      // never break engineering for observability
    }
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
      preferredEngine: task.preferredEngine || null,
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
    const { assertAllowedProjectRoot } = await import("../paths.mjs");
    const allowed = assertAllowedProjectRoot(discovered.projectRoot);
    if (!allowed.ok) {
      return {
        ok: false,
        code: allowed.code,
        message: allowed.message,
      };
    }
    const projectRoot = discovered.projectRoot;
    const workingSubdir =
      typeof discovered.workingSubdir === "string" ? discovered.workingSubdir : "";
    let branch = null;
    let clean = null;
    let unversioned = discovered.unversioned === true;
    const admission = admitPrimaryCheckout(projectRoot);
    if (admission.ok) {
      if (admission.unversioned) {
        branch = "unversioned";
        clean = null;
        unversioned = true;
      } else {
        branch = admission.detached ? null : admission.branch;
        clean = admission.dirty !== true;
        unversioned = false;
      }
    }

    try {
      if (!skipBootstrap) {
        await ensureAg1Runtime({ packageRoot, runtimeRoot });
      }
    } catch {
      // non-fatal at bind; task start re-checks
    }
    try {
      if (!skipBootstrap) {
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
      unversioned,
      boundAt: new Date().toISOString(),
    };
    return {
      ok: true,
      projectRoot,
      workingSubdir,
      projectName: project.projectName,
      branch,
      clean,
      unversioned,
      runtimeRoot,
      packageRoot,
      gatewayId,
      protocolVersion: GATEWAY_PROTOCOL_VERSION,
    };
  }

  /**
   * Sync Cursor readiness for listCapabilities (no network).
   * Key present + @cursor/sdk resolvable → available; missing key → auth_required.
   */
  function probeCursorCapabilitySync() {
    /** @type {string[]} */
    const evidence = [];
    const apiKey = resolveCursorApiKey(process.env);
    if (!apiKey) {
      evidence.push("CURSOR_API_KEY not set");
      return {
        ready: false,
        reason: "auth_required",
        mode: "none",
        evidence,
      };
    }
    evidence.push("CURSOR_API_KEY present");
    try {
      const require = createRequire(join(packageRoot, "package.json"));
      require.resolve("@cursor/sdk");
      evidence.push("@cursor/sdk resolvable");
      return {
        ready: true,
        reason: null,
        mode: "native_sdk",
        evidence,
      };
    } catch (err) {
      evidence.push(
        `sdk resolve failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return {
        ready: false,
        reason: "sdk_missing",
        mode: "none",
        evidence,
      };
    }
  }

  function listCapabilities() {
    const cursorProbe = probeCursorCapabilitySync();
    const copilotProbe = probeCopilotReadiness();
    const engines = buildEngineCapabilityList({
      antigravity: true,
      copilot: {
        ready: copilotProbe.ready,
        mode: copilotProbe.mode || "none",
        reason: copilotProbe.reason || undefined,
        evidence: copilotProbe.evidence,
      },
      cursor: {
        ready: cursorProbe.ready,
        mode: cursorProbe.mode,
        reason: cursorProbe.reason || undefined,
        evidence: cursorProbe.evidence,
      },
    });
    return {
      engines,
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
        workflows: ["path_code", "path_build", "path_studio_slot"],
        clients: ["cli", "headless", "studio_slot", "build"],
      },
      project: project.projectRoot
        ? {
            projectRoot: project.projectRoot,
            workingSubdir: project.workingSubdir,
            branch: project.branch,
            clean: project.clean,
            unversioned: project.unversioned === true,
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
    const objective = normalizeObjectiveText(
      typeof params.objective === "string" && params.objective.trim()
        ? params.objective.trim()
        : typeof params.taskText === "string" && params.taskText.trim()
          ? params.taskText.trim()
          : "",
    );
    if (!objective) {
      return { ok: false, code: "OBJECTIVE_REQUIRED", message: "objective required" };
    }
    if (params.engineeringModelId !== undefined) {
      const checked = validateEngineeringModelCommand(params.engineeringModelId);
      if (!checked.ok) return checked;
    }
    if (params.creatorReferenceBuildId !== undefined || params.creatorReferenceInputs !== undefined) {
      if (typeof params.creatorReferenceBuildId !== "string") {
        return { ok: false, code: "INVALID_REFERENCE_INPUT", message: "Build reference identity required" };
      }
      const checked = validateCreatorReferenceInput({
        runtimeRoot,
        buildId: params.creatorReferenceBuildId,
        projectRoot: project.projectRoot,
        references: params.creatorReferenceInputs,
      });
      if (!checked.ok) return checked;
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
    const preferredEngine = resolvePreferredEngine({
      prefer:
        (typeof params.preferredEngine === "string" && params.preferredEngine) ||
        (typeof params.engine === "string" && params.engine) ||
        null,
    });
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
      preferredEngine: preferredEngine || null,
    };
    tasks.set(taskId, task);

    emitTaskEvent(task, "session.task.received", {
      mode: "ag1",
      task: objective.slice(0, 4000),
      preview: objective.slice(0, 4000),
    });
    emitTaskEvent(task, "session.capability.preparing", {
      detail: "Admitting project and preparing environment",
    });

    if (preferredEngine) {
      emitTaskEvent(task, "session.capability.collaborate", {
        engine: preferredEngine,
        phase: "routing",
        label: "Collaborative engineering",
        detail: `preferred engine: ${preferredEngine}`,
      });
    }

    const sessionEventEmit = (type, fields = {}) => {
      emitTaskEvent(task, type, fields && typeof fields === "object" ? fields : {});
    };

    task.runPromise = runWithTaskContext(taskId, () =>
      (async () => {
      prompt.beginCycle();
      try {
        if (process.env.PATHCODE_GATEWAY_FAKE_ENGINE === "1") {
          // Persist a durable checkpoint early so Gateway kill mid-run leaves
          // recoverable PATH task reality (S4 continuity evidence).
          try {
            writeTaskCheckpoint(runtimeRoot, {
              schema: "pathcode.g10.task-checkpoint.v1",
              taskId: task.taskId,
              sessionId: task.sessionId,
              repoRoot: task.projectRoot,
              worktreePath: task.projectRoot,
              objective,
              ...(typeof params.creatorReferenceBuildId === "string" ? {
                creatorReferenceBuildId: params.creatorReferenceBuildId,
                referenceInputs: params.creatorReferenceInputs,
              } : {}),
              preferredEngine: preferredEngine || undefined,
              updatedAt: new Date().toISOString(),
            });
            task.worktreePath = task.projectRoot;
          } catch {
            /* ignore */
          }
          const holdMs = Number(process.env.PATHCODE_GATEWAY_FAKE_HOLD_MS || 0);
          if (Number.isFinite(holdMs) && holdMs > 0) {
            await new Promise((r) => setTimeout(r, holdMs));
            if (abort.signal.aborted || prompt.isCycleCancelRequested()) {
              task.status = "cancelled";
              task.classification = "CANCELLED";
              task.result = { exitCode: 130, classification: "CANCELLED" };
              emitTaskEvent(task, "gateway.task.finished", {
                status: task.status,
                classification: task.classification,
              });
              return;
            }
          }
          // Yield so mid-cycle steer can enqueue before the scripted turn finishes.
          await new Promise((r) => setTimeout(r, 40));
          emitTaskEvent(task, "session.capability.preparing", {
            detail: "resolving node · npm · typescript toolchain",
          });
          emitTaskEvent(task, "session.capability.discovered", {
            matrix: {
              languages: [
                { id: "typescript", status: "ready" },
                { id: "javascript", status: "ready" },
              ],
              toolchains: [
                { id: "node", status: "ready" },
                { id: "npm", status: "ready" },
              ],
            },
          });
          emitTaskEvent(task, "session.engineering.tool", {
            kind: "inspect",
            tool: "list_directory",
            summary: "list_directory src/lib",
            path: "src/lib/",
            preview: "utils.ts\nindex.ts\n",
          });
          emitTaskEvent(task, "session.engineering.tool", {
            kind: "inspect",
            tool: "find_file",
            summary: 'find_file "__pathcodeTrial"',
            query: '"__pathcodeTrial" in src/',
            preview: "src/lib/utils.ts:1\nsrc/lib/utils.test.ts:4\n",
          });
          emitTaskEvent(task, "session.engineering.tool", {
            kind: "inspect",
            tool: "view_file",
            summary: "view_file src/lib/utils.ts",
            path: "src/lib/utils.ts",
            preview:
              'export const __pathcodeTrial: number = "not a number";\nexport function clamp(n: number) {\n  return Math.max(0, n);\n}\n',
          });
          emitTaskEvent(task, "session.engineering.narration", {
            text: [
              "The production clamp helper already returns a number.",
              "The type error is isolated to the trial constant, so I'm correcting that assignment rather than changing clamp behavior.",
            ].join("\n\n"),
          });
          emitTaskEvent(task, "session.engineering.busy", {
            label: "Waiting for engineering result",
            detail: "planning the fix",
            since: Date.now(),
          });
          emitTaskEvent(task, "session.engineering.tool", {
            kind: "command",
            tool: "run_command",
            summary: "run_command node --version",
            command: "node --version",
            output: "env: node: Operation not permitted",
            ok: false,
          });
          emitTaskEvent(task, "session.engineering.tool", {
            kind: "command",
            tool: "run_command",
            summary: "run_command /opt/homebrew/bin/node --version",
            command: "/opt/homebrew/bin/node --version",
            output: "v22.14.0",
            ok: true,
          });
          emitTaskEvent(task, "session.capability.collaborate", {
            engine: "copilot",
            phase: "turn",
            detail: "editing src/lib/utils.ts",
          });
          // Drain any mid-cycle operator guidance into the live stream.
          if (typeof task.prompt?.drainSteering === "function") {
            for (const line of task.prompt.drainSteering()) {
              const text = String(line || "").trim();
              if (!text) continue;
              emitTaskEvent(task, "session.operator.note", {
                text: text.slice(0, 400),
              });
              emitTaskEvent(task, "session.engineering.narration", {
                text: "Taking that into the active engineering session now.",
              });
            }
          }
          emitTaskEvent(task, "session.engineering.tool", {
            kind: "file_edit",
            tool: "edit_file",
            summary: "edit_file src/lib/utils.ts",
            path: "src/lib/utils.ts",
            diff:
              '@@ -1,3 +1,3 @@\n-export const __pathcodeTrial: number = "not a number";\n+export const __pathcodeTrial: number = 0;\n export function clamp(n: number) {\n   return Math.max(0, n);\n }\n',
            added: 1,
            removed: 1,
          });
          emitTaskEvent(task, "session.engineering.tool", {
            kind: "command",
            tool: "run_command",
            summary: "run_command npm run typecheck",
            command: "npm run typecheck",
            output:
              "src/lib/utils.ts:1:14 - error TS2322:\nType 'string' is not assignable to type 'number'.\n\nFound 1 error.",
            ok: false,
          });
          emitTaskEvent(task, "session.capability.collaborate", {
            engine: "copilot",
            phase: "repair",
            detail: "repairing validation failures",
          });
          emitTaskEvent(task, "session.engineering.tool", {
            kind: "command",
            tool: "run_command",
            summary: "run_command npm run typecheck",
            command: "npm run typecheck",
            output: "✓ completed successfully",
            ok: true,
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
              changedFiles: ["src/lib/utils.ts"],
              commitSha: task.commitSha,
              taskBranch: task.taskBranch,
              engineActivityCount: 10,
            };
            emitTaskEvent(task, "session.engineering.result", {
              classification: "VERIFIED",
              changedFiles: ["src/lib/utils.ts"],
              commitSha: task.commitSha,
              taskBranch: task.taskBranch,
              checks: [
                { id: "typecheck-local-tsc", kind: "TYPECHECK", ok: true },
              ],
              engineeringHandoff:
                "Corrected the trial constant type so typecheck and tests pass.",
            });
            emitTaskEvent(task, "session.terminal", {
              disposition: "VERIFIED",
              summary: "Independent validation passed.",
              taskBranch: task.taskBranch,
              commitSha: task.commitSha,
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
          ...(typeof params.creatorReferenceBuildId === "string" ? {
            creatorReferenceBuildId: params.creatorReferenceBuildId,
            creatorReferenceInputs: params.creatorReferenceInputs,
          } : {}),
          projectRoot: task.projectRoot,
          workingSubdir: task.workingSubdir,
          unicode: true,
          checkoutRoot: packageRoot,
          sessionEventEmit,
          // Gateway already emitted session.task.received for this task.
          suppressTaskReceived: true,
          cardsOwnProgress: true,
          // Keep Gateway taskId === session/worktree taskId so /inspect,
          // reports, and checkpoints share one durable identity.
          taskId: task.taskId,
          ...(typeof params.resumeTaskId === "string" && params.resumeTaskId
            ? {
                resumeTaskId: String(params.resumeTaskId),
                resumeWorktreePath:
                  typeof params.resumeWorktreePath === "string"
                    ? params.resumeWorktreePath
                    : undefined,
              }
            : {}),
          sessionBaseCommit:
            typeof params.sessionBaseCommit === "string"
              ? params.sessionBaseCommit
              : null,
          ...(typeof params.engineeringModelId === "string"
            ? { engineeringModelId: params.engineeringModelId }
            : {}),
          signal: abort.signal,
          runtimeRoot,
          ...(preferredEngine ? { preferredEngine } : {}),
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
          sessionResult?.classification === "PARTIALLY_VERIFIED"
        ) {
          task.status = "completed";
        } else if (
          sessionResult?.exitCode === 0 &&
          sessionResult?.blocked !== true &&
          sessionResult?.classification !== "NOT_VERIFIED"
        ) {
          // Only treat exit 0 as completed when the session did not explicitly
          // report a blocked / not-verified admission outcome.
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
        // Always attempt cleanup of any leftover task-owned children.
        try {
          cancelTaskProcesses(taskId);
        } catch {
          // ignore
        }
      }
    })(),
    );

    // Do not await engineering here — clients subscribe while it runs.
    return {
      ok: true,
      taskId,
      sessionId,
      preferredEngine: preferredEngine || null,
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
      const trimmed = String(text || "").trim();
      emitTaskEvent(task, "session.operator.note", {
        text: trimmed.slice(0, 400),
      });
      emitTaskEvent(task, "session.engineering.steer", {
        phase: "queued",
        text: trimmed.slice(0, 400),
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
    if (task.status === "running") {
      task.status = "stopping";
      task.updatedAt = new Date().toISOString();
    }
    task.prompt.requestCycleCancel();
    try {
      task.abort.abort();
    } catch {
      // ignore
    }
    const cleaned = cancelTaskProcesses(taskId);
    try {
      appendTaskTrace({
        taskId,
        type: "task.stop",
        detail: `cancelled; processes=${cleaned.length}`,
        meta: { processes: cleaned },
        runtimeRoot,
      });
    } catch {
      // ignore
    }
    emitTaskEvent(task, "session.cancelled", {
      reason: "operator_stop",
      cleanedProcesses: cleaned.length,
    });
    return { ok: true, taskId, status: task.status, cleanedProcesses: cleaned.length };
  }

  /**
   * Assess durable + live continuity for a task (S4).
   * @param {Record<string, unknown>} [params]
   */
  function assessContinuity(params = {}) {
    const taskId =
      typeof params.taskId === "string" && params.taskId.trim()
        ? params.taskId.trim()
        : "";
    const live = taskId ? tasks.get(taskId) || null : null;
    const assessment = assessTaskContinuity({
      runtimeRoot,
      taskId: taskId || null,
      liveTask: live
        ? { status: live.status, result: live.result }
        : null,
      gatewayPidAlive: true,
    });
    return {
      ok: true,
      ...assessment,
      brief: formatContinuityBrief(assessment),
    };
  }

  /**
   * Resume or reconnect an interrupted / incomplete PATH task from durable state.
   * Distinct from task.attach (live Gateway map only).
   *
   * @param {Record<string, unknown>} [params]
   */
  async function resumeTask(params = {}) {
    let taskId =
      typeof params.taskId === "string" && params.taskId.trim()
        ? params.taskId.trim()
        : "";
    if (!taskId) {
      const latest = findLatestResumableCheckpoint(runtimeRoot);
      taskId = latest?.taskId || "";
    }
    if (!taskId) {
      return {
        ok: false,
        code: "NO_RESUMABLE_TASK",
        message: "No resumable checkpoint found",
      };
    }

    const live = tasks.get(taskId);
    if (live && live.status === "running") {
      return {
        ok: true,
        mode: "reconnect",
        disposition: "still_running",
        taskId,
        assessment: assessContinuity({ taskId }),
        snapshot: snapshotTask(live),
        note: "Gateway still owns this task — use attach/events; no reconstruct needed",
      };
    }
    if (live && live.status === "stopping") {
      return {
        ok: false,
        code: "TASK_STOPPING",
        message: `task ${taskId} is still stopping`,
        taskId,
      };
    }

    const cp = readTaskCheckpoint(runtimeRoot, taskId);
    if (!cp) {
      return {
        ok: false,
        code: "CHECKPOINT_NOT_FOUND",
        message: `no durable checkpoint for ${taskId}`,
        taskId,
      };
    }

    const assessment = assessTaskContinuity({
      runtimeRoot,
      taskId,
      liveTask: live ? { status: live.status, result: live.result } : null,
      checkpoint: cp,
      gatewayPidAlive: true,
    });

    if (
      assessment.disposition === "completed" ||
      assessment.disposition === "abandoned"
    ) {
      return {
        ok: false,
        code: "TASK_NOT_RESUMABLE",
        message: `task ${taskId} is ${assessment.disposition}`,
        taskId,
        assessment,
      };
    }

    if (
      !assessment.worktreeExists &&
      process.env.PATHCODE_GATEWAY_FAKE_ENGINE !== "1"
    ) {
      return {
        ok: false,
        code: "WORKTREE_MISSING",
        message: `worktree missing for ${taskId}`,
        taskId,
        assessment,
      };
    }

    if (cp.repoRoot) {
      const bound = await bindProject({ cwd: String(cp.repoRoot) });
      if (!bound.ok) return bound;
    } else if (!project.projectRoot) {
      const bound = await bindProject({
        cwd: typeof params.cwd === "string" ? params.cwd : undefined,
      });
      if (!bound.ok) return bound;
    }

    if (live) tasks.delete(taskId);

    const objective = normalizeObjectiveText(
      (typeof params.objective === "string" && params.objective.trim()) ||
        (typeof cp.objective === "string" && cp.objective) ||
        "Continue the interrupted PATH engineering task from durable state.",
    );

    const preferredEngine = resolvePreferredEngine({
      prefer:
        (typeof params.preferredEngine === "string" && params.preferredEngine) ||
        (typeof cp.preferredEngine === "string" && cp.preferredEngine) ||
        null,
    });

    const started = await startTask({
      ...params,
      creatorReferenceBuildId: params.creatorReferenceBuildId ?? cp.creatorReferenceBuildId,
      creatorReferenceInputs: params.creatorReferenceInputs ?? cp.referenceInputs,
      taskId,
      objective,
      taskText: objective,
      preferredEngine: preferredEngine || undefined,
      resumeTaskId: taskId,
      resumeWorktreePath: cp.worktreePath,
      cwd: cp.repoRoot || params.cwd,
      continuityResume: true,
      continuityDisposition: assessment.disposition,
      continuityReason: assessment.reason,
    });

    if (!started.ok) return started;

    const owned = tasks.get(taskId);
    if (owned) {
      emitTaskEvent(owned, "session.hydration", {
        stage: "continuity_resume",
        disposition: assessment.disposition,
        detail: assessment.reason,
        mode: "reconstruct",
      });
    }

    return {
      ok: true,
      mode: "resume",
      disposition: assessment.disposition,
      taskId,
      sessionId: started.sessionId,
      preferredEngine: preferredEngine || null,
      assessment: {
        ...assessment,
        brief: formatContinuityBrief(assessment),
      },
      snapshot: started.snapshot,
      note:
        "Reconstructed Gateway ownership from durable checkpoint/worktree. Engine-native resume is attempted only when session ids remain valid.",
    };
  }

  /**
   * Mark running tasks interrupted in durable checkpoints (Gateway stop/crash reclaim).
   * @param {string} [reason]
   * @returns {string[]}
   */
  function markRunningTasksInterrupted(reason) {
    /** @type {string[]} */
    const ids = [];
    for (const task of tasks.values()) {
      if (task.status !== "running" && task.status !== "stopping") continue;
      markTaskInterrupted(
        runtimeRoot,
        task.taskId,
        reason || "Gateway shutdown while task running",
      );
      ids.push(task.taskId);
    }
    return ids;
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
            identity: loadedCodeIdentity("gateway"),
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
        case GatewayMethods.TASK_RESUME: {
          const r = await resumeTask(params);
          return r.ok
            ? makeResult(reqId, r)
            : makeError(reqId, r.code || "RESUME_FAILED", r.message || "resume failed");
        }
        case GatewayMethods.TASK_CONTINUITY: {
          return makeResult(reqId, assessContinuity(params));
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
    resumeTask,
    assessContinuity,
    markRunningTasksInterrupted,
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
