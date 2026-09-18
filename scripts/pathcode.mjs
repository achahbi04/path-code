#!/usr/bin/env node
/**
 * PATH ● Code — terminal application entry (Phase 5F / 5G / 5G-R2).
 * Resolves owners from this checkout via import.meta.url, not process.cwd.
 * Legacy foundation CLI behavior is delegated for unrecognized flags.
 *
 * Phase 5G-R2: the session is long-lived; authority is not. After any cycle
 * disposition the prompt returns. Model id, autonomy mode, and provider key
 * persist for the process; every task is a fresh authority cycle.
 */

import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";

import {
  renderHelpText,
  COMPACT_NAME,
  ASCII_NAME,
} from "./pathcode-cli/banner.mjs";
import {
  resolveRuntimePrerequisites,
  assertPathPackagePresent,
  resolveTargetProjectRoot,
  resolvePathPackageRoot,
  resolvePathRuntimeRoot,
} from "./pathcode-cli/paths.mjs";
import {
  createPromptSession,
  isInteractiveTty,
} from "./pathcode-cli/terminal.mjs";
import { parseAutonomyMode } from "./pathcode-cli/autonomy-policy.mjs";
import {
  createSessionEventSink,
  mintSessionId,
} from "./pathcode-cli/session-events.mjs";
import { openEventsOutSink } from "./pathcode-cli/events-out.mjs";
import {
  createInlineStudioRenderer,
  installCollisionGuard,
} from "./pathcode-cli/inline-studio.mjs";
import {
  installTerminalRestoreGuards,
  restoreTerminal,
  setActiveTerminalCleanup,
} from "./pathcode-cli/terminal-restore.mjs";
import { ensureAg1Runtime } from "./pathcode-cli/ag1/runtime-bootstrap.mjs";
import { admitPrimaryCheckout } from "./pathcode-cli/ag1/admission.mjs";
import { basename } from "node:path";
import { recoverPathOwnedStaleWorktrees } from "./pathcode-cli/ag5/orphan-recovery.mjs";
import { runPathcodeDoctor } from "./pathcode-cli/ag5/doctor.mjs";
import {
  assertSupportedNode,
  assertSupportedPlatform,
} from "./pathcode-cli/ag6/platform.mjs";
import {
  createGatewayRuntime,
  startGatewayServer,
  ensureGateway,
} from "./pathcode-cli/gateway/index.mjs";
import { normalizeObjectiveText } from "./pathcode-cli/normalize-text.mjs";
import { isTaskStopCommand } from "./pathcode-cli/task-control.mjs";
import { reconcileHostStartup } from "./pathcode-cli/ag10/host-startup.mjs";
import { formatReopenNotice } from "./pathcode-cli/ag10/task-continuity.mjs";

const root = resolvePathPackageRoot();

// Keep Terminal.app from showing argv / TMPDIR in the title bar.
try {
  process.title = "pathcode";
} catch {
  // ignore
}

/**
 * @param {readonly string[]} argv
 */
function parseArgs(argv) {
  /** @type {{
   *   help: boolean,
   *   version: boolean,
   *   doctor: boolean,
   *   model: string | null,
   *   autonomy: "review" | "bounded",
   *   autonomyExplicit: boolean,
   *   events: null | "ndjson",
   *   eventsOut: string | null,
   *   execution: "local" | "cloud",
   *   issue: number | null,
   *   rest: string[],
   * }} */
  const out = {
    help: false,
    version: false,
    doctor: false,
    model: null,
    autonomy: "review",
    autonomyExplicit: false,
    events: null,
    eventsOut: null,
    execution: "local",
    issue: null,
    rest: [],
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") {
      out.help = true;
      continue;
    }
    if (a === "--version") {
      out.version = true;
      continue;
    }
    if (a === "doctor" || a === "--doctor") {
      out.doctor = true;
      continue;
    }
    if (a === "--issue") {
      const next = argv[i + 1];
      if (typeof next !== "string" || !/^\d+$/.test(next.trim())) {
        return { ok: false, message: "Usage: pathcode --issue <number>" };
      }
      out.issue = Number(next.trim());
      i += 1;
      continue;
    }
    if (a === "--model") {
      const next = argv[i + 1];
      if (typeof next !== "string" || next.trim() === "" || next.startsWith("-")) {
        return { ok: false, message: "Usage: pathcode --model <id>" };
      }
      out.model = next.trim();
      i += 1;
      continue;
    }
    if (a === "--autonomy") {
      const next = argv[i + 1];
      if (typeof next !== "string" || next.trim() === "" || next.startsWith("-")) {
        return { ok: false, message: "Usage: pathcode --autonomy review|bounded" };
      }
      const parsedAutonomy = parseAutonomyMode(next);
      if (!parsedAutonomy.ok) {
        return { ok: false, message: parsedAutonomy.message };
      }
      out.autonomy = parsedAutonomy.mode;
      out.autonomyExplicit = true;
      i += 1;
      continue;
    }
    if (a === "--events") {
      const next = argv[i + 1];
      if (typeof next !== "string" || next.trim() === "" || next.startsWith("-")) {
        return { ok: false, message: "Usage: pathcode --events ndjson" };
      }
      const mode = next.trim().toLowerCase();
      if (mode !== "ndjson") {
        return { ok: false, message: "Usage: pathcode --events ndjson" };
      }
      out.events = "ndjson";
      i += 1;
      continue;
    }
    if (a === "--events-out") {
      const next = argv[i + 1];
      if (typeof next !== "string" || next.trim() === "" || next.startsWith("-")) {
        return {
          ok: false,
          message: "Usage: pathcode --events ndjson --events-out <path>",
        };
      }
      out.eventsOut = next.trim();
      i += 1;
      continue;
    }
    if (a === "--execution") {
      const next = argv[i + 1];
      if (typeof next !== "string" || next.trim() === "" || next.startsWith("-")) {
        return { ok: false, message: "Usage: pathcode --execution local|cloud" };
      }
      const mode = next.trim().toLowerCase();
      if (mode !== "local" && mode !== "cloud") {
        return { ok: false, message: "Usage: pathcode --execution local|cloud" };
      }
      out.execution = mode;
      i += 1;
      continue;
    }
    if (a === "--yes" || a === "--auto-approve" || a.startsWith("--workspace") || a === "--key") {
      return {
        ok: false,
        message: `Refused flag ${a}: live trial requires interactive TTY approvals; no --yes/--auto-approve/--workspace/--key.`,
      };
    }
    out.rest.push(a);
  }
  if (out.eventsOut !== null && out.events !== "ndjson") {
    return {
      ok: false,
      message: "--events-out requires --events ndjson",
    };
  }
  return { ok: true, value: out };
}

/** Exported for focused CLI arg proofs (PS1). */
export { parseArgs };

function packageVersion() {
  try {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function detectPlain() {
  return (
    process.env.TERM === "dumb" ||
    process.env.NO_COLOR === "1" ||
    process.stdout.isTTY !== true
  );
}

function detectUnicode() {
  if (detectPlain()) return false;
  if (process.env.LC_ALL === "C" || process.env.LANG === "C") return false;
  return true;
}

/**
 * Delegate to foundation CLI pure helpers for legacy unrecognized args.
 * @param {readonly string[]} args
 */
async function delegateLegacy(args) {
  const prereq = resolveRuntimePrerequisites(root);
  if (!prereq.ok) {
    // Installed Beta packages do not ship TypeScript/devDeps. Unknown args must
    // not tell the user to "restore dependencies in this checkout".
    const label = Array.isArray(args) && args.length > 0 ? args.join(" ") : "(empty)";
    process.stderr.write(
      `Unknown argument: ${label}\nRun "pathcode --help" for usage.\n`,
    );
    return 2;
  }
  const mainHref = pathToFileURL(join(root, "dist", "cli", "main.js")).href;
  const { runCli } = await import(mainHref);
  return runCli(args, {
    writeOut: (t) => process.stdout.write(t),
    writeErr: (t) => process.stderr.write(t),
  });
}

/**
 * Quiet AG3 product startup — no provider/engine branding.
 * @param {{
 *   unicode: boolean,
 *   plain: boolean,
 *   projectName: string,
 *   branch: string | null,
 *   clean: boolean | null,
 * }} info
 */
function renderQuietStartup(info) {
  const name = info.unicode && !info.plain ? COMPACT_NAME : ASCII_NAME;
  const branch = info.unversioned
    ? "unversioned"
    : info.branch || "detached";
  const clean = info.unversioned
    ? "unversioned"
    : info.clean === true
      ? "clean"
      : info.clean === false
        ? "dirty"
        : "unknown";
  // Identity only — the session-long cockpit owns the live prompt.
  return `${name}\n${info.projectName} · ${branch} · ${clean}\n\n`;
}

/**
 * @param {boolean} unicode
 * @param {boolean} plain
 */
function promptPrefix(unicode, plain) {
  return `${unicode && !plain ? COMPACT_NAME : ASCII_NAME} > `;
}

/**
 * @param {any} prompt
 * @param {boolean} unicode
 * @param {boolean} plain
 * @param {{ taskCount: number, modelCallCount: number }} sessionStats
 */
function redrawPrompt(prompt, unicode, plain, sessionStats, inlineStudio = null) {
  if (inlineStudio && typeof inlineStudio.setIdlePrompt === "function") {
    // Keep the operator inside the session-long cockpit.
    inlineStudio.setIdlePrompt(promptPrefix(unicode, plain));
    return;
  }
  if (sessionStats.taskCount > 0) {
    const engine =
      typeof sessionStats.engineActivityCount === "number" &&
      sessionStats.engineActivityCount > 0
        ? `, ${sessionStats.engineActivityCount} engineering activities`
        : "";
    const handoff =
      typeof sessionStats.lastVerifiedBranch === "string" &&
      sessionStats.lastVerifiedBranch &&
      typeof sessionStats.sessionBaseCommit === "string" &&
      sessionStats.sessionBaseCommit
        ? `\nLatest verified task branch: ${sessionStats.lastVerifiedBranch}\nSession commit: ${sessionStats.sessionBaseCommit.slice(0, 12)}\nTo adopt: git merge ${sessionStats.lastVerifiedBranch}\n`
        : "";
    prompt.write(
      `Session so far: ${sessionStats.taskCount} task${sessionStats.taskCount === 1 ? "" : "s"}${engine}.\n${handoff}`,
    );
  }
  prompt.write(promptPrefix(unicode, plain));
}

/**
 * S2 command replies must be visible under alt-screen. Prefer the in-canvas
 * operator panel; fall back to prompt.write for non-TTY / tests.
 * @param {{ write: (t: string) => void }} prompt
 * @param {any} inlineStudio
 * @param {string} text
 */
function showOperatorReply(prompt, inlineStudio, text) {
  const body = String(text || "").replace(/\s+$/, "");
  if (
    inlineStudio &&
    typeof inlineStudio.setOperatorPanel === "function"
  ) {
    inlineStudio.setOperatorPanel(body);
    return;
  }
  prompt.write(body.endsWith("\n") ? body : `${body}\n`);
}

/**
 * @param {readonly string[]} argv
 * @param {{
 *   stdin?: any,
 *   stdout?: any,
 *   stderr?: any,
 *   runTrial?: Function,
 *   runRecover?: Function,
 *   runGeneralSession?: Function,
 * }} [testIo]
 */
export async function runPathcodeMain(argv, testIo = {}) {
  const stdin = testIo.stdin ?? process.stdin;
  const stdout = testIo.stdout ?? process.stdout;
  const stderr = testIo.stderr ?? process.stderr;
  const parsed = parseArgs(argv);
  if (!parsed.ok) {
    stderr.write(`${parsed.message}\n`);
    return 2;
  }
  const args = parsed.value;
  const plain = detectPlain();
  const unicode = detectUnicode() && !plain;
  const columns = stdout.columns ?? 80;

  const platformGate = assertSupportedPlatform();
  if (!platformGate.ok) {
    stderr.write(`${platformGate.message}\n`);
    return 2;
  }
  const nodeGate = assertSupportedNode();
  if (!nodeGate.ok) {
    stderr.write(`${nodeGate.message}\n`);
    return 2;
  }

  if (args.version) {
    stdout.write(`${unicode ? COMPACT_NAME : ASCII_NAME} ${packageVersion()}\n`);
    return 0;
  }

  if (args.help) {
    stdout.write(renderHelpText({ unicode, plain }));
    return 0;
  }

  if (args.doctor) {
    const report = runPathcodeDoctor({ packageRoot: root, cwd: process.cwd() });
    stdout.write(report.text);
    return report.exitCode;
  }

  if (args.rest.length > 0) {
    // Preserve foundation unknown-arg / legacy behavior.
    return await delegateLegacy(args.rest);
  }

  // Bare launch: quiet product shell. Bootstrap runtime; discover project.
  const streams = { stdin, stdout, stderr };
  const interactive = isInteractiveTty(streams);

  const packageOk = assertPathPackagePresent(root);
  if (!packageOk.ok) {
    stderr.write(`${packageOk.message}\n`);
    return 2;
  }

  const project = resolveTargetProjectRoot(process.cwd());
  if (!project.ok) {
    stderr.write(`${project.message}\n`);
    return 2;
  }
  const projectRoot = project.projectRoot;
  const workingSubdir =
    typeof project.workingSubdir === "string" ? project.workingSubdir : "";
  const projectName = basename(projectRoot);

  /** @type {{ branch: string | null, clean: boolean | null, unversioned?: boolean }} */
  let gitSummary = { branch: null, clean: null };
  const admission = admitPrimaryCheckout(projectRoot);
  if (admission.ok) {
    if (admission.unversioned) {
      gitSummary = { branch: "unversioned", clean: null, unversioned: true };
    } else {
      gitSummary = {
        branch: admission.detached ? null : admission.branch,
        clean: admission.dirty !== true,
      };
    }
  }

  // Quiet runtime bootstrap (venv under PATH_RUNTIME_ROOT). Failures surface later.
  try {
    await ensureAg1Runtime({ packageRoot: root });
  } catch {
    // non-fatal at shell open; task start will re-check
  }

  // AG5: reclaim PATH-owned stale worktrees only; never global user prune.
  try {
    recoverPathOwnedStaleWorktrees({
      projectRoot,
      checkoutRoot: root,
    });
  } catch {
    // non-fatal
  }

  if (!interactive) {
    stdout.write(
      renderQuietStartup({
        unicode,
        plain: true,
        projectName,
        branch: gitSummary.branch,
        clean: gitSummary.clean,
        unversioned: gitSummary.unversioned === true,
      }).replace(/\nPATH [●*] Code > $/, "\n"),
    );
    stdout.write(
      "(Non-interactive: showing project identity only. Use a TTY for engineering.)\n",
    );
    return 0;
  }

  // Do NOT write brand/startup identity to the normal scrollback buffer here.
  // The living cockpit enters alternate screen first and renders splash + PATH ● Code
  // inside that screen. Writing before alt-screen made the brand appear only after /exit.

  /** Session-scoped settings — persist via preferences.json; authority does not. */
  const { readPreferences, writePreferences } = await import(
    "./pathcode-cli/preferences.mjs"
  );
  const prefsAtLaunch = readPreferences();
  let modelId =
    args.model ??
    prefsAtLaunch.modelId ??
    process.env.PATHCODE_OPENAI_MODEL ??
    null;
  let autonomyMode = args.autonomyExplicit
    ? args.autonomy
    : prefsAtLaunch.autonomy ?? args.autonomy;
  /** @type {string | null} */
  let sessionCredential = null;
  const runtimeRoot = resolvePathRuntimeRoot({ packageRoot: root });
  const sessionStats = {
    taskCount: 0,
    modelCallCount: 0,
    engineActivityCount: 0,
    /** @type {string | null} */
    sessionBaseCommit: null,
    /** @type {string | null} */
    lastVerifiedBranch: null,
  };
  /** @type {number} */
  let lastExitCode = 0;

  // S1 — gateway owns engineering; CLI is a presentation client.
  // Default: embed runtime + expose socket for same-process multi-client attach.
  // PATHCODE_GATEWAY_EXTERNAL=1: attach to a detached gateway (disconnect ≠ cancel).
  const useGateway =
    testIo.runAg1Session == null &&
    testIo.runGeneralSession == null &&
    process.env.PATHCODE_USE_GATEWAY !== "0";
  const useExternalGateway =
    useGateway &&
    (process.env.PATHCODE_GATEWAY_EXTERNAL === "1" ||
      process.env.PATHCODE_GATEWAY_MODE === "external");
  /** @type {ReturnType<typeof createGatewayRuntime> | null} */
  let gatewayRuntime = null;
  /** @type {Awaited<ReturnType<typeof startGatewayServer>> | null} */
  let gatewayServer = null;
  /** @type {Awaited<ReturnType<typeof ensureGateway>>["client"] | null} */
  let gatewayClient = null;
  /** @type {string | null} */
  let activeGatewayTaskId = null;
  /** @type {Array<{ taskId: string, status?: string, objective?: string }>} */
  let aliveGatewayNotice = [];
  /** @type {import('./pathcode-cli/ag10/task-continuity.mjs').ContinuityAssessment[]} */
  let durableRecoverNotice = [];
  const runtimeRootForContinuity = resolvePathRuntimeRoot({ packageRoot: root });
  try {
    const startup = reconcileHostStartup({
      runtimeRoot: runtimeRootForContinuity,
      projectRoot,
    });
    durableRecoverNotice = Array.isArray(startup.recoverable)
      ? startup.recoverable.slice(0, 5)
      : [];
  } catch {
    durableRecoverNotice = [];
  }
  if (useGateway) {
    const runtimeRoot = runtimeRootForContinuity;
    if (useExternalGateway) {
      const ensured = await ensureGateway({
        packageRoot: root,
        runtimeRoot,
      });
      gatewayClient = ensured.client;
      await gatewayClient.bindProject(projectRoot);
      try {
        const listed = await gatewayClient.listTasks();
        const tasks = Array.isArray(listed?.tasks) ? listed.tasks : [];
        aliveGatewayNotice = tasks
          .filter((t) => t && t.status === "running" && typeof t.taskId === "string")
          .map((t) => ({
            taskId: t.taskId,
            status: t.status,
            objective:
              typeof t.objective === "string"
                ? t.objective.slice(0, 120)
                : undefined,
          }));
      } catch {
        aliveGatewayNotice = [];
      }
      if (Array.isArray(ensured.interruptedTaskIds) && ensured.interruptedTaskIds.length) {
        try {
          const startup = reconcileHostStartup({ runtimeRoot, projectRoot });
          durableRecoverNotice = startup.recoverable.slice(0, 5);
        } catch {
          /* keep prior */
        }
      }
    } else {
      gatewayRuntime = createGatewayRuntime({
        packageRoot: root,
        runtimeRoot,
      });
      try {
        await gatewayRuntime.bindProject({ cwd: projectRoot });
        gatewayServer = await startGatewayServer({
          runtime: gatewayRuntime,
          runtimeRoot,
          packageRoot: root,
        });
      } catch (err) {
        stderr.write(
          `PATH Gateway socket unavailable (${err instanceof Error ? err.message : String(err)}); continuing in-process.\n`,
        );
        gatewayServer = null;
      }
    }
  }

  // One living-session id for the process; stamped on every session.* event.
  const sessionId =
    typeof testIo.sessionId === "string" && testIo.sessionId.trim() !== ""
      ? testIo.sessionId.trim()
      : mintSessionId();

  /** @type {ReturnType<typeof openEventsOutSink> | null} */
  let eventsOut = null;
  /** @type {((line: string) => void) | undefined} */
  let writeNdjson;
  /** True when NDJSON would share the human TTY (breaks in-place cards). */
  let ndjsonSharesStdout = false;
  if (args.events === "ndjson") {
    if (typeof args.eventsOut === "string" && args.eventsOut.trim() !== "") {
      // Named destination: truncate on launch, flush each line, keep human stdout clean.
      eventsOut = openEventsOutSink(args.eventsOut);
      writeNdjson = (line) => {
        eventsOut.writeLine(line);
      };
    } else {
      ndjsonSharesStdout = true;
      writeNdjson = (line) => {
        stdout.write(line);
      };
    }
  }

  // Inline cards are the default TTY experience. Disable when NDJSON shares
  // stdout (operator should use --events-out for a side-channel).
  const ttyInline =
    streams.stdout.isTTY === true && ndjsonSharesStdout === false;
  const inlineStudio = createInlineStudioRenderer({
    stdout: streams.stdout,
    enabled: ttyInline,
    alternateScreen: true,
    projectName,
  });

  // Non-cockpit TTY (e.g. NDJSON on stdout): traditional scrollback identity + prompt.
  // Living cockpit owns brand inside alternate screen — never pre-paint it here.
  if (!ttyInline) {
    stdout.write(
      renderQuietStartup({
        unicode,
        plain,
        projectName,
        branch: gitSummary.branch,
        clean: gitSummary.clean,
        unversioned: gitSummary.unversioned === true,
      }),
    );
    stdout.write(promptPrefix(unicode, plain));
  }

  /** @type {AbortController | null} */
  let cycleAbort = null;

  installTerminalRestoreGuards({
    onSigint: () => {
      // Only cooperative-cancel while an engineering cycle is active.
      // Session-long cockpit stays active between tasks; idle Ctrl-C exits PATH.
      if (typeof prompt?.isCycleActive === "function" && prompt.isCycleActive()) {
        if (typeof prompt.requestCycleCancel === "function") {
          prompt.requestCycleCancel();
        }
        try {
          cycleAbort?.abort();
        } catch {
          // ignore
        }
        return "handled";
      }
      return "exit";
    },
  });
  setActiveTerminalCleanup(() => {
    try {
      // External gateway must keep owning engineering after CLI disconnect.
      if (gatewayServer) gatewayServer.stop();
    } catch {
      // ignore
    }
    try {
      gatewayClient?.close?.();
    } catch {
      // ignore
    }
    try {
      if (typeof inlineStudio.restoreTerminalState === "function") {
        inlineStudio.restoreTerminalState();
      } else {
        inlineStudio.finish();
      }
    } catch {
      // ignore
    }
  });

  const eventsMode = args.events === "ndjson" ? "both" : "human";
  const eventSink = createSessionEventSink({
    sessionId,
    mode: eventsMode,
    writeNdjson,
    ...(ttyInline
      ? {
          onEvent: (event) => {
            inlineStudio.onEvent(event);
          },
        }
      : {}),
  });

  const prompt = createPromptSession(streams, {
    onSteering: (text) => {
      // Stop commands are intercepted in terminal.pushSteering → requestCycleCancel.
      // Keep a defensive cancel here for any direct onSteering callers.
      if (isTaskStopCommand(text)) {
        if (activeGatewayTaskId) {
          if (gatewayClient) gatewayClient.cancelTask(activeGatewayTaskId);
          else if (gatewayRuntime) gatewayRuntime.cancelTask(activeGatewayTaskId);
        }
        try {
          cycleAbort?.abort();
        } catch {
          // ignore
        }
        return;
      }
      if (activeGatewayTaskId) {
        if (gatewayClient) gatewayClient.steerTask(activeGatewayTaskId, text);
        else if (gatewayRuntime) gatewayRuntime.steerTask(activeGatewayTaskId, text);
      }
    },
    onCycleCancel: () => {
      if (activeGatewayTaskId) {
        if (gatewayClient) gatewayClient.cancelTask(activeGatewayTaskId);
        else if (gatewayRuntime) gatewayRuntime.cancelTask(activeGatewayTaskId);
      }
    },
  });
  if (ttyInline && typeof prompt.enableLivingComposer === "function") {
    prompt.enableLivingComposer({
      onChange: (composerState) => {
        if (typeof inlineStudio.setComposerState === "function") {
          inlineStudio.setComposerState(composerState);
        }
      },
      onStreamScroll: (delta) => {
        if (typeof inlineStudio.adjustStreamScroll === "function") {
          inlineStudio.adjustStreamScroll(delta);
        }
      },
      onDismissOverlay: () => {
        if (typeof inlineStudio.setOperatorPanel === "function") {
          inlineStudio.setOperatorPanel(null);
        }
        if (typeof inlineStudio.setReportActionNotice === "function") {
          inlineStudio.setReportActionNotice("");
        }
      },
    });
  }
  const uninstallCollisionGuard = ttyInline
    ? installCollisionGuard(prompt, inlineStudio)
    : () => {};

  /** @param {(signal: AbortSignal) => Promise<unknown> | unknown} cycle */
  async function runCycle(cycle) {
    cycleAbort = new AbortController();
    if (typeof prompt.beginCycle === "function") prompt.beginCycle();
    if (ttyInline) {
      if (typeof inlineStudio.startTask === "function") {
        inlineStudio.startTask();
      } else {
        inlineStudio.begin();
      }
    }
    try {
      return await cycle(cycleAbort.signal);
    } finally {
      cycleAbort = null;
      // Session-long cockpit: keep alt-screen; do not finish() after each task.
      if (typeof prompt.endCycle === "function") prompt.endCycle();
      if (typeof prompt.clearStop === "function") prompt.clearStop();
    }
  }

  /**
   * Rejoin a Gateway-owned task that is still running (S1 ownership model).
   * Not crash/reboot resurrection — only live Gateway tasks.
   * @param {string} taskId
   */
  async function followAttachedGatewayTask(taskId) {
    const id = String(taskId || "").trim();
    if (!id) {
      return { ok: false, message: "Usage: /attach <taskId>" };
    }
    if (!useGateway || (!gatewayClient && !gatewayRuntime)) {
      return {
        ok: false,
        message:
          "No PATH Gateway is available in this session. Start a task normally, or launch with PATHCODE_GATEWAY_EXTERNAL=1 to rejoin a detached Gateway.",
      };
    }
    if (activeGatewayTaskId) {
      return {
        ok: false,
        message: `Already attached to task ${activeGatewayTaskId}. /stop it first, or wait for completion.`,
      };
    }

    let sessionResult = null;
    await runCycle(async (signal) => {
      if (gatewayClient) {
        const off = gatewayClient.onEvent((envelope) => {
          const ev = envelope?.event;
          if (!ev || typeof ev.type !== "string") return;
          const { type, ...fields } = ev;
          eventSink.emit(type, fields);
        });
        try {
          const attached = await gatewayClient.attachTask(id);
          if (!attached?.attached && !attached?.snapshot) {
            throw new Error(attached?.message || `attach failed for ${id}`);
          }
          const snap0 = attached.snapshot || (await gatewayClient.snapshotTask(id));
          if (!snap0 || snap0.status !== "running") {
            sessionResult =
              (snap0 && snap0.result) ||
              {
                exitCode: snap0?.status === "completed" ? 0 : 1,
                classification: snap0?.classification,
                taskBranch: snap0?.taskBranch,
                commitSha: snap0?.commitSha,
              };
            return;
          }
          activeGatewayTaskId = id;
          for (;;) {
            if (signal?.aborted) break;
            await new Promise((r) => setTimeout(r, 750));
            const full = await gatewayClient.snapshotTask(id);
            if (!full || full.status !== "running") {
              sessionResult =
                (full && full.result) ||
                {
                  exitCode: full?.status === "completed" ? 0 : 1,
                  classification: full?.classification,
                  taskBranch: full?.taskBranch,
                  commitSha: full?.commitSha,
                };
              break;
            }
          }
        } finally {
          activeGatewayTaskId = null;
          off();
        }
      } else if (gatewayRuntime) {
        const off = gatewayRuntime.onEvent((envelope) => {
          const ev = envelope?.event;
          if (!ev || typeof ev.type !== "string") return;
          const { type, ...fields } = ev;
          eventSink.emit(type, fields);
        });
        try {
          const task = gatewayRuntime.snapshotTask(id);
          if (!task) {
            throw new Error(`unknown task ${id}`);
          }
          activeGatewayTaskId = id;
          if (task.status === "running") {
            await gatewayRuntime.awaitTask(id);
          }
          const full = gatewayRuntime.snapshotTask(id);
          sessionResult =
            (full && full.result) ||
            {
              exitCode: full?.status === "completed" ? 0 : 1,
              classification: full?.classification,
              taskBranch: full?.taskBranch,
              commitSha: full?.commitSha,
            };
        } finally {
          activeGatewayTaskId = null;
          off();
        }
      }
    });

    if (sessionResult && typeof sessionResult === "object") {
      sessionStats.taskCount += 1;
      if (typeof sessionResult.taskBranch === "string" && sessionResult.taskBranch) {
        sessionStats.lastVerifiedBranch = sessionResult.taskBranch;
      }
      lastExitCode =
        typeof sessionResult.exitCode === "number" ? sessionResult.exitCode : 0;
    }
    return { ok: true, sessionResult };
  }

  /**
   * Reconstruct Gateway ownership from durable checkpoint after interruption (S4).
   * Distinct from /attach (live Gateway map only).
   * @param {string} [taskId]
   */
  async function followResumedGatewayTask(taskId) {
    const id = String(taskId || "").trim();
    if (!useGateway || (!gatewayClient && !gatewayRuntime)) {
      return {
        ok: false,
        message:
          "No PATH Gateway is available in this session. Resume requires a Gateway after restart.",
      };
    }
    if (activeGatewayTaskId) {
      return {
        ok: false,
        message: `Already attached to task ${activeGatewayTaskId}. /stop it first, or wait for completion.`,
      };
    }

    let sessionResult = null;
    let continuityNote = "";
    await runCycle(async (signal) => {
      if (gatewayClient) {
        const off = gatewayClient.onEvent((envelope) => {
          const ev = envelope?.event;
          if (!ev || typeof ev.type !== "string") return;
          const { type, ...fields } = ev;
          eventSink.emit(type, fields);
        });
        try {
          const resumed = await gatewayClient.resumeTask(id || undefined);
          if (!resumed?.ok && !resumed?.taskId) {
            throw new Error(resumed?.message || "resume failed");
          }
          if (resumed.mode === "reconnect") {
            continuityNote =
              resumed.note ||
              "Gateway still owns this task — reconnecting (same as /attach).";
            const followed = await followAttachedGatewayTask(resumed.taskId);
            sessionResult = followed.sessionResult || null;
            return;
          }
          continuityNote = [
            resumed.assessment?.brief || "",
            resumed.note || "",
            `Recovery mode: ${resumed.mode || "resume"} · disposition: ${resumed.disposition || "unknown"}`,
          ]
            .filter(Boolean)
            .join("\n");
          const resumeId = resumed.taskId || id;
          activeGatewayTaskId = resumeId;
          for (;;) {
            if (signal?.aborted) break;
            await new Promise((r) => setTimeout(r, 750));
            const full = await gatewayClient.snapshotTask(resumeId);
            if (!full || full.status !== "running") {
              sessionResult =
                (full && full.result) ||
                {
                  exitCode: full?.status === "completed" ? 0 : 1,
                  classification: full?.classification,
                  taskBranch: full?.taskBranch,
                  commitSha: full?.commitSha,
                };
              break;
            }
          }
        } finally {
          activeGatewayTaskId = null;
          off();
        }
      } else if (gatewayRuntime) {
        const off = gatewayRuntime.onEvent((envelope) => {
          const ev = envelope?.event;
          if (!ev || typeof ev.type !== "string") return;
          const { type, ...fields } = ev;
          eventSink.emit(type, fields);
        });
        try {
          const resumed = await gatewayRuntime.resumeTask({
            ...(id ? { taskId: id } : {}),
          });
          if (!resumed?.ok) {
            throw new Error(resumed?.message || "resume failed");
          }
          continuityNote = [
            resumed.assessment?.brief || "",
            resumed.note || "",
            `Recovery mode: ${resumed.mode || "resume"} · disposition: ${resumed.disposition || "unknown"}`,
          ]
            .filter(Boolean)
            .join("\n");
          if (resumed.mode === "reconnect") {
            activeGatewayTaskId = resumed.taskId;
            await gatewayRuntime.awaitTask(resumed.taskId);
            const full = gatewayRuntime.snapshotTask(resumed.taskId);
            sessionResult = (full && full.result) || null;
            return;
          }
          activeGatewayTaskId = resumed.taskId;
          await gatewayRuntime.awaitTask(resumed.taskId);
          const full = gatewayRuntime.snapshotTask(resumed.taskId);
          sessionResult =
            (full && full.result) ||
            {
              exitCode: full?.status === "completed" ? 0 : 1,
              classification: full?.classification,
            };
        } finally {
          activeGatewayTaskId = null;
          off();
        }
      }
    });

    if (continuityNote) {
      showOperatorReply(prompt, ttyInline ? inlineStudio : null, continuityNote);
    }
    if (sessionResult && typeof sessionResult === "object") {
      sessionStats.taskCount += 1;
      lastExitCode =
        typeof sessionResult.exitCode === "number" ? sessionResult.exitCode : 0;
    }
    return { ok: true, sessionResult };
  }

  /**
   * Run one local AG1 (or cloud) engineering cycle; optionally AG4 delivery.
   * @param {string} taskText
   * @param {{
   *   issueNumber?: number | null,
   *   issueTitle?: string | null,
   * }} [issueMeta]
   */
  async function runEngineeringTask(taskText, issueMeta = {}) {
    const cycleNote = await runCycle(async (signal) => {
      try {
        let sessionResult;
        if (args.execution === "cloud") {
          const { runGeneralEngineeringSession } = await import(
            "./pathcode-cli/general-session.mjs"
          );
          const runner = testIo.runGeneralSession ?? runGeneralEngineeringSession;
          sessionResult = await runner(prompt, {
            streams,
            taskText,
            projectRoot,
            modelId,
            autonomyMode,
            unicode,
            checkoutRoot: root,
            executionMode: "cloud",
            skipLiveGcp: !(process.env.GC1_LIVE_SMOKE === "1"),
            credential: sessionCredential,
            onCredentialAcquired: (credential) => {
              if (typeof credential === "string" && credential.length > 0) {
                sessionCredential = credential;
              }
            },
            sessionEventEmit: eventSink.emit,
            cardsOwnProgress: ttyInline,
            signal,
          });
        } else if (useGateway && gatewayClient) {
          const off = gatewayClient.onEvent((envelope) => {
            const ev = envelope?.event;
            if (!ev || typeof ev.type !== "string") return;
            const { type, ...fields } = ev;
            eventSink.emit(type, fields);
          });
          try {
            const started = await gatewayClient.startTask(taskText, {
              sessionId,
              sessionBaseCommit: sessionStats.sessionBaseCommit,
            });
            if (!started?.taskId) {
              throw new Error(started?.message || "gateway task start failed");
            }
            activeGatewayTaskId = started.taskId;
            for (;;) {
              if (signal?.aborted) break;
              await new Promise((r) => setTimeout(r, 750));
              const full = await gatewayClient.snapshotTask(started.taskId);
              if (!full || full.status !== "running") {
                sessionResult =
                  (full && full.result) ||
                  {
                    exitCode: full?.status === "completed" ? 0 : 1,
                    classification: full?.classification,
                    taskBranch: full?.taskBranch,
                    commitSha: full?.commitSha,
                  };
                break;
              }
            }
          } finally {
            activeGatewayTaskId = null;
            off();
          }
        } else if (useGateway && gatewayRuntime) {
          const off = gatewayRuntime.onEvent((envelope) => {
            const ev = envelope?.event;
            if (!ev || typeof ev.type !== "string") return;
            const { type, ...fields } = ev;
            eventSink.emit(type, fields);
          });
          try {
            const started = await gatewayRuntime.startTask({
              objective: taskText,
              sessionId,
              sessionBaseCommit: sessionStats.sessionBaseCommit,
            });
            if (!started.ok) {
              throw new Error(started.message || "gateway task start failed");
            }
            activeGatewayTaskId = started.taskId;
            await gatewayRuntime.awaitTask(started.taskId);
            const full = gatewayRuntime.snapshotTask(started.taskId);
            sessionResult =
              (full && full.result) ||
              {
                exitCode: full?.status === "completed" ? 0 : 1,
                classification: full?.classification,
                taskBranch: full?.taskBranch,
                commitSha: full?.commitSha,
              };
          } finally {
            activeGatewayTaskId = null;
            off();
          }
        } else {
          const { runAntigravityEngineeringSession } = await import(
            "./pathcode-cli/ag1/session.mjs"
          );
          const runner =
            testIo.runAg1Session ?? runAntigravityEngineeringSession;
          sessionResult = await runner(prompt, {
            streams,
            taskText,
            projectRoot,
            workingSubdir,
            unicode,
            checkoutRoot: root,
            sessionEventEmit: eventSink.emit,
            cardsOwnProgress: ttyInline,
            sessionBaseCommit: sessionStats.sessionBaseCommit,
            signal,
          });
        }
        lastExitCode = sessionResult.exitCode ?? 1;
        sessionStats.taskCount += 1;
        if (typeof sessionResult.engineActivityCount === "number") {
          sessionStats.engineActivityCount += sessionResult.engineActivityCount;
        }
        if (
          sessionResult.advancesSession === true &&
          typeof sessionResult.sessionBaseCommit === "string" &&
          sessionResult.sessionBaseCommit
        ) {
          sessionStats.sessionBaseCommit = sessionResult.sessionBaseCommit;
          if (typeof sessionResult.taskBranch === "string") {
            sessionStats.lastVerifiedBranch = sessionResult.taskBranch;
          }
        }
        if (
          args.execution === "cloud" &&
          typeof sessionResult.modelCalls === "number"
        ) {
          sessionStats.modelCallCount += sessionResult.modelCalls;
        }

        // AG4 delivery runs in a fresh TUI cycle after engineering teardown
        // (below). Keep the engineering result clean here.
        return sessionResult;
      } catch (err) {
        const message = err && err.message ? err.message : "unknown";
        eventSink.emit("session.internal_error", { message });
        lastExitCode = 1;
        sessionStats.taskCount += 1;
        return { __internalErrorMessage: message };
      }
    });

    // After engineering alternate-screen exit: optional GitHub publication cycle.
    if (
      cycleNote &&
      typeof cycleNote === "object" &&
      !cycleNote.__internalErrorMessage &&
      issueMeta.issueNumber != null &&
      cycleNote.classification === "VERIFIED" &&
      cycleNote.advancesSession === true
    ) {
      const { runGithubDeliveryAfterVerified, formatDeliverySummary } =
        await import("./pathcode-cli/ag4/delivery.mjs");
      const deliveryRunner =
        testIo.runGithubDelivery ?? runGithubDeliveryAfterVerified;
      const delivery = await runCycle(async (signal) => {
        // Rehydrate living surface with the already-earned VERIFIED result.
        eventSink.emit("session.engineering.result", {
          classification: cycleNote.classification,
          changedFiles: cycleNote.changedFiles || [],
          primaryUntouched: cycleNote.primaryUntouched === true,
          taskBranch: cycleNote.taskBranch,
          commitSha: cycleNote.commitSha,
          advancesSession: true,
          checks: Array.isArray(cycleNote.validation?.checks)
            ? cycleNote.validation.checks
            : [],
        });
        eventSink.emit("session.terminal", {
          disposition: "VERIFIED",
          summary: "All configured final checks passed.",
          taskBranch: cycleNote.taskBranch,
          commitSha: cycleNote.commitSha,
        });
        return deliveryRunner({
          projectRoot,
          prompt,
          emit: eventSink.emit,
          sessionResult: cycleNote,
          issueNumber: issueMeta.issueNumber,
          issueTitle: issueMeta.issueTitle ?? null,
          cardsOwnProgress: ttyInline,
          signal,
        });
      });
      cycleNote.delivery = delivery;
      const extra = formatDeliverySummary(delivery);
      if (extra.length && typeof cycleNote.durableSummary === "string") {
        cycleNote.durableSummary =
          cycleNote.durableSummary.replace(/\s*$/, "") +
          "\n" +
          extra.join("\n") +
          "\n";
      }
    }

    if (
      cycleNote &&
      typeof cycleNote === "object" &&
      typeof cycleNote.__internalErrorMessage === "string"
    ) {
      prompt.write(
        `Internal error (session continues): ${cycleNote.__internalErrorMessage}\n`,
      );
    } else if (
      cycleNote &&
      typeof cycleNote === "object" &&
      typeof cycleNote.durableSummary === "string" &&
      cycleNote.durableSummary.trim()
    ) {
      // Living cockpit: prefer the rematerialized studio report (stream-rich).
      // Still print a plain copy into the normal buffer when leaving alt-screen,
      // and after each task when not in ttyInline mode.
      let plainReport = cycleNote.durableSummary;
      if (ttyInline && typeof inlineStudio.getState === "function") {
        const product = inlineStudio.getState()?.product || {};
        if (
          typeof product.engineeringReportPlain === "string" &&
          product.engineeringReportPlain.trim()
        ) {
          plainReport = product.engineeringReportPlain;
          cycleNote.durableSummary = plainReport;
          if (typeof product.engineeringReportPath === "string") {
            cycleNote.engineeringReportPath = product.engineeringReportPath;
          }
        }
      }
      if (!ttyInline) {
        prompt.write(`\n${plainReport}`);
      }
    }
    return cycleNote;
  }

  try {
    // AG4 — optional issue entry: pathcode --issue N
    /** @type {{ number: number, title: string, taskText: string, contextBytes: number } | null} */
    let issueSeed = null;
    if (typeof args.issue === "number" && args.issue > 0) {
      const { assertGithubCliReady, resolveGithubRemoteTarget } = await import(
        "./pathcode-cli/ag4/remote.mjs"
      );
      const { fetchGithubIssue, issueToTaskText } = await import(
        "./pathcode-cli/ag4/issue.mjs"
      );
      const ready = assertGithubCliReady(projectRoot);
      if (!ready.ok) {
        prompt.write(`${ready.message}\n`);
        return 2;
      }
      const target = resolveGithubRemoteTarget(projectRoot);
      if (!target.ok) {
        prompt.write(`${target.message}\n`);
        return 2;
      }
      const issue = fetchGithubIssue({
        nameWithOwner: target.nameWithOwner,
        issueNumber: args.issue,
        cwd: projectRoot,
      });
      if (!issue.ok) {
        prompt.write(`${issue.message}\n`);
        return 2;
      }
      issueSeed = {
        number: issue.number,
        title: issue.title,
        taskText: issueToTaskText(issue),
        contextBytes: issue.bounded.bytes,
      };
      prompt.write(
        `Issue #${issue.number} — ${issue.title}\n` +
          `Context ${issue.bounded.bytes} bytes` +
          `${issue.bounded.truncated ? " (truncated)" : ""}\n` +
          `Remote ${target.remoteName} → ${target.nameWithOwner}\n\n`,
      );
    }

    if (issueSeed) {
      if (args.execution === "cloud") {
        const prereq = resolveRuntimePrerequisites(root);
        if (!prereq.ok) {
          prompt.write(`${prereq.message}\n`);
          return 2;
        }
      }
      await runEngineeringTask(issueSeed.taskText, {
        issueNumber: issueSeed.number,
        issueTitle: issueSeed.title,
      });
      redrawPrompt(prompt, unicode, plain, sessionStats, ttyInline ? inlineStudio : null);
      issueSeed = null;
    } else if (ttyInline) {
      // Enter the session-long cockpit immediately; prompt lives inside PATH.
      inlineStudio.begin();
      inlineStudio.onEvent({
        type: "session.started",
        sessionId,
      });
      inlineStudio.onEvent({
        type: "session.preflight",
        sessionId,
        branch: gitSummary.unversioned
          ? "unversioned"
          : gitSummary.branch || "unknown",
        dirtySummary: gitSummary.unversioned
          ? "unversioned"
          : gitSummary.clean === true
            ? "clean"
            : gitSummary.clean === false
              ? "dirty"
              : "unknown",
        projectName,
        unversioned: gitSummary.unversioned === true,
      });
      redrawPrompt(prompt, unicode, plain, sessionStats, inlineStudio);
      if (aliveGatewayNotice.length > 0) {
        const lines = [
          "Gateway-owned task(s) still running for this project:",
          "",
          ...aliveGatewayNotice.map((t) => {
            const obj = t.objective ? ` — ${t.objective}` : "";
            return `  ${t.taskId}${obj}`;
          }),
          "",
          "Rejoin with: /attach <taskId>",
          "(Disconnect did not cancel them.)",
        ];
        showOperatorReply(prompt, inlineStudio, lines.join("\n"));
        aliveGatewayNotice = [];
        redrawPrompt(prompt, unicode, plain, sessionStats, inlineStudio);
      } else if (durableRecoverNotice.length > 0) {
        const primary = durableRecoverNotice[0];
        const card = formatReopenNotice(primary);
        const extra =
          durableRecoverNotice.length > 1
            ? `\n\nAlso recoverable (${durableRecoverNotice.length - 1} more):\n${durableRecoverNotice
                .slice(1)
                .map((a) => `  /resume ${a.taskId}`)
                .join("\n")}`
            : "";
        showOperatorReply(prompt, inlineStudio, `${card}${extra}`);
        // Keep durableRecoverNotice for bare /resume default; clear card-only noise later.
        redrawPrompt(prompt, unicode, plain, sessionStats, inlineStudio);
      }
    }

    while (!prompt.isStopped()) {
      const line = await prompt.askLine("repl", "");
      if (line == null) {
        if (ttyInline) inlineStudio.finish();
        prompt.write("\n");
        return 130;
      }
      const cmd = line.trim();
      if (cmd === "") {
        if (
          ttyInline &&
          typeof inlineStudio.setOperatorPanel === "function"
        ) {
          inlineStudio.setOperatorPanel(null);
        }
        redrawPrompt(prompt, unicode, plain, sessionStats, ttyInline ? inlineStudio : null);
        continue;
      }
      if (cmd === "/exit" || cmd === "/quit") {
        let lastReport = "";
        if (ttyInline && typeof inlineStudio.getState === "function") {
          const product = inlineStudio.getState()?.product || {};
          if (
            typeof product.engineeringReportPlain === "string" &&
            product.engineeringReportPlain.trim()
          ) {
            lastReport = product.engineeringReportPlain.trim();
          }
        }
        if (ttyInline) inlineStudio.finish();
        if (lastReport) {
          prompt.write(`\n${lastReport}\n`);
        }
        prompt.write("Goodbye.\n");
        return 0;
      }
      if (cmd === "/stop" || isTaskStopCommand(cmd)) {
        if (activeGatewayTaskId) {
          if (gatewayClient) await gatewayClient.cancelTask(activeGatewayTaskId);
          else if (gatewayRuntime) gatewayRuntime.cancelTask(activeGatewayTaskId);
          prompt.write("Stop requested for the active task.\n");
        } else {
          prompt.write("No active engineering task to stop.\n");
        }
        redrawPrompt(prompt, unicode, plain, sessionStats, ttyInline ? inlineStudio : null);
        continue;
      }
      if (cmd === "/attach" || cmd.startsWith("/attach ")) {
        const parts = cmd.split(/\s+/);
        let idArg = parts[1] || "";
        if (!idArg && aliveGatewayNotice.length === 1) {
          idArg = aliveGatewayNotice[0].taskId;
        }
        if (!idArg && gatewayClient) {
          try {
            const listed = await gatewayClient.listTasks();
            const running = (listed?.tasks || []).filter(
              (t) => t && t.status === "running" && typeof t.taskId === "string",
            );
            if (running.length === 1) idArg = running[0].taskId;
            else if (running.length > 1) {
              showOperatorReply(
                prompt,
                ttyInline ? inlineStudio : null,
                [
                  "Multiple Gateway tasks are still running:",
                  "",
                  ...running.map((t) => `  ${t.taskId}`),
                  "",
                  "Usage: /attach <taskId>",
                ].join("\n"),
              );
              redrawPrompt(prompt, unicode, plain, sessionStats, ttyInline ? inlineStudio : null);
              continue;
            }
          } catch {
            // fall through to usage
          }
        }
        if (!idArg) {
          showOperatorReply(
            prompt,
            ttyInline ? inlineStudio : null,
            "Usage: /attach <taskId>\n\nRejoins a Gateway-owned task that is still running (external Gateway).",
          );
          redrawPrompt(prompt, unicode, plain, sessionStats, ttyInline ? inlineStudio : null);
          continue;
        }
        showOperatorReply(
          prompt,
          ttyInline ? inlineStudio : null,
          `Attaching to Gateway task ${idArg}…`,
        );
        const followed = await followAttachedGatewayTask(idArg);
        if (!followed.ok) {
          showOperatorReply(
            prompt,
            ttyInline ? inlineStudio : null,
            followed.message || "Attach failed.",
          );
        }
        redrawPrompt(prompt, unicode, plain, sessionStats, ttyInline ? inlineStudio : null);
        continue;
      }
      if (cmd === "/resume" || cmd.startsWith("/resume ")) {
        const parts = cmd.split(/\s+/);
        let idArg = parts[1] || "";
        if (!idArg && durableRecoverNotice.length === 1) {
          idArg = durableRecoverNotice[0].taskId;
        }
        if (!idArg && durableRecoverNotice.length > 1) {
          showOperatorReply(
            prompt,
            ttyInline ? inlineStudio : null,
            [
              "Multiple recoverable PATH tasks:",
              "",
              ...durableRecoverNotice.map(
                (a) => `  ${a.taskId} — ${a.disposition}`,
              ),
              "",
              "Usage: /resume <taskId>",
            ].join("\n"),
          );
          redrawPrompt(prompt, unicode, plain, sessionStats, ttyInline ? inlineStudio : null);
          continue;
        }
        showOperatorReply(
          prompt,
          ttyInline ? inlineStudio : null,
          idArg
            ? `Resuming PATH task ${idArg} from durable state…`
            : "Resuming latest interrupted PATH task from durable state…",
        );
        const followed = await followResumedGatewayTask(idArg);
        if (!followed.ok) {
          showOperatorReply(
            prompt,
            ttyInline ? inlineStudio : null,
            followed.message || "Resume failed.",
          );
        } else {
          durableRecoverNotice = durableRecoverNotice.filter(
            (a) => a.taskId !== (idArg || followed.sessionResult?.taskId),
          );
        }
        redrawPrompt(prompt, unicode, plain, sessionStats, ttyInline ? inlineStudio : null);
        continue;
      }
      if (cmd === "/log" || cmd === "/task") {
        const id = activeGatewayTaskId;
        if (!id) {
          prompt.write("No active task. Start an engineering task first.\n");
        } else {
          try {
            const { readTaskTrace } = await import("./pathcode-cli/task-trace.mjs");
            const pack = readTaskTrace(id);
            prompt.write(`Task trace: ${pack.path}\n`);
            for (const row of pack.lines.slice(-20)) {
              prompt.write(
                `  ${row.t || ""} ${row.type || ""} ${row.detail || row.command || ""}\n`,
              );
            }
          } catch (err) {
            prompt.write(
              `Trace unavailable: ${err instanceof Error ? err.message : String(err)}\n`,
            );
          }
        }
        redrawPrompt(prompt, unicode, plain, sessionStats, ttyInline ? inlineStudio : null);
        continue;
      }
      if (cmd === "/history" || cmd.startsWith("/history ")) {
        try {
          const {
            listTaskHistory,
            formatTaskHistoryListing,
          } = await import("./pathcode-cli/task-history.mjs");
          const parts = cmd.split(/\s+/);
          const nRaw = parts[1];
          const n =
            nRaw && /^\d+$/.test(nRaw) ? Math.min(40, Number(nRaw)) : 12;
          const rows = listTaskHistory(runtimeRoot, { limit: n });
          showOperatorReply(
            prompt,
            ttyInline ? inlineStudio : null,
            formatTaskHistoryListing(rows),
          );
        } catch (err) {
          showOperatorReply(
            prompt,
            ttyInline ? inlineStudio : null,
            `History unavailable: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        redrawPrompt(prompt, unicode, plain, sessionStats, ttyInline ? inlineStudio : null);
        continue;
      }
      if (cmd === "/report" || cmd.startsWith("/report ")) {
        const reportArg = cmd === "/report" ? "" : cmd.slice("/report".length).trim();
        if (reportArg && !reportArg.startsWith("/")) {
          try {
            const {
              getTaskHistoryEntry,
              formatMissingTaskHelp,
              formatReportPanel,
              isPlaceholderTaskId,
            } = await import("./pathcode-cli/task-history.mjs");
            if (isPlaceholderTaskId(reportArg)) {
              showOperatorReply(
                prompt,
                ttyInline ? inlineStudio : null,
                formatMissingTaskHelp(reportArg, runtimeRoot),
              );
              redrawPrompt(prompt, unicode, plain, sessionStats, ttyInline ? inlineStudio : null);
              continue;
            }
            const entry = getTaskHistoryEntry(runtimeRoot, reportArg);
            if (!entry || !entry.hasReport || !entry.reportText) {
              showOperatorReply(
                prompt,
                ttyInline ? inlineStudio : null,
                formatMissingTaskHelp(reportArg, runtimeRoot),
              );
            } else {
              const report = entry.reportText;
              const outPath = entry.reportPath;
              const { spawnSync } = await import("node:child_process");
              let copied = false;
              let copyError = "";
              if (process.platform === "darwin") {
                const r = spawnSync("pbcopy", [], {
                  input: report.endsWith("\n") ? report : `${report}\n`,
                  encoding: "utf8",
                });
                copied = r.status === 0;
                if (!copied) {
                  copyError =
                    (r.stderr && String(r.stderr).trim()) ||
                    `pbcopy exit ${r.status}`;
                }
              } else {
                copyError = "Clipboard copy is only automated on macOS (pbcopy).";
              }
              const studioState =
                typeof inlineStudio.getState === "function"
                  ? inlineStudio.getState()
                  : null;
              if (studioState?.product) {
                studioState.product.engineeringReportPlain = report;
                if (outPath) {
                  studioState.product.engineeringReportPath = outPath;
                }
              }
              showOperatorReply(
                prompt,
                ttyInline ? inlineStudio : null,
                formatReportPanel(entry, {
                  copied,
                  copyError: copied ? undefined : copyError || "not copied",
                }),
              );
              if (typeof inlineStudio.setReportActionNotice === "function") {
                inlineStudio.setReportActionNotice(
                  copied
                    ? `✓ Durable report opened for ${entry.taskId}\nSaved:\n  ${outPath}`
                    : `Durable report opened for ${entry.taskId}\nSaved:\n  ${outPath}`,
                );
              }
            }
          } catch (err) {
            showOperatorReply(
              prompt,
              ttyInline ? inlineStudio : null,
              `Report unavailable: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
          redrawPrompt(prompt, unicode, plain, sessionStats, ttyInline ? inlineStudio : null);
          continue;
        }
        try {
          const {
            materializeEngineeringReport,
            dispositionFromOutcome,
            formatEngineeringReportPlain,
            buildEngineeringReportModel,
          } = await import("./pathcode-cli/engineering-report.mjs");
          const studioState =
            typeof inlineStudio.getState === "function"
              ? inlineStudio.getState()
              : null;
          const product = studioState?.product || {};
          const disposition = dispositionFromOutcome(
            typeof product.resultClassification === "string"
              ? product.resultClassification
              : "",
            typeof product.pathPhase === "string" ? product.pathPhase : "",
            typeof product.terminalDisposition === "string"
              ? product.terminalDisposition
              : "",
          );
          // Always rematerialize so clipboard / durable / canvas stay identical.
          const pack = materializeEngineeringReport(product, {
            runtimeRoot,
            session: {
              classification: product.resultClassification || undefined,
              disposition,
              objective:
                typeof product.taskObjective === "string"
                  ? product.taskObjective
                  : typeof product.taskPreview === "string"
                    ? product.taskPreview
                    : undefined,
              advancesSession: product.advancesSession === true,
              engineeringHandoff: product.engineeringHandoff || undefined,
              terminalSummary: product.terminalSummary || undefined,
              durationMs:
                typeof product.durationMs === "number"
                  ? product.durationMs
                  : undefined,
              taskBranch: product.taskBranch || undefined,
              commitSha: product.resultSha || undefined,
              baselineSha: product.baselineSha || undefined,
              inspectCommand: product.inspectCommand || undefined,
              preservedPath: product.preservedArtifact || undefined,
              changedFiles: Array.isArray(product.projectFiles)
                ? product.projectFiles
                : undefined,
            },
          });
          let report = pack.plain || "";
          let outPath = pack.reportPath || product.engineeringReportPath || null;
          if (studioState?.product) {
            studioState.product.engineeringReportPlain = pack.plain;
            if (pack.reportPath) {
              studioState.product.engineeringReportPath = pack.reportPath;
            }
          }
          if (!report.trim()) {
            report = formatEngineeringReportPlain(
              buildEngineeringReportModel(product, { disposition }),
            );
          }
          if (!report.trim()) {
            showOperatorReply(
              prompt,
              ttyInline ? inlineStudio : null,
              [
                "No engineering report yet.",
                "",
                "Complete a task first, or reopen a past one:",
                "  /history",
                "  /report <taskId>",
              ].join("\n"),
            );
          } else {
            const { writeFileSync, mkdtempSync } = await import("node:fs");
            const { join } = await import("node:path");
            const { tmpdir } = await import("node:os");
            const { spawnSync } = await import("node:child_process");
            let copied = false;
            let copyError = "";
            if (process.platform === "darwin") {
              const r = spawnSync("pbcopy", [], {
                input: report.endsWith("\n") ? report : `${report}\n`,
                encoding: "utf8",
              });
              copied = r.status === 0;
              if (!copied) {
                copyError =
                  (r.stderr && String(r.stderr).trim()) ||
                  `pbcopy exit ${r.status}`;
              }
            } else {
              copyError = "Clipboard copy is only automated on macOS (pbcopy).";
            }
            if (!outPath) {
              const dir = mkdtempSync(join(tmpdir(), "pathcode-report-"));
              outPath = join(dir, "pathcode-engineering-report.txt");
              writeFileSync(
                outPath,
                report.endsWith("\n") ? report : `${report}\n`,
                "utf8",
              );
            }
            const notice = copied
              ? `✓ Engineering report copied to clipboard\nSaved:\n  ${outPath}`
              : `Clipboard copy failed${copyError ? ` (${copyError})` : ""}\nSaved:\n  ${outPath}`;
            if (studioState?.product) {
              studioState.product.reportActionNotice = notice;
            }
            if (typeof inlineStudio.setReportActionNotice === "function") {
              inlineStudio.setReportActionNotice(notice);
            }
            // Clear any prior command panel so the live completion report shows.
            if (typeof inlineStudio.setOperatorPanel === "function") {
              inlineStudio.setOperatorPanel(null);
            }
            if (!ttyInline) {
              prompt.write(`${notice}\n`);
              prompt.write(`${report}\n`);
            }
          }
        } catch (err) {
          showOperatorReply(
            prompt,
            ttyInline ? inlineStudio : null,
            `Report unavailable: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        redrawPrompt(prompt, unicode, plain, sessionStats, ttyInline ? inlineStudio : null);
        continue;
      }
      if (cmd === "/inspect" || cmd.startsWith("/inspect ")) {
        try {
          const {
            getTaskHistoryEntry,
            listTaskHistory,
            formatInspectPanel,
            formatMissingTaskHelp,
            isPlaceholderTaskId,
          } = await import("./pathcode-cli/task-history.mjs");
          const idArg =
            cmd === "/inspect" ? "" : cmd.slice("/inspect".length).trim();
          if (idArg && isPlaceholderTaskId(idArg)) {
            showOperatorReply(
              prompt,
              ttyInline ? inlineStudio : null,
              formatMissingTaskHelp(idArg, runtimeRoot),
            );
            redrawPrompt(prompt, unicode, plain, sessionStats, ttyInline ? inlineStudio : null);
            continue;
          }
          const taskId = idArg || activeGatewayTaskId || "";
          let entry = taskId
            ? getTaskHistoryEntry(runtimeRoot, taskId)
            : null;
          if (!entry && !idArg) {
            const rows = listTaskHistory(runtimeRoot, { limit: 1 });
            entry = rows[0] || null;
          }
          if (!entry && idArg) {
            showOperatorReply(
              prompt,
              ttyInline ? inlineStudio : null,
              formatMissingTaskHelp(idArg, runtimeRoot),
            );
          } else if (!entry) {
            showOperatorReply(
              prompt,
              ttyInline ? inlineStudio : null,
              [
                "No inspect target yet.",
                "",
                "Complete a verified task, or pass a real id:",
                "  /history",
                "  /inspect <taskId>",
              ].join("\n"),
            );
          } else {
            showOperatorReply(
              prompt,
              ttyInline ? inlineStudio : null,
              formatInspectPanel(entry),
            );
          }
        } catch (err) {
          showOperatorReply(
            prompt,
            ttyInline ? inlineStudio : null,
            `Inspect unavailable: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        redrawPrompt(prompt, unicode, plain, sessionStats, ttyInline ? inlineStudio : null);
        continue;
      }
      if (
        cmd === "/merge" ||
        cmd.startsWith("/merge ") ||
        cmd === "/adopt" ||
        cmd.startsWith("/adopt ")
      ) {
        try {
          const {
            getTaskHistoryEntry,
            listTaskHistory,
            taskHasAdoptableChanges,
            formatMissingTaskHelp,
            isPlaceholderTaskId,
          } = await import("./pathcode-cli/task-history.mjs");
          const { spawnSync } = await import("node:child_process");
          const isAdopt = cmd === "/adopt" || cmd.startsWith("/adopt ");
          const idArg = (
            isAdopt
              ? cmd === "/adopt"
                ? ""
                : cmd.slice("/adopt".length)
              : cmd === "/merge"
                ? ""
                : cmd.slice("/merge".length)
          ).trim();
          if (idArg && isPlaceholderTaskId(idArg)) {
            showOperatorReply(
              prompt,
              ttyInline ? inlineStudio : null,
              formatMissingTaskHelp(idArg, runtimeRoot),
            );
            redrawPrompt(prompt, unicode, plain, sessionStats, ttyInline ? inlineStudio : null);
            continue;
          }
          let entry = idArg ? getTaskHistoryEntry(runtimeRoot, idArg) : null;
          if (!entry && idArg) {
            showOperatorReply(
              prompt,
              ttyInline ? inlineStudio : null,
              formatMissingTaskHelp(idArg, runtimeRoot),
            );
            redrawPrompt(prompt, unicode, plain, sessionStats, ttyInline ? inlineStudio : null);
            continue;
          }
          if (!entry && !idArg) {
            const rows = listTaskHistory(runtimeRoot, { limit: 8 });
            entry =
              rows.find((r) => r && taskHasAdoptableChanges(r)) ||
              rows.find(
                (r) =>
                  r &&
                  (r.finalState === "VERIFIED" ||
                    r.finalState === "COMPLETE" ||
                    Boolean(r.branch)),
              ) ||
              rows[0] ||
              null;
          }
          const studioState =
            typeof inlineStudio.getState === "function"
              ? inlineStudio.getState()
              : null;
          const product = studioState?.product || {};
          const branch =
            entry?.branch ||
            (typeof product.taskBranch === "string" ? product.taskBranch : null) ||
            sessionStats.lastVerifiedBranch;
          if (!entry && !branch) {
            showOperatorReply(
              prompt,
              ttyInline ? inlineStudio : null,
              [
                "Nothing to merge.",
                "",
                "Complete a task that changes files, then:",
                "  /history",
                "  /inspect <taskId>",
                "  /merge <taskId>",
              ].join("\n"),
            );
            redrawPrompt(prompt, unicode, plain, sessionStats, ttyInline ? inlineStudio : null);
            continue;
          }
          if (entry && !taskHasAdoptableChanges(entry)) {
            showOperatorReply(
              prompt,
              ttyInline ? inlineStudio : null,
              [
                `Refused: task ${entry.taskId} has nothing meaningful to adopt.`,
                "",
                `  disposition   ${entry.finalState || "unknown"}`,
                `  branch        ${entry.branch || "(none)"}`,
                `  commit        ${entry.sha || "(none)"}`,
                `  changed       ${(entry.changedFiles && entry.changedFiles.length) || 0} file(s)`,
                "",
                "Read-only / no-change results do not alter the primary project.",
                `Review with: /inspect ${entry.taskId}`,
                `Report:       /report ${entry.taskId}`,
              ].join("\n"),
            );
            redrawPrompt(prompt, unicode, plain, sessionStats, ttyInline ? inlineStudio : null);
            continue;
          }
          if (!branch || !/^path\/task-/.test(branch)) {
            showOperatorReply(
              prompt,
              ttyInline ? inlineStudio : null,
              [
                "No adoptable path/task-* branch found.",
                "",
                "Pass a real task id after a verified task that changed files:",
                "  /history",
                "  /merge <taskId>",
              ].join("\n"),
            );
            redrawPrompt(prompt, unicode, plain, sessionStats, ttyInline ? inlineStudio : null);
            continue;
          }
          const dirty = spawnSync(
            "git",
            ["status", "--porcelain=v1", "-uall"],
            {
              cwd: projectRoot,
              encoding: "utf8",
              env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
            },
          );
          if (dirty.status === 0 && dirty.stdout && dirty.stdout.trim()) {
            showOperatorReply(
              prompt,
              ttyInline ? inlineStudio : null,
              [
                "Primary checkout is dirty.",
                "",
                "Commit or stash your work before merging a PATH task branch.",
                `Primary: ${projectRoot}`,
              ].join("\n"),
            );
            redrawPrompt(prompt, unicode, plain, sessionStats, ttyInline ? inlineStudio : null);
            continue;
          }
          const plan = [
            "Adopt task branch into primary (confirmation required)",
            "",
            entry ? `  taskId   ${entry.taskId}` : null,
            `  branch   ${branch}`,
            entry?.sha ? `  commit   ${entry.sha}` : null,
            `  command  git merge --no-edit ${branch}`,
            `  primary  ${projectRoot}`,
            "",
            "This will change the primary project checkout.",
          ]
            .filter(Boolean)
            .join("\n");
          showOperatorReply(prompt, ttyInline ? inlineStudio : null, plan);
          redrawPrompt(prompt, unicode, plain, sessionStats, ttyInline ? inlineStudio : null);
          const answer = await prompt.askLine(
            "merge-confirm",
            "Type y to run the merge now (N to cancel): ",
          );
          const ok =
            typeof answer === "string" &&
            /^(y|yes)$/i.test(answer.trim());
          if (!ok) {
            showOperatorReply(
              prompt,
              ttyInline ? inlineStudio : null,
              "Merge cancelled — primary project unchanged.",
            );
            redrawPrompt(prompt, unicode, plain, sessionStats, ttyInline ? inlineStudio : null);
            continue;
          }
          const merged = spawnSync("git", ["merge", "--no-edit", branch], {
            cwd: projectRoot,
            encoding: "utf8",
            env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
          });
          if (merged.status === 0) {
            if (entry?.taskId) {
              try {
                const { markTaskMerged } = await import(
                  "./pathcode-cli/result-lifecycle.mjs"
                );
                markTaskMerged({
                  runtimeRoot,
                  projectRoot,
                  entry,
                });
              } catch {
                // merge succeeded; lifecycle mark is best-effort
              }
            }
            showOperatorReply(
              prompt,
              ttyInline ? inlineStudio : null,
              [
                `Merged ${branch} into the primary checkout.`,
                "",
                `Primary: ${projectRoot}`,
                entry?.taskId
                  ? `Lifecycle: MERGED — /inspect ${entry.taskId}`
                  : null,
              ]
                .filter(Boolean)
                .join("\n"),
            );
          } else {
            showOperatorReply(
              prompt,
              ttyInline ? inlineStudio : null,
              `Merge failed:\n${(merged.stderr || merged.stdout || "git merge failed").trim()}`,
            );
          }
        } catch (err) {
          showOperatorReply(
            prompt,
            ttyInline ? inlineStudio : null,
            `Merge unavailable: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        redrawPrompt(prompt, unicode, plain, sessionStats, ttyInline ? inlineStudio : null);
        continue;
      }
      if (cmd === "/discard" || cmd.startsWith("/discard ")) {
        try {
          const {
            getTaskHistoryEntry,
            listTaskHistory,
            formatMissingTaskHelp,
            isPlaceholderTaskId,
            formatLifecycleLabel,
          } = await import("./pathcode-cli/task-history.mjs");
          const {
            discardTaskResult,
            formatDiscardResultPanel,
          } = await import("./pathcode-cli/result-lifecycle.mjs");
          const idArg =
            cmd === "/discard" ? "" : cmd.slice("/discard".length).trim();
          if (idArg && isPlaceholderTaskId(idArg)) {
            showOperatorReply(
              prompt,
              ttyInline ? inlineStudio : null,
              formatMissingTaskHelp(idArg, runtimeRoot),
            );
            redrawPrompt(prompt, unicode, plain, sessionStats, ttyInline ? inlineStudio : null);
            continue;
          }
          let entry = idArg ? getTaskHistoryEntry(runtimeRoot, idArg) : null;
          if (!entry && idArg) {
            showOperatorReply(
              prompt,
              ttyInline ? inlineStudio : null,
              formatMissingTaskHelp(idArg, runtimeRoot),
            );
            redrawPrompt(prompt, unicode, plain, sessionStats, ttyInline ? inlineStudio : null);
            continue;
          }
          if (!entry && !idArg) {
            const rows = listTaskHistory(runtimeRoot, { limit: 8 });
            entry =
              rows.find(
                (r) =>
                  r &&
                  r.lifecycleStatus !== "DISCARDED" &&
                  r.lifecycleStatus !== "MERGED",
              ) ||
              rows[0] ||
              null;
          }
          if (!entry) {
            showOperatorReply(
              prompt,
              ttyInline ? inlineStudio : null,
              [
                "Nothing to discard.",
                "",
                "Pass a real task id:",
                "  /history",
                "  /discard <taskId>",
              ].join("\n"),
            );
            redrawPrompt(prompt, unicode, plain, sessionStats, ttyInline ? inlineStudio : null);
            continue;
          }
          if (entry.lifecycleStatus === "DISCARDED") {
            showOperatorReply(
              prompt,
              ttyInline ? inlineStudio : null,
              formatDiscardResultPanel(
                { ok: true, already: true, primaryUntouched: true, steps: [] },
                entry,
              ),
            );
            redrawPrompt(prompt, unicode, plain, sessionStats, ttyInline ? inlineStudio : null);
            continue;
          }
          const plan = [
            "Discard task result (confirmation required)",
            "",
            `  taskId     ${entry.taskId}`,
            `  lifecycle  ${formatLifecycleLabel(entry)}`,
            `  branch     ${entry.branch || "(none)"}`,
            `  worktree   ${entry.worktreePath || "(none)"}`,
            "",
            "Will:",
            "  · remove the task worktree (if present)",
            "  · delete the local path/task-* branch (if present)",
            "  · mark the durable result DISCARDED",
            "",
            "Will NOT:",
            "  · change the primary project checkout",
            "  · delete history / report / trace",
          ].join("\n");
          showOperatorReply(prompt, ttyInline ? inlineStudio : null, plan);
          redrawPrompt(prompt, unicode, plain, sessionStats, ttyInline ? inlineStudio : null);
          const answer = await prompt.askLine(
            "discard-confirm",
            "Type y to discard now (N to cancel): ",
          );
          const ok =
            typeof answer === "string" &&
            /^(y|yes)$/i.test(answer.trim());
          if (!ok) {
            showOperatorReply(
              prompt,
              ttyInline ? inlineStudio : null,
              "Discard cancelled — primary and task result unchanged.",
            );
            redrawPrompt(prompt, unicode, plain, sessionStats, ttyInline ? inlineStudio : null);
            continue;
          }
          const result = discardTaskResult({
            runtimeRoot,
            projectRoot,
            entry,
          });
          showOperatorReply(
            prompt,
            ttyInline ? inlineStudio : null,
            formatDiscardResultPanel(result, entry),
          );
        } catch (err) {
          showOperatorReply(
            prompt,
            ttyInline ? inlineStudio : null,
            `Discard unavailable: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        redrawPrompt(prompt, unicode, plain, sessionStats, ttyInline ? inlineStudio : null);
        continue;
      }
      if (
        cmd === "/pr" ||
        cmd.startsWith("/pr ") ||
        cmd === "/publish" ||
        cmd.startsWith("/publish ")
      ) {
        try {
          const {
            getTaskHistoryEntry,
            listTaskHistory,
            taskHasAdoptableChanges,
            formatMissingTaskHelp,
            isPlaceholderTaskId,
            formatLifecycleLabel,
          } = await import("./pathcode-cli/task-history.mjs");
          const {
            previewTaskPullRequest,
            publishTaskPullRequest,
            formatPrPreviewPanel,
            formatPrResultPanel,
          } = await import("./pathcode-cli/result-lifecycle.mjs");
          const isPublish =
            cmd === "/publish" || cmd.startsWith("/publish ");
          const idArg = (
            isPublish
              ? cmd === "/publish"
                ? ""
                : cmd.slice("/publish".length)
              : cmd === "/pr"
                ? ""
                : cmd.slice("/pr".length)
          ).trim();
          if (idArg && isPlaceholderTaskId(idArg)) {
            showOperatorReply(
              prompt,
              ttyInline ? inlineStudio : null,
              formatMissingTaskHelp(idArg, runtimeRoot),
            );
            redrawPrompt(prompt, unicode, plain, sessionStats, ttyInline ? inlineStudio : null);
            continue;
          }
          let entry = idArg ? getTaskHistoryEntry(runtimeRoot, idArg) : null;
          if (!entry && idArg) {
            showOperatorReply(
              prompt,
              ttyInline ? inlineStudio : null,
              formatMissingTaskHelp(idArg, runtimeRoot),
            );
            redrawPrompt(prompt, unicode, plain, sessionStats, ttyInline ? inlineStudio : null);
            continue;
          }
          if (!entry && !idArg) {
            const rows = listTaskHistory(runtimeRoot, { limit: 8 });
            entry =
              rows.find((r) => r && taskHasAdoptableChanges(r)) || null;
          }
          if (!entry) {
            showOperatorReply(
              prompt,
              ttyInline ? inlineStudio : null,
              [
                "Nothing to publish as a pull request.",
                "",
                "Complete a verified task that changed files, then:",
                "  /history",
                "  /pr <taskId>",
              ].join("\n"),
            );
            redrawPrompt(prompt, unicode, plain, sessionStats, ttyInline ? inlineStudio : null);
            continue;
          }
          if (entry.lifecycleStatus === "DISCARDED") {
            showOperatorReply(
              prompt,
              ttyInline ? inlineStudio : null,
              [
                `Refused: task ${entry.taskId} was discarded.`,
                "",
                `  lifecycle  ${formatLifecycleLabel(entry)}`,
                "",
                "Discarded results are not published. Inspect history only.",
              ].join("\n"),
            );
            redrawPrompt(prompt, unicode, plain, sessionStats, ttyInline ? inlineStudio : null);
            continue;
          }
          if (!taskHasAdoptableChanges(entry)) {
            showOperatorReply(
              prompt,
              ttyInline ? inlineStudio : null,
              [
                `Refused: task ${entry.taskId} has nothing meaningful to publish.`,
                "",
                `  lifecycle  ${formatLifecycleLabel(entry)}`,
                `  changed    ${(entry.changedFiles && entry.changedFiles.length) || 0} file(s)`,
                "",
                "Read-only / no-change results do not create pull requests.",
                `Review with: /inspect ${entry.taskId}`,
              ].join("\n"),
            );
            redrawPrompt(prompt, unicode, plain, sessionStats, ttyInline ? inlineStudio : null);
            continue;
          }
          const preview = previewTaskPullRequest({
            projectRoot,
            entry,
          });
          if (!preview.ok) {
            showOperatorReply(
              prompt,
              ttyInline ? inlineStudio : null,
              [
                `Cannot prepare PR for task ${entry.taskId}`,
                "",
                `  code     ${preview.code || "FAILED"}`,
                preview.message
                  ? `  detail   ${String(preview.message).slice(0, 300)}`
                  : null,
              ]
                .filter(Boolean)
                .join("\n"),
            );
            redrawPrompt(prompt, unicode, plain, sessionStats, ttyInline ? inlineStudio : null);
            continue;
          }
          showOperatorReply(
            prompt,
            ttyInline ? inlineStudio : null,
            formatPrPreviewPanel(preview, entry),
          );
          redrawPrompt(prompt, unicode, plain, sessionStats, ttyInline ? inlineStudio : null);
          const answer = await prompt.askLine(
            "pr-confirm",
            "Type y to push branch and create/reuse PR (N to cancel): ",
          );
          const ok =
            typeof answer === "string" &&
            /^(y|yes)$/i.test(answer.trim());
          if (!ok) {
            showOperatorReply(
              prompt,
              ttyInline ? inlineStudio : null,
              "PR cancelled — no remote side effects.",
            );
            redrawPrompt(prompt, unicode, plain, sessionStats, ttyInline ? inlineStudio : null);
            continue;
          }
          const published = publishTaskPullRequest({
            runtimeRoot,
            projectRoot,
            entry,
          });
          showOperatorReply(
            prompt,
            ttyInline ? inlineStudio : null,
            formatPrResultPanel(published, entry),
          );
        } catch (err) {
          showOperatorReply(
            prompt,
            ttyInline ? inlineStudio : null,
            `PR unavailable: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        redrawPrompt(prompt, unicode, plain, sessionStats, ttyInline ? inlineStudio : null);
        continue;
      }
      if (cmd === "/help") {
        prompt.write(renderHelpText({ unicode, plain }));
        redrawPrompt(prompt, unicode, plain, sessionStats, ttyInline ? inlineStudio : null);
        continue;
      }

      // Session settings — affect SUBSEQUENT tasks; persist to preferences.json.
      if (cmd.startsWith("/model")) {
        const parts = cmd.split(/\s+/);
        const next = parts[1];
        if (parts.length !== 2 || !next || next.startsWith("-")) {
          showOperatorReply(
            prompt,
            ttyInline ? inlineStudio : null,
            "Usage: /model <id>\n\nExample: /model gpt-5",
          );
          redrawPrompt(prompt, unicode, plain, sessionStats, ttyInline ? inlineStudio : null);
          continue;
        }
        modelId = next.trim();
        const saved = writePreferences({ modelId, autonomy: autonomyMode });
        showOperatorReply(
          prompt,
          ttyInline ? inlineStudio : null,
          saved.ok
            ? [
                `Model set to ${modelId}`,
                "",
                "Applies to subsequent tasks.",
                `Persisted: ${saved.path || "preferences.json"}`,
                "",
                "Confirm with /prefs. Survives PATH restart.",
              ].join("\n")
            : [
                `Model set to ${modelId} for this session only.`,
                "",
                `Could not persist: ${saved.message || saved.code}`,
              ].join("\n"),
        );
        redrawPrompt(prompt, unicode, plain, sessionStats, ttyInline ? inlineStudio : null);
        continue;
      }
      if (cmd.startsWith("/autonomy")) {
        const parts = cmd.split(/\s+/);
        const next = parts[1];
        if (parts.length !== 2 || !next) {
          showOperatorReply(
            prompt,
            ttyInline ? inlineStudio : null,
            "Usage: /autonomy <review|bounded>",
          );
          redrawPrompt(prompt, unicode, plain, sessionStats, ttyInline ? inlineStudio : null);
          continue;
        }
        const parsedAutonomy = parseAutonomyMode(next);
        if (!parsedAutonomy.ok) {
          showOperatorReply(
            prompt,
            ttyInline ? inlineStudio : null,
            parsedAutonomy.message || "Invalid autonomy mode.",
          );
          redrawPrompt(prompt, unicode, plain, sessionStats, ttyInline ? inlineStudio : null);
          continue;
        }
        autonomyMode = parsedAutonomy.mode;
        const saved = writePreferences({ modelId, autonomy: autonomyMode });
        showOperatorReply(
          prompt,
          ttyInline ? inlineStudio : null,
          saved.ok
            ? [
                `Autonomy set to ${autonomyMode}`,
                "",
                "Applies to subsequent tasks.",
                `Persisted: ${saved.path || "preferences.json"}`,
                "",
                "Confirm with /prefs. Survives PATH restart.",
              ].join("\n")
            : [
                `Autonomy set to ${autonomyMode} for this session only.`,
                "",
                `Could not persist: ${saved.message || saved.code}`,
              ].join("\n"),
        );
        redrawPrompt(prompt, unicode, plain, sessionStats, ttyInline ? inlineStudio : null);
        continue;
      }
      if (cmd === "/prefs") {
        const {
          resolveEffectivePreferences,
          formatPreferencesPanel,
        } = await import("./pathcode-cli/preferences.mjs");
        const eff = resolveEffectivePreferences({
          modelFlag: args.model,
          autonomyFlag: args.autonomy,
          autonomyExplicit: args.autonomyExplicit === true,
          sessionModel: modelId,
          sessionAutonomy: autonomyMode,
        });
        showOperatorReply(
          prompt,
          ttyInline ? inlineStudio : null,
          formatPreferencesPanel(eff, { persisted: true }),
        );
        redrawPrompt(prompt, unicode, plain, sessionStats, ttyInline ? inlineStudio : null);
        continue;
      }

      if (cmd === "/trial") {
        const prereq = resolveRuntimePrerequisites(root);
        if (!prereq.ok) {
          prompt.write(`${prereq.message}\n`);
          redrawPrompt(prompt, unicode, plain, sessionStats, ttyInline ? inlineStudio : null);
          continue;
        }
        await runCycle(async () => {
          try {
            const { runMultiply01Trial } = await import("./pathcode-cli/trial.mjs");
            const runner = testIo.runTrial ?? runMultiply01Trial;
            const result = await runner(prompt, {
              streams,
              modelFlag: modelId,
              envModel: process.env.PATHCODE_OPENAI_MODEL ?? null,
              unicode,
              checkoutRoot: root,
            });
            lastExitCode = result.exitCode ?? 1;
          } catch (err) {
            const message = err && err.message ? err.message : "unknown";
            prompt.write(`Internal error (session continues): ${message}\n`);
            eventSink.emit("session.internal_error", { message });
            lastExitCode = 1;
          }
        });
        redrawPrompt(prompt, unicode, plain, sessionStats, ttyInline ? inlineStudio : null);
        continue;
      }

      if (cmd.startsWith("/recover")) {
        const { parseRecoverCommand, runRecoverCommand } = await import(
          "./pathcode-cli/recover.mjs"
        );
        const parsedCommand = parseRecoverCommand(cmd);
        if (!parsedCommand.ok) {
          prompt.write(`${parsedCommand.message ?? "Usage: /recover <checkpoint-id>"}\n`);
          redrawPrompt(prompt, unicode, plain, sessionStats, ttyInline ? inlineStudio : null);
          continue;
        }
        const prereq = resolveRuntimePrerequisites(root);
        if (!prereq.ok) {
          prompt.write(`${prereq.message}\n`);
          redrawPrompt(prompt, unicode, plain, sessionStats, ttyInline ? inlineStudio : null);
          continue;
        }
        await runCycle(async () => {
          try {
            const runner = testIo.runRecover ?? runRecoverCommand;
            const result = await runner(prompt, {
              checkpointId: parsedCommand.checkpointId,
              projectRoot: process.cwd(),
              checkoutRoot: root,
            });
            lastExitCode = result.exitCode ?? 1;
          } catch (err) {
            const message = err && err.message ? err.message : "unknown";
            prompt.write(`Internal error (session continues): ${message}\n`);
            eventSink.emit("session.internal_error", { message });
            lastExitCode = 1;
          }
        });
        redrawPrompt(prompt, unicode, plain, sessionStats, ttyInline ? inlineStudio : null);
        continue;
      }

      if (cmd.startsWith("/")) {
        prompt.write(`Unknown command: ${cmd}\n`);
        prompt.write(renderHelpText({ unicode, plain }));
        redrawPrompt(prompt, unicode, plain, sessionStats, ttyInline ? inlineStudio : null);
        continue;
      }

      // Any other line is an engineering task for the project in this directory.
      const packageCheck = assertPathPackagePresent(root);
      if (!packageCheck.ok) {
        prompt.write(`${packageCheck.message}\n`);
        redrawPrompt(prompt, unicode, plain, sessionStats, ttyInline ? inlineStudio : null);
        continue;
      }
      if (args.execution === "cloud") {
        const prereq = resolveRuntimePrerequisites(root);
        if (!prereq.ok) {
          prompt.write(`${prereq.message}\n`);
          redrawPrompt(prompt, unicode, plain, sessionStats, ttyInline ? inlineStudio : null);
          continue;
        }
      }
      await runEngineeringTask(normalizeObjectiveText(cmd));
      redrawPrompt(prompt, unicode, plain, sessionStats, ttyInline ? inlineStudio : null);
      void lastExitCode;
    }
    if (ttyInline) inlineStudio.finish();
    return 130;
  } finally {
    // Scrub session credential from the bag on leave.
    sessionCredential = null;
    uninstallCollisionGuard();
    setActiveTerminalCleanup(null);
    if (ttyInline) inlineStudio.finish();
    restoreTerminal({ stdout: streams.stdout, stdin: streams.stdin });
    if (eventsOut !== null) {
      eventsOut.close();
      eventsOut = null;
    }
    prompt.close();
  }
}

/**
 * True when this module is the process entry, including symlink and package/bin
 * launches. Naive argv[1] === import.meta.url fails when argv holds the symlink
 * path while import.meta.url is the real scripts/pathcode.mjs path.
 * @param {string | undefined} argv1
 */
export function isDirectEntry(argv1 = process.argv[1]) {
  if (!argv1) return false;
  const modulePath = fileURLToPath(import.meta.url);
  try {
    return realpathSync(argv1) === realpathSync(modulePath);
  } catch {
    return pathToFileURL(argv1).href === import.meta.url;
  }
}

if (isDirectEntry()) {
  runPathcodeMain(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err) => {
      process.stderr.write(
        `pathcode failed: ${err && err.message ? err.message : "unknown"}\n`,
      );
      process.exitCode = 1;
    });
}
