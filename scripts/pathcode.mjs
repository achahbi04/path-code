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

const root = resolvePathPackageRoot();

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
  const branch = info.branch || "detached";
  const clean =
    info.clean === true ? "clean" : info.clean === false ? "dirty" : "unknown";
  return `${name}\n${info.projectName} · ${branch} · ${clean}\n\n${name} > `;
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
function redrawPrompt(prompt, unicode, plain, sessionStats) {
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

  /** @type {{ branch: string | null, clean: boolean | null }} */
  let gitSummary = { branch: null, clean: null };
  const admission = admitPrimaryCheckout(projectRoot);
  if (admission.ok) {
    gitSummary = { branch: admission.branch, clean: true };
  } else if (admission.code === "DIRTY_PRIMARY_TREE") {
    gitSummary = {
      branch: typeof admission.branch === "string" ? admission.branch : null,
      clean: false,
    };
  } else if (admission.code === "DETACHED_HEAD_BLOCKED") {
    gitSummary = { branch: null, clean: null };
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
      }).replace(/\nPATH [●*] Code > $/, "\n"),
    );
    stdout.write(
      "(Non-interactive: showing project identity only. Use a TTY for engineering.)\n",
    );
    return 0;
  }

  stdout.write(
    renderQuietStartup({
      unicode,
      plain,
      projectName,
      branch: gitSummary.branch,
      clean: gitSummary.clean,
    }),
  );

  /** Session-scoped settings — persist; authority does not. */
  let modelId = args.model ?? process.env.PATHCODE_OPENAI_MODEL ?? null;
  let autonomyMode = args.autonomy;
  /** @type {string | null} */
  let sessionCredential = null;
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
  });

  /** @type {AbortController | null} */
  let cycleAbort = null;

  installTerminalRestoreGuards({
    onSigint: () => {
      if (
        inlineStudio.isActive() ||
        (typeof prompt?.isCycleActive === "function" && prompt.isCycleActive())
      ) {
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

  const prompt = createPromptSession(streams);
  const uninstallCollisionGuard = ttyInline
    ? installCollisionGuard(prompt, inlineStudio)
    : () => {};

  /** @param {(signal: AbortSignal) => Promise<unknown> | unknown} cycle */
  async function runCycle(cycle) {
    cycleAbort = new AbortController();
    if (typeof prompt.beginCycle === "function") prompt.beginCycle();
    if (ttyInline) inlineStudio.begin();
    try {
      return await cycle(cycleAbort.signal);
    } finally {
      cycleAbort = null;
      if (ttyInline) inlineStudio.finish();
      if (typeof prompt.endCycle === "function") prompt.endCycle();
      if (typeof prompt.clearStop === "function") prompt.clearStop();
    }
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
      prompt.write(`\n${cycleNote.durableSummary}`);
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
      redrawPrompt(prompt, unicode, plain, sessionStats);
      issueSeed = null;
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
        prompt.write(promptPrefix(unicode, plain));
        continue;
      }
      if (cmd === "/exit" || cmd === "/quit") {
        if (ttyInline) inlineStudio.finish();
        prompt.write("Goodbye.\n");
        return 0;
      }
      if (cmd === "/help") {
        prompt.write(renderHelpText({ unicode, plain }));
        redrawPrompt(prompt, unicode, plain, sessionStats);
        continue;
      }

      // Session settings — affect SUBSEQUENT tasks only.
      if (cmd.startsWith("/model")) {
        const parts = cmd.split(/\s+/);
        const next = parts[1];
        if (parts.length !== 2 || !next || next.startsWith("-")) {
          prompt.write("Usage: /model <id>\n");
          redrawPrompt(prompt, unicode, plain, sessionStats);
          continue;
        }
        modelId = next.trim();
        prompt.write(`Model set to ${modelId} for subsequent tasks.\n`);
        redrawPrompt(prompt, unicode, plain, sessionStats);
        continue;
      }
      if (cmd.startsWith("/autonomy")) {
        const parts = cmd.split(/\s+/);
        const next = parts[1];
        if (parts.length !== 2 || !next) {
          prompt.write("Usage: /autonomy <review|bounded>\n");
          redrawPrompt(prompt, unicode, plain, sessionStats);
          continue;
        }
        const parsedAutonomy = parseAutonomyMode(next);
        if (!parsedAutonomy.ok) {
          prompt.write(`${parsedAutonomy.message}\n`);
          redrawPrompt(prompt, unicode, plain, sessionStats);
          continue;
        }
        autonomyMode = parsedAutonomy.mode;
        prompt.write(`Autonomy set to ${autonomyMode} for subsequent tasks.\n`);
        redrawPrompt(prompt, unicode, plain, sessionStats);
        continue;
      }

      if (cmd === "/trial") {
        const prereq = resolveRuntimePrerequisites(root);
        if (!prereq.ok) {
          prompt.write(`${prereq.message}\n`);
          redrawPrompt(prompt, unicode, plain, sessionStats);
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
        redrawPrompt(prompt, unicode, plain, sessionStats);
        continue;
      }

      if (cmd.startsWith("/recover")) {
        const { parseRecoverCommand, runRecoverCommand } = await import(
          "./pathcode-cli/recover.mjs"
        );
        const parsedCommand = parseRecoverCommand(cmd);
        if (!parsedCommand.ok) {
          prompt.write(`${parsedCommand.message ?? "Usage: /recover <checkpoint-id>"}\n`);
          redrawPrompt(prompt, unicode, plain, sessionStats);
          continue;
        }
        const prereq = resolveRuntimePrerequisites(root);
        if (!prereq.ok) {
          prompt.write(`${prereq.message}\n`);
          redrawPrompt(prompt, unicode, plain, sessionStats);
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
        redrawPrompt(prompt, unicode, plain, sessionStats);
        continue;
      }

      if (cmd.startsWith("/")) {
        prompt.write(`Unknown command: ${cmd}\n`);
        prompt.write(renderHelpText({ unicode, plain }));
        redrawPrompt(prompt, unicode, plain, sessionStats);
        continue;
      }

      // Any other line is an engineering task for the project in this directory.
      const packageCheck = assertPathPackagePresent(root);
      if (!packageCheck.ok) {
        prompt.write(`${packageCheck.message}\n`);
        redrawPrompt(prompt, unicode, plain, sessionStats);
        continue;
      }
      if (args.execution === "cloud") {
        const prereq = resolveRuntimePrerequisites(root);
        if (!prereq.ok) {
          prompt.write(`${prereq.message}\n`);
          redrawPrompt(prompt, unicode, plain, sessionStats);
          continue;
        }
      }
      await runEngineeringTask(cmd);
      redrawPrompt(prompt, unicode, plain, sessionStats);
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
