/**
 * G9 — collaborative engine selection, argv, and journal/lease basics.
 */

import {
  mkdtempSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";

const CHECKOUT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const AG9 = join(CHECKOUT_ROOT, "scripts/pathcode-cli/ag9/index.mjs");

/** @type {string[]} */
const temps: string[] = [];

afterEach(() => {
  while (temps.length) {
    const p = temps.pop();
    if (!p) continue;
    try {
      rmSync(p, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

function tmpFixture(label: string): string {
  const dir = mkdtempSync(join(tmpdir(), `pathcode-g9-collab-${label}-`));
  temps.push(dir);
  return dir;
}

async function loadAg9() {
  return import(`${pathToFileURL(AG9).href}?g9=${randomUUID()}`);
}

describe("G9 collaborative engines", () => {
  it("chooseCollabEngine alternates and has no permanent primary", async () => {
    const { chooseCollabEngine } = await loadAg9();
    // S3 fabric: rotate among ready peers starting with antigravity — never a
    // permanent Copilot/Cursor specialty hierarchy.
    expect(chooseCollabEngine({ attempt: 0, copilotReady: true })).toBe(
      "antigravity",
    );
    expect(chooseCollabEngine({ attempt: 1, copilotReady: true })).toBe(
      "copilot",
    );
    expect(chooseCollabEngine({ attempt: 2, copilotReady: true })).toBe(
      "antigravity",
    );
    expect(chooseCollabEngine({ attempt: 0, copilotReady: false })).toBe(
      "antigravity",
    );
  });

  it("buildCopilotEngineeringArgs enables tools and denies push", async () => {
    const { buildCopilotEngineeringArgs } = await loadAg9();
    const help = `
Options:
  -p, --prompt <text>
  -s, --silent
  -C <directory>
  --add-dir <directory>
  --allow-all-tools
  --deny-tool[=tools...]
`;
    const built = buildCopilotEngineeringArgs({
      helpText: help,
      prompt: "fix the type error",
      cwd: "/tmp/wt",
    });
    expect(built.ok).toBe(true);
    expect(built.args).toContain("--allow-all-tools");
    expect(built.args).toContain("-C");
    expect(built.args).toContain("/tmp/wt");
    expect(built.args).toContain("--add-dir");
    expect(built.args.some((a: string) => /git push/.test(a))).toBe(true);
    expect(
      built.args.filter((a: string) => a === "--deny-tool").length,
    ).toBeGreaterThan(0);
  });

  it("P6.4 configures a selected CLI model only when the flag is supported", async () => {
    const { buildCopilotEngineeringArgs } = await loadAg9();
    const help = "Options:\n  -p, --prompt <text>\n  --allow-all-tools\n  --model <id>\n";
    const configured = buildCopilotEngineeringArgs({ helpText: help, prompt: "fix", cwd: "/tmp/wt", modelId: "copilot-project" });
    expect(configured.ok).toBe(true);
    expect(configured.args).toContain("--model");
    expect(configured.args[configured.args.indexOf("--model") + 1]).toBe("copilot-project");
    const unsupported = buildCopilotEngineeringArgs({ helpText: "Options:\n  -p, --prompt <text>\n  --allow-all-tools\n", prompt: "fix", cwd: "/tmp/wt", modelId: "copilot-project" });
    expect(unsupported.ok).toBe(false);
    expect(unsupported.reason).toMatch(/model flag/);
  });

  it("withCollabTurn journals and serializes exclusive turns", async () => {
    const {
      ensureAg9RuntimeDirs,
      withCollabTurn,
      readCollabJournal,
      formatCollabHandoff,
    } = await loadAg9();
    const runtimeRoot = tmpFixture("rt");
    ensureAg9RuntimeDirs(runtimeRoot);
    const taskId = `t-${randomUUID().slice(0, 8)}`;

    const order: string[] = [];
    await withCollabTurn(
      { runtimeRoot, taskId, engine: "copilot", timeoutMs: 5_000 },
      async () => {
        order.push("copilot");
        return { detail: "c1", changedFiles: ["a.ts"] };
      },
    );
    await withCollabTurn(
      { runtimeRoot, taskId, engine: "antigravity", timeoutMs: 5_000 },
      async () => {
        order.push("antigravity");
        return { detail: "a1", changedFiles: ["b.ts"] };
      },
    );

    expect(order).toEqual(["copilot", "antigravity"]);
    const journal = readCollabJournal({ runtimeRoot, taskId });
    expect(journal.length).toBeGreaterThanOrEqual(4);
    const handoff = formatCollabHandoff(journal);
    expect(handoff).toMatch(/Shared engineering journal/);
    expect(handoff).toMatch(/copilot/);
  });

  it("repair prompt mentions collaborative peer notes", async () => {
    const repairPath = join(
      CHECKOUT_ROOT,
      "scripts/pathcode-cli/ag8/repair.mjs",
    );
    const mod = await import(
      `${pathToFileURL(repairPath).href}?r=${randomUUID()}`
    );
    const text = mod.buildValidationRepairPrompt(
      {
        classification: "FAILED",
        checks: [{ id: "tsc", kind: "TYPECHECK", ok: false, stderrTail: "err" }],
      },
      { peerNotes: "Call resolveRef with the overload that takes string.", collabHandoff: "Shared engineering journal:\n- [copilot] turn_end" },
    );
    expect(text).toMatch(/collaborating with another engineering engine/i);
    expect(text).toMatch(/Peer engine notes/);
    expect(text).not.toMatch(/Specialist advisory \(read-only\)/);
  });
});
