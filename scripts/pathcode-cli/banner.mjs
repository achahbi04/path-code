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
    "",
    "  <task>              Describe what to change, in plain language",
    "  /history [n]        Past tasks for this install (durable)",
    "  /report · /inspect  Open a finished task result",
    "  /merge · /discard · /pr   Result lifecycle",
    "  /prefs · /model · /autonomy   Preferences",
    "  /attach [id]        Rejoin a Gateway-owned task still running",
    "  /resume [id]        Recover an interrupted task from durable state",
    "  /help               Full command list",
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
  /stop          Cancel the active engineering task (not steering)
  /history [n]   List durable tasks (id · project · outcome · when)
  /report        Copy/export the current engineering report
  /report <id>   Open the durable report for a real taskId
  /inspect [id]  Disposition · branch · commit · changes · adoptable?
  /merge [id]    Adopt only when files changed (confirm before merge)
  /discard [id]  Abandon a task result (primary untouched; history kept)
  /pr [id]       Push task branch + open/reuse a GitHub pull request
  /attach [id]   Rejoin a Gateway-owned task that is still running
  /resume [id]   Recover an interrupted task from durable checkpoint/worktree
  /log, /task    Show recent structured task trace lines
  /model <id>    Set model for subsequent tasks (persisted)
  /autonomy …    Set review|bounded for subsequent tasks (persisted)
  /prefs         Show durable model + autonomy and their sources
  /help          Show commands
  /exit          Leave

While a task is running:
  type naturally  steer the active session (not a command queue)
  ■ Stop / Ctrl-C / /stop   cancel immediately
  PageUp / wheel            scroll engineering history
  PageDown                  follow latest again
  /report                   copy the engineering report after completion

Flags:
  --issue <n>    Load GitHub issue #n as task context; after VERIFIED,
                 offer one publication approval (push + pull request)
  --help, -h     Show this help
  --version      Show version
  doctor         Readiness check (install, platform, Node, Git, runtime,
                 engineering auth; GitHub is optional)

Notes:
  - Verified work lands on a path/task-* branch for you to merge when ready
  - GitHub CLI auth is required only for --issue / /pr publication
  - First run bootstraps a private engine runtime automatically
  - Normal reopen keeps durable history, reports, and preferences
  - External Gateway (PATHCODE_GATEWAY_EXTERNAL=1): disconnect ≠ cancel;
    use /attach to rejoin a still-running task
  - After Gateway/process loss: use /resume to reconstruct from durable state
`;
}
