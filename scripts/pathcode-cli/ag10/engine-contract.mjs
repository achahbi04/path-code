/**
 * S3 — Unified Engine Fabric contract.
 *
 * Unify the Gateway-facing interface. Preserve honest capability differences.
 * Participation is capability-aware — not a permanent provider hierarchy.
 */

/** @typedef {'antigravity'|'copilot'|'cursor'} EngineId */

/** @typedef {'immediate'|'boundary'|'none'} SteeringMode */

/**
 * @typedef {{
 *   id: EngineId,
 *   role: 'engineering_collaborator',
 *   status: 'available'|'unavailable'|'auth_required'|'slot_reserved',
 *   native: string[],
 *   steering: SteeringMode,
 *   cancel: 'native'|'abort_registry'|'none',
 *   resume: 'native'|'session_id'|'none',
 *   extensions?: Record<string, unknown>,
 *   note?: string,
 *   evidence?: string[],
 * }} EngineCapability
 */

/**
 * @typedef {{
 *   ok: boolean,
 *   engine: EngineId,
 *   mode?: string,
 *   text?: string,
 *   detail?: string,
 *   code?: string,
 *   changedFiles?: string[],
 *   sessionId?: string | null,
 *   provenance?: {
 *     engine: EngineId,
 *     mode?: string,
 *     sessionId?: string | null,
 *     runId?: string | null,
 *   },
 * }} EngineTurnResult
 */

/** Static capability templates (live probes may flip status). */
export const ENGINE_CAPABILITY_TEMPLATES = Object.freeze({
  antigravity: /** @type {EngineCapability} */ ({
    id: "antigravity",
    role: "engineering_collaborator",
    status: "available",
    native: [
      "bridge",
      "tools",
      "mcp",
      "continue",
      "repair",
      "cancel",
      "hooks",
      "streaming",
    ],
    steering: "boundary",
    cancel: "native",
    resume: "native",
  }),
  copilot: /** @type {EngineCapability} */ ({
    id: "copilot",
    role: "engineering_collaborator",
    status: "available",
    native: [
      "sdk",
      "cli_fallback",
      "tools",
      "lsp",
      "mcp",
      "continue",
      "repair",
      "stable_cli_path",
    ],
    // Mid-turn steer is not wired; guidance applies at turn boundaries.
    steering: "boundary",
    cancel: "abort_registry",
    resume: "session_id",
  }),
  cursor: /** @type {EngineCapability} */ ({
    id: "cursor",
    role: "engineering_collaborator",
    status: "unavailable",
    native: [
      "sdk",
      "local_cwd",
      "tools",
      "streaming",
      "steer_inflight",
      "cancel",
      "resume",
      "multi_turn",
    ],
    // Local Cursor runs support in-flight steer; fabric still applies boundary
    // guidance into the next send when the run has finished.
    steering: "immediate",
    cancel: "native",
    resume: "native",
    note: "Official @cursor/sdk local executor against the PATH task worktree",
  }),
});

/**
 * @param {string | null | undefined} value
 * @returns {EngineId | null}
 */
export function normalizeEngineId(value) {
  const v = String(value || "")
    .trim()
    .toLowerCase();
  if (v === "antigravity" || v === "ag" || v === "ag1") return "antigravity";
  if (v === "copilot" || v === "github-copilot") return "copilot";
  if (v === "cursor") return "cursor";
  return null;
}

/**
 * Resolve operator / env preferred engine without inventing a permanent primary.
 *
 * @param {{
 *   prefer?: string | null,
 *   env?: NodeJS.ProcessEnv,
 * }} [input]
 * @returns {EngineId | null}
 */
export function resolvePreferredEngine(input = {}) {
  const fromArg = normalizeEngineId(input.prefer);
  if (fromArg) return fromArg;
  const env = input.env || process.env;
  return (
    normalizeEngineId(env.PATHCODE_PREFERRED_ENGINE) ||
    normalizeEngineId(env.PATHCODE_ENGINE) ||
    null
  );
}

/**
 * Capability-aware engine selection for a turn.
 *
 * Rules:
 * - Only select engines marked ready.
 * - Honor explicit preference when that engine is ready.
 * - Prefer continuity with last productive engine when still ready.
 * - Otherwise rotate among ready engines (no permanent hierarchy).
 *
 * @param {{
 *   role?: 'primary'|'repair'|'collab',
 *   attempt?: number,
 *   ready?: Partial<Record<EngineId, boolean>>,
 *   prefer?: EngineId | string | null,
 *   lastEngine?: EngineId | string | null,
 *   preferContinuity?: boolean,
 * }} input
 * @returns {EngineId}
 */
export function selectEngineForTurn(input = {}) {
  const ready = {
    antigravity: input.ready?.antigravity !== false,
    copilot: input.ready?.copilot === true,
    cursor: input.ready?.cursor === true,
  };
  /** @type {EngineId[]} */
  const available = [];
  if (ready.antigravity) available.push("antigravity");
  if (ready.copilot) available.push("copilot");
  if (ready.cursor) available.push("cursor");
  if (available.length === 0) return "antigravity";

  const prefer = normalizeEngineId(input.prefer);
  if (prefer && available.includes(prefer)) return prefer;

  const last = normalizeEngineId(input.lastEngine);
  if (
    input.preferContinuity !== false &&
    last &&
    available.includes(last) &&
    input.role !== "repair"
  ) {
    return last;
  }

  // Repair / collab: rotate among ready peers. Include antigravity so no
  // permanent Copilot/Cursor specialty is assumed.
  const n = typeof input.attempt === "number" && input.attempt >= 0 ? input.attempt : 0;
  return available[n % available.length];
}

/**
 * Build Gateway capability list from templates + live readiness.
 *
 * @param {{
 *   antigravity?: boolean,
 *   copilot?: { ready?: boolean, mode?: string, evidence?: string[] },
 *   cursor?: { ready?: boolean, mode?: string, evidence?: string[], reason?: string },
 * }} [live]
 * @returns {EngineCapability[]}
 */
export function buildEngineCapabilityList(live = {}) {
  const ag = {
    ...ENGINE_CAPABILITY_TEMPLATES.antigravity,
    status: live.antigravity === false ? "unavailable" : "available",
  };
  const copilotReady = live.copilot?.ready === true;
  const copilot = {
    ...ENGINE_CAPABILITY_TEMPLATES.copilot,
    status: copilotReady ? "available" : "unavailable",
    evidence: live.copilot?.evidence || [],
    extensions: {
      mode: live.copilot?.mode || "none",
    },
  };
  const cursorReady = live.cursor?.ready === true;
  const cursor = {
    ...ENGINE_CAPABILITY_TEMPLATES.cursor,
    status: cursorReady
      ? "available"
      : live.cursor?.reason === "auth_required"
        ? "auth_required"
        : "unavailable",
    evidence: live.cursor?.evidence || [],
    note:
      live.cursor?.reason && !cursorReady
        ? String(live.cursor.reason).slice(0, 200)
        : ENGINE_CAPABILITY_TEMPLATES.cursor.note,
    extensions: {
      mode: live.cursor?.mode || "none",
    },
  };
  return [ag, copilot, cursor];
}

/**
 * @param {EngineTurnResult | object | null | undefined} turn
 * @param {EngineId} engine
 * @returns {EngineTurnResult}
 */
export function withEngineProvenance(turn, engine) {
  const base =
    turn && typeof turn === "object" ? /** @type {any} */ (turn) : { ok: false };
  return {
    ...base,
    engine: base.engine || engine,
    provenance: {
      engine,
      mode: typeof base.mode === "string" ? base.mode : undefined,
      sessionId:
        typeof base.sessionId === "string" ? base.sessionId : base.sessionId ?? null,
      runId: typeof base.runId === "string" ? base.runId : null,
    },
  };
}
