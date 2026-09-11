/**
 * Phase PS1-INLINE — in-process Path Studio cards on the primary CLI TTY.
 *
 * Synchronous stdout writes only. No timers, sockets, servers, or file
 * watchers. Cards update in place from real session.* events (R2-O).
 *
 * Terminal-rendering safety (mandatory):
 *   1a viewport clamp  1b ANSI-aware width  1c atomic single-write
 *   1d collision re-anchor  1e resize teardown  1f cursor restore  1g erase-below
 */

import {
  applyStudioEvent,
  assertNoFabricatedProgress,
  createEmptyStudioState,
  projectAuthoritativePathPhase,
  STUDIO_CARD_ORDER,
} from "../path-studio/state.mjs";
import { escapeForTerminalDisplay } from "./escape.mjs";
import { renderSessionEventHuman } from "./session-events.mjs";

const ANSI_RE = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007]*(?:\u0007|\u001b\\)|\u001b./g;

const HIDE_CURSOR = "\u001b[?25l";
const SHOW_CURSOR = "\u001b[?25h";
const ERASE_LINE = "\u001b[2K";
const ERASE_BELOW = "\u001b[J";
const CR = "\r";

/**
 * Visible width with ANSI escape sequences stripped (1b).
 * @param {string} text
 */
export function visibleWidth(text) {
  if (typeof text !== "string" || text.length === 0) return 0;
  const stripped = text.replace(ANSI_RE, "");
  // Count code points roughly as columns (BMP/emoji treated as 1 — good enough
  // for path truncation; never under-estimate by counting escapes).
  return Array.from(stripped).length;
}

/**
 * Truncate to a maximum VISIBLE width; never leave a partial escape.
 * @param {string} text
 * @param {number} maxCols
 */
export function truncateVisible(text, maxCols) {
  if (typeof text !== "string") return "";
  if (!(maxCols > 0)) return "";
  if (visibleWidth(text) <= maxCols) return text;
  const ellipsis = "…";
  const budget = Math.max(1, maxCols - visibleWidth(ellipsis));
  let out = "";
  let width = 0;
  let i = 0;
  while (i < text.length) {
    if (text[i] === "\u001b") {
      ANSI_RE.lastIndex = i;
      const m = ANSI_RE.exec(text);
      if (m && m.index === i) {
        out += m[0];
        i += m[0].length;
        continue;
      }
    }
    const cp = text.codePointAt(i) ?? 0;
    const ch = String.fromCodePoint(cp);
    const step = cp > 0xffff ? 2 : 1;
    if (width + 1 > budget) break;
    out += ch;
    width += 1;
    i += step;
  }
  return `${out}${ellipsis}`;
}

/**
 * @param {string} text
 * @param {number} columns
 */
export function fitLine(text, columns) {
  const cols =
    typeof columns === "number" && columns > 0 ? Math.floor(columns) : 80;
  const sanitized = escapeForTerminalDisplay(text).replace(/\r?\n/g, " ");
  return truncateVisible(sanitized, cols);
}

/**
 * @param {ReturnType<typeof createEmptyStudioState>} state
 */
function activeCardId(state) {
  for (const id of STUDIO_CARD_ORDER) {
    if (state.cards[id]?.status === "active") return id;
  }
  // Prefer terminal when arrived; else last arrived non-pending.
  if (state.cards.terminal?.arrived) return "terminal";
  for (let i = STUDIO_CARD_ORDER.length - 1; i >= 0; i -= 1) {
    const id = STUDIO_CARD_ORDER[i];
    if (state.cards[id]?.arrived) return id;
  }
  return null;
}

/**
 * @param {{ id: string, title: string, status: string, detail: string, arrived: boolean }} card
 * @param {boolean} compact
 * @param {number} columns
 */
function formatCardLine(card, compact, columns) {
  const mark =
    card.status === "pending"
      ? "[ ]"
      : card.status === "skipped"
        ? "[~]"
        : card.status === "refused"
          ? "[x]"
          : card.status === "active"
            ? "[>]"
            : "[*]";
  if (compact) {
    return fitLine(`${mark} ${card.title}`, columns);
  }
  return fitLine(`${mark} ${card.title}: ${card.detail}`, columns);
}

/**
 * Evidence marks for the living product column — only from arrived cards.
 * @param {ReturnType<typeof createEmptyStudioState>} state
 * @returns {string[]}
 */
export function buildEvidenceLines(state) {
  /** @type {string[]} */
  const lines = [];
  const product = state.product || {};

  if (product.infraFailure) {
    lines.push("Environment     ✕");
  }

  // AG1/AG2: show engineering lifecycle evidence — never legacy Gate 1 / Gate 2.
  if (product.ag1 === true) {
    lines.push(
      state.cards.recovery?.arrived ? "Workspace       ✓" : "Workspace       —",
    );
    lines.push(
      state.cards.recovery?.arrived ? "Recovery        ✓" : "Recovery        —",
    );
    const activities = Array.isArray(product.ag1Activities)
      ? product.ag1Activities
      : [];
    if (activities.length === 0) {
      lines.push("Activity        —");
    } else {
      for (const label of activities.slice(-6)) {
        lines.push(`◆ ${label}`);
      }
    }
    if (product.ag1Mutation) {
      lines.push("Mutation        ✓");
    } else if (state.cards.applying?.status === "active") {
      lines.push("Mutation        ●");
    } else {
      lines.push("Mutation        —");
    }

    const checks = Array.isArray(product.ag1Checks) ? product.ag1Checks : [];
    if (state.cards.validationRunning?.status === "active" && checks.length === 0) {
      lines.push("Verifying       ●");
    } else if (checks.length > 0) {
      for (const c of checks) {
        const kind = String(c.kind || c.id || "Check");
        const label =
          kind === "TYPECHECK"
            ? "Typecheck"
            : kind === "TARGETED_TEST" || /test/i.test(kind)
              ? "Tests"
              : kind === "BUILD" || /build/i.test(kind)
                ? "Build"
                : kind.slice(0, 12);
        const pad = " ".repeat(Math.max(1, 14 - label.length));
        lines.push(`${label}${pad}${c.ok ? "✓" : "✕"}`);
      }
    } else if (state.cards.validationResult?.arrived) {
      const detail = state.cards.validationResult.detail || "";
      if (/fail|FAILED/i.test(detail)) lines.push("Validation      ✕");
      else if (/PASSED|pass/i.test(detail)) lines.push("Validation      ✓");
      else lines.push("Validation      —");
    } else if (state.cards.validationSkipped?.arrived) {
      lines.push("Validation      —");
    } else {
      lines.push("Validation      —");
    }

    const term = state.cards.terminal;
    if (term?.arrived) {
      const d = String(term.detail || "");
      if (/^VERIFIED\b/i.test(d)) lines.push("Result          ✓");
      else if (/PARTIALLY_VERIFIED/i.test(d)) lines.push("Result          ◐");
      else if (/CANCELLED/i.test(d)) lines.push("Result          —");
      else if (/FAILED|NOT_VERIFIED|AG1_|DIRTY_|DETACHED_|GIT_/i.test(d)) {
        lines.push("Result          ✕");
      } else lines.push("Result          —");
    } else {
      lines.push("Result          —");
    }
    return lines;
  }

  const g1 = state.cards.gate1;
  if (g1?.arrived) {
    lines.push(
      g1.status === "done" ? "Gate 1          ✓" : "Gate 1          refused",
    );
  } else {
    lines.push("Gate 1          waiting");
  }

  // Snapshot is established once hydration (or non-cloud recovery path) begins.
  if (product.hydrationFiles != null || state.cards.recovery?.arrived) {
    lines.push("Snapshot        ✓");
  } else if (product.cloudSelected && !product.workstationReady) {
    lines.push("Snapshot        —");
  } else if (state.cards.scope?.arrived) {
    lines.push("Snapshot        —");
  }

  const rec = state.cards.recovery;
  if (rec?.arrived) {
    lines.push("Recovery        ✓");
  } else {
    lines.push("Recovery        —");
  }

  const apply = state.cards.applying;
  if (apply?.status === "active") {
    lines.push("Mutation        ●");
  } else if (apply?.arrived) {
    lines.push("Mutation        ✓");
  } else {
    lines.push("Mutation        —");
  }

  const vPlan = state.cards.validationPlan;
  const vRun = state.cards.validationRunning;
  const vRes = state.cards.validationResult;
  const detail = vRes?.detail || "";
  const typecheckPass = /TYPECHECK[^\n]*?(?:pass|ok|✓|done)/i.test(detail);
  const typecheckFail = /TYPECHECK[^\n]*?(?:fail|error|NOT_PASS)/i.test(detail);
  const testPassMatch = detail.match(/(\d+)\s*\/\s*(\d+)/);
  const testFail = /fail|error|NOT_PASS|not.?pass/i.test(detail) && /test|TARGETED|regression/i.test(detail);

  if (vRun?.status === "active") {
    const check = String(vRun.detail || "");
    if (/TYPECHECK/i.test(check)) {
      lines.push("Typecheck       ●");
      lines.push("Tests           —");
    } else {
      lines.push(typecheckPass ? "Typecheck       ✓" : "Typecheck       —");
      lines.push(`Tests           ●`);
    }
  } else if (vRes?.arrived) {
    if (typecheckFail) {
      lines.push("Typecheck       ✕");
    } else if (typecheckPass || /TYPECHECK/i.test(detail)) {
      lines.push("Typecheck       ✓");
    } else if (vPlan?.arrived) {
      lines.push("Typecheck       —");
    } else {
      lines.push("Typecheck       —");
    }
    if (testPassMatch) {
      const mark = testFail || /✕|fail/i.test(detail) ? " ✕" : " ✓";
      lines.push(`Tests          ${testPassMatch[1]}/${testPassMatch[2]}${mark}`);
    } else if (testFail || /fail|error|NOT_PASS/i.test(detail)) {
      lines.push("Tests           ✕");
    } else if (/TARGETED|test|regression|pass|ok/i.test(detail)) {
      lines.push("Tests           ✓");
    } else {
      lines.push("Tests           —");
    }
  } else {
    lines.push("Typecheck       —");
    lines.push("Tests           —");
  }

  const g2 = state.cards.gate2;
  if (g2?.arrived) {
    if (g2.status === "done" && g2.detail === "accepted") {
      lines.push("Gate 2          ✓");
    } else {
      lines.push("Gate 2          NOT ESTABLISHED");
    }
  } else if (vRun?.status === "active") {
    lines.push("Gate 2          waiting");
  } else {
    lines.push("Gate 2          —");
  }
  return lines;
}

/**
 * Glyph for PATH phase — activity vs terminal.
 * @param {string} phase
 */
function pathGlyph(phase) {
  if (phase === "Complete" || phase === "Verified") return "✓";
  if (phase === "Partially verified") return "◐";
  if (phase === "Failed" || phase === "Infrastructure failure" || phase === "Not verified") return "✕";
  if (phase === "Blocked") return "■";
  if (phase === "Cancelled" || phase === "Cancelling") return "○";
  if (phase === "Unknown" || phase === "Unconfirmed") return "○";
  return "◆";
}

/**
 * Wide living product surface: PROJECT | PATH | EVIDENCE + MACHINE + footer.
 *
 * @param {ReturnType<typeof createEmptyStudioState>} state
 * @param {{ rows: number, columns: number }} viewport
 * @returns {string[]}
 */
export function buildLivingProductLines(state, viewport) {
  const columns =
    typeof viewport.columns === "number" && viewport.columns > 0
      ? Math.floor(viewport.columns)
      : 80;
  const rows =
    typeof viewport.rows === "number" && viewport.rows > 0
      ? Math.floor(viewport.rows)
      : 24;
  const maxHeight = Math.max(10, rows - 2);
  const gap = 2;
  const colW = Math.max(12, Math.floor((columns - gap * 2) / 3));

  const product = state.product || {
    pathPhase: "Idle",
    cloudFooter: null,
    projectFiles: [],
    projectEntries: [],
    branch: null,
    dirtySummary: null,
  };

  const pathPhase = projectAuthoritativePathPhase(state);

  /** @type {string[]} */
  const projectCol = ["PROJECT", ""];
  const entries = Array.isArray(product.projectEntries)
    ? product.projectEntries
    : [];
  if (entries.length > 0) {
    for (const e of entries.slice(0, 6)) {
      projectCol.push(String(e.path));
      projectCol.push(`  ${e.role}`);
    }
  } else {
    const files = Array.isArray(product.projectFiles) ? product.projectFiles : [];
    if (files.length === 0) {
      projectCol.push(product.ag1 ? "(engineering…)" : "(awaiting scope)");
    } else {
      for (const f of files.slice(0, 6)) {
        projectCol.push(String(f));
      }
    }
  }
  projectCol.push("");
  const branch = product.branch ? String(product.branch).replace(/\s+@\s+\S+/, "") : null;
  const dirty = product.dirtySummary ? String(product.dirtySummary) : null;
  if (branch || dirty) {
    projectCol.push([branch, dirty].filter(Boolean).join(" · "));
  }

  /** @type {string[]} */
  const pathCol = ["PATH", "", `${pathGlyph(pathPhase)} ${pathPhase}`];
  if (pathPhase === "Starting workstation") {
    const region = product.region || "europe-west4";
    const sec = state.heartbeat
      ? Math.floor(state.heartbeat.elapsedMs / 1000)
      : null;
    pathCol.push(`  ${region}${sec != null ? ` · ${sec}s` : ""}`);
  } else if (pathPhase === "Hydrating" && product.pathDetail) {
    pathCol.push(`  ${product.pathDetail}`);
  } else if (pathPhase === "Applying" && product.pathDetail) {
    pathCol.push(`  ${product.pathDetail}`);
  } else if (pathPhase === "Testing" && state.cards.validationRunning?.detail) {
    pathCol.push(`  ${state.cards.validationRunning.detail}`);
  } else if (pathPhase === "Infrastructure failure" && product.infraFailure) {
    pathCol.push(`  ${String(product.infraFailure).slice(0, colW - 2)}`);
  }

  const modelId = product.modelId || null;
  const provider = product.providerLabel || (modelId ? "OpenAI" : null);
  if (provider || modelId) {
    pathCol.push("");
    pathCol.push("Provider");
    pathCol.push(`  ${[provider, modelId].filter(Boolean).join(" · ")}`);
    if (product.providerTurn) {
      const t = product.providerTurn;
      pathCol.push(`  bounded · turn ${t.call}/${t.of}`);
    }
  }

  /** @type {string[]} */
  const evidenceCol = ["EVIDENCE", "", ...buildEvidenceLines(state)];

  const height = Math.max(projectCol.length, pathCol.length, evidenceCol.length);
  /** @type {string[]} */
  const lines = [];
  for (let i = 0; i < height; i += 1) {
    const a = fitLine(projectCol[i] ?? "", colW).padEnd(colW, " ");
    const b = fitLine(pathCol[i] ?? "", colW).padEnd(colW, " ");
    const c = fitLine(evidenceCol[i] ?? "", colW);
    lines.push(fitLine(`${a}${" ".repeat(gap)}${b}${" ".repeat(gap)}${c}`, columns));
  }

  const machineLines = Array.isArray(product.machineLines)
    ? product.machineLines
    : null;
  if (machineLines && machineLines.length > 0 && product.workstationReady) {
    lines.push(fitLine("─".repeat(Math.min(columns, 80)), columns));
    lines.push(fitLine("MACHINE", columns));
    for (const ml of machineLines) {
      lines.push(fitLine(ml, columns));
    }
  }

  lines.push(fitLine("─".repeat(Math.min(columns, 80)), columns));
  let footer =
    product.cloudFooter ||
    (state.heartbeat
      ? `☁ working · ${state.heartbeat.stage} · ${Math.floor(state.heartbeat.elapsedMs / 1000)}s`
      : "");
  // Keep footer coherent with authoritative PATH (no Complete + Starting).
  if (
    pathPhase === "Starting workstation" &&
    footer &&
    !/Starting/i.test(footer)
  ) {
    footer = `☁ ${product.region || "europe-west4"} · Engineering Image · Starting`;
  }
  if (pathPhase === "Infrastructure failure") {
    footer = product.disposed ? "☁ Disposed ✓" : "☁ Cleaning up…";
  }
  if (footer) {
    lines.push(fitLine(footer, columns));
  }
  return lines.slice(0, maxHeight);
}

/** Wide-TTY threshold for three-column living product surface. */
export const LIVING_PRODUCT_MIN_COLUMNS = 120;

/**
 * Build the visible card block, clamped to rows-2 (1a).
 * Non-active stages collapse to single-line summaries when needed.
 * Wide TTY (≥120 cols): three-column living product surface.
 *
 * @param {ReturnType<typeof createEmptyStudioState>} state
 * @param {{ rows: number, columns: number }} viewport
 * @returns {string[]}
 */
export function buildInlineCardLines(state, viewport) {
  const columns =
    typeof viewport.columns === "number" && viewport.columns > 0
      ? Math.floor(viewport.columns)
      : 80;
  if (columns >= LIVING_PRODUCT_MIN_COLUMNS) {
    return buildLivingProductLines(state, viewport);
  }

  const rows =
    typeof viewport.rows === "number" && viewport.rows > 0
      ? Math.floor(viewport.rows)
      : 24;
  const maxHeight = Math.max(3, rows - 2);
  const activeId = activeCardId(state);

  /** @type {string[]} */
  const header = [];
  header.push(fitLine("PATH STUDIO — live", columns));
  header.push(
    fitLine(
      state.sessionId
        ? `session: ${state.sessionId}`
        : "session: (waiting for first event)",
      columns,
    ),
  );

  /** @type {Array<{ id: string, full: string, compact: string, keepFull: boolean }>} */
  const body = [];
  for (const id of STUDIO_CARD_ORDER) {
    const card = state.cards[id];
    if (!card) continue;
    const keepFull =
      id === activeId ||
      id === "terminal" ||
      card.status === "active" ||
      card.status === "refused" ||
      (id === "validationSkipped" && card.arrived);
    body.push({
      id,
      full: formatCardLine(card, false, columns),
      compact: formatCardLine(card, true, columns),
      keepFull,
    });
  }

  /** @type {string[]} */
  const footer = [];
  if (state.heartbeat) {
    const sec = Math.floor(state.heartbeat.elapsedMs / 1000);
    footer.push(
      fitLine(`liveness: working on ${state.heartbeat.stage} — ${sec}s`, columns),
    );
  }

  const assemble = (compactNonKeep) => {
    /** @type {string[]} */
    const lines = [...header, ""];
    for (const row of body) {
      lines.push(compactNonKeep && !row.keepFull ? row.compact : row.full);
    }
    if (footer.length > 0) {
      lines.push("");
      lines.push(...footer);
    }
    return lines;
  };

  let lines = assemble(false);
  if (lines.length <= maxHeight) {
    for (const line of lines) {
      if (visibleWidth(line) > columns) {
        throw new Error("inline card line exceeded columns after fit");
      }
    }
    return lines;
  }

  // Collapse non-kept stages first.
  lines = assemble(true);
  if (lines.length <= maxHeight) return lines;

  // Drop pending (not-yet) cards from the visible block, keep arrived + active.
  const arrivedOnly = body.filter(
    (row) => state.cards[row.id]?.arrived === true || row.keepFull,
  );
  lines = [...header, ""];
  for (const row of arrivedOnly) {
    lines.push(row.keepFull ? row.full : row.compact);
  }
  if (footer.length > 0) {
    lines.push("");
    lines.push(...footer);
  }
  if (lines.length <= maxHeight) return lines;

  // Hard trim from the top of the body, preserving header + active/terminal.
  const essential = new Set(
    [activeId, "terminal"].filter((x) => typeof x === "string"),
  );
  const kept = arrivedOnly.filter((row) => essential.has(row.id) || row.keepFull);
  const optional = arrivedOnly.filter((row) => !essential.has(row.id) && !row.keepFull);
  lines = [...header, ""];
  const room = maxHeight - lines.length - footer.length - (footer.length > 0 ? 1 : 0);
  const optionalBudget = Math.max(0, room - kept.length);
  const shownOptional = optional.slice(-optionalBudget);
  for (const row of [...shownOptional, ...kept]) {
    lines.push(row.keepFull ? row.full : row.compact);
  }
  if (footer.length > 0) {
    lines.push("");
    lines.push(...footer);
  }
  while (lines.length > maxHeight) {
    // Drop from just after header blank.
    if (lines.length <= header.length + 2) break;
    lines.splice(header.length + 1, 1);
  }
  return lines.slice(0, maxHeight);
}

/**
 * Assemble one ANSI frame for in-place redraw (1c, 1g).
 *
 * Cursor ends one row below the block. Next non-reanchor redraw moves up
 * `lines.length` rows to the first card line. `\u001b[J` runs from that
 * below-block row so a shorter frame erases phantom leftovers.
 *
 * @param {string[]} lines
 * @param {{ prevHeight: number, reanchor: boolean, hideCursor: boolean }} opts
 */
export function assembleAnsiFrame(lines, opts) {
  const prevHeight = opts.prevHeight > 0 ? opts.prevHeight : 0;
  const reanchor = opts.reanchor === true;
  const hideCursor = opts.hideCursor !== false;
  /** @type {string[]} */
  const parts = [];
  if (hideCursor) parts.push(HIDE_CURSOR);
  if (!reanchor && prevHeight > 0) {
    parts.push(`\u001b[${prevHeight}A`);
  } else if (reanchor) {
    // External write may have left the cursor elsewhere; start a fresh block.
    parts.push("\n");
  }
  for (let i = 0; i < lines.length; i += 1) {
    parts.push(CR);
    parts.push(ERASE_LINE);
    parts.push(lines[i] ?? "");
    parts.push("\n");
  }
  // Cursor is now one row below the block — erase any taller prior frame (1g).
  parts.push(ERASE_BELOW);
  return parts.join("");
}

/**
 * @param {{
 *   stdout?: NodeJS.WritableStream & {
 *     isTTY?: boolean,
 *     rows?: number,
 *     columns?: number,
 *     on?: Function,
 *     off?: Function,
 *     write?: Function,
 *   },
 *   enabled?: boolean,
 *   writePlain?: (text: string) => void,
 *   decorateGate2Accepted?: boolean,
 * }} [options]
 */
export function createInlineStudioRenderer(options = {}) {
  const stdout = options.stdout ?? process.stdout;
  const enabled =
    typeof options.enabled === "boolean"
      ? options.enabled
      : stdout.isTTY === true;

  /** @type {ReturnType<typeof createEmptyStudioState>} */
  let state = createEmptyStudioState();
  let active = false;
  let prevHeight = 0;
  let needsReanchor = false;
  let cursorHidden = false;
  /** @type {((this: any) => void) | null} */
  let resizeListener = null;
  let writeCount = 0;
  /** @type {string[]} */
  const diagnostics = [];
  const frames = [];
  const decorateGate2Accepted = options.decorateGate2Accepted === true;

  function readViewport() {
    const rows =
      typeof stdout.rows === "number" && stdout.rows > 0 ? stdout.rows : 24;
    const columns =
      typeof stdout.columns === "number" && stdout.columns > 0
        ? stdout.columns
        : 80;
    return { rows, columns };
  }

  function detachResize() {
    if (resizeListener !== null && typeof stdout.off === "function") {
      try {
        stdout.off("resize", resizeListener);
      } catch {
        // best effort
      }
    }
    resizeListener = null;
  }

  function restoreCursor() {
    if (!enabled) {
      cursorHidden = false;
      return;
    }
    try {
      stdout.write(SHOW_CURSOR);
    } catch {
      // best effort
    }
    cursorHidden = false;
  }

  function emitFrame(frame) {
    writeCount += 1;
    frames.push(frame);
    stdout.write(frame);
  }

  function redraw() {
    if (!enabled || !active) return;
    const viewport = readViewport();
    const lines = buildInlineCardLines(state, viewport);
    const text = `${lines.join("\n")}\n`;
    assertNoFabricatedProgress(text);
    for (const line of lines) {
      if (visibleWidth(line) > viewport.columns) {
        throw new Error("PI-I: visible width exceeds columns");
      }
    }
    const frame = assembleAnsiFrame(lines, {
      prevHeight,
      reanchor: needsReanchor,
      hideCursor: true,
    });
    cursorHidden = true;
    emitFrame(frame);
    prevHeight = lines.length;
    needsReanchor = false;
  }

  function begin() {
    // Tear down any prior cycle handles before arming a new one (R2-K / 1e / 1f).
    detachResize();
    if (cursorHidden) restoreCursor();
    state = createEmptyStudioState();
    active = true;
    prevHeight = 0;
    needsReanchor = false;
    writeCount = 0;
    frames.length = 0;
    if (enabled && typeof stdout.on === "function") {
      resizeListener = () => {
        if (active) redraw();
      };
      stdout.on("resize", resizeListener);
    }
  }

  /**
   * End the card cycle: detach resize, restore cursor, leave final cards on screen.
   * Safe on every terminal path (completion / refusal / escalation / error / SIGINT).
   */
  function finish() {
    detachResize();
    if (cursorHidden) {
      restoreCursor();
    }
    active = false;
    prevHeight = 0;
    needsReanchor = false;
  }

  /**
   * @param {Record<string, unknown>} event
   */
  function onEvent(event) {
    if (!active) {
      // Auto-begin on first event if the host forgot begin() — still tears down.
      begin();
    }
    applyStudioEvent(state, event, { decorateGate2Accepted });

    if (!enabled) {
      // Non-TTY: plain sequential progress lines (no ANSI cursor codes).
      const plain = renderSessionEventHuman(event);
      if (!plain) return;
      if (typeof options.writePlain === "function") {
        options.writePlain(plain);
      } else {
        writeCount += 1;
        frames.push(plain);
        stdout.write(plain);
      }
      return;
    }

    redraw();
  }

  function noteExternalWrite() {
    if (!active || !enabled) return;
    // Collision guard (1d): next redraw re-anchors instead of cursor-up.
    needsReanchor = true;
    prevHeight = 0;
    if (cursorHidden) {
      restoreCursor();
    }
  }

  function noteDiagnostic(text) {
    diagnostics.push(String(text ?? ""));
  }

  function isActive() {
    return active;
  }

  function getState() {
    return state;
  }

  /** Test / proof introspection. */
  function stats() {
    return {
      enabled,
      active,
      prevHeight,
      needsReanchor,
      cursorHidden,
      writeCount,
      frames: frames.slice(),
      diagnostics: diagnostics.slice(),
      hasResizeListener: resizeListener !== null,
    };
  }

  return {
    enabled,
    begin,
    onEvent,
    noteExternalWrite,
    noteDiagnostic,
    finish,
    dispose: () => finish(),
    isActive,
    getState,
    stats,
    // Exported for SIGINT / cycle cleanup parity with finish.
    restoreCursor,
    detachResize,
  };
}

/**
 * Wrap a prompt.write so external session output does not tear the living frame.
 * Interactive challenge prompts still surface; diagnostic dumps are suppressed
 * while the renderer owns the TTY and routed into a diagnostic buffer.
 *
 * @param {{ write: (text: string) => void }} prompt
 * @param {ReturnType<typeof createInlineStudioRenderer>} renderer
 */
export function installCollisionGuard(prompt, renderer) {
  const original = prompt.write.bind(prompt);
  /** @type {string[]} */
  const diagnostics = [];
  prompt.write = (text) => {
    const raw = String(text ?? "");
    if (renderer.isActive() && renderer.enabled) {
      const interactive =
        /Approve THIS|typing exactly:|Your task:|ESCAPE_LEGEND|APPLY |CHECK |SCOPE |RESTORE |\/recover|Goodbye|Usage:|Model set|PATH ●|Path Code >/i.test(
          raw,
        );
      if (!interactive) {
        diagnostics.push(raw);
        if (typeof renderer.noteDiagnostic === "function") {
          renderer.noteDiagnostic(raw);
        }
        return;
      }
      renderer.noteExternalWrite();
    }
    return original(text);
  };
  return () => {
    prompt.write = original;
    return diagnostics;
  };
}
