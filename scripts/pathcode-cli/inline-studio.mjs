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
const ENTER_ALT = "\u001b[?1049h";
const EXIT_ALT = "\u001b[?1049l";
const HOME = "\u001b[H";
const RESET_GRAPHICS = "\u001b[0m";
const CR = "\r";
const MAX_FPS = 24;
const FRAME_MIN_MS = Math.floor(1000 / MAX_FPS);

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
 * Escape untrusted fragments (paths, tool summaries, commands) BEFORE styling.
 * Trusted SGR from paint()/style.* must never pass through this.
 * @param {unknown} text
 */
export function safeDisplay(text) {
  return escapeForTerminalDisplay(typeof text === "string" ? text : String(text ?? ""))
    .replace(/\r?\n/g, " ");
}

/**
 * Fit a rendered line for the TTY by visible width.
 *
 * CRITICAL: do not run escapeForTerminalDisplay here. paint()/style.* already
 * inject real ESC (0x1b) SGR bytes; escaping them produced literal "\\u001b"
 * on the operator Terminal. Untrusted payloads must be safeDisplay()'d first.
 *
 * @param {string} text
 * @param {number} columns
 */
export function fitLine(text, columns) {
  const cols =
    typeof columns === "number" && columns > 0 ? Math.floor(columns) : 80;
  const flattened = String(text ?? "").replace(/\r?\n/g, " ");
  return truncateVisible(flattened, cols);
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
    return fitLine(`${mark} ${safeDisplay(card.title)}`, columns);
  }
  return fitLine(
    `${mark} ${safeDisplay(card.title)}: ${safeDisplay(card.detail)}`,
    columns,
  );
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
    if (product.ag1Mutation) {
      lines.push("Mutation        ✓");
    } else if (state.cards.applying?.status === "active") {
      lines.push("Mutation        ●");
    } else {
      lines.push("Mutation        —");
    }

    // Provisional engine-time feedback — never pretend this is final validation.
    if (
      product.engineCheckFeedback === "running" &&
      product.finalValidationStarted !== true
    ) {
      lines.push("Eng. tests      ●");
    } else if (
      product.engineCheckFeedback &&
      product.finalValidationStarted !== true
    ) {
      lines.push(`Eng. tests      ${safeDisplay(product.engineCheckFeedback)}`);
    }

    const checks = Array.isArray(product.ag1Checks) ? product.ag1Checks : [];
    if (product.finalValidationStarted === true) {
      if (
        state.cards.validationRunning?.status === "active" &&
        checks.length === 0
      ) {
        lines.push("Final validate  ●");
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
        if (product.finalValidationComplete === true) {
          lines.push("Final validate  ✓");
        }
      } else if (state.cards.validationResult?.arrived) {
        const detail = state.cards.validationResult.detail || "";
        if (/fail|FAILED/i.test(detail)) lines.push("Final validate  ✕");
        else if (/PASSED|pass/i.test(detail)) lines.push("Final validate  ✓");
        else lines.push("Final validate  —");
      } else {
        lines.push("Final validate  ●");
      }
    } else {
      lines.push("Final validate  —");
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
    const delivery = product.deliveryResult;
    if (delivery?.remoteBranchOk) lines.push("Remote branch  ✓");
    if (delivery?.prOk) lines.push("Pull request   ✓");
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
  if (phase === "Complete" || phase === "Verified" || phase === "Pull request created")
    return "✓";
  if (phase === "Partially verified") return "◐";
  if (
    phase === "Failed" ||
    phase === "Infrastructure failure" ||
    phase === "Not verified" ||
    /_FAILED|_CONFLICT|_MISMATCH|_NOT_AUTHORIZED|_REQUIRED|_AMBIGUOUS|_CHANGED/i.test(
      phase,
    )
  )
    return "✕";
  if (phase === "Blocked") return "■";
  if (phase === "Cancelled" || phase === "Cancelling") return "○";
  if (phase === "Unknown" || phase === "Unconfirmed") return "○";
  return "◆";
}

/** @returns {boolean} */
function colorEnabled() {
  if (process.env.NO_COLOR != null && process.env.NO_COLOR !== "") return false;
  if (process.env.FORCE_COLOR === "0") return false;
  return true;
}

/**
 * @param {string} text
 * @param {string} code
 */
function paint(text, code) {
  if (!colorEnabled() || !text) return text;
  return `\u001b[${code}m${text}\u001b[0m`;
}

const style = {
  dim: (t) => paint(t, "2"),
  bold: (t) => paint(t, "1"),
  cyan: (t) => paint(t, "36"),
  green: (t) => paint(t, "32"),
  red: (t) => paint(t, "31"),
  yellow: (t) => paint(t, "33"),
  white: (t) => paint(t, "37"),
};

/**
 * @param {string} text
 * @param {number} width
 */
function padVisible(text, width) {
  const w = visibleWidth(text);
  if (w >= width) return truncateVisible(text, width);
  return `${text}${" ".repeat(width - w)}`;
}

/**
 * Wide living product surface: PROJECT | PATH | EVIDENCE.
 * Visual north star: framed cockpit, calm hierarchy, dense but anchored.
 * Truth rules unchanged — real events only; no provider branding on AG1.
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
  const inner = Math.max(24, columns - 2);
  const gap = 1;
  // Layout: [col][gap][│][gap][col][gap][│][gap][col]  == inner
  const fixed = gap * 4 + 2;
  const colW = Math.max(10, Math.floor((inner - fixed) / 3));
  const colWR = Math.max(colW, inner - fixed - colW * 2);

  const product = state.product || {
    pathPhase: "Idle",
    cloudFooter: null,
    projectFiles: [],
    projectEntries: [],
    branch: null,
    dirtySummary: null,
  };

  const pathPhase = projectAuthoritativePathPhase(state);
  const isAg1 = product.ag1 === true;

  const branchRaw = product.branch
    ? String(product.branch).replace(/\s+@\s+\S+/, "")
    : null;
  const dirty = product.dirtySummary ? String(product.dirtySummary) : null;
  const projectName =
    typeof product.projectName === "string" && product.projectName
      ? product.projectName
      : null;

  /** @type {string[]} */
  const projectCol = [style.bold(style.cyan("PROJECT")), ""];
  if (projectName) {
    projectCol.push(style.white(safeDisplay(projectName)));
    projectCol.push("");
  }
  const primaryBranch =
    typeof product.primaryBranch === "string" && product.primaryBranch
      ? product.primaryBranch
      : branchRaw;
  const taskBranch =
    typeof product.taskBranch === "string" && product.taskBranch
      ? product.taskBranch
      : null;
  if (primaryBranch || taskBranch) {
    projectCol.push(style.dim("Branches"));
    if (primaryBranch) {
      projectCol.push(style.green(`  primary  ${safeDisplay(primaryBranch)}`));
    }
    if (taskBranch) {
      projectCol.push(style.cyan(`  task     ${safeDisplay(taskBranch)}`));
    } else if (isAg1) {
      projectCol.push(style.dim("  task     (creating…)"));
    }
    if (dirty && !/clean/i.test(String(dirty))) {
      projectCol.push(style.yellow(`  ${safeDisplay(dirty)}`));
    } else if (dirty) {
      projectCol.push(style.dim(`  ${safeDisplay(dirty)}`));
    }
    projectCol.push("");
  }

  const entries = Array.isArray(product.projectEntries)
    ? product.projectEntries
    : [];
  const totalFiles =
    typeof product.changedFileTotal === "number" && product.changedFileTotal > 0
      ? product.changedFileTotal
      : entries.length || (product.projectFiles?.length ?? 0);
  const showEntries = entries.slice(0, 5);
  if (showEntries.length > 0) {
    projectCol.push(style.dim("Activity"));
    for (const e of showEntries) {
      projectCol.push(style.white(`  ${safeDisplay(e.path)}`));
      const role =
        typeof e.role === "string" && e.role.trim() ? e.role.trim() : "modified";
      projectCol.push(style.dim(`    ${safeDisplay(role)}`));
    }
    if (totalFiles > showEntries.length) {
      projectCol.push(
        style.dim(
          `  ${showEntries.length} of ${totalFiles} changed files shown`,
        ),
      );
    } else if (totalFiles > 0) {
      projectCol.push(
        style.dim(
          `  ${totalFiles} file${totalFiles === 1 ? "" : "s"} changed`,
        ),
      );
    }
  } else {
    const files = Array.isArray(product.projectFiles) ? product.projectFiles : [];
    if (files.length === 0) {
      projectCol.push(style.dim(isAg1 ? "(engineering…)" : "(awaiting scope)"));
    } else {
      projectCol.push(style.dim("Files"));
      for (const f of files.slice(0, 5)) {
        projectCol.push(style.white(`  ${safeDisplay(f)}`));
      }
      if (files.length > 5) {
        projectCol.push(style.dim(`  5 of ${files.length} shown`));
      }
    }
  }

  /** @type {string[]} */
  const pathCol = [style.bold(style.cyan("PATH")), ""];
  const phaseMark = pathGlyph(pathPhase);
  const phaseLine =
    phaseMark === "✓"
      ? style.green(`${phaseMark} ${safeDisplay(pathPhase)}`)
      : phaseMark === "✕"
        ? style.red(`${phaseMark} ${safeDisplay(pathPhase)}`)
        : phaseMark === "◐"
          ? style.yellow(`${phaseMark} ${safeDisplay(pathPhase)}`)
          : style.cyan(`${phaseMark} ${safeDisplay(pathPhase)}`);
  pathCol.push(phaseLine);

  if (isAg1) {
    const currentDetail =
      typeof product.currentDetail === "string" && product.currentDetail
        ? product.currentDetail
        : null;
    if (
      currentDetail &&
      !/^google|gemini|antigravity|vertex|pid=|python=/i.test(String(currentDetail))
    ) {
      pathCol.push(
        style.dim(`  ${safeDisplay(String(currentDetail)).slice(0, colW - 2)}`),
      );
    }
    const ops = Array.isArray(product.recentOps) ? product.recentOps : [];
    const trail =
      ops.length > 0
        ? ops.slice(-5)
        : (Array.isArray(product.ag1Activities) ? product.ag1Activities : [])
            .slice(-5)
            .map((label) => ({ label, detail: "" }));
    if (trail.length > 0) {
      pathCol.push("");
      pathCol.push(style.dim("Recent"));
      for (const item of trail) {
        const label = typeof item === "string" ? item : item.label;
        const detail = typeof item === "string" ? "" : item.detail || "";
        const current = label === pathPhase;
        const line = detail ? `${label} · ${detail}` : label;
        pathCol.push(
          current
            ? style.cyan(
                `  ◆ ${safeDisplay(String(line)).slice(0, colW - 4)}`,
              )
            : style.dim(
                `  · ${safeDisplay(String(line)).slice(0, colW - 4)}`,
              ),
        );
      }
    }
    const history = Array.isArray(product.sessionHistory)
      ? product.sessionHistory.slice(-4)
      : [];
    if (history.length > 0 && state.cards.terminal?.arrived) {
      pathCol.push("");
      pathCol.push(style.dim("Session"));
      for (const h of history) {
        const mark =
          h.classification === "VERIFIED"
            ? "✓"
            : h.classification === "PARTIALLY_VERIFIED"
              ? "◐"
              : h.classification === "CANCELLED"
                ? "○"
                : "✕";
        const color =
          mark === "✓"
            ? style.green
            : mark === "✕"
              ? style.red
              : mark === "◐"
                ? style.yellow
                : style.dim;
        pathCol.push(
          color(
            `  ${mark} ${safeDisplay(h.preview || "task").slice(0, colW - 4)}`,
          ),
        );
      }
    }
    const approval = product.deliveryApproval;
    if (approval && pathPhase === "Awaiting publication approval") {
      pathCol.push("");
      pathCol.push(style.dim("Remote"));
      pathCol.push(`  ${safeDisplay(approval.remote || "").slice(0, colW - 2)}`);
      pathCol.push(style.dim("Base"));
      pathCol.push(
        `  ${safeDisplay(approval.baseBranch || "").slice(0, colW - 2)}`,
      );
      pathCol.push(style.dim("Action"));
      pathCol.push(
        `  Push ${safeDisplay(approval.taskBranch || "").slice(0, Math.max(8, colW - 10))} and create PR`,
      );
      pathCol.push("");
      pathCol.push("Publish verified work to GitHub");
      pathCol.push("and create a pull request? [y/N]");
    }
  } else {
    if (pathPhase === "Starting workstation") {
      const region = product.region || "europe-west4";
      const sec = state.heartbeat
        ? Math.floor(state.heartbeat.elapsedMs / 1000)
        : null;
      pathCol.push(style.dim(`  ${safeDisplay(region)}${sec != null ? ` · ${sec}s` : ""}`));
    } else if (pathPhase === "Hydrating" && product.pathDetail) {
      pathCol.push(style.dim(`  ${safeDisplay(product.pathDetail)}`));
    } else if (pathPhase === "Applying" && product.pathDetail) {
      pathCol.push(style.dim(`  ${safeDisplay(product.pathDetail)}`));
    } else if (pathPhase === "Testing" && state.cards.validationRunning?.detail) {
      pathCol.push(
        style.dim(`  ${safeDisplay(state.cards.validationRunning.detail)}`),
      );
    } else if (pathPhase === "Infrastructure failure" && product.infraFailure) {
      pathCol.push(
        style.red(`  ${safeDisplay(String(product.infraFailure)).slice(0, colW - 2)}`),
      );
    }

    const modelId = product.modelId || null;
    const provider = product.providerLabel || (modelId ? "OpenAI" : null);
    if (provider || modelId) {
      pathCol.push("");
      pathCol.push(style.dim("Provider"));
      pathCol.push(
        `  ${safeDisplay([provider, modelId].filter(Boolean).join(" · "))}`,
      );
      if (product.providerTurn) {
        const t = product.providerTurn;
        pathCol.push(style.dim(`  bounded · turn ${t.call}/${t.of}`));
      }
    }
  }

  /** @type {string[]} */
  const evidenceCol = [
    style.bold(style.cyan("EVIDENCE")),
    "",
    ...buildEvidenceLines(state).map((line) => {
      if (/\s✓\s*$/.test(line) || /\s✓$/.test(line)) return style.green(line);
      if (/\s✕\s*$/.test(line) || /\s✕$/.test(line)) return style.red(line);
      if (/\s●\s*$/.test(line) || /\s●$/.test(line)) return style.yellow(line);
      if (/—\s*$/.test(line)) return style.dim(line);
      return line;
    }),
  ];

  const height = Math.max(projectCol.length, pathCol.length, evidenceCol.length, 6);
  /** @type {string[]} */
  const bodyRows = [];
  for (let i = 0; i < height; i += 1) {
    const a = padVisible(fitLine(` ${projectCol[i] ?? ""}`, colW), colW);
    const b = padVisible(fitLine(` ${pathCol[i] ?? ""}`, colW), colW);
    const c = padVisible(fitLine(` ${evidenceCol[i] ?? ""}`, colWR), colWR);
    const row = `${a}${" ".repeat(gap)}${style.dim("│")}${" ".repeat(gap)}${b}${" ".repeat(gap)}${style.dim("│")}${" ".repeat(gap)}${c}`;
    bodyRows.push(padVisible(row, inner));
  }

  const headerLeft = style.bold(style.cyan("PATH ● Code"));
  const headerRightParts = [];
  if (projectName) headerRightParts.push(projectName);
  if (branchRaw) headerRightParts.push(branchRaw);
  if (dirty) headerRightParts.push(dirty);
  const headerRight = style.dim(headerRightParts.join(" · "));
  const headerGap = Math.max(
    1,
    inner - visibleWidth(headerLeft) - visibleWidth(headerRight) - 2,
  );
  const headerInner = ` ${headerLeft}${" ".repeat(headerGap)}${headerRight} `;

  /** @type {string[]} */
  const lines = [];
  lines.push(fitLine(`╭${"─".repeat(inner)}╮`, columns));
  lines.push(fitLine(`│${padVisible(headerInner.trimEnd(), inner)}│`, columns));
  // Three-column divider aligned to body gutters.
  const leftSeg = colW + gap;
  const midSeg = colW + gap;
  const rightSeg = Math.max(0, inner - leftSeg - midSeg - 2);
  lines.push(
    fitLine(
      `├${"─".repeat(leftSeg)}${style.dim("┬")}${"─".repeat(midSeg)}${style.dim("┬")}${"─".repeat(rightSeg)}┤`,
      columns,
    ),
  );
  for (const row of bodyRows) {
    lines.push(fitLine(`│${row}│`, columns));
  }

  const machineLines = Array.isArray(product.machineLines)
    ? product.machineLines
    : null;
  if (machineLines && machineLines.length > 0 && product.workstationReady) {
    lines.push(fitLine(`├${"─".repeat(inner)}┤`, columns));
    lines.push(fitLine(`│${padVisible(style.bold(" MACHINE"), inner)}│`, columns));
    for (const ml of machineLines) {
      lines.push(fitLine(`│${padVisible(` ${ml}`, inner)}│`, columns));
    }
  }

  lines.push(fitLine(`├${"─".repeat(inner)}┤`, columns));

  // In-cockpit RESULT (session-long): never dump a separate scrollback report.
  if (isAg1 && state.cards.terminal?.arrived) {
    lines.push(
      fitLine(`│${padVisible(` ${style.bold(style.cyan("RESULT"))}`, inner)}│`, columns),
    );
    const branch =
      typeof product.taskBranch === "string" ? product.taskBranch : "";
    const sha =
      typeof product.resultSha === "string" ? product.resultSha.slice(0, 12) : "";
    const classLabel = String(pathPhase || "Not verified");
    const headBits = [branch, sha].filter(Boolean).join(" · ");
    if (headBits) {
      lines.push(
        fitLine(
          `│${padVisible(` ${style.dim(safeDisplay(headBits))}`, inner)}│`,
          columns,
        ),
      );
    }
    const fileN =
      typeof product.changedFileTotal === "number"
        ? product.changedFileTotal
        : Array.isArray(product.projectFiles)
          ? product.projectFiles.length
          : 0;
    const resultTone =
      pathPhase === "Verified"
        ? style.green
        : pathPhase === "Failed" || pathPhase === "Not verified"
          ? style.red
          : pathPhase === "Partially verified"
            ? style.yellow
            : style.dim;
    lines.push(
      fitLine(
        `│${padVisible(
          ` ${resultTone(`${fileN} file${fileN === 1 ? "" : "s"} changed · ${safeDisplay(classLabel)}`)}`,
          inner,
        )}│`,
        columns,
      ),
    );
    const preview = Array.isArray(product.diffPreviewLines)
      ? product.diffPreviewLines.filter((l) => typeof l === "string").slice(0, 8)
      : [];
    if (preview.length > 0) {
      lines.push(fitLine(`│${padVisible(` ${style.dim("Diff preview")}`, inner)}│`, columns));
      for (const pl of preview) {
        const tone = pl.startsWith("+")
          ? style.green
          : pl.startsWith("-")
            ? style.red
            : style.dim;
        lines.push(
          fitLine(
            `│${padVisible(` ${tone(safeDisplay(pl).slice(0, Math.max(12, inner - 4)))}`, inner)}│`,
            columns,
          ),
        );
      }
      if (product.diffPreviewTruncated) {
        lines.push(
          fitLine(`│${padVisible(` ${style.dim("… truncated")}`, inner)}│`, columns),
        );
      }
    } else if (
      typeof product.inspectCommand === "string" &&
      product.inspectCommand
    ) {
      lines.push(
        fitLine(
          `│${padVisible(` ${style.dim(safeDisplay(product.inspectCommand))}`, inner)}│`,
          columns,
        ),
      );
    }
    lines.push(fitLine(`├${"─".repeat(inner)}┤`, columns));
  }

  let footer =
    product.cloudFooter ||
    (state.heartbeat
      ? `☁ working · ${state.heartbeat.stage} · ${Math.floor(state.heartbeat.elapsedMs / 1000)}s`
      : "");
  if (isAg1) {
    const sec = state.heartbeat
      ? Math.floor(state.heartbeat.elapsedMs / 1000)
      : null;
    const mm = sec != null ? String(Math.floor(sec / 60)).padStart(2, "0") : null;
    const ss = sec != null ? String(sec % 60).padStart(2, "0") : null;
    if (product.awaitingInput === true && typeof product.cockpitPrompt === "string") {
      footer = product.cockpitPrompt;
    } else if (!state.cards.terminal?.arrived) {
      footer =
        sec != null
          ? `PATH Engineering Session · ${mm}:${ss}`
          : "PATH Engineering Session";
    } else {
      footer =
        typeof product.cockpitPrompt === "string" && product.cockpitPrompt
          ? product.cockpitPrompt
          : "PATH ● Code > ";
    }
  }
  if (
    !isAg1 &&
    pathPhase === "Starting workstation" &&
    footer &&
    !/Starting/i.test(footer)
  ) {
    footer = `☁ ${product.region || "europe-west4"} · Engineering Image · Starting`;
  }
  if (!isAg1 && pathPhase === "Infrastructure failure") {
    footer = product.disposed ? "☁ Disposed ✓" : "☁ Cleaning up…";
  }
  const footerPainted =
    product.awaitingInput === true
      ? style.cyan(safeDisplay(footer || ""))
      : style.dim(safeDisplay(footer || ""));
  lines.push(fitLine(`│${padVisible(` ${footerPainted}`, inner)}│`, columns));
  lines.push(fitLine(`╰${"─".repeat(inner)}╯`, columns));
  return lines.slice(0, maxHeight);
}

/**
 * Narrow/mid AG1 stacked cockpit — same truth model, denser vertical hierarchy.
 *
 * @param {ReturnType<typeof createEmptyStudioState>} state
 * @param {{ rows: number, columns: number }} viewport
 * @returns {string[]}
 */
export function buildCompactAg1Lines(state, viewport) {
  const columns =
    typeof viewport.columns === "number" && viewport.columns > 0
      ? Math.floor(viewport.columns)
      : 80;
  const rows =
    typeof viewport.rows === "number" && viewport.rows > 0
      ? Math.floor(viewport.rows)
      : 24;
  const maxHeight = Math.max(8, rows - 2);
  const inner = Math.max(20, columns - 2);
  const product = state.product || {};
  const pathPhase = projectAuthoritativePathPhase(state);
  const branch = product.branch
    ? String(product.branch).replace(/\s+@\s+\S+/, "")
    : null;
  const dirty = product.dirtySummary ? String(product.dirtySummary) : null;
  const projectName =
    typeof product.projectName === "string" ? product.projectName : null;

  /** @type {string[]} */
  const lines = [];
  lines.push(fitLine(`╭${"─".repeat(inner)}╮`, columns));
  const head = [
    style.bold(style.cyan("PATH ● Code")),
    style.dim([projectName, branch, dirty].filter(Boolean).join(" · ")),
  ]
    .filter((p) => visibleWidth(p) > 0)
    .join("  ");
  lines.push(fitLine(`│${padVisible(` ${head}`, inner)}│`, columns));
  lines.push(fitLine(`├${"─".repeat(inner)}┤`, columns));

  lines.push(fitLine(`│${padVisible(` ${style.bold(style.cyan("PROJECT"))}`, inner)}│`, columns));
  const primary =
    typeof product.primaryBranch === "string" ? product.primaryBranch : branch;
  const task =
    typeof product.taskBranch === "string" ? product.taskBranch : null;
  if (primary) {
    lines.push(
      fitLine(
        `│${padVisible(style.dim(`  primary  ${safeDisplay(primary)}`), inner)}│`,
        columns,
      ),
    );
  }
  if (task) {
    lines.push(
      fitLine(
        `│${padVisible(style.cyan(`  task     ${safeDisplay(task)}`), inner)}│`,
        columns,
      ),
    );
  }
  const entries = Array.isArray(product.projectEntries) ? product.projectEntries : [];
  const totalFiles =
    typeof product.changedFileTotal === "number" && product.changedFileTotal > 0
      ? product.changedFileTotal
      : entries.length;
  if (entries.length === 0) {
    lines.push(fitLine(`│${padVisible(style.dim("  (engineering…)"), inner)}│`, columns));
  } else {
    for (const e of entries.slice(0, 5)) {
      lines.push(
        fitLine(
          `│${padVisible(`  ${safeDisplay(e.path)}`, inner)}│`,
          columns,
        ),
      );
      if (e.role) {
        lines.push(
          fitLine(
            `│${padVisible(style.dim(`    ${safeDisplay(e.role)}`), inner)}│`,
            columns,
          ),
        );
      }
    }
    if (totalFiles > 5) {
      lines.push(
        fitLine(
          `│${padVisible(style.dim(`  5 of ${totalFiles} changed files shown`), inner)}│`,
          columns,
        ),
      );
    }
  }

  lines.push(fitLine(`├${"─".repeat(inner)}┤`, columns));
  lines.push(fitLine(`│${padVisible(` ${style.bold(style.cyan("PATH"))}`, inner)}│`, columns));
  const mark = pathGlyph(pathPhase);
  const phasePaint =
    mark === "✓"
      ? style.green
      : mark === "✕"
        ? style.red
        : mark === "◐"
          ? style.yellow
          : style.cyan;
  lines.push(
    fitLine(
      `│${padVisible(`  ${phasePaint(`${mark} ${safeDisplay(pathPhase)}`)}`, inner)}│`,
      columns,
    ),
  );
  if (typeof product.currentDetail === "string" && product.currentDetail) {
    lines.push(
      fitLine(
        `│${padVisible(style.dim(`  ${safeDisplay(product.currentDetail).slice(0, Math.max(12, inner - 4))}`), inner)}│`,
        columns,
      ),
    );
  }
  const ops = Array.isArray(product.recentOps)
    ? product.recentOps.slice(-4)
    : (Array.isArray(product.ag1Activities) ? product.ag1Activities.slice(-4) : []).map(
        (label) => ({ label, detail: "" }),
      );
  for (const item of ops) {
    const label = item.label || String(item);
    const detail = item.detail ? ` · ${item.detail}` : "";
    lines.push(
      fitLine(
        `│${padVisible(style.dim(`  · ${safeDisplay(`${label}${detail}`).slice(0, Math.max(12, inner - 4))}`), inner)}│`,
        columns,
      ),
    );
  }

  lines.push(fitLine(`├${"─".repeat(inner)}┤`, columns));
  lines.push(fitLine(`│${padVisible(` ${style.bold(style.cyan("EVIDENCE"))}`, inner)}│`, columns));
  for (const ev of buildEvidenceLines(state).slice(0, 8)) {
    const painted = /\s✓\s*$/.test(ev)
      ? style.green(ev)
      : /\s✕\s*$/.test(ev)
        ? style.red(ev)
        : /\s●\s*$/.test(ev)
          ? style.yellow(ev)
          : style.dim(ev);
    lines.push(fitLine(`│${padVisible(`  ${painted}`, inner)}│`, columns));
  }

  if (state.cards.terminal?.arrived) {
    lines.push(fitLine(`├${"─".repeat(inner)}┤`, columns));
    lines.push(
      fitLine(`│${padVisible(` ${style.bold(style.cyan("RESULT"))}`, inner)}│`, columns),
    );
    const bits = [
      typeof product.taskBranch === "string" ? product.taskBranch : null,
      typeof product.resultSha === "string" ? product.resultSha.slice(0, 12) : null,
    ]
      .filter(Boolean)
      .join(" · ");
    if (bits) {
      lines.push(
        fitLine(`│${padVisible(` ${style.dim(safeDisplay(bits))}`, inner)}│`, columns),
      );
    }
    const preview = Array.isArray(product.diffPreviewLines)
      ? product.diffPreviewLines.slice(0, 5)
      : [];
    for (const pl of preview) {
      const tone = String(pl).startsWith("+")
        ? style.green
        : String(pl).startsWith("-")
          ? style.red
          : style.dim;
      lines.push(
        fitLine(
          `│${padVisible(` ${tone(safeDisplay(pl).slice(0, Math.max(12, inner - 4)))}`, inner)}│`,
          columns,
        ),
      );
    }
    if (
      preview.length === 0 &&
      typeof product.inspectCommand === "string" &&
      product.inspectCommand
    ) {
      lines.push(
        fitLine(
          `│${padVisible(` ${style.dim(safeDisplay(product.inspectCommand))}`, inner)}│`,
          columns,
        ),
      );
    }
  }

  lines.push(fitLine(`├${"─".repeat(inner)}┤`, columns));
  const sec = state.heartbeat
    ? Math.floor(state.heartbeat.elapsedMs / 1000)
    : null;
  let footer =
    sec != null
      ? `PATH Engineering Session · ${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`
      : "PATH Engineering Session";
  if (product.awaitingInput === true && typeof product.cockpitPrompt === "string") {
    footer = product.cockpitPrompt;
  } else if (state.cards.terminal?.arrived) {
    footer =
      typeof product.cockpitPrompt === "string" && product.cockpitPrompt
        ? product.cockpitPrompt
        : "PATH ● Code > ";
  }
  const footerPainted =
    product.awaitingInput === true
      ? style.cyan(safeDisplay(footer))
      : style.dim(safeDisplay(footer));
  lines.push(fitLine(`│${padVisible(` ${footerPainted}`, inner)}│`, columns));
  lines.push(fitLine(`╰${"─".repeat(inner)}╯`, columns));
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

  // Mid-width / narrow: stacked framed layout for AG1 (any width below wide).
  // Below 72 columns still uses the compact cockpit — never legacy card dump for AG1.
  if (state.product?.ag1 === true) {
    return buildCompactAg1Lines(state, viewport);
  }

  const rows =
    typeof viewport.rows === "number" && viewport.rows > 0
      ? Math.floor(viewport.rows)
      : 24;
  const maxHeight = Math.max(3, rows - 2);
  const activeId = activeCardId(state);

  /** @type {string[]} */
  const header = [];
  header.push(fitLine(style.bold(style.cyan("PATH ● Code")), columns));
  header.push(
    fitLine(
      state.sessionId
        ? style.dim(`session: ${state.sessionId}`)
        : style.dim("session: (waiting for first event)"),
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
 * Assemble a line-diff frame for the managed alternate-screen surface.
 * Positions only changed rows; never console.clear().
 *
 * @param {string[]} lines
 * @param {string[]} prevLines
 * @param {{ columns: number, forceFull?: boolean }} opts
 */
export function assembleAltScreenDiff(lines, prevLines, opts) {
  const columns =
    typeof opts.columns === "number" && opts.columns > 0
      ? Math.floor(opts.columns)
      : 80;
  const forceFull = opts.forceFull === true;
  /** @type {string[]} */
  const parts = [HIDE_CURSOR];
  if (forceFull || !prevLines || prevLines.length === 0) {
    parts.push(HOME);
    for (let i = 0; i < lines.length; i += 1) {
      parts.push(CR, ERASE_LINE, lines[i] ?? "", "\n");
    }
    parts.push(ERASE_BELOW);
    return parts.join("");
  }
  const max = Math.max(lines.length, prevLines.length);
  for (let i = 0; i < max; i += 1) {
    const next = lines[i];
    const prev = prevLines[i];
    if (next === undefined) {
      // Erase leftover taller frame rows.
      parts.push(`\u001b[${i + 1};1H`, ERASE_LINE);
      continue;
    }
    if (prev !== next) {
      parts.push(`\u001b[${i + 1};1H`, ERASE_LINE, fitLine(next, columns));
    }
  }
  if (lines.length < prevLines.length) {
    parts.push(`\u001b[${lines.length + 1};1H`, ERASE_BELOW);
  }
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
 *   alternateScreen?: boolean,
 * }} [options]
 */
export function createInlineStudioRenderer(options = {}) {
  const stdout = options.stdout ?? process.stdout;
  const enabled =
    typeof options.enabled === "boolean"
      ? options.enabled
      : stdout.isTTY === true;
  const useAltScreen = options.alternateScreen === true && enabled === true;

  /** @type {ReturnType<typeof createEmptyStudioState>} */
  let state = createEmptyStudioState();
  let active = false;
  let sessionOwned = false;
  let prevHeight = 0;
  let needsReanchor = false;
  let cursorHidden = false;
  let altScreenActive = false;
  /** @type {string[]} */
  let prevLines = [];
  /** @type {((this: any) => void) | null} */
  let resizeListener = null;
  let writeCount = 0;
  /** @type {string[]} */
  const diagnostics = [];
  const frames = [];
  const decorateGate2Accepted = options.decorateGate2Accepted === true;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let pendingTimer = null;
  let lastFrameAt = 0;
  let dirty = false;
  let forceFull = false;

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

  function clearPending() {
    if (pendingTimer !== null) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }
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

  function exitAltScreen() {
    if (!altScreenActive) return;
    try {
      stdout.write(`${SHOW_CURSOR}${EXIT_ALT}${RESET_GRAPHICS}`);
    } catch {
      // best effort
    }
    altScreenActive = false;
    cursorHidden = false;
  }

  /**
   * Idempotent full restore for this renderer instance.
   */
  function restoreTerminalState() {
    clearPending();
    detachResize();
    exitAltScreen();
    if (cursorHidden) restoreCursor();
    prevLines = [];
    prevHeight = 0;
    active = false;
    dirty = false;
  }

  function emitFrame(frame) {
    writeCount += 1;
    frames.push(frame);
    stdout.write(frame);
  }

  function paintNow() {
    if (!enabled || !active) return;
    dirty = false;
    const viewport = readViewport();
    const lines = buildInlineCardLines(state, viewport);
    const text = `${lines.join("\n")}\n`;
    assertNoFabricatedProgress(text);
    for (const line of lines) {
      if (visibleWidth(line) > viewport.columns) {
        throw new Error("PI-I: visible width exceeds columns");
      }
    }

    if (useAltScreen) {
      if (!altScreenActive) {
        emitFrame(`${ENTER_ALT}${HIDE_CURSOR}${HOME}`);
        altScreenActive = true;
        cursorHidden = true;
        forceFull = true;
      }
      const frame = assembleAltScreenDiff(lines, prevLines, {
        columns: viewport.columns,
        forceFull: forceFull || needsReanchor || prevLines.length === 0,
      });
      emitFrame(frame);
      prevLines = lines.slice();
      prevHeight = lines.length;
      needsReanchor = false;
      forceFull = false;
      lastFrameAt = Date.now();
      return;
    }

    // Legacy in-place scrollback mode (tests / opt-out).
    const frame = assembleAnsiFrame(lines, {
      prevHeight,
      reanchor: needsReanchor,
      hideCursor: true,
    });
    cursorHidden = true;
    emitFrame(frame);
    prevHeight = lines.length;
    prevLines = lines.slice();
    needsReanchor = false;
    lastFrameAt = Date.now();
  }

  function scheduleFrame() {
    if (!enabled || !active) return;
    dirty = true;
    // Legacy in-place mode: paint every event immediately (existing PI proofs).
    // Alternate-screen mode: coalesce bursts to a max frame rate.
    if (!useAltScreen || lastFrameAt === 0) {
      clearPending();
      paintNow();
      return;
    }
    if (pendingTimer !== null) return;
    const elapsed = Date.now() - lastFrameAt;
    const wait = Math.max(0, FRAME_MIN_MS - elapsed);
    pendingTimer = setTimeout(() => {
      pendingTimer = null;
      if (dirty && active) paintNow();
    }, wait);
  }

  function redraw() {
    // Immediate path used by resize; still respects coalesce via schedule when bursty.
    clearPending();
    if (active && enabled) paintNow();
  }

  function begin() {
    detachResize();
    clearPending();
    // Session-long cockpit: do not tear down alt-screen between tasks.
    if (!sessionOwned) {
      restoreTerminalState();
      state = createEmptyStudioState();
    }
    active = true;
    sessionOwned = true;
    prevHeight = sessionOwned && altScreenActive ? prevHeight : 0;
    if (!altScreenActive) {
      prevLines = [];
      prevHeight = 0;
    }
    needsReanchor = false;
    forceFull = true;
    writeCount = 0;
    frames.length = 0;
    lastFrameAt = 0;
    state.product.awaitingInput = false;
    if (enabled && typeof stdout.on === "function" && resizeListener === null) {
      resizeListener = () => {
        if (!active) return;
        forceFull = true;
        needsReanchor = true;
        redraw();
      };
      stdout.on("resize", resizeListener);
    }
  }

  /**
   * Soft-reset task-scoped fields while keeping the session-long alt screen
   * and compact session history.
   */
  function startTask() {
    const keep = {
      sessionHistory: Array.isArray(state.product?.sessionHistory)
        ? state.product.sessionHistory.slice()
        : [],
      projectName: state.product?.projectName ?? null,
      branch: state.product?.branch ?? null,
      primaryBranch: state.product?.primaryBranch ?? null,
      dirtySummary: state.product?.dirtySummary ?? null,
      ag1: true,
    };
    if (!sessionOwned || !active) {
      begin();
    }
    state = createEmptyStudioState();
    state.product.sessionHistory = keep.sessionHistory;
    state.product.projectName = keep.projectName;
    state.product.branch = keep.branch;
    state.product.primaryBranch = keep.primaryBranch;
    state.product.dirtySummary = keep.dirtySummary;
    state.product.ag1 = keep.ag1;
    state.product.awaitingInput = false;
    state.product.cockpitPrompt = null;
    forceFull = true;
    dirty = true;
    try {
      stdout.write(HIDE_CURSOR);
      cursorHidden = true;
    } catch {
      // ignore
    }
    scheduleFrame();
  }

  /**
   * Show the in-cockpit idle prompt without leaving alternate screen.
   * @param {string} promptText
   */
  function setIdlePrompt(promptText) {
    if (!sessionOwned) begin();
    active = true;
    state.product.ag1 = true;
    state.product.awaitingInput = true;
    state.product.cockpitPrompt =
      typeof promptText === "string" && promptText
        ? promptText
        : "PATH ● Code > ";
    forceFull = true;
    clearPending();
    paintNow();
    // Place the live readline cursor on the cockpit prompt row. Writing the
    // prompt text (ending in "> ") also keeps scripted TTY harnesses feeding.
    try {
      const row = Math.max(1, prevLines.length || 1);
      stdout.write(`${SHOW_CURSOR}\u001b[${row};3H${state.product.cockpitPrompt}`);
      cursorHidden = false;
    } catch {
      // ignore
    }
  }

  /**
   * End the card cycle: leave alt screen, restore cursor.
   * Only for explicit PATH exit / fatal restore — not after each task.
   */
  function finish() {
    clearPending();
    if (dirty && active && enabled) {
      try {
        paintNow();
      } catch {
        // best effort final paint
      }
    }
    detachResize();
    exitAltScreen();
    if (cursorHidden) restoreCursor();
    active = false;
    sessionOwned = false;
    prevHeight = 0;
    prevLines = [];
    needsReanchor = false;
    dirty = false;
  }

  /**
   * @param {Record<string, unknown>} event
   */
  function onEvent(event) {
    if (!active) {
      begin();
    }
    applyStudioEvent(state, event, { decorateGate2Accepted });

    if (!enabled) {
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

    scheduleFrame();
  }

  function noteExternalWrite() {
    if (!active || !enabled) return;
    needsReanchor = true;
    forceFull = true;
    prevHeight = 0;
    prevLines = [];
    if (cursorHidden && !altScreenActive) {
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
      altScreenActive,
      writeCount,
      frames: frames.slice(),
      diagnostics: diagnostics.slice(),
      hasResizeListener: resizeListener !== null,
      useAltScreen,
    };
  }

  return {
    enabled,
    begin,
    startTask,
    setIdlePrompt,
    onEvent,
    noteExternalWrite,
    noteDiagnostic,
    finish,
    dispose: () => finish(),
    restoreTerminalState,
    isActive,
    getState,
    stats,
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
      // Session-long cockpit owns the TTY. Suppress scrollback dumps, including
      // durable result banners and prompt redraws that would tear the frame.
      const interactive =
        /Approve THIS|typing exactly:|Your task:|ESCAPE_LEGEND|APPLY |CHECK |SCOPE |RESTORE |\/recover|Goodbye|Usage:|Model set to|Autonomy set to|Unknown command|Internal error|checkpoint id|not a checkpoint/i.test(
          raw,
        );
      if (!interactive) {
        diagnostics.push(raw);
        if (typeof renderer.noteDiagnostic === "function") {
          renderer.noteDiagnostic(raw);
        }
        return;
      }
      // Interactive challenges briefly surface; re-anchor after.
      renderer.noteExternalWrite();
    }
    return original(text);
  };
  return () => {
    prompt.write = original;
    return diagnostics;
  };
}
