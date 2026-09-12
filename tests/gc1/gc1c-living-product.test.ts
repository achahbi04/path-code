/**
 * GC1-c living product surface — three-column wide TTY + evidence honesty.
 */
import { describe, expect, it } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../..");

async function load() {
  const t = Date.now();
  return {
    ...(await import(
      `${pathToFileURL(join(ROOT, "scripts/path-studio/state.mjs")).href}?t=${t}`
    )),
    ...(await import(
      `${pathToFileURL(join(ROOT, "scripts/pathcode-cli/inline-studio.mjs")).href}?t=${t}`
    )),
  };
}

describe("GC1-c living product surface", () => {
  it("wide TTY renders PROJECT | PATH | EVIDENCE + cloud footer from real events", async () => {
    const {
      createEmptyStudioState,
      applyStudioEvent,
      buildLivingProductLines,
      LIVING_PRODUCT_MIN_COLUMNS,
    } = await load();
    let state = createEmptyStudioState();
    const sid = "sess-living";
    const events = [
      { type: "session.cloud.selected", sessionId: sid, config: "pathcode-gc1b-config-v4", region: "europe-west4" },
      { type: "session.task.received", sessionId: sid, task: "fix greet" },
      { type: "session.preflight", sessionId: sid, branch: "main @ abc", dirtySummary: "clean" },
      {
        type: "session.scope.admitted",
        sessionId: sid,
        editable: ["src/greet.ts"],
        context: ["src/greet.test.ts"],
      },
      { type: "session.environment.preparing", sessionId: sid, config: "pathcode-gc1b-config-v4" },
      { type: "session.workstation.ready", sessionId: sid },
      { type: "session.hydration", sessionId: sid, files: 5 },
      { type: "session.gate1", sessionId: sid, status: "grounded" },
      { type: "session.recovery.checkpoint", sessionId: sid, id: "cp1", status: "READY" },
      { type: "session.validation.running", sessionId: sid, check: "TYPECHECK" },
    ];
    for (const e of events) applyStudioEvent(state, e);

    expect(state.product.pathPhase).toBe("Testing");
    expect(state.product.cloudFooter).toMatch(/Running|Hydrating|Ready|☁/);
    expect(state.cards.gate2.arrived).toBe(false);

    const lines = buildLivingProductLines(state, {
      rows: 40,
      columns: LIVING_PRODUCT_MIN_COLUMNS,
    });
    const text = lines.join("\n");
    expect(text).toContain("PROJECT");
    expect(text).toContain("PATH");
    expect(text).toContain("EVIDENCE");
    expect(text).toContain("src/greet.ts");
    expect(text).toMatch(/◆ Testing|◆ Verifying|◆/);
    expect(text).toContain("Gate 1");
    expect(text).toContain("Gate 2          waiting");
    expect(text).not.toMatch(/Gate 2\s+✓/);
    expect(text).toMatch(/☁/);
  });

  it("R17: Gate 2 ✓ only after authentic session.gate2 accepted", async () => {
    const { createEmptyStudioState, applyStudioEvent, buildEvidenceLines } =
      await load();
    let state = createEmptyStudioState();
    applyStudioEvent(state, {
      type: "session.gate1",
      sessionId: "s",
      status: "grounded",
    });
    expect(buildEvidenceLines(state).join("\n")).not.toMatch(/Gate 2\s+✓/);
    applyStudioEvent(state, {
      type: "session.gate2",
      sessionId: "s",
      status: "not-established",
    });
    expect(buildEvidenceLines(state).join("\n")).toContain("NOT ESTABLISHED");
    expect(buildEvidenceLines(state).join("\n")).not.toMatch(/Gate 2\s+✓/);

    state = createEmptyStudioState();
    applyStudioEvent(state, {
      type: "session.gate2",
      sessionId: "s2",
      status: "accepted",
    });
    expect(buildEvidenceLines(state).join("\n")).toMatch(/Gate 2\s+✓/);
  });

  it("R16: pending hydration visibly changes PATH before terminal", async () => {
    const { createEmptyStudioState, applyStudioEvent } = await load();
    const state = createEmptyStudioState();
    applyStudioEvent(state, {
      type: "session.cloud.selected",
      sessionId: "pend",
      region: "europe-west4",
    });
    expect(state.product.pathPhase).toBe("Preparing environment");
    applyStudioEvent(state, {
      type: "session.environment.preparing",
      sessionId: "pend",
      config: "cfg",
    });
    expect(state.product.pathPhase).toBe("Starting workstation");
    expect(state.product.cloudFooter).toMatch(/Starting workstation/);
    applyStudioEvent(state, {
      type: "session.hydration",
      sessionId: "pend",
      files: 3,
    });
    expect(state.product.pathPhase).toBe("Hydrating");
    expect(state.cards.terminal.arrived).toBe(false);
  });

  it("narrow TTY keeps card stack (compat)", async () => {
    const { createEmptyStudioState, applyStudioEvent, buildInlineCardLines } =
      await load();
    const state = createEmptyStudioState();
    applyStudioEvent(state, {
      type: "session.gate1",
      sessionId: "n",
      status: "grounded",
    });
    const lines = buildInlineCardLines(state, { rows: 40, columns: 80 });
    expect(lines.join("\n")).toContain("PATH ● Code");
    expect(lines.join("\n")).toMatch(/Gate 1/);
  });
});
