/**
 * G8 — same-session continue protocol without live Antigravity.
 *
 * Spawns the Node fake bridge via options.pythonPath=process.execPath and
 * options.bridgeScript=fixtures/fake-ag-bridge.mjs, then drives:
 * start → finished → continue → finished(repaired) → done → close.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";

const CHECKOUT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const BRIDGE_CLIENT = join(
  CHECKOUT_ROOT,
  "scripts/pathcode-cli/ag1/bridge-client.mjs",
);
const FAKE_BRIDGE = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/fake-ag-bridge.mjs",
);

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

async function loadBridgeClient() {
  return import(`${pathToFileURL(BRIDGE_CLIENT).href}?g8=${randomUUID()}`);
}

/**
 * @param {Array<Record<string, unknown>>} events
 * @param {string} type
 * @param {number} timeoutMs
 */
async function waitForEvent(
  events: Array<Record<string, unknown>>,
  type: string,
  timeoutMs = 5_000,
) {
  const startLen = events.filter((e) => e.type === type).length;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const matches = events.filter((e) => e.type === type);
    if (matches.length > startLen) {
      return matches[matches.length - 1]!;
    }
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(
    `Timed out waiting for event type=${type}; saw=${JSON.stringify(
      events.map((e) => e.type),
    )}`,
  );
}

describe("G8 bridge — same-session continue protocol", () => {
  it(
    "start → continue → repaired finished stays on one child",
    async () => {
      const { createAntigravityEngineeringAgent } = await loadBridgeClient();
      const workspace = mkdtempSync(join(tmpdir(), "pathcode-g8-continue-"));
      temps.push(workspace);

      const events: Array<Record<string, unknown>> = [];
      const diags: Array<{ kind: string; text: string }> = [];
      const repairText =
        "Repair: fix the failing unit-tests check and re-run validation.";

      const agent = createAntigravityEngineeringAgent({
        checkoutRoot: CHECKOUT_ROOT,
        pythonPath: process.execPath,
        bridgeScript: FAKE_BRIDGE,
        onEvent: (m: Record<string, unknown>) => events.push(m),
        onDiagnostic: (kind: string, text: string) =>
          diags.push({ kind, text }),
      });

      const start = await agent.startTask({
        taskId: "g8-continue-1",
        workspace,
        task: "initial engineering task",
        allowShell: false,
      });
      expect(start.ok).toBe(true);

      const pidAfterStart = agent.getPid();
      expect(pidAfterStart).toBeTypeOf("number");

      const firstFinished = await waitForEvent(events, "finished");
      expect(firstFinished.summary).toBe("initial done");
      expect(events.some((e) => e.type === "started")).toBe(true);

      const cont = agent.continueTask({ text: repairText });
      expect(cont.ok).toBe(true);

      const secondFinished = await waitForEvent(events, "finished");
      expect(secondFinished.summary).toBe("repaired");
      expect(
        events.some(
          (e) => e.type === "activity" && e.activity === "repairing",
        ),
      ).toBe(true);

      // Same child process — continue must not respawn.
      expect(agent.getPid()).toBe(pidAfterStart);

      // Continue payload reached the bridge (stderr side-channel → diagnostics).
      const continueDiag = diags.find(
        (d) =>
          d.kind === "stderr" &&
          d.text.startsWith("CONTINUE_TEXT=") &&
          d.text.includes(repairText),
      );
      expect(continueDiag).toBeTruthy();
      const encoded = continueDiag!.text.slice("CONTINUE_TEXT=".length);
      expect(JSON.parse(encoded)).toBe(repairText);

      const done = agent.signalDone();
      expect(done.ok).toBe(true);

      await agent.close();
      expect(agent.getPid()).toBeNull();
    },
    15_000,
  );
});
