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
  renderWelcomeScreen,
  COMPACT_NAME,
  ASCII_NAME,
} from "./pathcode-cli/banner.mjs";
import {
  resolveCheckoutRoot,
  resolveRuntimePrerequisites,
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

const root = resolveCheckoutRoot();

/**
 * @param {readonly string[]} argv
 */
function parseArgs(argv) {
  /** @type {{
   *   help: boolean,
   *   version: boolean,
   *   model: string | null,
   *   autonomy: "review" | "bounded",
   *   events: null | "ndjson",
   *   eventsOut: string | null,
   *   execution: "local" | "cloud",
   *   rest: string[],
   * }} */
  const out = {
    help: false,
    version: false,
    model: null,
    autonomy: "review",
    events: null,
    eventsOut: null,
    execution: "local",
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
    process.stderr.write(`${prereq.message}\n`);
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
  if (sessionStats.taskCount > 0 || sessionStats.modelCallCount > 0) {
    prompt.write(
      `Session so far: ${sessionStats.taskCount} tasks, ${sessionStats.modelCallCount} model calls.\n`,
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

  if (args.rest.length > 0) {
    // Preserve foundation unknown-arg / legacy behavior.
    return await delegateLegacy(args.rest);
  }

  // Bare launch: welcome. No key, no network, no workspace scan.
  const streams = { stdin, stdout, stderr };
  const interactive = isInteractiveTty(streams);

  if (!interactive) {
    stdout.write(
      renderWelcomeScreen({ columns, unicode, plain: true }).replace(
        /\nPATH [●*] Code > $/,
        "\n",
      ),
    );
    stdout.write(
      "(Non-interactive stdout: showing welcome only. Use a TTY for /trial.)\n",
    );
    return 0;
  }

  stdout.write(
    renderWelcomeScreen({
      columns,
      unicode,
      plain,
    }),
  );

  /** Session-scoped settings — persist; authority does not. */
  let modelId = args.model ?? process.env.PATHCODE_OPENAI_MODEL ?? null;
  let autonomyMode = args.autonomy;
  /** @type {string | null} */
  let sessionCredential = null;
  const sessionStats = { taskCount: 0, modelCallCount: 0 };
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

  /** @param {() => Promise<void> | void} cycle */
  async function runCycle(cycle) {
    if (typeof prompt.beginCycle === "function") prompt.beginCycle();
    if (ttyInline) inlineStudio.begin();
    try {
      await cycle();
    } finally {
      if (ttyInline) inlineStudio.finish();
      if (typeof prompt.endCycle === "function") prompt.endCycle();
      if (typeof prompt.clearStop === "function") prompt.clearStop();
    }
  }

  try {
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
      const prereq = resolveRuntimePrerequisites(root);
      if (!prereq.ok) {
        prompt.write(`${prereq.message}\n`);
        redrawPrompt(prompt, unicode, plain, sessionStats);
        continue;
      }
      const { runGeneralEngineeringSession } = await import(
        "./pathcode-cli/general-session.mjs"
      );
      const runner = testIo.runGeneralSession ?? runGeneralEngineeringSession;
      await runCycle(async () => {
        try {
          const sessionResult = await runner(prompt, {
            streams,
            taskText: cmd,
            projectRoot: process.cwd(),
            modelId,
            autonomyMode,
            unicode,
            checkoutRoot: root,
            executionMode: args.execution,
            credential: sessionCredential,
            onCredentialAcquired: (credential) => {
              if (typeof credential === "string" && credential.length > 0) {
                sessionCredential = credential;
              }
            },
            sessionEventEmit: eventSink.emit,
            // Cards own mirrored progress on TTY; disclosures/prompts still write.
            cardsOwnProgress: ttyInline,
          });
          lastExitCode = sessionResult.exitCode ?? 1;
          sessionStats.taskCount += 1;
          const calls =
            typeof sessionResult.modelCalls === "number" ? sessionResult.modelCalls : 0;
          sessionStats.modelCallCount += calls;
        } catch (err) {
          const message = err && err.message ? err.message : "unknown";
          prompt.write(`Internal error (session continues): ${message}\n`);
          eventSink.emit("session.internal_error", { message });
          lastExitCode = 1;
          sessionStats.taskCount += 1;
        }
      });
      redrawPrompt(prompt, unicode, plain, sessionStats);
      void lastExitCode;
    }
    if (ttyInline) inlineStudio.finish();
    return 130;
  } finally {
    // Scrub session credential from the bag on leave.
    sessionCredential = null;
    uninstallCollisionGuard();
    if (ttyInline) inlineStudio.finish();
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
