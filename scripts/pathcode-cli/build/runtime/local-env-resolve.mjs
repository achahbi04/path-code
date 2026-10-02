/**
 * V1 .env.local grammar: one assignment per line, ASCII variable name,
 * optional surrounding whitespace, unquoted or single/double quoted value,
 * optional whitespace-prefixed trailing comment. No multiline, escapes,
 * export, interpolation, shell evaluation, or duplicate definitions.
 * The whole file is syntax-checked, but only exact requested values are kept.
 */
import { closeSync, fstatSync, openSync, readFileSync, constants } from "node:fs";
import { join } from "node:path";
import { checkLocalEnvGitSafety } from "./local-env-safety.mjs";

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const fail = (code) => ({ ok: false, code });

/** @param {string} line */
function parseLine(line) {
  const trimmed = line.trimStart();
  if (!trimmed || trimmed.startsWith("#")) return { ok: true, empty: true };
  const assignment = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (!assignment || !NAME.test(assignment[1])) return fail("LOCAL_ENV_SYNTAX_UNSUPPORTED");
  let value = assignment[2];
  if (value.startsWith("'") || value.startsWith('"')) {
    const quote = value[0];
    const end = value.indexOf(quote, 1);
    if (end < 0 || !/^\s*(?:#.*)?$/.test(value.slice(end + 1))) return fail("LOCAL_ENV_SYNTAX_UNSUPPORTED");
    value = value.slice(1, end);
  } else {
    value = value.replace(/\s+#.*$/, "").trimEnd();
    if (/[\"'`#]/.test(value)) return fail("LOCAL_ENV_SYNTAX_UNSUPPORTED");
  }
  // Native loaders disagree about interpolation; reject it for both quoted
  // and unquoted forms so PATH and a framework cannot assign different values.
  if (/\$|`|\\/.test(value)) return fail("LOCAL_ENV_SYNTAX_UNSUPPORTED");
  return { ok: true, name: assignment[1], value };
}

/**
 * @param {{ projectRoot: string, exactNames: readonly string[], allowedNativeNames: readonly string[] }} input
 */
export function resolveExactLocalEnvValues(input) {
  const safety = checkLocalEnvGitSafety(input.projectRoot);
  if (!safety.ok) return fail(safety.code);
  const exact = new Set(input.exactNames);
  const allowed = new Set(input.allowedNativeNames);
  if (exact.size !== input.exactNames.length ||
      [...exact].some((name) => !NAME.test(name) || !allowed.has(name))) return fail("SECRET_BINDING_INVALID");
  let fd;
  let content;
  try {
    fd = openSync(join(input.projectRoot, ".env.local"), constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > 128 * 1024) return fail("LOCAL_ENV_PATH_UNSAFE");
    content = readFileSync(fd, "utf8");
  } catch (error) {
    return fail(error?.code === "ENOENT" ? "LOCAL_SECRET_MISSING" : "LOCAL_ENV_PATH_UNSAFE");
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
  const values = Object.create(null);
  if (content.includes("\0") || content.includes("\uFFFD")) return fail("LOCAL_ENV_SYNTAX_UNSUPPORTED");
  const seen = new Set();
  for (const line of content.split(/\r?\n/)) {
    const parsed = parseLine(line);
    if (!parsed.ok) return parsed;
    if (parsed.empty) continue;
    if (seen.has(parsed.name)) return fail("LOCAL_ENV_DUPLICATE");
    seen.add(parsed.name);
    if (!allowed.has(parsed.name)) return fail("LOCAL_ENV_NATIVE_LOAD_UNSAFE");
    if (exact.has(parsed.name)) values[parsed.name] = parsed.value;
  }
  const missing = [...exact].find((name) => !seen.has(name) || values[name] === "");
  if (missing) return fail("LOCAL_SECRET_MISSING");
  return { ok: true, values, names: [...seen] };
}
