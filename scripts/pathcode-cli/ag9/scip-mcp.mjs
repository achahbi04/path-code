/**
 * G9 — PATH-owned SCIP MCP server descriptor for LocalAgentConfig.
 * Trust class: read_only tools only.
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));

/** Read-only tools exposed by scip-mcp-server.mjs */
export const SCIP_MCP_READ_ONLY_TOOLS = Object.freeze([
  "code_definition",
  "code_references",
  "code_search_symbol",
]);

/**
 * Absolute path to the stdio MCP server script.
 * @returns {string}
 */
export function resolveScipMcpServerScript() {
  return join(HERE, "scip-mcp-server.mjs");
}

/**
 * Build LocalAgentConfig-compatible MCP server descriptor.
 *
 * @param {{
 *   runtimeRoot: string,
 *   indexDir: string,
 *   nodeExecutable?: string,
 *   name?: string,
 * }} input
 * @returns {{
 *   type: 'stdio',
 *   name: string,
 *   command: string,
 *   args: string[],
 *   env: Record<string, string>,
 *   trustClass: 'read_only',
 *   enabled_tools: string[],
 * }}
 */
export function createScipMcpServerConfig({
  runtimeRoot,
  indexDir,
  nodeExecutable,
  name = "path-scip",
}) {
  const node =
    typeof nodeExecutable === "string" && nodeExecutable.trim()
      ? nodeExecutable.trim()
      : process.execPath;
  const script = resolveScipMcpServerScript();

  return {
    type: "stdio",
    name,
    command: node,
    args: [script],
    env: {
      PATHCODE_SCIP_INDEX_DIR: indexDir,
      PATHCODE_RUNTIME_ROOT: runtimeRoot,
      PATHCODE_SCIP_TRUST_CLASS: "read_only",
    },
    trustClass: "read_only",
    enabled_tools: [...SCIP_MCP_READ_ONLY_TOOLS],
  };
}
