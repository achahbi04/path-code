/**
 * S2 — task history + preferences MVP.
 */
import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it, afterEach } from "vitest";

const CHECKOUT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const SCRATCH = join(CHECKOUT, ".path-code-tmp", "s2-mvp-test");

async function load(rel: string) {
  return import(
    `${pathToFileURL(join(CHECKOUT, "scripts/pathcode-cli", rel)).href}?s2=${randomUUID()}`
  );
}

const cleanups: string[] = [];
afterEach(() => {
  while (cleanups.length) {
    const p = cleanups.pop();
    if (p) {
      try {
        rmSync(p, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  }
});

describe("S2 task history", () => {
  it("lists durable checkpoints/reports and reopens report text", async () => {
    mkdirSync(SCRATCH, { recursive: true });
    const runtimeRoot = mkdtempSync(join(SCRATCH, "rt-"));
    cleanups.push(runtimeRoot);
    const {
      listTaskHistory,
      getTaskHistoryEntry,
      formatTaskHistoryListing,
    } = await load("task-history.mjs");
    const { writeTaskCheckpoint, createCheckpointSkeleton } = await load(
      "ag10/task-checkpoint.mjs",
    );
    const { writeEngineeringReportFile } = await load("engineering-report.mjs");

    const taskId = "s2-hist-aaaa-bbbb-cccc-ddddeeee0001";
    writeTaskCheckpoint(
      runtimeRoot,
      createCheckpointSkeleton({
        taskId,
        worktreePath: join(runtimeRoot, "ag1-tasks", taskId),
        objective: "Assess packaging without modifying files",
        finalState: "VERIFIED",
      }),
    );
    const plain = [
      "PATH ● Code — Engineering report",
      "",
      "COMPLETE",
      "",
      "Asked",
      "  Assess packaging without modifying files",
      "",
      "Git / result",
      "  path/task-s2-hist-aaaa-bbbb-cccc-ddddeeee0001",
      "  commit abcdef1234567890",
      "  baseline 1111111111111111",
      "  Inspect:",
      "  git diff --no-ext-diff --no-textconv 1111111111111111 abcdef1234567890 --",
      "",
    ].join("\n");
    writeEngineeringReportFile(taskId, plain, runtimeRoot);

    const rows = listTaskHistory(runtimeRoot, { limit: 10 });
    expect(rows.length).toBe(1);
    expect(rows[0]?.taskId).toBe(taskId);
    expect(rows[0]?.hasReport).toBe(true);
    expect(rows[0]?.finalState).toBe("VERIFIED");
    expect(formatTaskHistoryListing(rows)).toMatch(/Durable task history/);
    expect(formatTaskHistoryListing(rows)).toMatch(/\/report <taskId>/);
    expect(formatTaskHistoryListing(rows)).toMatch(/outcome/);
    expect(formatTaskHistoryListing(rows)).toContain(taskId);

    const entry = getTaskHistoryEntry(runtimeRoot, taskId);
    expect(entry?.branch).toBe(
      "path/task-s2-hist-aaaa-bbbb-cccc-ddddeeee0001",
    );
    expect(entry?.inspectCommand).toMatch(/^git diff --no-ext-diff/);
    expect(entry?.reportText).toContain("COMPLETE");
  });

  it("detects placeholder ids and explains missing reports", async () => {
    mkdirSync(SCRATCH, { recursive: true });
    const runtimeRoot = mkdtempSync(join(SCRATCH, "rt-"));
    cleanups.push(runtimeRoot);
    const {
      isPlaceholderTaskId,
      formatMissingTaskHelp,
      formatInspectPanel,
      formatReportPanel,
      taskHasAdoptableChanges,
      getTaskHistoryEntry,
    } = await load("task-history.mjs");
    const { writeEngineeringReportFile } = await load("engineering-report.mjs");

    expect(isPlaceholderTaskId("<taskId>")).toBe(true);
    expect(isPlaceholderTaskId("taskId")).toBe(true);
    expect(isPlaceholderTaskId("real-uuid-ish-id")).toBe(false);

    const help = formatMissingTaskHelp("<taskId>", runtimeRoot);
    expect(help).toMatch(/placeholder/i);
    expect(help).toMatch(/\/history/);

    const taskId = "s2-ro-aaaa-bbbb-cccc-ddddeeee0002";
    const plain = [
      "PATH ● Code — Engineering report",
      "",
      "COMPLETE",
      "",
      "Asked",
      "  Assess packaging without modifying files",
      "",
      "Git / result",
      "  path/task-s2-ro-aaaa-bbbb-cccc-ddddeeee0002",
      "  commit abcdef1234567890",
      "  baseline abcdef1234567890",
      "  Inspect:",
      "  git diff --no-ext-diff --no-textconv abcdef1234567890 abcdef1234567890 --",
      "",
    ].join("\n");
    writeEngineeringReportFile(taskId, plain, runtimeRoot);
    const entry = getTaskHistoryEntry(runtimeRoot, taskId);
    expect(entry).toBeTruthy();
    expect(taskHasAdoptableChanges(entry!)).toBe(false);
    const inspect = formatInspectPanel(entry!);
    expect(inspect).toMatch(/Adoptable: no/);
    expect(inspect).toMatch(/disposition/);
    expect(inspect).toMatch(/branch/);
    const reportPanel = formatReportPanel(entry!, { copied: true });
    expect(reportPanel).toContain(taskId);
    expect(reportPanel).toMatch(/──── report ────/);
    expect(reportPanel).toMatch(/no adoptable file changes/);
  });

  it("marks tasks with changed files as adoptable", async () => {
    mkdirSync(SCRATCH, { recursive: true });
    const runtimeRoot = mkdtempSync(join(SCRATCH, "rt-"));
    cleanups.push(runtimeRoot);
    const { getTaskHistoryEntry, taskHasAdoptableChanges } = await load(
      "task-history.mjs",
    );
    const { writeEngineeringReportFile } = await load("engineering-report.mjs");
    const taskId = "s2-chg-aaaa-bbbb-cccc-ddddeeee0003";
    const plain = [
      "COMPLETE",
      "",
      "Changed",
      "  src/app.ts",
      "  package.json",
      "",
      "Git / result",
      "  path/task-s2-chg-aaaa-bbbb-cccc-ddddeeee0003",
      "  commit abcdef1234567890",
      "  baseline 1111111111111111",
      "  Inspect:",
      "  git diff --no-ext-diff --no-textconv 1111111111111111 abcdef1234567890 --",
      "",
    ].join("\n");
    writeEngineeringReportFile(taskId, plain, runtimeRoot);
    const entry = getTaskHistoryEntry(runtimeRoot, taskId);
    expect(taskHasAdoptableChanges(entry!)).toBe(true);
    expect(entry?.changedFiles).toEqual(["src/app.ts", "package.json"]);
  });
});

describe("S2 preferences", () => {
  it("persists model and autonomy and resolves load order", async () => {
    mkdirSync(SCRATCH, { recursive: true });
    const stateDir = mkdtempSync(join(SCRATCH, "state-"));
    cleanups.push(stateDir);
    const {
      writePreferences,
      readPreferences,
      resolveEffectivePreferences,
    } = await load("preferences.mjs");

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PATHCODE_STATE_DIR: stateDir,
    };
    delete env.PATHCODE_OPENAI_MODEL;

    const written = writePreferences({
      modelId: "gpt-test",
      autonomy: "bounded",
      env,
    });
    expect(written.ok).toBe(true);
    expect(existsSync(join(stateDir, "preferences.json"))).toBe(true);

    const read = readPreferences({ env });
    expect(read.modelId).toBe("gpt-test");
    expect(read.autonomy).toBe("bounded");

    const fromFile = resolveEffectivePreferences({ env });
    expect(fromFile.modelId).toBe("gpt-test");
    expect(fromFile.modelSource).toBe("file");
    expect(fromFile.autonomy).toBe("bounded");
    expect(fromFile.autonomySource).toBe("file");

    const sessionWins = resolveEffectivePreferences({
      env,
      sessionModel: "session-model",
      sessionAutonomy: "review",
      modelFlag: "flag-model",
      autonomyFlag: "bounded",
      autonomyExplicit: true,
    });
    expect(sessionWins.modelId).toBe("session-model");
    expect(sessionWins.modelSource).toBe("session");
    expect(sessionWins.autonomy).toBe("review");
    expect(sessionWins.autonomySource).toBe("session");

    const raw = JSON.parse(
      readFileSync(join(stateDir, "preferences.json"), "utf8"),
    );
    expect(raw.schema).toBe("pathcode.prefs.v1");
  });

  it("formats an unmistakable prefs panel", async () => {
    const { formatPreferencesPanel } = await load("preferences.mjs");
    const text = formatPreferencesPanel({
      modelId: "gpt-test",
      modelSource: "file",
      autonomy: "bounded",
      autonomySource: "file",
      prefsPath: "/tmp/preferences.json",
    }, { persisted: true });
    expect(text).toMatch(/Durable preferences/);
    expect(text).toMatch(/gpt-test/);
    expect(text).toMatch(/bounded/);
    expect(text).toMatch(/\/model <id>/);
    expect(text).toMatch(/persist across PATH restarts/i);
  });
});
