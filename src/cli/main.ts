/**
 * Pure/testable CLI behavior boundary.
 * Accepts already-sliced args and a tiny IO adapter — no process reads.
 */

export type CliIo = {
  readonly writeOut: (text: string) => void;
  readonly writeErr: (text: string) => void;
};

const HELP_TEXT = `Path Code

Usage:
  pathcode [--help]

Path Code engineering task execution is not enabled in the Foundation Kernel.
`;

/**
 * Run minimal Foundation Kernel CLI behavior.
 * Returns a numeric exit code; callers decide how to apply it.
 */
export function runCli(args: readonly string[], io: CliIo): number {
  if (args.length === 0) {
    io.writeOut(HELP_TEXT);
    return 0;
  }

  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
    io.writeOut(HELP_TEXT);
    return 0;
  }

  const first = args[0] ?? "";
  io.writeErr(
    `Unknown argument: ${first}\nRun "pathcode --help" for usage.\n`,
  );
  return 1;
}
