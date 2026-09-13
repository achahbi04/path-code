/**
 * G7 — bounded unified-diff preview for TUI / durable summary.
 * Presentation limits only; never discards the durable Git result.
 */

export const DIFF_PREVIEW_MAX_FILES = 5;
export const DIFF_PREVIEW_MAX_LINES = 50;

/**
 * @param {string} diffText Unified diff text (may be empty).
 * @param {{
 *   maxFiles?: number,
 *   maxLines?: number,
 *   changedFiles?: string[],
 * }} [opts]
 * @returns {{
 *   lines: string[],
 *   shownFiles: number,
 *   totalFiles: number,
 *   shownLines: number,
 *   truncated: boolean,
 *   fileTruncated: boolean,
 *   lineTruncated: boolean,
 * }}
 */
export function buildBoundedDiffPreview(diffText, opts = {}) {
  const maxFiles =
    typeof opts.maxFiles === "number" && opts.maxFiles > 0
      ? Math.floor(opts.maxFiles)
      : DIFF_PREVIEW_MAX_FILES;
  const maxLines =
    typeof opts.maxLines === "number" && opts.maxLines > 0
      ? Math.floor(opts.maxLines)
      : DIFF_PREVIEW_MAX_LINES;

  const named = Array.isArray(opts.changedFiles)
    ? opts.changedFiles.filter((p) => typeof p === "string" && p.trim())
    : [];

  const text = typeof diffText === "string" ? diffText : "";
  const rawLines = text.length ? text.replace(/\r\n/g, "\n").split("\n") : [];

  /** @type {string[]} */
  const out = [];
  let fileCount = 0;
  let fileTruncated = false;
  let lineTruncated = false;

  for (const line of rawLines) {
    if (line.startsWith("diff --git ")) {
      fileCount += 1;
      if (fileCount > maxFiles) {
        fileTruncated = true;
        break;
      }
    } else if (fileCount === 0 && (line.startsWith("+++ ") || line.startsWith("--- "))) {
      // orphan headers without diff --git still count toward line budget
    }
    if (fileCount > maxFiles) {
      fileTruncated = true;
      break;
    }
    if (out.length >= maxLines) {
      lineTruncated = true;
      break;
    }
    // Skip enormous binary markers' hex dumps — keep the marker line only.
    if (/^Binary files /i.test(line) || /GIT binary patch/i.test(line)) {
      out.push(line.slice(0, 200));
      continue;
    }
    out.push(line.length > 240 ? `${line.slice(0, 237)}...` : line);
  }

  const totalFiles = named.length > 0 ? named.length : Math.max(fileCount, 0);
  const shownFiles = named.length > 0
    ? Math.min(maxFiles, named.length)
    : Math.min(maxFiles, fileCount);
  if (named.length > maxFiles) fileTruncated = true;

  return {
    lines: out,
    shownFiles,
    totalFiles,
    shownLines: out.length,
    truncated: fileTruncated || lineTruncated,
    fileTruncated,
    lineTruncated,
  };
}

/**
 * Build the inspect command with recorded SHAs (never bare `git diff`).
 * @param {{ baselineSha?: string | null, resultSha?: string | null }} input
 * @returns {string | null}
 */
export function buildFullResultInspectCommand(input) {
  const baseline =
    typeof input.baselineSha === "string" && /^[0-9a-f]{7,40}$/i.test(input.baselineSha)
      ? input.baselineSha
      : null;
  const result =
    typeof input.resultSha === "string" && /^[0-9a-f]{7,40}$/i.test(input.resultSha)
      ? input.resultSha
      : null;
  if (!baseline || !result) return null;
  return `git diff --no-ext-diff --no-textconv ${baseline} ${result} --`;
}

/**
 * Extract a short observable detail from a tool summary for the PATH column.
 * @param {{ kind?: string, tool?: string, summary?: string }} event
 * @returns {string | null}
 */
export function summarizeToolObservation(event) {
  const kind = typeof event.kind === "string" ? event.kind : "";
  const tool = typeof event.tool === "string" ? event.tool : "";
  const summary = typeof event.summary === "string" ? event.summary : "";
  const blob = `${tool} ${summary}`.trim();
  if (!blob) return null;

  if (kind === "command" || /run_command/i.test(tool) || /run_command/i.test(summary)) {
    // Prefer the command line fragment after run_command / CommandLine=.
    const m =
      summary.match(/CommandLine[=:\s]+(.+)$/i) ||
      summary.match(/run_command\s+(.+)$/i) ||
      summary.match(/\$\s*(.+)$/);
    const cmd = (m?.[1] || summary.replace(/^run_command\s*/i, "")).trim();
    return cmd ? `cmd ${cmd.slice(0, 96)}` : "Running command";
  }
  if (kind === "file_edit" || /edit_file|create_file/i.test(tool)) {
    const pathMatch = summary.match(/(?:^|\s)([^\s]+?\.[A-Za-z0-9]{1,8})\b/);
    return pathMatch ? `edit ${pathMatch[1]}` : `edit ${tool || "file"}`;
  }
  if (kind === "test") {
    return `test ${(summary || tool).slice(0, 96)}`;
  }
  if (kind === "inspect" || /view_file|list_dir|find_file|search_dir/i.test(tool)) {
    const pathMatch = summary.match(/(?:^|\s)([^\s]+?\.[A-Za-z0-9]{1,8})\b/);
    return pathMatch ? `read ${pathMatch[1]}` : `inspect ${tool || "files"}`;
  }
  return blob.slice(0, 96);
}
