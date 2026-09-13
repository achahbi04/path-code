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
  const title = "PATH engineering session";
  const prompt = unicode ? "PATH ● Code >" : "PATH * Code >";
  const body = [
    wordmark,
    "",
    centerLine(title, opts.columns ?? 80),
    "",
    "  Describe an engineering task in your own words to start one here.",
    "  PATH creates an isolated task workspace and runs bounded engineering.",
    "  PATH independently validates the final result. The primary checkout stays untouched.",
    "  No project scan happens just by opening this screen.",
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
  return `${name}

Local autonomous engineering for a Git project. PATH works in an isolated
task workspace, independently validates the result, and leaves your primary
checkout untouched.

Usage:
  pathcode
  pathcode --issue <number>
  pathcode doctor
  pathcode --help
  pathcode --version

At the prompt:
  <task>         Describe an engineering change in plain language
  /help          Show commands
  /exit          Leave

Flags:
  --issue <n>    Load GitHub issue #n as task context; after VERIFIED,
                 offer one publication approval (push + pull request)
  --help, -h     Show this help
  --version      Show version
  doctor         Readiness check (install, platform, Node, Git, runtime,
                 engineering auth; GitHub is optional)

Notes:
  - Verified work lands on a path/task-* branch for you to merge when ready
  - GitHub CLI auth is required only for --issue publication
  - First run bootstraps a private engine runtime automatically
`;
}
