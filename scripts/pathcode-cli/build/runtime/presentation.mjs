/**
 * Artifact presentation capability matrix — web is one adapter, not the architecture.
 */

/**
 * @typedef {{
 *   kind: string,
 *   detection: 'implemented'|'partial'|'none',
 *   runtime: 'implemented'|'partial'|'none',
 *   inBuilderPresentation: 'implemented'|'partial'|'none',
 *   interactive: boolean,
 *   completionEvidence: string,
 * }} PresentationCapability
 */

/** @type {PresentationCapability[]} */
export const ARTIFACT_PRESENTATION_MATRIX = [
  {
    kind: "web",
    detection: "implemented",
    runtime: "implemented",
    inBuilderPresentation: "implemented",
    interactive: true,
    completionEvidence: "runtime + browser/DOM + project-native checks",
  },
  {
    kind: "api",
    detection: "partial",
    runtime: "partial",
    inBuilderPresentation: "partial",
    interactive: false,
    completionEvidence: "health/request evidence (no embed explorer yet)",
  },
  {
    kind: "cli",
    detection: "partial",
    runtime: "none",
    inBuilderPresentation: "none",
    interactive: false,
    completionEvidence: "project-native checks / stdout capture (not embedded)",
  },
  {
    kind: "desktop",
    detection: "none",
    runtime: "none",
    inBuilderPresentation: "none",
    interactive: false,
    completionEvidence: "unsupported in builder",
  },
  {
    kind: "mobile",
    detection: "none",
    runtime: "none",
    inBuilderPresentation: "none",
    interactive: false,
    completionEvidence: "unsupported in builder",
  },
  {
    kind: "service",
    detection: "partial",
    runtime: "partial",
    inBuilderPresentation: "none",
    interactive: false,
    completionEvidence: "health/logs when available",
  },
  {
    kind: "multi_service",
    detection: "partial",
    runtime: "none",
    inBuilderPresentation: "none",
    interactive: false,
    completionEvidence: "unsupported in builder",
  },
  {
    kind: "unknown",
    detection: "implemented",
    runtime: "none",
    inBuilderPresentation: "partial",
    interactive: false,
    completionEvidence: "files + run instructions only — no false visual preview",
  },
];

/**
 * @param {string} kind
 * @param {{ previewUrl?: string | null, embedPath?: string | null, status?: string }} [runtime]
 */
export function describePresentation(kind, runtime = {}) {
  const row =
    ARTIFACT_PRESENTATION_MATRIX.find((r) => r.kind === kind) ||
    ARTIFACT_PRESENTATION_MATRIX.find((r) => r.kind === "unknown");
  if (kind === "web" && runtime.previewUrl) {
    return {
      ...row,
      mode: "embedded_browser",
      url: runtime.previewUrl,
      embedPath: runtime.embedPath || null,
      status: runtime.status || "ready",
    };
  }
  if (kind === "api") {
    return {
      ...row,
      mode: "endpoint_health",
      url: runtime.previewUrl || null,
      status: runtime.status || "unsupported_embed",
    };
  }
  return {
    ...row,
    mode: "files_and_instructions",
    url: null,
    status: "no_visual_preview",
  };
}
