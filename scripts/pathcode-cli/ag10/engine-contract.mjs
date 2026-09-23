/**
 * S3 — Unified Engine Fabric contract.
 *
 * Unify the Gateway-facing interface. Preserve honest capability differences.
 * Participation is capability-aware — not a permanent provider hierarchy,
 * not a model-judge ranking.
 *
 * S3.2: richer live capability traits + turn-need matching + selection reasons.
 * Traits originate from adapter declarations (engine-capabilities.mjs) and
 * remain evolvable via traitOverrides / live declarations — routing never
 * hard-codes provider stereotypes.
 */

import {
  declareAntigravityEngineCapability,
  declareCopilotEngineCapability,
  declareCursorEngineCapability,
} from "./engine-capabilities.mjs";

/** @typedef {'antigravity'|'copilot'|'cursor'} EngineId */

/** @typedef {'immediate'|'boundary'|'none'} SteeringMode */

/**
 * Capability tags an engine can honestly claim. Matching is boolean fit —
 * never a scored ranking of engines as models.
 *
 * @typedef {'shell'|'tools'|'mcp'|'lsp'|'bridge'|'hooks'|'streaming'|'local_cwd'|'inflight_steer'|'boundary_steer'|'repair'|'continue'|'sdk'|'cli_fallback'} EngineTrait
 */

/**
 * What the current turn needs from a collaborator. Derived from objective /
 * validation / role — not from scoring engines against each other.
 *
 * @typedef {'code_edit'|'repair'|'shell'|'inflight_steer'|'boundary_steer'|'lsp'|'mcp'|'assessment'|'continue'} TurnNeed
 */

/**
 * @typedef {{
 *   id: EngineId,
 *   role: 'engineering_collaborator',
 *   status: 'available'|'unavailable'|'auth_required'|'slot_reserved',
 *   native: string[],
 *   traits: EngineTrait[],
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

/**
 * @typedef {{
 *   engine: EngineId,
 *   reason: string,
 *   needs: TurnNeed[],
 *   candidates: EngineId[],
 *   preferredHonored: boolean,
 *   continuityHonored: boolean,
 * }} EngineSelection
 */

/**
 * Capability templates sourced from adapter declarations.
 * Live probes may flip status / evidence; traitOverrides may evolve traits
 * without redesigning the routing architecture.
 */
export const ENGINE_CAPABILITY_TEMPLATES = Object.freeze({
  antigravity: Object.freeze(declareAntigravityEngineCapability()),
  copilot: Object.freeze(declareCopilotEngineCapability()),
  cursor: Object.freeze(declareCursorEngineCapability()),
});

export {
  declareAntigravityEngineCapability,
  declareCopilotEngineCapability,
  declareCursorEngineCapability,
} from "./engine-capabilities.mjs";

/** @type {Record<TurnNeed, EngineTrait[]>} */
const NEED_TRAIT_ANY_OF = Object.freeze({
  code_edit: ["tools", "sdk", "bridge"],
  repair: ["repair", "tools"],
  shell: ["shell", "tools"],
  inflight_steer: ["inflight_steer"],
  boundary_steer: ["boundary_steer", "inflight_steer"],
  lsp: ["lsp"],
  mcp: ["mcp"],
  assessment: ["tools", "sdk", "bridge"],
  continue: ["continue", "sdk", "bridge"],
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
 * Infer turn needs from role / objective / validation — capability tags only.
 *
 * @param {{
 *   role?: 'primary'|'repair'|'collab',
 *   objective?: string,
 *   validation?: {
 *     classification?: string,
 *     checks?: Array<{ kind?: string, ok?: boolean, id?: string }>,
 *     reason?: string,
 *   } | null,
 *   requireInflightSteer?: boolean,
 * }} [input]
 * @returns {{ needs: TurnNeed[], detail: string }}
 */
export function inferTurnNeeds(input = {}) {
  /** @type {Set<TurnNeed>} */
  const needs = new Set();
  const objective = String(input.objective || "");
  const role = input.role || "collab";
  /** @type {string[]} */
  const bits = [];

  if (role === "repair") {
    needs.add("repair");
    needs.add("code_edit");
    bits.push("repair role");
  } else if (role === "primary") {
    needs.add("continue");
    bits.push("primary turn");
  } else {
    needs.add("continue");
    bits.push("collab turn");
  }

  if (input.requireInflightSteer === true) {
    needs.add("inflight_steer");
    bits.push("in-flight steer required");
  }

  if (
    /\b(assess|inspect|review|audit|read-?only|findings?)\b/i.test(objective) &&
    !/\b(fix|repair|implement|create|write|add)\b/i.test(objective)
  ) {
    needs.add("assessment");
    bits.push("assessment objective");
  } else if (/\b(fix|repair|implement|create|write|edit|refactor|migrate)\b/i.test(objective)) {
    needs.add("code_edit");
    bits.push("edit objective");
  }

  if (/\b(typecheck|typescript|tsc|lsp|language server)\b/i.test(objective)) {
    needs.add("lsp");
    bits.push("language-intelligence objective");
  }
  if (/\b(mcp|tool server)\b/i.test(objective)) {
    needs.add("mcp");
    bits.push("mcp objective");
  }
  if (/\b(shell|npm test|pytest|cargo test|go test|build)\b/i.test(objective)) {
    needs.add("shell");
    bits.push("shell/test objective");
  }

  const checks = Array.isArray(input.validation?.checks)
    ? input.validation.checks
    : [];
  const failing = checks.filter((c) => c && c.ok === false);
  if (failing.length > 0) {
    needs.add("repair");
    needs.add("code_edit");
    needs.add("shell");
    bits.push(`${failing.length} failing check(s)`);
    if (
      failing.some((c) =>
        /typecheck|tsc|typescript|mypy/i.test(
          `${c.kind || ""} ${c.id || ""}`,
        ),
      )
    ) {
      needs.add("lsp");
      bits.push("typecheck failure");
    }
  }

  if (needs.size === 0) {
    needs.add("continue");
    bits.push("default continue");
  }

  return {
    needs: [...needs],
    detail: bits.join(" · ").slice(0, 240),
  };
}

/**
 * @param {EngineCapability | null | undefined} cap
 * @param {TurnNeed} need
 * @returns {boolean}
 */
export function engineSupportsNeed(cap, need) {
  if (!cap || cap.status === "unavailable" || cap.status === "slot_reserved") {
    return false;
  }
  const traits = Array.isArray(cap.traits) ? cap.traits : [];
  if (need === "inflight_steer") {
    return cap.steering === "immediate" || traits.includes("inflight_steer");
  }
  if (need === "boundary_steer") {
    return (
      cap.steering === "boundary" ||
      cap.steering === "immediate" ||
      traits.includes("boundary_steer") ||
      traits.includes("inflight_steer")
    );
  }
  const anyOf = NEED_TRAIT_ANY_OF[need] || [];
  if (anyOf.length === 0) return true;
  return anyOf.some((t) => traits.includes(t));
}

/**
 * @param {EngineCapability | null | undefined} cap
 * @param {TurnNeed[]} needs
 * @returns {boolean}
 */
export function engineMeetsNeeds(cap, needs) {
  if (!cap) return false;
  if (!Array.isArray(needs) || needs.length === 0) return true;
  // Soft fit: meet every need we can express; unknown needs do not veto.
  return needs.every((n) => engineSupportsNeed(cap, n));
}

/**
 * Capability-aware engine selection for a turn.
 *
 * Rules (in order):
 * - Only select engines marked ready.
 * - When turn needs are provided, prefer engines that meet them (boolean fit).
 * - Honor explicit preference when that engine is ready (and fits, if needs set).
 * - Prefer continuity with last productive engine when still ready (non-repair).
 * - Otherwise rotate among fit (or ready) peers — no permanent hierarchy.
 *
 * @param {{
 *   role?: 'primary'|'repair'|'collab',
 *   attempt?: number,
 *   ready?: Partial<Record<EngineId, boolean>>,
 *   prefer?: EngineId | string | null,
 *   lastEngine?: EngineId | string | null,
 *   preferContinuity?: boolean,
 *   forcePrefer?: boolean,
 *   needs?: TurnNeed[],
 *   capabilities?: EngineCapability[],
 * }} input
 * @returns {EngineId}
 */
/**
 * Deterministic primary-turn rotation index from the task id.
 * Attempt 0 is not a constant, so the first ready peer does not win every
 * no-preference primary. This is not a quality score and not a random draw.
 *
 * @param {string | null | undefined} taskId
 */
export function primaryRotationAttempt(taskId) {
  const text = String(taskId || "");
  let n = 0;
  for (let i = 0; i < text.length; i += 1) {
    n = (n + text.charCodeAt(i) * (i + 1)) >>> 0;
  }
  return n % 9973;
}

export function selectEngineForTurn(input = {}) {
  return explainEngineSelection(input).engine;
}

/**
 * Ordinary primary selection. Same contract as explainEngineSelection.
 * No-preference turns pass a task-derived attempt so rotation is real.
 *
 * @param {{
 *   taskId?: string | null,
 *   attempt?: number,
 *   ready?: { antigravity?: boolean, copilot?: boolean, cursor?: boolean },
 *   prefer?: string | null,
 *   lastEngine?: string | null,
 *   preferContinuity?: boolean,
 *   needs?: TurnNeed[],
 *   capabilities?: EngineCapability[],
 *   forcePrefer?: boolean,
 * }} [input]
 */
export function selectPrimaryEngine(input = {}) {
  const attempt =
    typeof input.attempt === "number" && input.attempt >= 0
      ? input.attempt
      : primaryRotationAttempt(input.taskId);
  return explainEngineSelection({
    role: "primary",
    attempt,
    ready: input.ready,
    prefer: input.prefer ?? null,
    lastEngine: input.lastEngine ?? null,
    preferContinuity: input.preferContinuity !== false,
    needs:
      Array.isArray(input.needs) && input.needs.length > 0
        ? input.needs
        : ["continue", "code_edit"],
    ...(Array.isArray(input.capabilities) ? { capabilities: input.capabilities } : {}),
    ...(input.forcePrefer === true ? { forcePrefer: true } : {}),
  });
}

/**
 * Adapter to invoke for a selection. An unready engine is not treated as the
 * executor.
 *
 * @param {{ engine?: string | null }} selection
 * @param {{ antigravity?: boolean, copilot?: boolean, cursor?: boolean }} ready
 * @returns {'antigravity'|'copilot'|'cursor'|null}
 */
export function primaryAdapterFor(selection, ready) {
  const engine = String(selection?.engine || "");
  if (engine === "cursor" && ready?.cursor === true) return "cursor";
  if (engine === "copilot" && ready?.copilot === true) return "copilot";
  if (engine === "antigravity" && ready?.antigravity !== false) return "antigravity";
  return null;
}

/**
 * Same selection policy as selectEngineForTurn, with an auditable reason.
 *
 * @param {Parameters<typeof selectEngineForTurn>[0]} input
 * @returns {EngineSelection}
 */
export function explainEngineSelection(input = {}) {
  const ready = {
    antigravity: input.ready?.antigravity !== false,
    copilot: input.ready?.copilot === true,
    cursor: input.ready?.cursor === true,
  };
  // Stable peer enumeration for rotation only — not preference weights or
  // quality ranks. Fit filtering below decides who may run.
  /** @type {EngineId[]} */
  const available = [];
  if (ready.antigravity) available.push("antigravity");
  if (ready.copilot) available.push("copilot");
  if (ready.cursor) available.push("cursor");

  const needs = Array.isArray(input.needs)
    ? /** @type {TurnNeed[]} */ (input.needs.filter(Boolean))
    : [];
  const caps =
    Array.isArray(input.capabilities) && input.capabilities.length > 0
      ? input.capabilities
      : buildEngineCapabilityList({
          antigravity: ready.antigravity,
          copilot: { ready: ready.copilot },
          cursor: {
            ready: ready.cursor,
            mode: ready.cursor ? "native_sdk" : "none",
          },
        });
  /** @param {EngineId} id */
  const capFor = (id) => caps.find((c) => c.id === id) || null;

  /** @type {EngineId[]} */
  let candidates = available;
  if (needs.length > 0 && available.length > 0) {
    const fit = available.filter((id) => engineMeetsNeeds(capFor(id), needs));
    if (fit.length > 0) candidates = fit;
  }
  if (candidates.length === 0) {
    // PATH's embedded bridge is always present in-process when no peer SDK
    // is ready — product fallback, not a ranking among ready collaborators.
    return {
      engine: "antigravity",
      reason: "no ready peers — PATH bridge fallback",
      needs,
      candidates: [],
      preferredHonored: false,
      continuityHonored: false,
    };
  }

  const prefer = normalizeEngineId(input.prefer);
  if (prefer && input.forcePrefer === true) {
    return {
      engine: prefer,
      reason: candidates.includes(prefer)
        ? `forced preferred ${prefer}`
        : `forced preferred ${prefer} despite unreadiness`,
      needs,
      candidates: candidates.includes(prefer) ? candidates : [prefer, ...candidates],
      preferredHonored: true,
      continuityHonored: false,
    };
  }
  if (prefer && candidates.includes(prefer)) {
    return {
      engine: prefer,
      reason: needs.length
        ? `preferred ${prefer} meets turn needs`
        : `preferred ${prefer}`,
      needs,
      candidates,
      preferredHonored: true,
      continuityHonored: false,
    };
  }

  const last = normalizeEngineId(input.lastEngine);
  if (
    input.preferContinuity !== false &&
    last &&
    candidates.includes(last) &&
    input.role !== "repair"
  ) {
    return {
      engine: last,
      reason: `continuity with last engine ${last}`,
      needs,
      candidates,
      preferredHonored: false,
      continuityHonored: true,
    };
  }

  const n =
    typeof input.attempt === "number" && input.attempt >= 0 ? input.attempt : 0;
  const engine = candidates[n % candidates.length];
  return {
    engine,
    reason: needs.length
      ? `rotate among need-fit peers (${candidates.join(" · ")})`
      : `rotate among ready peers (${candidates.join(" · ")})`,
    needs,
    candidates,
    preferredHonored: false,
    continuityHonored: false,
  };
}

/**
 * Build Gateway capability list from adapter declarations + live readiness.
 *
 * Optional `declarations` / `traitOverrides` let traits evolve when an
 * integration gains or loses a capability — without redesigning routing.
 *
 * @param {{
 *   antigravity?: boolean,
 *   copilot?: { ready?: boolean, mode?: string, evidence?: string[], reason?: string },
 *   cursor?: { ready?: boolean, mode?: string, evidence?: string[], reason?: string },
 *   declarations?: Partial<Record<EngineId, EngineCapability>>,
 *   traitOverrides?: Partial<Record<EngineId, EngineTrait[]>>,
 * }} [live]
 * @returns {EngineCapability[]}
 */
export function buildEngineCapabilityList(live = {}) {
  const base = {
    antigravity:
      live.declarations?.antigravity || ENGINE_CAPABILITY_TEMPLATES.antigravity,
    copilot: live.declarations?.copilot || ENGINE_CAPABILITY_TEMPLATES.copilot,
    cursor: live.declarations?.cursor || ENGINE_CAPABILITY_TEMPLATES.cursor,
  };
  /** @param {EngineId} id @param {EngineCapability} tpl */
  const traitsFor = (id, tpl) => {
    const override = live.traitOverrides?.[id];
    if (Array.isArray(override)) return [...override];
    return [...(tpl.traits || [])];
  };

  const ag = {
    ...base.antigravity,
    traits: traitsFor("antigravity", base.antigravity),
    status: live.antigravity === false ? "unavailable" : "available",
  };
  const copilotReady = live.copilot?.ready === true;
  const copilot = {
    ...base.copilot,
    traits: traitsFor("copilot", base.copilot),
    status: copilotReady
      ? "available"
      : live.copilot?.reason === "AUTH_REQUIRED" ||
          live.copilot?.reason === "auth_required"
        ? "auth_required"
        : "unavailable",
    evidence: live.copilot?.evidence || [],
    note:
      live.copilot?.reason && !copilotReady
        ? String(live.copilot.reason).slice(0, 200)
        : base.copilot.note,
    extensions: {
      mode: live.copilot?.mode || "none",
    },
  };
  const cursorReady = live.cursor?.ready === true;
  const cursor = {
    ...base.cursor,
    traits: traitsFor("cursor", base.cursor),
    status: cursorReady
      ? "available"
      : live.cursor?.reason === "auth_required"
        ? "auth_required"
        : "unavailable",
    evidence: live.cursor?.evidence || [],
    note:
      live.cursor?.reason && !cursorReady
        ? String(live.cursor.reason).slice(0, 200)
        : base.cursor.note,
    extensions: {
      mode: live.cursor?.mode || "none",
    },
  };
  return [ag, copilot, cursor];
}

/**
 * Structured fabric handoff packet for the next collaborating engine.
 *
 * @param {{
 *   fromEngine?: EngineId | string | null,
 *   toEngine: EngineId | string,
 *   objective?: string,
 *   needs?: TurnNeed[],
 *   reason?: string,
 *   journal?: object[],
 *   changedFiles?: string[],
 *   headSha?: string | null,
 *   validationSummary?: string,
 *   pendingSteering?: string,
 * }} input
 */
export function buildFabricHandoff(input) {
  const to = normalizeEngineId(input.toEngine) || "antigravity";
  const from = normalizeEngineId(input.fromEngine);
  const journal = Array.isArray(input.journal) ? input.journal.slice(-8) : [];
  return {
    schema: "pathcode.s3.fabric-handoff.v1",
    fromEngine: from,
    toEngine: to,
    objective: String(input.objective || "").slice(0, 800),
    needs: Array.isArray(input.needs) ? input.needs.slice(0, 12) : [],
    reason: String(input.reason || "").slice(0, 240),
    changedFiles: Array.isArray(input.changedFiles)
      ? input.changedFiles.map(String).slice(0, 40)
      : [],
    headSha:
      typeof input.headSha === "string" && input.headSha.trim()
        ? input.headSha.trim()
        : null,
    validationSummary: String(input.validationSummary || "").slice(0, 600),
    pendingSteering: String(input.pendingSteering || "").slice(0, 600),
    journal,
  };
}

/**
 * Render a fabric handoff packet as prompt text for the next engine.
 * Preserves engine identity in the journal while PATH stays the product voice.
 *
 * @param {ReturnType<typeof buildFabricHandoff> | null | undefined} packet
 * @returns {string}
 */
export function formatFabricHandoff(packet) {
  if (!packet || typeof packet !== "object") return "";
  /** @type {string[]} */
  const lines = [];
  lines.push("PATH fabric handoff — continue from shared task reality.");
  if (packet.fromEngine) {
    lines.push(`Previous collaborator: ${packet.fromEngine}`);
  }
  lines.push(`Your turn: ${packet.toEngine}`);
  if (packet.reason) lines.push(`Routing: ${packet.reason}`);
  if (Array.isArray(packet.needs) && packet.needs.length > 0) {
    lines.push(`Turn needs: ${packet.needs.join(", ")}`);
  }
  if (packet.objective) {
    lines.push("Objective:");
    lines.push(packet.objective);
  }
  if (packet.headSha) lines.push(`Worktree HEAD: ${packet.headSha}`);
  if (Array.isArray(packet.changedFiles) && packet.changedFiles.length > 0) {
    lines.push(
      `Changed files so far: ${packet.changedFiles.slice(0, 12).join(", ")}`,
    );
  }
  if (packet.validationSummary) {
    lines.push("Validation:");
    lines.push(packet.validationSummary);
  }
  if (packet.pendingSteering) {
    lines.push("Pending operator steering:");
    lines.push(packet.pendingSteering);
  }
  if (Array.isArray(packet.journal) && packet.journal.length > 0) {
    lines.push("Recent collaboration journal:");
    for (const e of packet.journal.slice(-6)) {
      const row = /** @type {Record<string, unknown>} */ (e || {});
      const eng = typeof row.engine === "string" ? row.engine : "?";
      const phase = typeof row.phase === "string" ? row.phase : "";
      const detail = typeof row.detail === "string" ? row.detail : "";
      const files = Array.isArray(row.changedFiles)
        ? row.changedFiles.slice(0, 4).join(",")
        : "";
      lines.push(
        `  [${eng}] ${phase}${detail ? ` — ${detail.slice(0, 120)}` : ""}${
          files ? ` files=${files}` : ""
        }`,
      );
    }
  }
  lines.push(
    "Stay inside the PATH task worktree. Do not push, open PRs, or leave the workspace.",
  );
  return lines.join("\n");
}

/**
 * @param {EngineTurnResult | object | null | undefined} turn
 * @param {EngineId} engine
 * @returns {EngineTurnResult}
 */
/**
 * One mutating engine per attempt. A replacement engine requires an explicit
 * fallback policy and a new task; this record does not start that task.
 *
 * @param {{
 *   preferred?: string | null,
 *   cursorMode?: string | null,
 *   fallback?: string | null,
 * }} input
 */
export function resolveMutatingEngineAttempt(input) {
  const preferred = String(input?.preferred || "").trim().toLowerCase();
  const cursorMode = String(input?.cursorMode || "").trim().toLowerCase();
  const fallback = String(input?.fallback || "").trim().toLowerCase();
  const explicit = fallback === "copilot" || fallback === "antigravity" ? fallback : null;
  if (preferred === "cursor" && cursorMode === "native_sdk") {
    return {
      selected: "cursor",
      fallback: false,
      blocked: false,
      newTask: false,
      reason: "Preferred cursor is ready.",
    };
  }
  if (preferred === "cursor" && cursorMode && cursorMode !== "native_sdk") {
    if (explicit) {
      return {
        selected: explicit,
        fallback: true,
        blocked: false,
        newTask: true,
        reason: `Cursor attempt ended (${cursorMode}). Continued with ${explicit}.`,
      };
    }
    return {
      selected: null,
      fallback: false,
      blocked: true,
      newTask: false,
      reason: `Cursor attempt ended (${cursorMode}). No fallback is configured.`,
    };
  }
  return {
    selected: preferred || null,
    fallback: false,
    blocked: false,
    newTask: false,
    reason: preferred
      ? `Preferred ${preferred} selected for this attempt.`
      : "No preferred engine; Engine Fabric default for this attempt.",
  };
}

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
