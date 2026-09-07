#!/usr/bin/env node
/**
 * PATH ● Code — terminal application entry (Phase 5F).
 * Resolves owners from this checkout via import.meta.url, not process.cwd.
 * Legacy foundation CLI behavior is delegated for unrecognized flags.
 */

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
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

const root = resolveCheckoutRoot();

/**
 * @param {readonly string[]} argv
 */
function parseArgs(argv) {
  /** @type {{ help: boolean, version: boolean, model: string | null, rest: string[] }} */
  const out = { help: false, version: false, model: null, rest: [] };
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
    if (a === "--yes" || a === "--auto-approve" || a.startsWith("--workspace") || a === "--key") {
      return {
        ok: false,
        message: `Refused flag ${a}: live trial requires interactive TTY approvals; no --yes/--auto-approve/--workspace/--key.`,
      };
    }
    out.rest.push(a);
  }
  return { ok: true, value: out };
}

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
 * @param {readonly string[]} argv
 * @param {{
 *   stdin?: any,
 *   stdout?: any,
 *   stderr?: any,
 *   runTrial?: Function,
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

  const prompt = createPromptSession(streams);
  try {
    while (!prompt.isStopped()) {
      const line = await prompt.askLine("repl", "");
      if (line == null) {
        prompt.write("\n");
        return 130;
      }
      const cmd = line.trim();
      if (cmd === "" ) {
        prompt.write(`${unicode ? COMPACT_NAME : ASCII_NAME} > `);
        continue;
      }
      if (cmd === "/exit" || cmd === "/quit") {
        prompt.write("Goodbye.\n");
        return 0;
      }
      if (cmd === "/help") {
        prompt.write(renderHelpText({ unicode, plain }));
        prompt.write(`${unicode ? COMPACT_NAME : ASCII_NAME} > `);
        continue;
      }
      if (cmd === "/trial") {
        const prereq = resolveRuntimePrerequisites(root);
        if (!prereq.ok) {
          prompt.write(`${prereq.message}\n`);
          prompt.write(`${unicode ? COMPACT_NAME : ASCII_NAME} > `);
          continue;
        }
        const { runMultiply01Trial } = await import("./pathcode-cli/trial.mjs");
        const runner = testIo.runTrial ?? runMultiply01Trial;
        const result = await runner(prompt, {
          streams,
          modelFlag: args.model,
          envModel: process.env.PATHCODE_OPENAI_MODEL ?? null,
          unicode,
          checkoutRoot: root,
        });
        prompt.close();
        return result.exitCode ?? 1;
      }
      prompt.write(`Unknown command: ${cmd}\n`);
      prompt.write(renderHelpText({ unicode, plain }));
      prompt.write(`${unicode ? COMPACT_NAME : ASCII_NAME} > `);
    }
    return 130;
  } finally {
    prompt.close();
  }
}

const isDirect =
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (isDirect) {
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
