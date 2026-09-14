/**
 * G8 — MCP discovery + trust firewall.
 * Reads only project-local MCP configs; default-denies external mutation tools;
 * strips arbitrary env (esp. secrets) from project config.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Env keys project MCP may retain (never secrets by name). */
export const MCP_ENV_ALLOWLIST = Object.freeze([
  "PATH",
  "HOME",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "NODE_ENV",
  "TERM",
  "TMPDIR",
  "TMP",
  "TEMP",
  "USER",
  "LOGNAME",
  // PATH-owned G9 SCIP MCP (non-secret runtime pointers for path-scip stdio server)
  "PATHCODE_SCIP_INDEX_DIR",
  "PATHCODE_RUNTIME_ROOT",
  "PATHCODE_SCIP_TRUST_CLASS",
]);

const NAME_RE = /^[a-zA-Z0-9_-]+$/;

/** @type {RegExp[]} */
const EXTERNAL_MUTATION_RE = [
  /\b(deploy|publish|push|release|billing|invoice|payment|iam|rbac|permission|grant|revoke)\b/i,
  /\b(database|db|sql|postgres|mysql|mongo|redis).{0,40}\b(write|insert|update|delete|drop|migrate|mutate)\b/i,
  /\b(write|insert|update|delete|drop|migrate).{0,40}\b(database|db|sql|postgres|mysql|mongo)\b/i,
  /\b(send_email|post_tweet|create_issue|open_pr|merge_pr|delete_repo)\b/i,
  /\b(cloud|aws|gcp|azure).{0,30}\b(create|delete|update|put|write|destroy)\b/i,
];

/** @type {RegExp[]} */
const WORKSPACE_MUTATION_RE = [
  /\b(write|edit|create|delete|remove|rename|move|apply_patch|overwrite)\b/i,
  /\b(git\s+(commit|add|checkout|reset|clean|stash|rebase))\b/i,
  /\b(install|uninstall|npm\s+i|pip\s+install)\b/i,
  /\b(filesystem|fs).{0,20}\b(write|mutate)\b/i,
];

/** @type {RegExp[]} */
const READ_ONLY_HINT_RE = [
  /\b(read|list|get|fetch|search|query|find|inspect|describe|status|info|show|view|catalog)\b/i,
];

/**
 * Sanitize a server/tool name to ^[a-zA-Z0-9_-]+$.
 * @param {unknown} name
 * @returns {string | null}
 */
export function sanitizeMcpName(name) {
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 128) return null;
  if (!NAME_RE.test(trimmed)) return null;
  return trimmed;
}

/**
 * Strip non-allowlisted env keys (never pass secrets from project config).
 * @param {unknown} env
 * @returns {Record<string, string> | undefined}
 */
export function sanitizeMcpEnv(env) {
  if (!env || typeof env !== "object" || Array.isArray(env)) return undefined;
  /** @type {Record<string, string>} */
  const out = {};
  for (const [k, v] of Object.entries(
    /** @type {Record<string, unknown>} */ (env),
  )) {
    if (!MCP_ENV_ALLOWLIST.includes(k)) continue;
    if (typeof v !== "string") continue;
    out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Classify an MCP tool by name + optional description.
 * @param {string} toolName
 * @param {string} [toolDescription]
 * @returns {'read_only'|'workspace_mutation'|'external_mutation'}
 */
export function classifyMcpToolTrust(toolName, toolDescription) {
  const name = typeof toolName === "string" ? toolName : "";
  const desc = typeof toolDescription === "string" ? toolDescription : "";
  const blob = `${name} ${desc}`;

  for (const re of EXTERNAL_MUTATION_RE) {
    if (re.test(blob)) return "external_mutation";
  }
  for (const re of WORKSPACE_MUTATION_RE) {
    if (re.test(blob)) return "workspace_mutation";
  }
  if (
    /_(write|deploy|push|publish|delete|create|update|mutate|billing|iam)$/i.test(
      name,
    ) ||
    /^(write|deploy|push|publish|delete|create|update|mutate)_/i.test(name)
  ) {
    if (/deploy|push|publish|billing|iam/i.test(name)) return "external_mutation";
    return "workspace_mutation";
  }
  if (
    READ_ONLY_HINT_RE.some((re) => re.test(blob)) ||
    /^(get|list|read|search|find|describe)_/i.test(name)
  ) {
    return "read_only";
  }
  // Unknown tools default to workspace_mutation (conservative).
  return "workspace_mutation";
}

/**
 * @param {string} projectRoot
 * @returns {Array<object>}
 */
export function discoverProjectMcpConfigs(projectRoot) {
  const root =
    typeof projectRoot === "string" && projectRoot.trim()
      ? projectRoot.trim()
      : "";
  if (!root) return [];

  const paths = [
    join(root, ".mcp.json"),
    join(root, ".github", "mcp.json"),
    join(root, ".path-code", "mcp.json"),
  ];

  /** @type {Array<object>} */
  const servers = [];
  /** @type {Set<string>} */
  const seen = new Set();

  for (const path of paths) {
    if (!existsSync(path)) continue;
    let raw;
    try {
      raw = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      continue;
    }
    const normalized = normalizeMcpServers(raw, path);
    for (const s of normalized) {
      const key = `${s.name}::${s.command || ""}::${s.url || ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      servers.push(s);
    }
  }
  return servers;
}

/**
 * Normalize Claude/Cursor mcpServers map or servers array shapes.
 * @param {unknown} raw
 * @param {string} sourcePath
 * @returns {Array<object>}
 */
export function normalizeMcpServers(raw, sourcePath = "") {
  if (!raw || typeof raw !== "object") return [];

  /** @type {Array<[string, unknown]>} */
  let entries = [];
  const obj = /** @type {Record<string, unknown>} */ (raw);

  if (
    obj.mcpServers &&
    typeof obj.mcpServers === "object" &&
    !Array.isArray(obj.mcpServers)
  ) {
    entries = Object.entries(
      /** @type {Record<string, unknown>} */ (obj.mcpServers),
    );
  } else if (Array.isArray(obj.servers)) {
    entries = obj.servers.map((s, i) => {
      if (
        s &&
        typeof s === "object" &&
        typeof /** @type {any} */ (s).name === "string"
      ) {
        return [/** @type {any} */ (s).name, s];
      }
      return [`server_${i}`, s];
    });
  } else if (!Array.isArray(raw)) {
    const keys = Object.keys(obj);
    const looksLikeMap =
      keys.length > 0 &&
      keys.every((k) => {
        const v = obj[k];
        return (
          v &&
          typeof v === "object" &&
          ("command" in /** @type {object} */ (v) ||
            "url" in /** @type {object} */ (v))
        );
      });
    if (looksLikeMap) entries = Object.entries(obj);
  }

  /** @type {Array<object>} */
  const out = [];
  for (const [rawName, cfg] of entries) {
    if (!cfg || typeof cfg !== "object") continue;
    const c = /** @type {Record<string, unknown>} */ (cfg);
    const name = sanitizeMcpName(rawName) || sanitizeMcpName(c.name);
    if (!name) continue;

    const type =
      typeof c.type === "string" && /http|sse/i.test(c.type)
        ? "http"
        : typeof c.url === "string" && c.url
          ? "http"
          : "stdio";

    /** @type {string[]} */
    const args = Array.isArray(c.args)
      ? c.args.filter((a) => typeof a === "string")
      : [];

    /** @type {Array<{ name: string, description?: string }>} */
    const tools = [];
    if (Array.isArray(c.tools)) {
      for (const t of c.tools) {
        if (typeof t === "string") {
          const tn = sanitizeMcpName(t);
          if (tn) tools.push({ name: tn });
        } else if (t && typeof t === "object") {
          const tn = sanitizeMcpName(/** @type {any} */ (t).name);
          if (tn) {
            tools.push({
              name: tn,
              description:
                typeof /** @type {any} */ (t).description === "string"
                  ? /** @type {any} */ (t).description
                  : undefined,
            });
          }
        }
      }
    }

    out.push({
      name,
      type,
      command: typeof c.command === "string" ? c.command : undefined,
      args,
      url: typeof c.url === "string" ? c.url : undefined,
      headers:
        c.headers && typeof c.headers === "object" && !Array.isArray(c.headers)
          ? /** @type {Record<string, string>} */ (
              Object.fromEntries(
                Object.entries(
                  /** @type {Record<string, unknown>} */ (c.headers),
                ).filter(([, v]) => typeof v === "string"),
              )
            )
          : undefined,
      env: c.env,
      tools,
      sourcePath,
      enabled: false,
    });
  }
  return out;
}

/**
 * Apply trust policy: default-deny external_mutation; strip env; sanitize.
 * Project MCP is not auto-enabled unless trustClass allows and there is no denial.
 *
 * @param {object} server
 * @returns {object}
 */
export function applyMcpTrustPolicy(server) {
  if (!server || typeof server !== "object") {
    return {
      name: "invalid",
      enabled: false,
      trustClass: "external_mutation",
      denialReason: "invalid server object",
    };
  }

  const name = sanitizeMcpName(/** @type {any} */ (server).name);
  if (!name) {
    return {
      ...server,
      name: "invalid",
      enabled: false,
      trustClass: "external_mutation",
      denialReason: "invalid server name",
      env: undefined,
    };
  }

  const tools = Array.isArray(/** @type {any} */ (server).tools)
    ? /** @type {any} */ (server).tools
    : [];

  /** @type {Array<{ name: string, description?: string, trust: string }>} */
  const classified = tools.map((t) => {
    const tn = typeof t === "string" ? t : t?.name;
    const desc = typeof t === "object" && t ? t.description : undefined;
    const trust = classifyMcpToolTrust(tn || "", desc);
    return { name: sanitizeMcpName(tn) || "tool", description: desc, trust };
  });

  const hasExternal = classified.some((t) => t.trust === "external_mutation");
  const hasWorkspace = classified.some((t) => t.trust === "workspace_mutation");
  const readOnly = classified.filter((t) => t.trust === "read_only");
  const dangerous = classified.filter((t) => t.trust !== "read_only");

  /** @type {'read_only'|'workspace_mutation'|'external_mutation'} */
  let trustClass = "read_only";
  if (hasExternal) trustClass = "external_mutation";
  else if (hasWorkspace || classified.length === 0) trustClass = "workspace_mutation";

  const env = sanitizeMcpEnv(/** @type {any} */ (server).env);

  /** @type {string[] | undefined} */
  let enabled_tools;
  /** @type {string[] | undefined} */
  let disabled_tools;

  if (dangerous.length > 0) {
    disabled_tools = dangerous.map((t) => t.name);
  }
  if (readOnly.length > 0) {
    enabled_tools = readOnly.map((t) => t.name);
  } else if (hasExternal) {
    enabled_tools = [];
  }

  let enabled = false;
  /** @type {string | undefined} */
  let denialReason;

  // Prefer exposing only read-only tools (hide mutations) when any exist.
  // Pure undeclared / mutation-only project MCP stays disabled (no auto-authority).
  if (readOnly.length > 0) {
    enabled = true;
    enabled_tools = readOnly.map((t) => t.name);
    if (dangerous.length > 0) {
      disabled_tools = dangerous.map((t) => t.name);
      denialReason =
        "mutation tools hidden; only read_only tools exposed to engine";
    }
    // Exposed surface is read-only even if the server also advertised mutations.
    trustClass = "read_only";
  } else if (hasExternal) {
    enabled = false;
    enabled_tools = [];
    denialReason = "external_mutation tools denied; no read_only tools remain";
  } else if (hasWorkspace || classified.length === 0) {
    enabled = false;
    denialReason =
      classified.length === 0
        ? "undeclared toolset; project MCP not auto-enabled"
        : "workspace_mutation capability not auto-enabled for project MCP";
  }

  return {
    ...server,
    name,
    env,
    trustClass,
    enabled,
    enabled_tools,
    disabled_tools,
    denialReason,
    classifiedTools: classified,
  };
}

/**
 * Map filtered servers to LocalAgentConfig MCP shape.
 * @param {Array<object>} filteredServers
 * @returns {Array<object>}
 */
export function toAntigravityMcpServers(filteredServers) {
  if (!Array.isArray(filteredServers)) return [];
  /** @type {Array<object>} */
  const out = [];
  for (const s of filteredServers) {
    if (!s || typeof s !== "object") continue;
    const name = sanitizeMcpName(/** @type {any} */ (s).name);
    if (!name) continue;
    const type =
      /** @type {any} */ (s).type === "http" ||
      (typeof /** @type {any} */ (s).url === "string" &&
        /** @type {any} */ (s).url)
        ? "http"
        : "stdio";

    /** @type {Record<string, unknown>} */
    const entry = { type, name };
    if (type === "stdio") {
      if (typeof /** @type {any} */ (s).command === "string") {
        entry.command = /** @type {any} */ (s).command;
      }
      if (Array.isArray(/** @type {any} */ (s).args)) {
        entry.args = /** @type {any} */ (s).args.filter(
          (a) => typeof a === "string",
        );
      }
    } else {
      if (typeof /** @type {any} */ (s).url === "string") {
        entry.url = /** @type {any} */ (s).url;
      }
      if (
        /** @type {any} */ (s).headers &&
        typeof /** @type {any} */ (s).headers === "object"
      ) {
        entry.headers = /** @type {any} */ (s).headers;
      }
    }
    const env = sanitizeMcpEnv(/** @type {any} */ (s).env);
    if (env) entry.env = env;
    if (Array.isArray(/** @type {any} */ (s).enabled_tools)) {
      entry.enabled_tools = /** @type {any} */ (s).enabled_tools.filter(
        (t) => typeof t === "string" && NAME_RE.test(t),
      );
    }
    if (Array.isArray(/** @type {any} */ (s).disabled_tools)) {
      entry.disabled_tools = /** @type {any} */ (s).disabled_tools.filter(
        (t) => typeof t === "string" && NAME_RE.test(t),
      );
    }
    out.push(entry);
  }
  return out;
}
