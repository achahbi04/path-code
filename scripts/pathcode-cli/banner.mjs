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
  return `${name} — CLI scope

At the prompt:
  <task>              Any line that does not start with '/' is an engineering task
                      for the Git project in the current directory
  /recover <id>       Restore the files captured by an earlier checkpoint
  /model <id>         Change the model for subsequent tasks (not a cycle in flight)
  /autonomy <mode>    review | bounded — for subsequent tasks only
  /trial              Run Trial 1 (multiply-01) in a new synthetic workspace
  /help               Show this help
  /exit               Leave

Flags:
  --help, -h              Show help and exit
  --version               Show package version and exit
  --model <id>            Select the OpenAI model (else PATHCODE_OPENAI_MODEL, else prompt)
  --autonomy review|bounded
                          Session consent mode (default: review). review keeps
                          START/SCOPE/APPLY/CHECK; bounded requires one RUN
                          disclosure then host-minted authority inside that envelope.
  --execution local|cloud
                          Where admitted project effects run (default: local).
                          cloud uses pinned GC1 constants (pathcode-gc1b-config-v4
                          Engineering Image) via a disposable workstation; primary
                          project bytes are never written. Trusted host config only —
                          the model cannot select the backend.
  --events ndjson         Emit the structured session event stream as NDJSON
                          (same events the live terminal is driven by)
  --events-out <path>     With --events ndjson: write NDJSON to a named file
                          or pipe (fresh truncate on launch; flushed per event).
                          Keeps machine events off the human terminal.

Environment:
  PATHCODE_STATE_DIR   Where recovery checkpoints are stored. Must be outside the
                       project. Defaults to the platform state directory.
  GC1_LIVE_SMOKE=1     Required (with live transport) for real GCP workstations;
                       canonical/cloud tests use the mock transport ($0).

A living PATH engineering session (local default):
  - the prompt stays open across tasks; each task is a fresh isolated workspace
  - PATH creates a unique task branch and worktree from the session baseline
  - Antigravity engineers inside that envelope; PATH independently validates
  - VERIFIED tasks advance the session baseline; failed work does not
  - primary checkout stays untouched; merge the task branch when you choose
  - cloud execution (--execution cloud) retains the historical Gate-1 OpenAI path

Opening this screen does not read a key, scan a project, or call a provider.
`;
}
