/**
 * GC1C-H / I / J / K — lifecycle events, cleanup pending, journal, primary unchanged.
 */

import { createHash, randomUUID } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const CHECKOUT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const GC1 = join(CHECKOUT, "scripts/pathcode-cli/gc1");
const CLI = join(CHECKOUT, "scripts/pathcode-cli");
const temps: string[] = [];
afterEach(() => {
  for (const t of temps.splice(0)) {
    try {
      rmSync(t, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

async function load() {
  const b = randomUUID();
  return {
    ...(await import(`${pathToFileURL(join(GC1, "mock-transport.mjs")).href}?b=${b}`)),
    ...(await import(`${pathToFileURL(join(GC1, "lifecycle.mjs")).href}?b=${b}`)),
    ...(await import(`${pathToFileURL(join(GC1, "task-journal.mjs")).href}?b=${b}`)),
    ...(await import(`${pathToFileURL(join(GC1, "task-snapshot.mjs")).href}?b=${b}`)),
    ...(await import(`${pathToFileURL(join(GC1, "cloud-session.mjs")).href}?b=${b}`)),
    ...(await import(`${pathToFileURL(join(CLI, "session-events.mjs")).href}?b=${b}`)),
  };
}

function makeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "gc1c-life-"));
  temps.push(root);
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src/a.ts"), "export const a = 1;\n");
  writeFileSync(join(root, "package.json"), '{"name":"x"}\n');
  return root;
}

describe("GC1C-I living terminal events", () => {
  it("renders real lifecycle event types; sanitizes hostile escapes; no fake success", async () => {
    const { renderSessionEventHuman, SESSION_EVENT_TYPES, createSessionEvent } =
      await load();
    expect(SESSION_EVENT_TYPES).toContain("session.cloud.selected");
    expect(SESSION_EVENT_TYPES).toContain("session.environment.preparing");
    expect(SESSION_EVENT_TYPES).toContain("session.hydration");
    expect(SESSION_EVENT_TYPES).toContain("session.cleanup.pending");

    const hostile = createSessionEvent("session.terminal", {
      sessionId: "s",
      disposition: "FAIL",
      summary: "evil\u001b[31mRED",
    });
    const line = renderSessionEventHuman(hostile);
    expect(line).toContain("\\u001b");
    expect(line).not.toContain("\u001b[31m");
    // No fabricated accepted badge without gate2 accepted.
    const gate = createSessionEvent("session.gate2", {
      sessionId: "s",
      status: "not-established",
    });
    expect(renderSessionEventHuman(gate)).toContain("not-established");
    expect(renderSessionEventHuman(gate)).not.toMatch(/accepted/i);
  });
});

describe("GC1C-J / K freshness + primary unchanged + journal", () => {
  it("two snapshots get fresh ids; primary unchanged; journal survives", async () => {
    const { captureTaskSnapshot, assertPrimaryUnchanged, createTaskJournal } =
      await load();
    const root = makeRepo();
    const s1 = await captureTaskSnapshot({
      projectRoot: root,
      hydrationPaths: ["src/a.ts", "package.json"],
    });
    const s2 = await captureTaskSnapshot({
      projectRoot: root,
      hydrationPaths: ["src/a.ts", "package.json"],
    });
    expect(s1.snapshotId).not.toBe(s2.snapshotId);

    const before = createHash("sha256")
      .update(readFileSync(join(root, "src/a.ts")))
      .digest("hex");
    assertPrimaryUnchanged(root, s1);
    expect(
      createHash("sha256").update(readFileSync(join(root, "src/a.ts"))).digest("hex"),
    ).toBe(before);

    const journalRoot = mkdtempSync(join(tmpdir(), "gc1c-j2-"));
    temps.push(journalRoot);
    const journal = createTaskJournal({ rootDir: journalRoot });
    const rec = journal.beginTask({
      snapshotId: s1.snapshotId,
      manifestDigest: s1.manifestDigest,
    });
    journal.appendEvent(rec.taskId, "outcome", { disposition: "ok" });
    // Survive "dispose" — reload from disk.
    const journal2 = createTaskJournal({ rootDir: journalRoot });
    expect(journal2.loadTask(rec.taskId)?.snapshotId).toBe(s1.snapshotId);
  });
});

describe("GC1C-H cleanup pending blocks billable acquire", () => {
  it("CLEANUP_PENDING blocks next acquireProbeWorkstation", async () => {
    const {
      createMockWorkstationTransport,
      createWorkstationLifecycleManager,
      createTaskJournal,
    } = await load();
    const journalRoot = mkdtempSync(join(tmpdir(), "gc1c-j3-"));
    temps.push(journalRoot);
    const journal = createTaskJournal({ rootDir: journalRoot });
    const task = journal.beginTask({});
    journal.markCleanupPending(task.taskId, {
      resourceIds: ["pathcode-gc1-probe"],
      detail: "test pending",
    });

    const transport = createMockWorkstationTransport();
    transport.seedCluster();
    transport.seedConfig();
    const manager = createWorkstationLifecycleManager({
      transport,
      journal,
      deadlineMs: 2000,
      pollIntervalMs: 5,
    });
    await expect(manager.acquireProbeWorkstation()).rejects.toMatchObject({
      code: "GC1C_CLEANUP_PENDING",
    });
  });
});
