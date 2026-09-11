/**
 * GC1-c — one-shot live Engineering Computer capability probe.
 *
 * Queries the real workstation after execution readiness. Never hard-codes
 * versions. Cache key = workstation/image identity for the running session.
 *
 * Tool list mirrors GC1-b live smoke (polyglot engineering baseline).
 */

/** @typedef {{ id: string, label: string, command: string, versionRe?: RegExp }} ToolSpec */

/** @type {ReadonlyArray<ToolSpec>} */
export const ENGINEERING_TOOL_SPECS = Object.freeze([
  { id: "node", label: "Node", command: "node --version" },
  { id: "npm", label: "npm", command: "npm --version" },
  { id: "pnpm", label: "pnpm", command: "pnpm --version" },
  { id: "yarn", label: "yarn", command: "yarn --version" },
  { id: "bun", label: "bun", command: "bun --version" },
  { id: "python3", label: "Python", command: "python3 --version" },
  { id: "pip", label: "pip", command: "pip --version || pip3 --version" },
  { id: "uv", label: "uv", command: "uv --version" },
  { id: "pipx", label: "pipx", command: "pipx --version" },
  { id: "java", label: "Java", command: "java --version" },
  { id: "mvn", label: "Maven", command: "mvn --version" },
  { id: "gradle", label: "Gradle", command: "gradle --version" },
  { id: "go", label: "Go", command: "go version" },
  { id: "rustc", label: "Rust", command: "rustc --version" },
  { id: "cargo", label: "cargo", command: "cargo --version" },
  { id: "rustfmt", label: "rustfmt", command: "rustfmt --version" },
  { id: "clippy", label: "clippy", command: "cargo clippy --version" },
  { id: "gcc", label: "GCC", command: "gcc --version" },
  { id: "g++", label: "G++", command: "g++ --version" },
  { id: "git", label: "git", command: "git --version" },
  { id: "rg", label: "rg", command: "rg --version" },
  { id: "fd", label: "fd", command: "fd --version || fdfind --version" },
  { id: "jq", label: "jq", command: "jq --version" },
  { id: "git-lfs", label: "git-lfs", command: "git-lfs --version" },
]);

/**
 * Extract a short version token from command stdout/stderr.
 * @param {string} id
 * @param {string} text
 * @returns {string | null}
 */
export function parseToolVersion(id, text) {
  const raw = String(text || "");
  if (!raw.trim()) return null;
  const patterns = {
    node: /v?(\d+(?:\.\d+){0,2})/,
    npm: /(\d+(?:\.\d+){0,2})/,
    pnpm: /(\d+(?:\.\d+){0,2})/,
    yarn: /(\d+(?:\.\d+){0,2})/,
    bun: /(\d+(?:\.\d+){0,2})/,
    python3: /Python\s+(\d+(?:\.\d+){0,2})/i,
    pip: /pip\s+(\d+(?:\.\d+){0,2})/i,
    uv: /(?:uv\s+)?(\d+(?:\.\d+){0,2})/,
    pipx: /(\d+(?:\.\d+){0,2})/,
    java: /(?:openjdk|java)\s+(?:version\s+")?(\d+(?:\.\d+){0,2})/i,
    mvn: /Apache Maven\s+(\d+(?:\.\d+){0,2})/i,
    gradle: /Gradle\s+(\d+(?:\.\d+){0,2})/i,
    go: /go(\d+(?:\.\d+){0,2})/i,
    rustc: /rustc\s+(\d+(?:\.\d+){0,2})/i,
    cargo: /cargo\s+(\d+(?:\.\d+){0,2})/i,
    rustfmt: /(?:rustfmt\s+)?(\d+(?:\.\d+){0,2})/,
    clippy: /(?:clippy\s+)?(\d+(?:\.\d+){0,2})/,
    gcc: /(?:gcc|GCC).*?(\d+\.\d+(?:\.\d+)?)/i,
    "g++": /(?:g\+\+|GCC).*?(\d+\.\d+(?:\.\d+)?)/i,
    git: /git version\s+(\d+(?:\.\d+){0,2})/i,
    rg: /ripgrep\s+(\d+(?:\.\d+){0,2})/i,
    fd: /(?:fd|fdfind)\s+(\d+(?:\.\d+){0,2})/i,
    jq: /jq-?(\d+(?:\.\d+){0,2})/i,
    "git-lfs": /git-lfs\/(\d+(?:\.\d+){0,2})/i,
  };
  const re = patterns[id] || /(\d+(?:\.\d+){0,2})/;
  const m = raw.match(re);
  return m ? m[1] : "✓";
}

/**
 * @param {{ exitCode?: number|null, stdout?: string, stderr?: string }} result
 * @param {string} id
 * @returns {{ present: boolean, version: string | null, raw: string }}
 */
export function interpretToolResult(result, id) {
  const stdout = String(result?.stdout || "");
  const stderr = String(result?.stderr || "");
  const combined = `${stdout}\n${stderr}`.trim();
  const exit = result?.exitCode;
  if (exit !== 0 && exit !== null && exit !== undefined) {
    return { present: false, version: null, raw: combined };
  }
  if (!combined) {
    return { present: false, version: null, raw: "" };
  }
  return {
    present: true,
    version: parseToolVersion(id, combined),
    raw: combined.slice(0, 240),
  };
}

/**
 * Format a compact MACHINE band line set from capability map.
 * @param {Record<string, { present: boolean, version: string | null }>} tools
 * @returns {string[]}
 */
export function formatMachineCapabilityLines(tools) {
  const t = tools || {};
  const mark = (id, withVersion = true) => {
    const row = t[id];
    if (!row || !row.present) return "MISSING";
    if (!withVersion || !row.version || row.version === "✓") return "✓";
    return row.version;
  };
  const pair = (label, id, withVersion = true) => {
    const v = mark(id, withVersion);
    if (v === "MISSING") return `${label} MISSING`;
    if (v === "✓") return `${label} ✓`;
    return `${label} ${v}`;
  };

  return [
    [
      pair("Node", "node"),
      pair("npm", "npm"),
      pair("pnpm", "pnpm", false),
      pair("yarn", "yarn", false),
      pair("bun", "bun"),
    ].join(" · "),
    [
      pair("Python", "python3"),
      pair("pip", "pip"),
      pair("uv", "uv"),
      pair("pipx", "pipx"),
    ].join(" · "),
    [
      pair("Java", "java"),
      pair("Maven", "mvn", false),
      pair("Gradle", "gradle", false),
      pair("Go", "go"),
    ].join(" · "),
    [
      pair("Rust", "rustc"),
      pair("cargo", "cargo", false),
      pair("rustfmt", "rustfmt", false),
      pair("clippy", "clippy", false),
      `GCC/G++ ${mark("gcc") === "MISSING" && mark("g++") === "MISSING" ? "MISSING" : mark("gcc") !== "MISSING" ? mark("gcc") : mark("g++")}`,
    ].join(" · "),
    [
      pair("git", "git", false),
      pair("rg", "rg", false),
      pair("fd", "fd", false),
      pair("jq", "jq", false),
      pair("git-lfs", "git-lfs", false),
    ].join(" · "),
  ];
}

/**
 * Query every engineering tool once. Caller caches by workstation identity.
 *
 * @param {{
 *   executeCommand: (req: { workstationName: string, command: string }) => Promise<{ exitCode?: number|null, stdout?: string, stderr?: string }>,
 * }} transport
 * @param {{ workstationName: string, specs?: ReadonlyArray<ToolSpec> }} options
 */
export async function queryMachineCapabilities(transport, options) {
  const workstationName = options.workstationName;
  const specs = options.specs || ENGINEERING_TOOL_SPECS;
  /** @type {Record<string, { present: boolean, version: string | null, raw: string }>} */
  const tools = {};
  for (const spec of specs) {
    let result;
    try {
      result = await transport.executeCommand({
        workstationName,
        command: spec.command,
      });
    } catch (e) {
      tools[spec.id] = {
        present: false,
        version: null,
        raw: String(e?.message || e),
      };
      continue;
    }
    tools[spec.id] = interpretToolResult(result, spec.id);
  }
  return {
    workstationName,
    queriedAt: Date.now(),
    tools,
    lines: formatMachineCapabilityLines(tools),
  };
}
