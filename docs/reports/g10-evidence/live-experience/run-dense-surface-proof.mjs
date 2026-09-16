#!/usr/bin/env node
/**
 * Dense live engineering surface proof.
 *
 * Proves operator-visible evidence (real cmds, output, reads, diffs, search,
 * collaboration, scroll after COMPLETE, full-width canvas) via Gateway fake
 * engine events applied through the same Studio → canvas path as Terminal.app.
 */
import { mkdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  createEmptyStudioState,
  applyStudioEvent,
} from "../../../../scripts/path-studio/state.mjs";
import { buildMinimalLivingLines } from "../../../../scripts/pathcode-cli/inline-studio.mjs";
import { renderStreamOp } from "../../../../scripts/pathcode-cli/engineering-stream.mjs";
import { createGatewayRuntime } from "../../../../scripts/pathcode-cli/gateway/runtime.mjs";
import {
  resolvePathPackageRoot,
  resolvePathRuntimeRoot,
} from "../../../../scripts/pathcode-cli/paths.mjs";
import { formatPathTitle } from "../../../../scripts/pathcode-cli/terminal-title.mjs";

const outDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolvePathPackageRoot();
const runtimeRoot = resolvePathRuntimeRoot({ packageRoot });
mkdirSync(outDir, { recursive: true });

function stripAnsi(s) {
  return String(s)
    .replace(/\u001b\[[0-9;]*m/g, "")
    .replace(/\u001b\][^\u0007]*\u0007/g, "");
}

/** @type {Array<Record<string, unknown>>} */
const checks = [];

{
  const proj = mkdtempSync(join(tmpdir(), "path-dense-"));
  spawnSync("git", ["init"], { cwd: proj, encoding: "utf8" });
  spawnSync("git", ["config", "user.email", "t@t"], { cwd: proj });
  spawnSync("git", ["config", "user.name", "t"], { cwd: proj });
  writeFileSync(join(proj, "package.json"), '{"name":"dense","scripts":{"typecheck":"tsc"}}\n');
  spawnSync("git", ["add", "."], { cwd: proj });
  spawnSync("git", ["commit", "-m", "init"], { cwd: proj });

  process.env.PATHCODE_GATEWAY_FAKE_ENGINE = "1";
  process.env.PATHCODE_GATEWAY_SKIP_BOOTSTRAP = "1";

  const rt = createGatewayRuntime({ packageRoot, runtimeRoot });
  await rt.bindProject({ cwd: proj });

  /** @type {object[]} */
  const events = [];
  const state = createEmptyStudioState();
  state.product.ag1 = true;
  state.product.projectName = "dense-surface-proof";

  rt.onEvent((env) => {
    const ev = env?.event;
    if (!ev || typeof ev.type !== "string") return;
    events.push(ev);
    const { type, ...fields } = ev;
    applyStudioEvent(state, { type, ...fields });
  });

  const started = await rt.startTask({
    objective:
      "Fix __pathcodeTrial type error in src/lib/utils.ts and run typecheck.",
  });
  await rt.awaitTask(started.taskId);

  // Wide canvas (operator Terminal.app width class).
  const wide = stripAnsi(
    buildMinimalLivingLines(state, { rows: 48, columns: 140 }).join("\n"),
  );
  writeFileSync(join(outDir, "dense-wide-preview.txt"), wide);

  // Narrow canvas still readable.
  const narrow = stripAnsi(
    buildMinimalLivingLines(state, { rows: 36, columns: 72 }).join("\n"),
  );
  writeFileSync(join(outDir, "dense-narrow-preview.txt"), narrow);

  // After COMPLETE, scroll back into history must still expose earlier evidence.
  state.product.streamScroll = 80;
  const scrolled = stripAnsi(
    buildMinimalLivingLines(state, { rows: 48, columns: 140 }).join("\n"),
  );
  writeFileSync(join(outDir, "dense-scrolled-preview.txt"), scrolled);

  const history = Array.isArray(state.product.streamHistory)
    ? state.product.streamHistory
    : [];
  const titles = history.map((h) => String(h?.title || ""));
  const commands = history
    .map((h) => (typeof h?.command === "string" ? h.command : ""))
    .filter(Boolean);
  const hasPreview = history.some(
    (h) => typeof h?.preview === "string" && h.preview.includes("__pathcodeTrial"),
  );
  const hasDiff = history.some(
    (h) => typeof h?.diff === "string" && h.diff.includes("__pathcodeTrial"),
  );
  const hasFailOut = history.some(
    (h) =>
      typeof h?.output === "string" &&
      /Operation not permitted|TS2322|Found 1 error/i.test(h.output),
  );
  const hasOkOut = history.some(
    (h) =>
      typeof h?.output === "string" &&
      /completed successfully|v22\.|✓/i.test(h.output),
  );
  const hasSearch = history.some(
    (h) =>
      /Search|Inspect directory/i.test(String(h?.title || "")) &&
      (h?.query || h?.path || h?.preview),
  );
  const hasCollab = history.some((h) => /Copilot/i.test(String(h?.title || "")));

  // Follow-tail frame: recent engineering + completion (not early env — that's scrollback).
  checks.push({
    id: "brand_pinned",
    ok: wide.startsWith("PATH ● Code") && !/╭|╰/.test(wide),
  });
  checks.push({
    id: "no_abstract_tool_ids_as_primary",
    ok:
      !/\brun_command\b/.test(wide) &&
      !/\bview_file\b/.test(wide) &&
      !/\blist_directory\b/.test(wide) &&
      !/Ran \d+ shell/.test(wide) &&
      !/Read\(Code\)/.test(wide) &&
      !/inspect view_file/.test(wide) &&
      !/\brun_command\b/.test(scrolled) &&
      !/\bview_file\b/.test(scrolled),
    sample: wide.split("\n").slice(0, 30),
  });
  checks.push({
    id: "environment_visible",
    ok:
      titles.includes("Environment ready") &&
      titles.includes("Preparing environment") &&
      /Environment ready|Preparing environment|typescript|node/i.test(scrolled),
  });
  checks.push({
    id: "file_read_with_code",
    ok:
      hasPreview &&
      titles.includes("Read") &&
      /Read src\/lib\/utils\.ts|● Read/.test(scrolled) &&
      /__pathcodeTrial/.test(scrolled),
  });
  checks.push({
    id: "search_visible",
    ok:
      hasSearch &&
      /Search|Inspect directory/i.test(scrolled) &&
      (/__pathcodeTrial|src\/lib/.test(scrolled) ||
        history.some((h) => /Search/i.test(String(h?.title || "")))),
  });
  checks.push({
    id: "real_commands",
    ok:
      commands.some((c) => /npm run typecheck/.test(c)) &&
      commands.some((c) => /node --version/.test(c)) &&
      /npm run typecheck/.test(wide) &&
      !/^●\s+run_command/m.test(wide),
    commands,
  });
  checks.push({
    id: "failure_and_recovery_output",
    ok: hasFailOut && hasOkOut && /Operation not permitted|TS2322|completed successfully/i.test(
      `${wide}\n${scrolled}`,
    ),
  });
  checks.push({
    id: "live_diff",
    ok: (() => {
      const update = history.find(
        (h) =>
          String(h?.title || "") === "Update" &&
          typeof h?.diff === "string" &&
          h.diff.includes("__pathcodeTrial"),
      );
      if (!update) return false;
      const rendered = stripAnsi(renderStreamOp(update, 140).join("\n"));
      return (
        /Update\(src\/lib\/utils\.ts\)/.test(rendered) &&
        /Added 1/.test(rendered) &&
        /__pathcodeTrial/.test(rendered) &&
        // Follow-tail still shows the live hunk body.
        /__pathcodeTrial/.test(wide)
      );
    })(),
  });
  checks.push({
    id: "collaboration_useful",
    ok:
      hasCollab &&
      /Copilot/.test(wide) &&
      !/Copilot engineering turn/.test(wide),
  });
  checks.push({
    id: "completion_report",
    ok:
      /✓ COMPLETE/.test(wide) &&
      /typecheck-local-tsc|path\/task-/.test(wide),
  });
  checks.push({
    id: "wide_uses_canvas",
    ok:
      /PATH ● Code/.test(wide) &&
      // Frame is built at 140 cols; content lines use the width budget.
      Math.max(...wide.split("\n").map((l) => l.length)) >= 100,
    maxLine: Math.max(...wide.split("\n").map((l) => l.length)),
  });
  checks.push({
    id: "scroll_after_complete",
    ok:
      /Jump to latest/.test(scrolled) &&
      /Preparing environment|Environment ready|Read src\/lib\/utils|Inspect directory|Search/i.test(
        scrolled,
      ) &&
      history.length >= 8,
    historyLen: history.length,
    titles: titles.slice(0, 20),
  });
  checks.push({
    id: "narrow_still_readable",
    ok:
      narrow.startsWith("PATH ● Code") &&
      /COMPLETE|Typecheck|Read|Update|Copilot/.test(narrow),
  });
  checks.push({
    id: "title_format_clean",
    ok:
      formatPathTitle("dense-surface-proof") ===
        "dense-surface-proof — PATH Code" &&
      !/TMPDIR|copilot/i.test(formatPathTitle("dense-surface-proof")),
  });

  writeFileSync(
    join(outDir, "dense-events.json"),
    JSON.stringify(
      {
        eventTypes: events.map((e) => e.type),
        history: history.map((h) => ({
          title: h.title,
          path: h.path,
          command: h.command,
          query: h.query,
          hasPreview: Boolean(h.preview),
          hasDiff: Boolean(h.diff),
          hasOutput: Boolean(h.output),
        })),
      },
      null,
      2,
    ),
  );

  delete process.env.PATHCODE_GATEWAY_FAKE_ENGINE;
  delete process.env.PATHCODE_GATEWAY_SKIP_BOOTSTRAP;
}

const allOk = checks.every((c) => c.ok);
const report = {
  phase: "LIVE_ENGINEERING_SURFACE_DENSE",
  at: new Date().toISOString(),
  pass: allOk,
  checks,
};
writeFileSync(join(outDir, "dense-surface-proof.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(allOk ? 0 : 1);
