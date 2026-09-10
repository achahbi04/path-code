/**
 * GC1C-A / G — cloud backend + credential canary proofs (mock transport, $0).
 */

import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
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
    ...(await import(`${pathToFileURL(join(GC1, "remote-worker.mjs")).href}?b=${b}`)),
    ...(await import(`${pathToFileURL(join(GC1, "task-journal.mjs")).href}?b=${b}`)),
  };
}

describe("GC1C-A backend compatibility", () => {
  it("unbound local process path is unchanged (no cloud runner required)", async () => {
    // Architecture: getBoundProcessObservationRunner returns null when unbound.
    // This suite only asserts the cloud backend does not install global hooks.
    const { createCloudEffectsBackend, createMockWorkstationTransport } = await load();
    const transport = createMockWorkstationTransport();
    transport.seedCluster();
    transport.seedConfig();
    const primary = mkdtempSync(join(tmpdir(), "gc1c-prim-"));
    const task = mkdtempSync(join(tmpdir(), "gc1c-task-"));
    temps.push(primary, task);
    const backend = createCloudEffectsBackend({
      transport,
      workstationName: "projects/p/locations/r/workstationClusters/c/workstationConfigs/cfg/workstations/ws",
      taskWorkspaceRoot: task,
      localPrimaryRoot: primary,
    });
    expect(typeof backend.createProcessObservationRunner).toBe("function");
    // Creating a backend must not mutate process-wide spawn defaults.
    expect(process.env.PATHCODE_FORCE_REMOTE).toBeUndefined();
  });

  it("mock remote three-channel sentinel returns exit 17 with drained streams", async () => {
    const {
      createCloudEffectsBackend,
      createMockWorkstationTransport,
      toProcessObservation,
    } = await load();
    const transport = createMockWorkstationTransport();
    const primary = mkdtempSync(join(tmpdir(), "gc1c-prim-"));
    const task = mkdtempSync(join(tmpdir(), "gc1c-task-"));
    temps.push(primary, task);
    const backend = createCloudEffectsBackend({
      transport,
      workstationName: "ws",
      taskWorkspaceRoot: task,
      localPrimaryRoot: primary,
      scriptedProcessResults: [
        {
          exitCode: 17,
          stdout: "OUT_SENTINEL",
          stderr: "ERR_SENTINEL",
          signal: null,
        },
      ],
    });
    const obs = await backend.runProcess({
      executable: "/usr/bin/true",
      argv: [],
      cwd: task,
      env: { PATH: "/usr/bin" },
      timeoutMs: 5_000,
      maxStdoutBytes: 1024,
      maxStderrBytes: 1024,
    });
    expect(obs.exitCode).toBe(17);
    expect(obs.stdout.text).toContain("OUT_SENTINEL");
    expect(obs.stderr.text).toContain("ERR_SENTINEL");
    expect(obs.stdout.complete).toBe(true);
    expect(obs.stderr.complete).toBe(true);
    // toProcessObservation keeps channels independent.
    const mapped = toProcessObservation({
      exitCode: 17,
      stdout: "A",
      stderr: "B",
      stdoutTruncated: false,
      stderrTruncated: false,
      startedAtMs: 1,
      finishedAtMs: 2,
      pid: 9,
    });
    expect(mapped.stdout.text).toBe("A");
    expect(mapped.stderr.text).toBe("B");
  });

  it("truncation flags are explicit incomplete (never promoted to full)", async () => {
    const { createCloudEffectsBackend, createMockWorkstationTransport } = await load();
    const transport = createMockWorkstationTransport();
    const primary = mkdtempSync(join(tmpdir(), "gc1c-prim-"));
    const task = mkdtempSync(join(tmpdir(), "gc1c-task-"));
    temps.push(primary, task);
    const backend = createCloudEffectsBackend({
      transport,
      workstationName: "ws",
      taskWorkspaceRoot: task,
      localPrimaryRoot: primary,
      scriptedProcessResults: [
        {
          exitCode: 0,
          stdout: "partial",
          stderr: "",
          stdoutTruncated: true,
          stderrTruncated: false,
        },
      ],
    });
    const obs = await backend.runProcess({
      executable: "/usr/bin/true",
      argv: [],
      cwd: task,
      env: {},
      timeoutMs: 1000,
      maxStdoutBytes: 8,
      maxStderrBytes: 8,
    });
    expect(obs.overflow).toBe(true);
    expect(obs.stdout.truncated).toBe(true);
    expect(obs.stdout.complete).toBe(false);
  });
});

describe("GC1C-G credential canaries", () => {
  it("credential canaries absent from worker requests and sanitized child env", async () => {
    const {
      createCloudEffectsBackend,
      createMockWorkstationTransport,
      assertNoCredentialCanaries,
    } = await load();
    const transport = createMockWorkstationTransport();
    const primary = mkdtempSync(join(tmpdir(), "gc1c-prim-"));
    const task = mkdtempSync(join(tmpdir(), "gc1c-task-"));
    temps.push(primary, task);
    const backend = createCloudEffectsBackend({
      transport,
      workstationName: "ws",
      taskWorkspaceRoot: task,
      localPrimaryRoot: primary,
      scriptedProcessResults: [{ exitCode: 0, stdout: "ok", stderr: "" }],
    });
    await backend.runProcess({
      executable: "/usr/bin/true",
      argv: ["hello"],
      cwd: task,
      env: {
        PATH: "/usr/bin",
        OPENAI_API_KEY: "GC1_CANARY_SECRET_should_never_travel",
        SAFE_FLAG: "1",
      },
      timeoutMs: 1000,
      maxStdoutBytes: 100,
      maxStderrBytes: 100,
    });
    const log = transport.getWorkerRequestLog();
    const serialized = JSON.stringify(log);
    expect(serialized).not.toContain("GC1_CANARY_SECRET");
    expect(serialized).not.toContain("OPENAI_API_KEY");
    expect(() =>
      assertNoCredentialCanaries({ path: ".env", value: "GC1_CANARY_SECRET" }),
    ).toThrow(/canary/i);
  });
});
