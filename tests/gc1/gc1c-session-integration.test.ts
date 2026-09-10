/**
 * GC1-c session integration — one cloud cycle with mock transport, $0, no network.
 * Uses general-session helpers + scripted brain; asserts cloud lifecycle order
 * and that the local primary fixture is unchanged.
 */

import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, afterEach, describe, expect, it } from "vitest";

import {
  SEED_SOURCE,
  cleanupTrackedRoots,
  fullApprovalScript,
  provisionProject,
  runSession,
} from "../general-session/helpers.js";

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
afterAll(() => {
  cleanupTrackedRoots();
});

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

async function loadMockTransport() {
  const b = randomUUID();
  return import(`${pathToFileURL(join(GC1, "mock-transport.mjs")).href}?b=${b}`);
}

describe("GC1C session integration (mock cloud, no network)", () => {
  it("runs one cloud cycle: lifecycle events in order, primary unchanged", async () => {
    expect(process.env.GC1_LIVE_SMOKE).not.toBe("1");

    const fixture = provisionProject();
    const primaryAnswer = join(fixture.projectRoot, "src/answer.ts");
    const beforeHash = sha256(primaryAnswer);
    const beforeBytes = readFileSync(primaryAnswer, "utf8");
    expect(beforeBytes).toBe(SEED_SOURCE);

    const { createMockWorkstationTransport } = await loadMockTransport();
    const transport = createMockWorkstationTransport();
    // Mock must never touch GCP / network counters for this suite.
    expect(transport.networkCalls ?? 0).toBe(0);

    const journalRoot = mkdtempSync(join(tmpdir(), "gc1c-int-journal-"));
    temps.push(journalRoot);

    /** @type {Array<{ type: string }>} */
    const events: Array<{ type: string }> = [];

    const run = await runSession(fixture, {
      answers: fullApprovalScript(),
      sessionOptions: {
        executionMode: "cloud",
        skipLiveGcp: true,
        cloudTransport: transport,
        journalRoot,
        // Validation processes run through the remote worker; script exit 0.
        scriptedProcessResults: [
          { exitCode: 0, stdout: "stub tsc\n", stderr: "" },
          { exitCode: 0, stdout: "pre\nok\n", stderr: "" },
          { exitCode: 0, stdout: "ok\n", stderr: "" },
        ],
        sessionEventEmit: (type: string, fields: Record<string, unknown> = {}) => {
          events.push({ type, ...fields });
        },
      },
    });

    expect(transport.networkCalls ?? 0).toBe(0);
    expect(run.result.executionMode).toBe("cloud");
    expect(run.result.cloudFinalize?.ok).toBe(true);
    expect(run.result.primaryCheckFailed).toBeFalsy();

    // Primary editable fixture bytes must be untouched (cloud writes task workspace only).
    expect(readFileSync(primaryAnswer, "utf8")).toBe(SEED_SOURCE);
    expect(sha256(primaryAnswer)).toBe(beforeHash);

    const types = events.map((e) => e.type);
    const cloudSelected = types.indexOf("session.cloud.selected");
    const preparing = types.indexOf("session.environment.preparing");
    const hydration = types.indexOf("session.hydration");
    const checkpoint = types.indexOf("session.checkpoint.ready");
    const artifacts = types.indexOf("session.artifacts.saving");
    const cleanup = types.indexOf("session.cleanup");
    const terminal = types.indexOf("session.terminal");

    expect(cloudSelected).toBeGreaterThanOrEqual(0);
    expect(preparing).toBeGreaterThan(cloudSelected);
    expect(hydration).toBeGreaterThan(preparing);
    expect(checkpoint).toBeGreaterThan(hydration);
    expect(artifacts).toBeGreaterThan(checkpoint);
    expect(cleanup).toBeGreaterThan(artifacts);
    expect(terminal).toBeGreaterThan(cleanup);

    // Edit applied on cloud path — terminal may be accepted or not-established
    // depending on Gate 2 / scripted process observation shape; either way the
    // cycle completed and primary stayed sealed.
    expect(run.result.checkpointId).toBeTruthy();
    expect(run.result.modelCalls).toBe(3);
  });
});
