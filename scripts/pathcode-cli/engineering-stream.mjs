/**
 * Open-canvas engineering stream — dense Claude-Code-like surface.
 * No boxes. Real files, diffs, commands, environment, collaboration.
 */

import { normalizeObjectiveText } from "./normalize-text.mjs";
import {
  paintCodeLine,
  languageFromPath,
  countDiffStats,
  stripAnsiSequences,
} from "./syntax-paint.mjs";
import {
  buildEngineeringReportModel,
  formatEngineeringReportPlain,
  dispositionFromOutcome,
} from "./engineering-report.mjs";

/**
 * @param {string} text
 * @param {string} code
 */
function paint(text, code) {
  if (process.env.NO_COLOR != null && process.env.NO_COLOR !== "") return text;
  if (!text) return text;
  return `\u001b[${code}m${text}\u001b[0m`;
}

const style = {
  dim: (t) => paint(t, "2"),
  bold: (t) => paint(t, "1"),
  green: (t) => paint(t, "32"),
  red: (t) => paint(t, "31"),
  yellow: (t) => paint(t, "33"),
  white: (t) => paint(t, "37"),
  cyan: (t) => paint(t, "36"),
  blue: (t) => paint(t, "34"),
};

const NO_COLOR = () =>
  process.env.NO_COLOR != null && process.env.NO_COLOR !== "";

function bgAdd(inner) {
  if (NO_COLOR()) return inner;
  return `\u001b[48;2;18;42;24m${inner}\u001b[0m`;
}
function bgDel(inner) {
  if (NO_COLOR()) return inner;
  return `\u001b[48;2;48;20;20m${inner}\u001b[0m`;
}

/**
 * @param {unknown} text
 * @param {number} max
 */
function clip(text, max) {
  const s = String(text ?? "");
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}

/**
 * @param {string} line
 * @param {number} columns
 */
export function fitCanvasLine(line, columns) {
  const cols = Math.max(40, Math.floor(columns || 80));
  // Full CSI family — not only SGR …m — so width math never drifts and we
  // never truncate mid-sequence into residue like `38;5;180m`.
  const ansiRe =
    /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007]*(?:\u0007|\u001b\\)|\u001b#[0-9]|\u001b./g;
  const visible = line.replace(ansiRe, "");
  if (visible.length <= cols) return line;
  let out = "";
  let w = 0;
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] === "\u001b") {
      ansiRe.lastIndex = i;
      const m = ansiRe.exec(line);
      if (m && m.index === i) {
        out += m[0];
        i += m[0].length - 1;
        continue;
      }
      // Orphan ESC — drop it rather than leaking control residue.
      continue;
    }
    if (w >= cols - 1) {
      out += "…";
      break;
    }
    out += line[i];
    w += 1;
  }
  return out;
}

/**
 * @param {string} line
 */
function parseHunk(line) {
  const m = line.match(/@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/);
  if (!m) return null;
  return { old: Number(m[1]), next: Number(m[2]) };
}

/**
 * @param {string} diff
 * @param {number} maxLines
 * @param {number} columns
 * @param {string} [filePath]
 */
export function renderDiffLines(diff, maxLines, columns, filePath) {
  /** @type {string[]} */
  const out = [];
  const raw = String(diff || "");
  if (!raw.trim()) return out;
  const lang = languageFromPath(filePath || "");
  const lines = raw.split("\n");
  let shown = 0;
  let oldLn = 0;
  let newLn = 0;
  const numW = 4;

  for (const line of lines) {
    if (shown >= maxLines) {
      out.push(fitCanvasLine(style.dim("  … diff truncated"), columns));
      break;
    }
    if (
      line.startsWith("+++") ||
      line.startsWith("---") ||
      line.startsWith("diff ") ||
      line.startsWith("index ")
    ) {
      continue;
    }
    if (line.startsWith("@@")) {
      const hunk = parseHunk(line);
      if (hunk) {
        oldLn = hunk.old;
        newLn = hunk.next;
      }
      out.push(
        fitCanvasLine(style.cyan(`  ${clip(line, columns - 2)}`), columns),
      );
      shown += 1;
      continue;
    }

    const isAdd = line.startsWith("+");
    const isDel = line.startsWith("-");
    const body = stripAnsiSequences(line.length > 0 ? line.slice(1) : "");
    let leftNum = "";
    let rightNum = "";
    if (isAdd) {
      leftNum = " ".repeat(numW);
      rightNum = String(newLn).padStart(numW);
      newLn += 1;
    } else if (isDel) {
      leftNum = String(oldLn).padStart(numW);
      rightNum = " ".repeat(numW);
      oldLn += 1;
    } else {
      leftNum = String(oldLn).padStart(numW);
      rightNum = String(newLn).padStart(numW);
      oldLn += 1;
      newLn += 1;
    }
    const nums = style.dim(`${leftNum} ${rightNum}`);
    const mark = isAdd
      ? style.green("+")
      : isDel
        ? style.red("-")
        : style.dim(" ");
    const contentBudget = Math.max(20, columns - numW * 2 - 5);
    const safeBody =
      body.length > contentBudget
        ? `${body.slice(0, contentBudget - 1)}…`
        : body;
    const safePainted = paintCodeLine(safeBody, lang);
    const row = `${nums} ${mark}${safePainted}`;
    const wrapped = isAdd ? bgAdd(row) : isDel ? bgDel(row) : row;
    out.push(fitCanvasLine(wrapped, columns));
    shown += 1;
  }
  return out;
}

/**
 * @param {number} added
 * @param {number} removed
 */
export function formatDiffStat(added, removed) {
  const parts = [];
  if (added > 0)
    parts.push(style.green(`Added ${added} line${added === 1 ? "" : "s"}`));
  if (removed > 0)
    parts.push(
      style.red(`removed ${removed} line${removed === 1 ? "" : "s"}`),
    );
  if (parts.length === 0) return style.dim("No line changes");
  return parts.join(style.dim(" · "));
}

/**
 * @param {Record<string, unknown>} op
 * @param {number} columns
 */
export function renderStreamOp(op, columns) {
  /** @type {string[]} */
  const lines = [];
  const kind = String(op.kind || op.label || "activity");
  let title = scrubProductTitle(String(op.title || op.label || kind));
  const detail = typeof op.detail === "string" ? op.detail : "";
  const path = typeof op.path === "string" ? op.path : "";
  const command = typeof op.command === "string" ? op.command : "";
  const query = typeof op.query === "string" ? op.query : "";
  const ok = op.ok;
  const mark =
    ok === true
      ? style.green("●")
      : ok === false
        ? style.red("✕")
        : style.white("●");

  if (kind === "objective" || title === "Objective") {
    const body = normalizeObjectiveText(detail || title);
    for (const paragraph of body.split("\n")) {
      if (!paragraph.trim()) {
        lines.push("");
        continue;
      }
      lines.push(fitCanvasLine(`> ${clip(paragraph, columns - 2)}`, columns));
    }
    lines.push("");
    return lines;
  }

  // User-facing engineering narration — prose, not a tool bullet.
  if (kind === "narration" || title === "PATH") {
    for (const paragraph of String(detail || "").split(/\n\s*\n/).slice(0, 8)) {
      const p = paragraph.replace(/\n/g, " ").trim();
      if (!p) continue;
      let rest = p;
      while (rest.length > 0) {
        const budget = Math.max(20, columns - 2);
        if (rest.length <= budget) {
          lines.push(fitCanvasLine(rest, columns));
          break;
        }
        let cut = rest.lastIndexOf(" ", budget);
        if (cut < budget * 0.5) cut = budget;
        lines.push(fitCanvasLine(rest.slice(0, cut).trimEnd(), columns));
        rest = rest.slice(cut).trimStart();
      }
      lines.push("");
    }
    return lines;
  }

  if (kind === "operator" || title === "You") {
    lines.push(
      fitCanvasLine(`${style.dim("You")}  ${clip(detail, columns - 6)}`, columns),
    );
    lines.push("");
    return lines;
  }

  if (kind === "steer" || title === "Guidance") {
    const phase = String(op.phase || detail || "received");
    const label =
      phase === "applying"
        ? "Applying your guidance now"
        : phase === "queued"
          ? "Guidance queued until safe continuation"
          : "Guidance received";
    lines.push(fitCanvasLine(`${style.cyan("→")} ${style.bold(label)}`, columns));
    if (detail && detail !== phase) {
      lines.push(
        fitCanvasLine(style.dim(`  ${clip(detail, columns - 2)}`), columns),
      );
    }
    lines.push("");
    return lines;
  }

  // Claude-like titles: Update(path) / Read path — only with real paths.
  if (path && /^(Update|Create|Read|Edit)$/i.test(title)) {
    title = /^(Read)$/i.test(title) ? `Read ${path}` : `${title}(${path})`;
  } else if (path && /^(Inspect directory)$/i.test(title)) {
    title = `Inspect directory`;
  } else if (/^Run /i.test(title) && command) {
    // Prefer the real command over a bare "Run …" fragment.
    title = command.length <= 48 ? command : `Run ${command.slice(0, 44)}…`;
  }

  lines.push(
    fitCanvasLine(`${mark} ${style.bold(clip(title, columns - 4))}`, columns),
  );

  if (typeof op.diff === "string" && op.diff.trim()) {
    const stats =
      typeof op.added === "number" && typeof op.removed === "number"
        ? { added: op.added, removed: op.removed }
        : countDiffStats(op.diff);
    lines.push(
      fitCanvasLine(`  ${formatDiffStat(stats.added, stats.removed)}`, columns),
    );
    lines.push(
      ...renderDiffLines(
        op.diff,
        typeof op.maxDiffLines === "number" ? op.maxDiffLines : 28,
        columns,
        path,
      ),
    );
    lines.push("");
    return lines;
  }

  if (typeof op.stat === "string" && op.stat) {
    lines.push(
      fitCanvasLine(style.dim(`  ${clip(op.stat, columns - 2)}`), columns),
    );
  }
  if (command && !title.includes(command.slice(0, 24))) {
    lines.push(
      fitCanvasLine(`  ${clip(command, columns - 2)}`, columns),
    );
  } else if (query) {
    lines.push(
      fitCanvasLine(style.dim(`  ${clip(query, columns - 2)}`), columns),
    );
  } else if (path && !/Update|Create|Read/i.test(String(op.title || ""))) {
    lines.push(
      fitCanvasLine(style.dim(`  ${clip(path, columns - 2)}`), columns),
    );
  }

  // Skip opaque leftover detail (tool ids, "inspect view_file", etc.).
  const garbageDetail =
    !detail ||
    detail === path ||
    detail === command ||
    detail === query ||
    /^(bash|sh|zsh|run_command|view_file|edit_file|list_directory|find_file|search_dir|inspect view_file|cmd finished|cmd tests)$/i.test(
      detail.trim(),
    ) ||
    detail.startsWith("read ") ||
    detail.startsWith("edit ") ||
    /\b(copilot|antigravity|openai|anthropic)\b/i.test(detail);
  if (!garbageDetail) {
    for (const dline of String(detail).split("\n").slice(0, 6)) {
      if (!dline.trim()) continue;
      lines.push(
        fitCanvasLine(
          style.dim(`  ${clip(stripAnsiSequences(dline), columns - 2)}`),
          columns,
        ),
      );
    }
  }

  if (typeof op.preview === "string" && op.preview.trim()) {
    const lang = languageFromPath(path);
    const previewLines = stripAnsiSequences(op.preview).split("\n").slice(0, 18);
    const numW = String(previewLines.length).length;
    for (let i = 0; i < previewLines.length; i += 1) {
      const n = style.dim(String(i + 1).padStart(numW));
      lines.push(
        fitCanvasLine(
          `  ${n} │ ${paintCodeLine(previewLines[i], lang)}`,
          columns,
        ),
      );
    }
    if (stripAnsiSequences(op.preview).split("\n").length > 18) {
      lines.push(fitCanvasLine(style.dim("  …"), columns));
    }
  }

  if (typeof op.output === "string" && op.output.trim()) {
    const outLines = stripAnsiSequences(op.output).split("\n").slice(0, 20);
    for (const oline of outLines) {
      const tone = /error|fail|✕|not found|not permitted|EPERM|TS\d{4}/i.test(
        oline,
      )
        ? style.red
        : /✓|pass|ok\b|passed|successfully/i.test(oline)
          ? style.green
          : (t) => t;
      lines.push(
        fitCanvasLine(tone(`  ${clip(oline, columns - 2)}`), columns),
      );
    }
    if (stripAnsiSequences(op.output).split("\n").length > 20) {
      lines.push(fitCanvasLine(style.dim("  …"), columns));
    }
  }

  lines.push("");
  return lines;
}

/**
 * Never let provider / engine product names dominate the PATH story.
 * @param {string} title
 */
function scrubProductTitle(title) {
  let t = String(title || "").trim();
  if (!t) return "Working";
  t = t
    .replace(/\b(google\s*)?antigravity\b/gi, "")
    .replace(/\b(github\s*)?copilot\b/gi, "")
    .replace(/\b(openai|anthropic|claude|gpt-4[o0]?|gpt-5|gemini)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (/^researching$/i.test(t)) return "Inspecting";
  if (!t) return "Working";
  return t;
}

/**
 * Living-canvas completion report — same model as /report and durable file.
 * Prefer the already-materialized plain artifact when present so canvas,
 * clipboard, durable file, and /exit never diverge.
 * @param {Record<string, unknown>} product
 * @param {string} disposition
 * @param {number} columns
 */
export function renderTaskReport(product, disposition, columns) {
  if (
    typeof product.engineeringReportPlain === "string" &&
    product.engineeringReportPlain.trim()
  ) {
    return renderPlainReportOnCanvas(
      product.engineeringReportPlain,
      columns,
      typeof product.reportActionNotice === "string"
        ? product.reportActionNotice
        : null,
    );
  }

  const model = buildEngineeringReportModel(product, {
    classification:
      typeof product.resultClassification === "string"
        ? product.resultClassification
        : undefined,
    disposition:
      disposition ||
      (typeof product.terminalDisposition === "string"
        ? product.terminalDisposition
        : undefined),
    advancesSession: product.advancesSession === true,
  });
  // Prefer caller disposition when already normalized.
  const d = dispositionFromOutcome(
    model.classification,
    "",
    disposition || model.disposition,
  );
  model.disposition = d;

  /** @type {string[]} */
  const lines = [];
  if (d === "COMPLETE") {
    lines.push(fitCanvasLine(style.green(style.bold("✓ COMPLETE")), columns));
  } else if (d === "STOPPED") {
    lines.push(fitCanvasLine(style.yellow(style.bold("■ STOPPED")), columns));
  } else if (d === "PARTIAL") {
    lines.push(fitCanvasLine(style.yellow(style.bold("◐ PARTIAL")), columns));
  } else {
    lines.push(fitCanvasLine(style.red(style.bold("■ BLOCKED")), columns));
  }
  lines.push("");
  lines.push(fitCanvasLine(style.bold("PATH ● Code — Engineering report"), columns));
  lines.push("");

  if (model.objective) {
    lines.push(style.dim("Asked"));
    for (const p of model.objective.split("\n").slice(0, 8)) {
      lines.push(fitCanvasLine(`  ${clip(p, columns - 2)}`, columns));
    }
    lines.push("");
  }

  if (model.whatPathDid.length) {
    lines.push(style.dim("What PATH did"));
    for (const n of model.whatPathDid.slice(0, 8)) {
      lines.push(fitCanvasLine(`  ${clip(n, columns - 2)}`, columns));
    }
    lines.push("");
  }

  if (model.discoveries.length) {
    lines.push(style.dim("Important discoveries"));
    for (const n of model.discoveries.slice(0, 6)) {
      lines.push(fitCanvasLine(`  ${clip(n, columns - 2)}`, columns));
    }
    lines.push("");
  }

  if (typeof model.durationMs === "number") {
    lines.push(style.dim("Duration"));
    lines.push(fitCanvasLine(`  ${formatDuration(model.durationMs)}`, columns));
    lines.push("");
  }

  if (model.files.length) {
    lines.push(style.dim("Changed"));
    for (const f of model.files.slice(0, 16)) {
      lines.push(fitCanvasLine(`  ${clip(String(f), columns - 2)}`, columns));
    }
    if (model.files.length > 16) {
      lines.push(style.dim(`  … +${model.files.length - 16} more`));
    }
    lines.push("");
  }

  if (model.diffLines.length) {
    lines.push(style.dim("Diff"));
    lines.push(
      ...renderDiffLines(
        model.diffLines.join("\n"),
        24,
        columns,
        typeof model.files[0] === "string" ? model.files[0] : "",
      ),
    );
    lines.push("");
  }

  if (model.commands.length) {
    lines.push(style.dim("Commands"));
    for (const c of model.commands.slice(-12)) {
      lines.push(fitCanvasLine(`  ${clip(c, columns - 2)}`, columns));
    }
    lines.push("");
  }

  if (model.checks.length) {
    lines.push(style.dim("Checks"));
    for (const c of model.checks.slice(0, 12)) {
      const mk = c.ok === true ? "✓" : c.ok === false ? "✕" : "·";
      lines.push(
        fitCanvasLine(`  ${mk} ${clip(c.name, columns - 6)}`, columns),
      );
    }
    lines.push("");
  }

  if (model.timing && typeof model.timing === "object") {
    lines.push(style.dim("Timing"));
    for (const [k, v] of Object.entries(model.timing)) {
      if (typeof v === "number") {
        lines.push(
          fitCanvasLine(`  ${k.padEnd(14)} ${formatDuration(v)}`, columns),
        );
      }
    }
    lines.push("");
  }

  if (model.branch || model.sha || model.preserved) {
    lines.push(style.dim("Git / result"));
    if (model.branch) {
      lines.push(fitCanvasLine(`  ${clip(model.branch, columns - 2)}`, columns));
    }
    if (model.sha) {
      lines.push(
        fitCanvasLine(`  commit ${String(model.sha).slice(0, 12)}`, columns),
      );
    }
    if (model.primaryUntouched != null) {
      lines.push(
        fitCanvasLine(
          `  primary untouched · ${model.primaryUntouched ? "yes" : "NO"}`,
          columns,
        ),
      );
    }
    lines.push(
      fitCanvasLine(
        style.dim(
          model.pushPerformed ? "  push performed" : "  No push performed",
        ),
        columns,
      ),
    );
    if (model.inspect) {
      lines.push(fitCanvasLine(style.dim("  Inspect:"), columns));
      lines.push(
        fitCanvasLine(`  ${clip(model.inspect, columns - 2)}`, columns),
      );
    }
    lines.push("");
  }

  if (model.incomplete.length) {
    lines.push(style.dim("Not completed"));
    for (const n of model.incomplete) {
      lines.push(fitCanvasLine(`  ${clip(n, columns - 2)}`, columns));
    }
    lines.push("");
  }

  if (model.remaining.length) {
    lines.push(style.dim("Remaining / operator action"));
    for (const n of model.remaining) {
      lines.push(fitCanvasLine(`  ${clip(n, columns - 2)}`, columns));
    }
    lines.push("");
  }

  if (model.reportPath) {
    lines.push(
      fitCanvasLine(
        style.dim(`Report saved · ${clip(model.reportPath, columns - 16)}`),
        columns,
      ),
    );
  }
  lines.push(
    fitCanvasLine(
      style.dim("Type /report to copy this engineering report"),
      columns,
    ),
  );
  if (
    typeof product.reportActionNotice === "string" &&
    product.reportActionNotice.trim()
  ) {
    lines.push("");
    for (const n of product.reportActionNotice.trim().split("\n")) {
      lines.push(
        fitCanvasLine(
          style.green(clip(n, columns - 2)),
          columns,
        ),
      );
    }
  }
  lines.push("");
  return lines;
}

/**
 * Paint the canonical plain report onto the living canvas (same text as /report).
 * @param {string} plain
 * @param {number} columns
 * @param {string | null} [notice]
 */
function renderPlainReportOnCanvas(plain, columns, notice = null) {
  /** @type {string[]} */
  const lines = [];
  const section =
    /^(Asked|What PATH did|Important discoveries|Changed|Diff preview|Commands(?: \/ tool activity)?|Checks|Duration|Timing|Git \/ result(?: state)?|Not completed|Remaining \/ operator action)$/;
  for (const raw of String(plain).replace(/\n+$/, "").split("\n")) {
    const t = raw;
    if (/^✓ COMPLETE/.test(t)) {
      lines.push(fitCanvasLine(style.green(style.bold(t)), columns));
    } else if (/^◐ PARTIAL/.test(t) || /^■ STOPPED/.test(t)) {
      lines.push(fitCanvasLine(style.yellow(style.bold(t)), columns));
    } else if (/^■ BLOCKED/.test(t) || /^■ /.test(t)) {
      lines.push(fitCanvasLine(style.red(style.bold(t)), columns));
    } else if (/^PATH ● Code — Engineering report/.test(t)) {
      lines.push(fitCanvasLine(style.bold(t), columns));
    } else if (section.test(t.trim())) {
      lines.push(fitCanvasLine(style.dim(t.trim()), columns));
    } else if (/^Type \/report/.test(t) || /^Report file:/.test(t)) {
      lines.push(fitCanvasLine(style.dim(clip(t, columns)), columns));
    } else {
      lines.push(fitCanvasLine(clip(t, columns), columns));
    }
  }
  if (typeof notice === "string" && notice.trim()) {
    lines.push("");
    for (const n of notice.trim().split("\n")) {
      lines.push(fitCanvasLine(style.green(clip(n, columns - 2)), columns));
    }
  }
  lines.push("");
  return lines;
}

/**
 * Plain-text engineering report for copy/export (no ANSI).
 * Same content as the living completion report.
 * @param {Record<string, unknown>} product
 * @param {string} disposition
 */
export function formatPlainReport(product, disposition) {
  if (
    typeof product.engineeringReportPlain === "string" &&
    product.engineeringReportPlain.trim()
  ) {
    return product.engineeringReportPlain.trim() + "\n";
  }
  const model = buildEngineeringReportModel(product, {
    classification:
      typeof product.resultClassification === "string"
        ? product.resultClassification
        : undefined,
    disposition:
      disposition ||
      (typeof product.terminalDisposition === "string"
        ? product.terminalDisposition
        : undefined),
    advancesSession: product.advancesSession === true,
  });
  model.disposition = dispositionFromOutcome(
    model.classification,
    "",
    disposition || model.disposition,
  );
  return formatEngineeringReportPlain(model);
}

/**
 * @param {number} ms
 */
export function formatDuration(ms) {
  const n = Math.max(0, Math.floor(ms));
  if (n < 1000) return `${n}ms`;
  const s = Math.floor(n / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${String(rem).padStart(2, "0")}s`;
}

/**
 * @param {number} columns
 */
export function renderJumpChip(columns) {
  const label = "↓ Jump to latest  ·  End / wheel";
  const pad = Math.max(0, Math.floor((columns - label.length) / 2));
  return fitCanvasLine(`${" ".repeat(pad)}${style.dim(label)}`, columns);
}

export { style as streamStyle };
