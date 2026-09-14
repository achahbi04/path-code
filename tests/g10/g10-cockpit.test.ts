/**
 * G10 — cockpit event mapping acceptance (Living Cockpit 2.0 wiring).
 */

import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

const CHECKOUT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const STATE = join(CHECKOUT_ROOT, "scripts/path-studio/state.mjs");

async function loadStudio() {
  return import(`${pathToFileURL(STATE).href}?g10=${randomUUID()}`);
}

describe("G10 Living Cockpit 2.0 event wiring", () => {
  it("maps collaboration / repair / steering / intelligence into PATH phase", async () => {
    const { createEmptyStudioState, applyStudioEvent } = await loadStudio();
    const state = createEmptyStudioState();
    state.sessionId = "s1";

    applyStudioEvent(state, {
      type: "session.task.received",
      sessionId: "s1",
      taskId: "t1",
      preview: "fix",
    });
    applyStudioEvent(state, {
      type: "session.capability.preparing",
      sessionId: "s1",
      detail: "Preparing environment",
    });
    applyStudioEvent(state, {
      type: "session.engineering.activity",
      sessionId: "s1",
      activity: "code_intelligence",
      label: "Code intelligence",
      detail: "symbol query",
    });
    expect(state.product.pathPhase).toBe("Code intelligence");

    applyStudioEvent(state, {
      type: "session.capability.collaborate",
      sessionId: "s1",
      engine: "copilot",
      phase: "handoff",
      label: "Collaborating",
      detail: "handoff",
    });
    expect(state.product.ag1).toBe(true);

    applyStudioEvent(state, {
      type: "session.engineering.activity",
      sessionId: "s1",
      activity: "repairing",
      label: "Repairing",
    });
    expect(state.product.pathPhase).toBe("Repairing");
    expect(state.product.ag1Mutation).toBe(true);

    applyStudioEvent(state, {
      type: "session.engineering.activity",
      sessionId: "s1",
      activity: "steering",
      label: "Steering pending",
      detail: "Keep API",
    });
    expect(state.product.pathPhase).toBe("Steering pending");

    applyStudioEvent(state, {
      type: "session.engineering.activity",
      sessionId: "s1",
      activity: "background",
      label: "Background (stale)",
      stale: true,
    });
    expect(state.product.pathPhase).toContain("Background");
  });

  it("hydration resume reconstructs without minting Verified", async () => {
    const { createEmptyStudioState, applyStudioEvent } = await loadStudio();
    const state = createEmptyStudioState();
    state.sessionId = "s2";
    applyStudioEvent(state, {
      type: "session.hydration",
      sessionId: "s2",
      stage: "task_resume",
      detail: "resuming task",
      mode: "PATH_RESUME",
    });
    expect(state.cards.terminal.status).not.toBe("done");
  });
});
