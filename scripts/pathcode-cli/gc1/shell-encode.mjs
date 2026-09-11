/**
 * Canonical POSIX shell argv encoder for trusted host-owned remote commands.
 *
 * One encoder for readiness / runtime delivery / worker bootstrap / control.
 * Project execution descriptors NEVER pass through this as a joined shell
 * program — they travel via worker stdin protocol.
 *
 * Refuse Array / Object coercion. Refuse NUL. Encode each argument independently.
 */

export const GC1_SHELL_ENCODE_ERROR = Object.freeze({
  NUL: "GC1_SHELL_ARG_NUL",
  ARRAY: "GC1_SHELL_ARG_ARRAY",
  TYPE: "GC1_SHELL_ARG_TYPE",
  EMPTY_ARGV: "GC1_SHELL_ARGV_EMPTY",
  COMMAND_NOT_STRING: "GC1_REMOTE_COMMAND_NOT_STRING",
});

/**
 * @param {string} code
 * @param {string} message
 */
function namedError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

/**
 * Encode one shell argument with POSIX single-quote discipline.
 * @param {unknown} value
 * @returns {string}
 */
export function encodeShellArg(value) {
  if (Array.isArray(value)) {
    throw namedError(
      GC1_SHELL_ENCODE_ERROR.ARRAY,
      "shell arg must not be an array — encode each element via encodeShellArgv",
    );
  }
  if (value != null && typeof value === "object") {
    throw namedError(
      GC1_SHELL_ENCODE_ERROR.TYPE,
      "shell arg must be a string primitive (objects refuse)",
    );
  }
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
    throw namedError(
      GC1_SHELL_ENCODE_ERROR.TYPE,
      `shell arg refused type ${value === null ? "null" : typeof value}`,
    );
  }
  const s = String(value);
  if (s.includes("\0")) {
    throw namedError(
      GC1_SHELL_ENCODE_ERROR.NUL,
      "NUL byte refused in shell argument",
    );
  }
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/**
 * Encode argv[] → one remote command string (space-joined independently quoted args).
 * NEVER use argv.join(" "), String(argv), or template `${argv}`.
 * @param {unknown[]} argv
 * @returns {string}
 */
export function encodeShellArgv(argv) {
  if (!Array.isArray(argv)) {
    throw namedError(
      GC1_SHELL_ENCODE_ERROR.TYPE,
      "encodeShellArgv requires an array",
    );
  }
  if (argv.length === 0) {
    throw namedError(
      GC1_SHELL_ENCODE_ERROR.EMPTY_ARGV,
      "encodeShellArgv requires at least one argument",
    );
  }
  return argv.map((a) => encodeShellArg(a)).join(" ");
}

/**
 * Fail closed if a transport command is not a string (arrays coerce to "a,b").
 * @param {unknown} command
 * @returns {string}
 */
export function assertRemoteCommandString(command) {
  if (typeof command !== "string") {
    throw namedError(
      GC1_SHELL_ENCODE_ERROR.COMMAND_NOT_STRING,
      `remote command must be a string (got ${Array.isArray(command) ? "array" : typeof command}) — refusing Array.toString / join(",") coercion`,
    );
  }
  if (command.includes("\0")) {
    throw namedError(
      GC1_SHELL_ENCODE_ERROR.NUL,
      "NUL byte refused in remote command string",
    );
  }
  return command;
}

/**
 * Detect the historic live bug shape: executable,path from Array.toString().
 * @param {unknown} command
 * @returns {boolean}
 */
export function looksLikeArrayCommaCoercion(command) {
  if (typeof command !== "string") return false;
  // node,/tmp/... or /usr/bin/node,/tmp/...
  return /(?:^|,)(?:\/usr\/bin\/)?node,\/tmp\//.test(command) ||
    /(?:^|,)(?:\/usr\/bin\/)?node,\/[^,\s]+/.test(command);
}
