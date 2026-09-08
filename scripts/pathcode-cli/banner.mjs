/**
 * PATH ● Code wordmark — owned literal renderer. No figlet / font download.
 */

export const COMPACT_NAME = "PATH ● Code";
export const ASCII_NAME = "PATH * Code";

/** Owned wide banner reference (55 columns before margins). */
export const WIDE_BANNER_LINES = Object.freeze([
  "████   ███  █████ █   █          ████           █",
  "█   █ █   █   █   █   █    ▄    █               █",
  "████  █████   █   █████   ███   █      ███   ████  ███",
  "█     █   █   █   █   █    ▀    █     █   █ █   █ █████",
  "█     █   █   █   █   █          ████  ███   ████  ███",
]);

const WIDE_WIDTH = Math.max(...WIDE_BANNER_LINES.map((l) => [...l].length));

/**
 * @param {{ columns?: number, unicode?: boolean, plain?: boolean, color?: boolean }} [opts]
 * @returns {string}
 */
export function renderWordmark(opts = {}) {
  const columns =
    typeof opts.columns === "number" && opts.columns > 0
      ? Math.floor(opts.columns)
      : 80;
  const unicode = opts.unicode !== false;
  const plain = opts.plain === true;
  const margin = Math.max(0, Math.min(4, Math.floor((columns - WIDE_WIDTH) / 2)));

  // Wide banner only when there is comfortable margin (tested at 100).
  // At 60 and below use compact `PATH ● Code`.
  if (!unicode || plain || columns < 80 || columns < WIDE_WIDTH + 8) {
    const name = unicode && !plain ? COMPACT_NAME : ASCII_NAME;
    const pad = Math.max(0, Math.floor((columns - [...name].length) / 2));
    return `${" ".repeat(pad)}${name}`;
  }

  const indented = WIDE_BANNER_LINES.map((line) => `${" ".repeat(margin)}${line}`);
  return indented.join("\n");
}

/**
 * @param {{ columns?: number, unicode?: boolean, plain?: boolean }} [opts]
 */
export function renderWelcomeScreen(opts = {}) {
  const wordmark = renderWordmark(opts);
  const unicode = opts.unicode !== false && opts.plain !== true;
  const title = "General engineering session";
  const prompt = unicode ? "PATH ● Code >" : "PATH * Code >";
  const body = [
    wordmark,
    "",
    centerLine(title, opts.columns ?? 80),
    "",
    "  Describe an engineering task in your own words to start one here.",
    "  You review the files, the exact edit and the exact checks before anything runs.",
    "  A recovery checkpoint is written before any file changes.",
    "  No project scan or API call happens just by opening this screen.",
    "",
    "  <task>              Describe what to change, in plain language",
    "  /recover <id>       Restore a checkpoint from an earlier session",
    "  /trial              Run Trial 1 in a disposable project",
    "  /help               Show the commands and current scope",
    "  /exit               Leave",
    "",
    `${prompt} `,
  ];
  return body.join("\n");
}

/**
 * @param {string} text
 * @param {number} columns
 */
function centerLine(text, columns) {
  const pad = Math.max(0, Math.floor((columns - text.length) / 2));
  return `${" ".repeat(pad)}${text}`;
}

/**
 * @param {{ unicode?: boolean, plain?: boolean }} [opts]
 */
export function renderHelpText(opts = {}) {
  const name = opts.unicode !== false && opts.plain !== true ? COMPACT_NAME : ASCII_NAME;
  return `${name} — CLI scope

At the prompt:
  <task>              Any line that does not start with '/' is an engineering task
                      for the Git project in the current directory
  /recover <id>       Restore the files captured by an earlier checkpoint
  /trial              Run Trial 1 (multiply-01) in a new synthetic workspace
  /help               Show this help
  /exit               Leave

Flags:
  --help, -h     Show help and exit
  --version      Show package version and exit
  --model <id>   Select the OpenAI model (else PATHCODE_OPENAI_MODEL, else prompt)

Environment:
  PATHCODE_STATE_DIR   Where recovery checkpoints are stored. Must be outside the
                       project. Defaults to the platform state directory.

A general engineering session:
  - requires a Git working tree, on a branch, with no merge/rebase in progress
  - asks the model which files the task touches, then asks you to approve that list
  - shows you the exact bytes of the edit before writing anything
  - writes a recovery checkpoint before the first byte changes
  - runs only checks discovered from your project metadata, after a separate approval
  - never commits, stashes, resets, cleans or checks out anything in Git
  - uses at most 3 model calls and never retries automatically

Opening this screen does not read a key, scan a project, or call a provider.
`;
}
