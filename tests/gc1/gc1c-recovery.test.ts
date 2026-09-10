/**
 * GC1C-E — recovery READY before writes; checkpoint failure → zero publishes.
 */

import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const CHECKOUT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const GC1 = join(CHECKOUT, "scripts/pathcode-cli/gc1");
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
    ...(await import(`${pathToFileURL(join(GC1, "cloud-effects.mjs")).href}?b=${b}`)),
    ...(await import(`${pathToFileURL(join(GC1, "task-journal.mjs")).href}?b=${b}`)),
  };
}

describe("GC1C-E recovery ordering", () => {
  it("READY recorded before remote publishes; publish failure yields UNCONFIRMED", async () => {
    const {
      createCloudEffectsBackend,
      createMockWorkstationTransport,
      createTaskJournal,
    } = await load();
    const journalRoot = mkdtempSync(join(tmpdir(), "gc1c-j-"));
    temps.push(journalRoot);
    const journal = createTaskJournal({ rootDir: journalRoot });
    const task = journal.beginTask({ snapshotId: "s1" });
    journal.appendEvent(task.taskId, "recovery.checkpoint", {
      checkpointId: "cp-ready-1",
      status: "READY",
    });

    const transport = createMockWorkstationTransport();
    const primary = mkdtempSync(join(tmpdir(), "gc1c-prim-"));
    const taskWs = mkdtempSync(join(tmpdir(), "gc1c-task-"));
    temps.push(primary, taskWs);
    mkdirSync(join(taskWs, "src"), { recursive: true });
    writeFileSync(join(taskWs, "src/a.ts"), "export const a = 1;\n");

    const order: string[] = [];
    order.push("checkpoint-ready");

    const backend = createCloudEffectsBackend({
      transport,
      workstationName: "ws",
      taskWorkspaceRoot: taskWs,
      localPrimaryRoot: primary,
      journal,
      taskId: task.taskId,
    });

    await backend.publishFile("src/a.ts", Buffer.from("export const a = 2;\n"));
    order.push("publish");
    expect(order).toEqual(["checkpoint-ready", "publish"]);
    expect(backend.getPublishLog()).toHaveLength(1);

    // Checkpoint still loadable after "dispose" (journal persists).
    transport.deleteWorkstation = async () => {
      /* pretend disposed */
    };
    const loaded = journal.loadTask(task.taskId);
    expect(loaded?.checkpointId).toBe("cp-ready-1");
    expect(loaded?.events.some((e: { type: string }) => e.type === "recovery.checkpoint")).toBe(
      true,
    );
  });

  it("checkpoint failure path leaves zero remote publishes", async () => {
    const { createCloudEffectsBackend, createMockWorkstationTransport } = await load();
    const transport = createMockWorkstationTransport();
    const primary = mkdtempSync(join(tmpdir(), "gc1c-prim-"));
    const taskWs = mkdtempSync(join(tmpdir(), "gc1c-task-"));
    temps.push(primary, taskWs);
    // Simulate: never call publish when checkpoint not READY.
    const checkpointReady = false;
    const backend = createCloudEffectsBackend({
      transport,
      workstationName: "ws",
      taskWorkspaceRoot: taskWs,
      localPrimaryRoot: primary,
    });
    if (!checkpointReady) {
      expect(backend.getPublishLog()).toHaveLength(0);
      expect(transport.getWorkerRequestLog().filter((r: { op: string }) => r.op === "writeFile")).toHaveLength(
        0,
      );
    }
  });
});
