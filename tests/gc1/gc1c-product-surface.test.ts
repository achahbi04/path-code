/**
 * GC1-c product surface rejection proofs:
 * - execution readiness timing (transient SSH ≠ immediate Failed)
 * - authoritative PATH/Evidence/Footer projection
 * - in-place TTY frames (R1–R10)
 * - machine capability rendering
 */
import { describe, expect, it } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../..");

async function loadGc1() {
  const t = Date.now();
  return import(
    `${pathToFileURL(join(ROOT, "scripts/pathcode-cli/gc1/index.mjs")).href}?t=${t}`
  );
}

async function loadUi() {
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

describe("GC1-c execution readiness production window", () => {
  it("production defaults are 2s interval / 180s deadline", async () => {
    const mod = await loadGc1();
    expect(mod.GC1_EXECUTION_READY_INTERVAL_MS).toBe(2_000);
    expect(mod.GC1_EXECUTION_READY_DEADLINE_MS).toBe(180_000);
    expect(mod.GC1_EXECUTION_READY_ATTEMPTS).toBe(90);
  });

  it("transient exit=255 Connection refused retries then reaches Ready", async () => {
    const {
      createMockWorkstationTransport,
      createWorkstationLifecycleManager,
      isTransientExecutionChannelFailure,
    } = await loadGc1();

    expect(
      isTransientExecutionChannelFailure({
        exitCode: 255,
        stderr: "Connection refused",
        stdout: "",
      }),
    ).toBe(true);
    expect(
      isTransientExecutionChannelFailure({
        exitCode: 1,
        stderr: "PERMISSION_DENIED: workstations.workstations.ssh",
        stdout: "",
      }),
    ).toBe(false);

    const transport = createMockWorkstationTransport({
      pollsUntilRunning: 1,
      connectionRefusedBeforeSuccess: 2,
    });
    transport.seedCluster();
    transport.seedConfig();
    const manager = createWorkstationLifecycleManager({
      transport,
      deadlineMs: 5_000,
      pollIntervalMs: 5,
      executionReadyAttempts: 6,
      executionReadyIntervalMs: 1,
    });
    const ready = await manager.acquireProbeWorkstation();
    expect(ready.executionReady).toBe(true);
    expect(ready.healthCheck).toBe("HEALTH_CHECK_OK");
    expect(ready.executionReadyAttempts).toBeGreaterThanOrEqual(3);
    await manager.teardown();
  });

  it("persistent readiness failure → EXECUTION_NOT_READY + dispose (never success)", async () => {
    const { createMockWorkstationTransport, createWorkstationLifecycleManager } =
      await loadGc1();
    const transport = createMockWorkstationTransport({
      pollsUntilRunning: 1,
      connectionRefusedBeforeSuccess: 100,
    });
    transport.seedCluster();
    transport.seedConfig();
    const manager = createWorkstationLifecycleManager({
      transport,
      deadlineMs: 5_000,
      pollIntervalMs: 5,
      executionReadyDeadlineMs: 8,
      executionReadyIntervalMs: 1,
    });
    await expect(manager.acquireProbeWorkstation()).rejects.toMatchObject({
      code: "GC1_EXECUTION_NOT_READY",
    });
    expect(transport.hasWorkstation("pathcode-gc1-probe")).toBe(false);
  });

  it("auth/config permanent failure fails closed without exhausting 180s", async () => {
    const { createMockWorkstationTransport, createWorkstationLifecycleManager } =
      await loadGc1();
    const transport = createMockWorkstationTransport({
      pollsUntilRunning: 1,
    });
    transport.seedCluster();
    transport.seedConfig();
    const original = transport.executeCommand.bind(transport);
    transport.executeCommand = async (req: { command: string; workstationName?: string }) => {
      if (String(req.command).includes("HEALTH_CHECK_OK")) {
        return {
          stdout: "",
          stderr: "ERROR: PERMISSION_DENIED: workstations.workstations.ssh",
          exitCode: 1,
        };
      }
      return original(req);
    };
    const manager = createWorkstationLifecycleManager({
      transport,
      deadlineMs: 5_000,
      pollIntervalMs: 5,
      executionReadyDeadlineMs: 180_000,
      executionReadyIntervalMs: 2_000,
    });
    const t0 = Date.now();
    await expect(manager.acquireProbeWorkstation()).rejects.toMatchObject({
      code: "GC1_EXECUTION_NOT_READY",
      permanent: true,
    });
    expect(Date.now() - t0).toBeLessThan(5_000);
  });
});

describe("GC1-c living product surface authority (R1–R10)", () => {
  it("R4: workstation starting + Gate 2 waiting cannot render Complete", async () => {
    const {
      createEmptyStudioState,
      applyStudioEvent,
      projectAuthoritativePathPhase,
      buildLivingProductLines,
      LIVING_PRODUCT_MIN_COLUMNS,
    } = await loadUi();
    let state = createEmptyStudioState();
    const sid = "r4";
    for (const e of [
      { type: "session.cloud.selected", sessionId: sid, region: "europe-west4" },
      { type: "session.environment.preparing", sessionId: sid, config: "cfg" },
      {
        type: "session.terminal",
        sessionId: sid,
        disposition: "GC1_EXECUTION_NOT_READY",
        summary: "expected HEALTH_CHECK_OK",
      },
    ]) {
      applyStudioEvent(state, e);
    }
    // Even if a buggy path tried Complete, projection must refuse it while starting.
    state.product.pathPhase = "Complete";
    expect(projectAuthoritativePathPhase(state)).not.toBe("Complete");
    const text = buildLivingProductLines(state, {
      rows: 40,
      columns: LIVING_PRODUCT_MIN_COLUMNS,
    }).join("\n");
    expect(text).not.toMatch(/✓ Complete/);
    expect(text).toMatch(/Infrastructure failure|Failed|Starting/);
  });

  it("R3: Gate 1 grounded immediately shows ✓", async () => {
    const { createEmptyStudioState, applyStudioEvent, buildEvidenceLines } =
      await loadUi();
    const state = createEmptyStudioState();
    applyStudioEvent(state, {
      type: "session.gate1",
      sessionId: "g1",
      status: "grounded",
    });
    expect(buildEvidenceLines(state).join("\n")).toMatch(/Gate 1\s+✓/);
  });

  it("R5: cloud failure renders Failed / Infrastructure failure", async () => {
    const {
      createEmptyStudioState,
      applyStudioEvent,
      projectAuthoritativePathPhase,
      buildLivingProductLines,
      LIVING_PRODUCT_MIN_COLUMNS,
    } = await loadUi();
    const state = createEmptyStudioState();
    applyStudioEvent(state, {
      type: "session.infrastructure.failure",
      sessionId: "f",
      code: "GC1_EXECUTION_NOT_READY",
      message: "Workstation execution channel did not become ready.",
    });
    expect(projectAuthoritativePathPhase(state)).toBe("Infrastructure failure");
    const text = buildLivingProductLines(state, {
      rows: 40,
      columns: LIVING_PRODUCT_MIN_COLUMNS,
    }).join("\n");
    expect(text).toMatch(/Infrastructure failure/);
    expect(text).toMatch(/Environment\s+✕/);
    expect(text).not.toMatch(/✓ Complete/);
  });

  it("R6: validation failure renders Gate 2 NOT ESTABLISHED", async () => {
    const { createEmptyStudioState, applyStudioEvent, buildEvidenceLines } =
      await loadUi();
    const state = createEmptyStudioState();
    applyStudioEvent(state, {
      type: "session.validation.result",
      sessionId: "v",
      check: "TARGETED_TEST",
      status: "NOT_PASS",
    });
    applyStudioEvent(state, {
      type: "session.gate2",
      sessionId: "v",
      status: "not-established",
    });
    expect(buildEvidenceLines(state).join("\n")).toContain("NOT ESTABLISHED");
  });

  it("R7: cleanup then disposed", async () => {
    const { createEmptyStudioState, applyStudioEvent, projectAuthoritativePathPhase } =
      await loadUi();
    const state = createEmptyStudioState();
    applyStudioEvent(state, {
      type: "session.cloud.selected",
      sessionId: "c",
      region: "europe-west4",
    });
    applyStudioEvent(state, { type: "session.cleanup", sessionId: "c" });
    expect(projectAuthoritativePathPhase(state)).toBe("Cleaning up");
    expect(state.product.cloudFooter).toMatch(/Cleaning up/);
    applyStudioEvent(state, {
      type: "session.workstation.disposed",
      sessionId: "c",
    });
    expect(state.product.cloudFooter).toMatch(/Disposed/);
    expect(state.product.disposed).toBe(true);
  });

  it("R1/R2: multiple events update one managed frame; diagnostics stay out of stdout", async () => {
    const {
      createInlineStudioRenderer,
      installCollisionGuard,
      LIVING_PRODUCT_MIN_COLUMNS,
    } = await loadUi();
    const chunks: string[] = [];
    const stdout = {
      isTTY: true,
      rows: 40,
      columns: LIVING_PRODUCT_MIN_COLUMNS,
      write(s: string) {
        chunks.push(s);
      },
      on() {},
      off() {},
    };
    const renderer = createInlineStudioRenderer({ stdout: stdout as any, enabled: true });
    const prompt = { write(t: string) { stdout.write(t); } };
    const uninstall = installCollisionGuard(prompt, renderer);
    renderer.begin();
    renderer.onEvent({
      type: "session.environment.preparing",
      sessionId: "r1",
      config: "cfg",
    });
    renderer.onEvent({
      type: "session.workstation.ready",
      sessionId: "r1",
    });
    prompt.write("Cloud preparation refused: boom\n");
    const joined = chunks.join("");
    expect(joined).not.toContain("Cloud preparation refused");
    expect(renderer.stats().diagnostics.join("")).toContain("Cloud preparation refused");
    // Frames use cursor-up / erase — not stacked duplicate full dashboards without ANSI.
    const ansiFrames = chunks.filter((c) => c.includes("\u001b["));
    expect(ansiFrames.length).toBeGreaterThanOrEqual(2);
    expect(ansiFrames.some((f) => f.includes("\u001b[") && /PATH|Starting|Ready|Preparing/.test(f))).toBe(
      true,
    );
    uninstall();
    renderer.finish();
    expect(renderer.stats().active).toBe(false);
    expect(renderer.stats().hasResizeListener).toBe(false);
  });

  it("R8: renderer timers/handles gone after finish", async () => {
    const { createInlineStudioRenderer, LIVING_PRODUCT_MIN_COLUMNS } = await loadUi();
    const stdout = {
      isTTY: true,
      rows: 24,
      columns: LIVING_PRODUCT_MIN_COLUMNS,
      write() {},
      on() {},
      off() {},
    };
    const renderer = createInlineStudioRenderer({ stdout: stdout as any, enabled: true });
    renderer.begin();
    renderer.onEvent({ type: "session.task.received", sessionId: "r8", task: "x" });
    renderer.finish();
    expect(renderer.stats().active).toBe(false);
    expect(renderer.stats().hasResizeListener).toBe(false);
    expect(renderer.stats().cursorHidden).toBe(false);
  });

  it("R9: non-TTY output remains deterministic plain text", async () => {
    const { createInlineStudioRenderer } = await loadUi();
    const lines: string[] = [];
    const renderer = createInlineStudioRenderer({
      stdout: { isTTY: false, write(s: string) { lines.push(s); } } as any,
      enabled: false,
      writePlain: (t: string) => lines.push(t),
    });
    renderer.begin();
    renderer.onEvent({
      type: "session.environment.preparing",
      sessionId: "r9",
      config: "cfg",
    });
    renderer.finish();
    const text = lines.join("");
    expect(text).not.toMatch(/\u001b\[/);
    expect(text).toMatch(/Preparing cloud environment/);
  });

  it("R10: ANSI from project output cannot rewrite trusted columns", async () => {
    const { createEmptyStudioState, applyStudioEvent, buildLivingProductLines, fitLine, LIVING_PRODUCT_MIN_COLUMNS } =
      await loadUi();
    const state = createEmptyStudioState();
    applyStudioEvent(state, {
      type: "session.scope.admitted",
      sessionId: "r10",
      editable: ["src/greet.ts\u001b[2J\u001b[H"],
      context: [],
    });
    const lines = buildLivingProductLines(state, {
      rows: 40,
      columns: LIVING_PRODUCT_MIN_COLUMNS,
    });
    const text = lines.join("\n");
    expect(text).not.toMatch(/\u001b\[2J/);
    expect(fitLine("evil\u001b[2J", 20)).not.toContain("\u001b[2J");
  });

  it("PROJECT shows main · clean and file roles", async () => {
    const {
      createEmptyStudioState,
      applyStudioEvent,
      buildLivingProductLines,
      LIVING_PRODUCT_MIN_COLUMNS,
    } = await loadUi();
    const state = createEmptyStudioState();
    applyStudioEvent(state, {
      type: "session.preflight",
      sessionId: "p",
      branch: "main @ abc",
      dirtySummary: "clean",
    });
    applyStudioEvent(state, {
      type: "session.scope.admitted",
      sessionId: "p",
      editable: ["src/greet.ts"],
      context: ["src/greet.test.ts", "package.json"],
    });
    const text = buildLivingProductLines(state, {
      rows: 40,
      columns: LIVING_PRODUCT_MIN_COLUMNS,
    }).join("\n");
    expect(text).toMatch(/main · clean/);
    expect(text).toMatch(/editable/);
    expect(text).toMatch(/validation/);
    expect(text).toMatch(/execution/);
    expect(text).not.toMatch(/^Git$/m);
  });
});

describe("GC1-c machine capability surface", () => {
  it("live version result renders; missing command shows MISSING", async () => {
    const {
      queryMachineCapabilities,
      formatMachineCapabilityLines,
      interpretToolResult,
    } = await loadGc1();
    const {
      createEmptyStudioState,
      applyStudioEvent,
      buildLivingProductLines,
      LIVING_PRODUCT_MIN_COLUMNS,
    } = await loadUi();

    expect(interpretToolResult({ exitCode: 0, stdout: "v24.20.0\n" }, "node")).toEqual({
      present: true,
      version: "24.20.0",
      raw: expect.any(String),
    });
    expect(interpretToolResult({ exitCode: 127, stdout: "", stderr: "not found" }, "bun")).toEqual({
      present: false,
      version: null,
      raw: expect.any(String),
    });

    const fakeTransport = {
      async executeCommand({ command }: { command: string }) {
        if (command.startsWith("node ")) return { exitCode: 0, stdout: "v24.20.1\n", stderr: "" };
        if (command.startsWith("npm ")) return { exitCode: 0, stdout: "10.9.0\n", stderr: "" };
        if (command.startsWith("python3 ")) return { exitCode: 0, stdout: "Python 3.12.0\n", stderr: "" };
        if (command.startsWith("git ")) return { exitCode: 0, stdout: "git version 2.45.0\n", stderr: "" };
        return { exitCode: 127, stdout: "", stderr: "MISSING" };
      },
    };
    const caps = await queryMachineCapabilities(fakeTransport, {
      workstationName: "ws",
    });
    expect(caps.tools.node.version).toBe("24.20.1");
    expect(caps.tools.bun.present).toBe(false);
    expect(formatMachineCapabilityLines(caps.tools).join("\n")).toMatch(/bun MISSING/i);

    const state = createEmptyStudioState();
    applyStudioEvent(state, {
      type: "session.workstation.ready",
      sessionId: "m",
    });
    applyStudioEvent(state, {
      type: "session.machine.capabilities",
      sessionId: "m",
      lines: caps.lines,
    });
    const text = buildLivingProductLines(state, {
      rows: 50,
      columns: LIVING_PRODUCT_MIN_COLUMNS,
    }).join("\n");
    expect(text).toContain("MACHINE");
    expect(text).toMatch(/Node 24/);
    expect(text).toMatch(/MISSING/);
  });
});
