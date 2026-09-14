/**
 * G9 — minimal seam descriptors for G10 (LOCAL_TOOL | MCP_TOOL | SERVICE_API).
 */

/**
 * @typedef {'LOCAL_TOOL'|'MCP_TOOL'|'SERVICE_API'} SeamKind
 * @typedef {'discover'|'acquire'|'health'|'expose'|'dispose'} SeamLifecycle
 *
 * @typedef {object} SeamDescriptor
 * @property {SeamKind} kind
 * @property {string} id
 * @property {string} status
 * @property {SeamLifecycle} lifecycle
 * @property {string} [executable]
 * @property {string} [detail]
 */

/**
 * Convert a provision result into minimal G10 seam descriptors.
 *
 * @param {{
 *   ready?: Array<{ id?: string, status?: string, executable?: string|null, kind?: string }>,
 *   failed?: Array<{ id?: string, status?: string, error?: string, executable?: string|null }>,
 *   mcpServers?: Array<{ name?: string, id?: string, enabled?: boolean }>,
 *   services?: Array<{ id?: string, status?: string }>,
 * }} provisionResult
 * @returns {SeamDescriptor[]}
 */
export function toSeamDescriptors(provisionResult) {
  /** @type {SeamDescriptor[]} */
  const out = [];
  const ready = Array.isArray(provisionResult?.ready) ? provisionResult.ready : [];
  const failed = Array.isArray(provisionResult?.failed) ? provisionResult.failed : [];

  for (const r of ready) {
    const id = typeof r.id === "string" && r.id ? r.id : "tool";
    out.push({
      kind: "LOCAL_TOOL",
      id,
      status: typeof r.status === "string" ? r.status : "ready",
      lifecycle: "expose",
      executable: typeof r.executable === "string" ? r.executable : undefined,
    });
  }

  for (const f of failed) {
    const id = typeof f.id === "string" && f.id ? f.id : "tool";
    out.push({
      kind: "LOCAL_TOOL",
      id,
      status: typeof f.status === "string" ? f.status : "failed",
      lifecycle: "health",
      executable: typeof f.executable === "string" ? f.executable : undefined,
      detail: typeof f.error === "string" ? f.error.slice(0, 200) : undefined,
    });
  }

  const mcps = Array.isArray(provisionResult?.mcpServers)
    ? provisionResult.mcpServers
    : [];
  for (const m of mcps) {
    const id =
      (typeof m.name === "string" && m.name) ||
      (typeof m.id === "string" && m.id) ||
      "mcp";
    out.push({
      kind: "MCP_TOOL",
      id,
      status: m.enabled === false ? "disabled" : "ready",
      lifecycle: "expose",
    });
  }

  const services = Array.isArray(provisionResult?.services)
    ? provisionResult.services
    : [];
  for (const s of services) {
    out.push({
      kind: "SERVICE_API",
      id: typeof s.id === "string" && s.id ? s.id : "service",
      status: typeof s.status === "string" ? s.status : "unknown",
      lifecycle: "expose",
    });
  }

  return out;
}
