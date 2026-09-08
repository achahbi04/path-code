/**
 * Phase 5G validation candidate discovery.
 *
 * The trusted host — never the model — decides what may be executed. The model
 * may only echo back an id this module minted. Everything an approved check
 * would run is expanded statically and disclosed before the CHECK prompt, so
 * "run the tests" can never quietly mean "install packages" or "deploy".
 *
 * Discovery is read-only: it parses package.json and looks for a locally
 * installed compiler. It never installs, downloads, or executes anything.
 */

import { existsSync, realpathSync, statSync } from "node:fs";
import { delimiter, join } from "node:path";

/** Exactly the script names a validation plan may draw from. */
export const ADMITTED_SCRIPT_NAMES = Object.freeze([
  "typecheck",
  "check",
  "test",
  "lint",
  "build",
]);

/** Additional admitted family: `test:*`. */
export const ADMITTED_SCRIPT_PREFIXES = Object.freeze(["test:"]);

export const SCRIPT_KIND_BY_NAME = Object.freeze({
  typecheck: "TYPECHECK",
  check: "TYPECHECK",
  lint: "LINT",
  build: "BUILD",
  test: "TARGETED_TEST",
});

/**
 * Command fragments a validation check may never contain. These are matched
 * against whitespace-normalized command text after static chain expansion, so
 * a hook three scripts deep is still caught.
 */
export const FORBIDDEN_COMMAND_PATTERNS = Object.freeze([
  { pattern: /(^|[;&|]\s*)npm\s+(install|i|ci|add|update|up)\b/, label: "npm install/ci" },
  { pattern: /(^|[;&|]\s*)(yarn|pnpm|bun)\s+(install|add|up|update)\b/, label: "package install" },
  { pattern: /(^|[\s;&|])npx\b/, label: "npx (may download a package)" },
  { pattern: /(^|[\s;&|])(pnpm\s+dlx|yarn\s+dlx|bunx)\b/, label: "dlx (may download a package)" },
  { pattern: /\bpublish\b/, label: "publish" },
  { pattern: /\bdeploy\b/, label: "deploy" },
  { pattern: /\bmigrate\b/, label: "migrate" },
  { pattern: /\bgit\s+(push|commit|reset|clean|checkout|stash)\b/, label: "mutating git" },
  { pattern: /(^|[\s;&|])(curl|wget)\b/, label: "network download" },
  { pattern: /\brm\s+-[a-z]*[rf]/, label: "recursive remove" },
]);

/** Shell constructs that make static expansion impossible. */
export const DYNAMIC_COMMAND_PATTERNS = Object.freeze([
  { pattern: /\$\{?[A-Za-z_][A-Za-z0-9_]*\}?/, label: "shell variable reference" },
  { pattern: /\$\(/, label: "command substitution" },
  { pattern: /`/, label: "backtick substitution" },
  { pattern: /%[A-Za-z_][A-Za-z0-9_]*%/, label: "Windows variable reference" },
]);

/** Depth ceiling for `npm run` chain expansion. */
export const MAX_SCRIPT_CHAIN_DEPTH = 8;
/** Node ceiling so a wide script graph cannot exhaust the disclosure. */
export const MAX_SCRIPT_CHAIN_NODES = 64;

/**
 * Per-check wall clock. These are deliberately not "as long as possible": the
 * orchestrator admits a whole post-edit cycle inside DEFAULT_CYCLE_ADMISSION_MS
 * (600_000 ms) and refuses to dispatch when the summed process budget plus
 * termination grace would not fit. A plan carries at most one TYPECHECK and one
 * TARGETED_TEST, so 180s + 300s + 2×7s of grace leaves comfortable headroom.
 */
export const TYPECHECK_TIMEOUT_MS = 180_000;
export const NPM_SCRIPT_TIMEOUT_MS = 300_000;

/**
 * @param {string} name
 */
export function isAdmittedScriptName(name) {
  if (typeof name !== "string" || name.length === 0 || name.length > 64) {
    return false;
  }
  if (ADMITTED_SCRIPT_NAMES.includes(name)) {
    return true;
  }
  return ADMITTED_SCRIPT_PREFIXES.some(
    (prefix) => name.startsWith(prefix) && name.length > prefix.length,
  );
}

/**
 * @param {string} name
 */
export function scriptKindFor(name) {
  if (Object.prototype.hasOwnProperty.call(SCRIPT_KIND_BY_NAME, name)) {
    return SCRIPT_KIND_BY_NAME[name];
  }
  if (name.startsWith("test:")) {
    return "TARGETED_TEST";
  }
  return null;
}

/**
 * Split a script body into the sequential/parallel command segments a shell
 * would run. Deliberately conservative: it only understands `&&`, `||`, `;`
 * and `&`, which is enough to see every command an admitted script names.
 *
 * @param {string} body
 * @returns {string[]}
 */
export function splitCommandSegments(body) {
  return body
    .split(/\s*(?:&&|\|\||;|(?<!&)&(?!&)|\|)\s*/g)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

/**
 * Classify one command segment's reference to another npm script.
 *
 * @param {string} segment
 * @returns {{ kind: "RUN", script: string } | { kind: "TEST" } | { kind: "NONE" }}
 */
export function parseNpmScriptReference(segment) {
  const run = /^npm\s+(?:run|run-script)\s+(?:--\s+)?([A-Za-z0-9_:.-]+)\s*$/.exec(
    segment,
  );
  if (run !== null) {
    return { kind: "RUN", script: run[1] };
  }
  if (/^npm\s+test\s*$/.test(segment) || /^npm\s+t\s*$/.test(segment)) {
    return { kind: "TEST" };
  }
  return { kind: "NONE" };
}

/**
 * @param {string} segment
 * @returns {{ label: string } | null}
 */
export function findDynamicConstruct(segment) {
  for (const entry of DYNAMIC_COMMAND_PATTERNS) {
    if (entry.pattern.test(segment)) {
      return { label: entry.label };
    }
  }
  return null;
}

/**
 * @param {string} segment
 * @returns {{ label: string } | null}
 */
export function findForbiddenOperation(segment) {
  const normalized = segment.replace(/\s+/g, " ").trim();
  for (const entry of FORBIDDEN_COMMAND_PATTERNS) {
    if (entry.pattern.test(normalized)) {
      return { label: entry.label };
    }
  }
  return null;
}

/**
 * npm lifecycle hooks that run around a named script.
 * @param {Record<string, string>} scripts
 * @param {string} name
 */
export function lifecycleHooksFor(scripts, name) {
  const hooks = [];
  const pre = `pre${name}`;
  const post = `post${name}`;
  if (typeof scripts[pre] === "string") {
    hooks.push({ phase: "pre", name: pre, body: scripts[pre] });
  }
  if (typeof scripts[post] === "string") {
    hooks.push({ phase: "post", name: post, body: scripts[post] });
  }
  return hooks;
}

/**
 * Statically expand everything `npm run <name>` would execute, following
 * `npm run <literal>` / `npm test` references and npm's own pre/post hooks.
 *
 * Bounded by depth and node count; a cycle is reported, never followed.
 *
 * @param {Record<string, string>} scripts
 * @param {string} rootName
 * @returns {{ ok: true, nodes: Array<{ name: string, body: string, depth: number, via: string | null, phase: string }> }
 *   | { ok: false, code: string, detail: string }}
 */
export function expandScriptChain(scripts, rootName) {
  /** @type {Array<{ name: string, body: string, depth: number, via: string | null, phase: string }>} */
  const nodes = [];
  const onPath = new Set();

  /**
   * @param {string} name
   * @param {number} depth
   * @param {string | null} via
   * @param {string} phase
   */
  function visit(name, depth, via, phase) {
    if (depth > MAX_SCRIPT_CHAIN_DEPTH) {
      return {
        ok: false,
        code: "VALIDATION_CANDIDATE_UNRESOLVED",
        detail: `script chain exceeds the depth bound of ${MAX_SCRIPT_CHAIN_DEPTH} at '${name}'`,
      };
    }
    if (nodes.length >= MAX_SCRIPT_CHAIN_NODES) {
      return {
        ok: false,
        code: "VALIDATION_CANDIDATE_UNRESOLVED",
        detail: `script chain exceeds the node bound of ${MAX_SCRIPT_CHAIN_NODES}`,
      };
    }
    if (onPath.has(name)) {
      return {
        ok: false,
        code: "VALIDATION_CANDIDATE_CYCLE",
        detail: `script '${name}' takes part in a cycle`,
      };
    }
    const body = scripts[name];
    if (typeof body !== "string") {
      return {
        ok: false,
        code: "VALIDATION_CANDIDATE_UNRESOLVED",
        detail: `script '${name}' is referenced but not defined`,
      };
    }

    onPath.add(name);
    nodes.push({ name, body, depth, via, phase });

    const pre = `pre${name}`;
    if (typeof scripts[pre] === "string") {
      const result = visit(pre, depth + 1, name, "pre");
      if (!result.ok) {
        return result;
      }
    }

    for (const segment of splitCommandSegments(body)) {
      const dynamic = findDynamicConstruct(segment);
      if (dynamic !== null) {
        return {
          ok: false,
          code: "VALIDATION_CANDIDATE_UNRESOLVED",
          detail: `script '${name}' contains a ${dynamic.label}; Path Code cannot prove what it would run`,
        };
      }
      const forbidden = findForbiddenOperation(segment);
      if (forbidden !== null) {
        return {
          ok: false,
          code: "VALIDATION_CANDIDATE_FORBIDDEN",
          detail: `script '${name}' would run ${forbidden.label}`,
        };
      }
      const reference = parseNpmScriptReference(segment);
      if (reference.kind === "NONE") {
        continue;
      }
      const target = reference.kind === "TEST" ? "test" : reference.script;
      const result = visit(target, depth + 1, name, "run");
      if (!result.ok) {
        return result;
      }
    }

    const post = `post${name}`;
    if (typeof scripts[post] === "string") {
      const result = visit(post, depth + 1, name, "post");
      if (!result.ok) {
        return result;
      }
    }

    onPath.delete(name);
    return { ok: true };
  }

  const outcome = visit(rootName, 0, null, "main");
  if (!outcome.ok) {
    return outcome;
  }
  return { ok: true, nodes };
}

/**
 * Locate the npm CLI JavaScript entry without spawning anything.
 * Returns null when npm cannot be located; npm candidates are then unavailable.
 *
 * @param {{ env?: Record<string, string | undefined>, execPath?: string }} [options]
 */
export function resolveNpmCliJs(options = {}) {
  const env = options.env ?? process.env;
  const execPath = options.execPath ?? process.execPath;
  let binDirectory;
  try {
    binDirectory = join(realpathSync(execPath), "..");
  } catch {
    binDirectory = join(execPath, "..");
  }

  const direct = [
    join(binDirectory, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
    join(binDirectory, "..", "lib", "node_modules", "npm", "lib", "cli.js"),
    join(binDirectory, "node_modules", "npm", "bin", "npm-cli.js"),
  ];
  for (const candidate of direct) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  // Fall back to the `npm` shim on PATH, which is normally a symlink straight
  // at npm-cli.js. Only a JavaScript entry is accepted — never a shell wrapper.
  for (const directory of String(env.PATH ?? "").split(delimiter)) {
    if (directory === "") continue;
    const shim = join(directory, "npm");
    if (!existsSync(shim)) continue;
    try {
      const real = realpathSync(shim);
      if (real.endsWith("npm-cli.js") || real.endsWith(join("npm", "lib", "cli.js"))) {
        return real;
      }
    } catch {
      // unreadable shim; keep looking
    }
  }
  return null;
}

/**
 * @param {string} projectRoot
 */
function resolveLocalTsc(projectRoot) {
  const tscJs = join(projectRoot, "node_modules", "typescript", "lib", "tsc.js");
  const tsconfig = join(projectRoot, "tsconfig.json");
  try {
    if (!statSync(tscJs).isFile() || !statSync(tsconfig).isFile()) {
      return null;
    }
  } catch {
    return null;
  }
  return { tscJs, tsconfig };
}

/**
 * @param {string} text
 */
export function readPackageScripts(text) {
  if (typeof text !== "string" || text.length === 0) {
    return { ok: true, scripts: {} };
  }
  let decoded;
  try {
    decoded = JSON.parse(text);
  } catch {
    return { ok: false, code: "PACKAGE_JSON_UNPARSEABLE" };
  }
  if (decoded === null || typeof decoded !== "object" || Array.isArray(decoded)) {
    return { ok: false, code: "PACKAGE_JSON_UNPARSEABLE" };
  }
  const raw = decoded.scripts;
  if (raw === undefined || raw === null) {
    return { ok: true, scripts: {} };
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, code: "PACKAGE_JSON_UNPARSEABLE" };
  }
  /** @type {Record<string, string>} */
  const scripts = Object.create(null);
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") {
      scripts[key] = value;
    }
  }
  return { ok: true, scripts };
}

/**
 * Discover every validation candidate this project offers.
 *
 * @param {{
 *   projectRoot: string,
 *   packageJsonText?: string | null,
 *   childEnv: Readonly<Record<string, string>>,
 *   env?: Record<string, string | undefined>,
 *   execPath?: string,
 *   npmCliJs?: string | null,
 * }} input
 * @returns {{ candidates: Array<object>, refused: Array<object>, npmCliJs: string | null }}
 */
export function discoverValidationCandidates(input) {
  const candidates = [];
  const refused = [];
  const execPath = input.execPath ?? process.execPath;

  const tsc = resolveLocalTsc(input.projectRoot);
  if (tsc !== null) {
    candidates.push({
      id: "typecheck-local-tsc",
      kind: "TYPECHECK",
      source: "LOCAL_TSC",
      label: "TypeScript compiler (project-local, --noEmit)",
      // --noEmit is appended unconditionally: a validation check observes, it
      // never publishes build output into the repository under review.
      request: {
        executable: execPath,
        argv: [tsc.tscJs, "-p", tsc.tsconfig, "--noEmit"],
        cwd: input.projectRoot,
        env: input.childEnv,
        timeoutMs: TYPECHECK_TIMEOUT_MS,
      },
      disclosure: {
        command: `node ${tsc.tscJs} -p ${tsc.tsconfig} --noEmit`,
        chain: [],
        lifecycleHooks: [],
      },
    });
  }

  const parsed = readPackageScripts(input.packageJsonText ?? null);
  if (!parsed.ok) {
    refused.push({
      id: "package-json",
      reasonCode: parsed.code,
      detail: "package.json could not be parsed as an object with string scripts",
    });
    return { candidates, refused, npmCliJs: null };
  }

  const scriptNames = Object.keys(parsed.scripts).sort();
  if (scriptNames.length === 0) {
    return { candidates, refused, npmCliJs: null };
  }

  const npmCliJs =
    input.npmCliJs !== undefined
      ? input.npmCliJs
      : resolveNpmCliJs({
          ...(input.env === undefined ? {} : { env: input.env }),
          execPath,
        });

  for (const name of scriptNames) {
    if (!isAdmittedScriptName(name)) {
      continue;
    }
    const kind = scriptKindFor(name);
    if (kind === null) {
      continue;
    }
    const expansion = expandScriptChain(parsed.scripts, name);
    if (!expansion.ok) {
      refused.push({
        id: `npm-${name}`,
        scriptName: name,
        reasonCode: expansion.code,
        detail: expansion.detail,
      });
      continue;
    }
    if (npmCliJs === null) {
      refused.push({
        id: `npm-${name}`,
        scriptName: name,
        reasonCode: "NPM_CLI_UNAVAILABLE",
        detail:
          "the npm CLI JavaScript entry could not be located; Path Code will not download one",
      });
      continue;
    }
    candidates.push({
      id: `npm-${name}`,
      kind,
      source: "NPM_SCRIPT",
      scriptName: name,
      label: `npm run ${name}`,
      request: {
        executable: execPath,
        argv: [npmCliJs, "run", name],
        cwd: input.projectRoot,
        env: input.childEnv,
        timeoutMs: NPM_SCRIPT_TIMEOUT_MS,
      },
      disclosure: {
        command: `node ${npmCliJs} run ${name}`,
        chain: expansion.nodes,
        lifecycleHooks: lifecycleHooksFor(parsed.scripts, name),
      },
    });
  }

  return { candidates, refused, npmCliJs };
}

/**
 * Choose the checks that will actually run.
 *
 * Gate 2 binds each post-edit claim to exactly one check of a single kind, so
 * a V1 plan carries at most one TYPECHECK and at most one TARGETED_TEST. LINT
 * and BUILD candidates are discovered and disclosed, but are not executed:
 * Path Code will not run a check it cannot turn into evidence.
 *
 * @param {Array<any>} candidates
 * @param {readonly string[]} preferredIds ids the approved scope selected
 */
export function selectPlannedChecks(candidates, preferredIds = []) {
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const preferred = preferredIds
    .map((id) => byId.get(id))
    .filter((candidate) => candidate !== undefined);

  /**
   * @param {string} kind
   */
  const pick = (kind) =>
    preferred.find((candidate) => candidate.kind === kind) ??
    candidates.find((candidate) => candidate.kind === kind) ??
    null;

  const typecheck = pick("TYPECHECK");
  const targeted = pick("TARGETED_TEST");
  const planned = [];
  if (typecheck !== null) planned.push(typecheck);
  if (targeted !== null) planned.push(targeted);

  const notPlanned = candidates.filter(
    (candidate) => !planned.includes(candidate),
  );
  return { planned, notPlanned };
}
