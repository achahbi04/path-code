/**
 * S3.1 — unified engine fabric contract (mechanical).
 */
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const CHECKOUT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const AG10 = join(CHECKOUT, "scripts/pathcode-cli/ag10");
const AG9 = join(CHECKOUT, "scripts/pathcode-cli/ag9");

async function load(path: string) {
  return import(`${pathToFileURL(path).href}?s3=${randomUUID()}`);
}

describe("S3.1 engine fabric contract", () => {
  it("normalizeEngineId accepts aliases without inventing engines", async () => {
    const { normalizeEngineId } = await load(join(AG10, "engine-contract.mjs"));
    expect(normalizeEngineId("cursor")).toBe("cursor");
    expect(normalizeEngineId("ag")).toBe("antigravity");
    expect(normalizeEngineId("github-copilot")).toBe("copilot");
    expect(normalizeEngineId("nope")).toBeNull();
  });

  it("selectEngineForTurn honors preference and rotates without permanent hierarchy", async () => {
    const { selectEngineForTurn } = await load(join(AG10, "engine-contract.mjs"));
    expect(
      selectEngineForTurn({
        role: "primary",
        ready: { antigravity: true, copilot: true, cursor: true },
        prefer: "cursor",
      }),
    ).toBe("cursor");

    const ready = { antigravity: true, copilot: true, cursor: true };
    const a0 = selectEngineForTurn({
      role: "repair",
      attempt: 0,
      ready,
      preferContinuity: false,
    });
    const a1 = selectEngineForTurn({
      role: "repair",
      attempt: 1,
      ready,
      preferContinuity: false,
    });
    const a2 = selectEngineForTurn({
      role: "repair",
      attempt: 2,
      ready,
      preferContinuity: false,
    });
    expect([a0, a1, a2]).toEqual(["antigravity", "copilot", "cursor"]);
    expect(new Set([a0, a1, a2]).size).toBe(3);
  });

  it("buildEngineCapabilityList reports honest cursor statuses", async () => {
    const { buildEngineCapabilityList } = await load(
      join(AG10, "engine-contract.mjs"),
    );
    const withKey = buildEngineCapabilityList({
      cursor: { ready: true, mode: "native_sdk", evidence: ["key"] },
    });
    expect(withKey.find((e: { id: string }) => e.id === "cursor")?.status).toBe(
      "available",
    );

    const auth = buildEngineCapabilityList({
      cursor: {
        ready: false,
        reason: "auth_required",
        mode: "none",
        evidence: ["no key"],
      },
    });
    expect(auth.find((e: { id: string }) => e.id === "cursor")?.status).toBe(
      "auth_required",
    );

    const missing = buildEngineCapabilityList({
      cursor: { ready: false, reason: "sdk_missing", mode: "none" },
    });
    expect(missing.find((e: { id: string }) => e.id === "cursor")?.status).toBe(
      "unavailable",
    );
    expect(missing.every((e: { status: string }) => e.status !== "slot_reserved")).toBe(
      true,
    );
  });

  it("chooseCollabEngine includes cursor when ready", async () => {
    const { chooseCollabEngine } = await load(join(AG9, "collaborate.mjs"));
    expect(
      chooseCollabEngine({
        attempt: 2,
        copilotReady: true,
        cursorReady: true,
      }),
    ).toBe("cursor");
    expect(
      chooseCollabEngine({
        attempt: 0,
        copilotReady: false,
        cursorReady: false,
      }),
    ).toBe("antigravity");
  });

  it("mapCursorSdkEvent maps assistant and tool_call families", async () => {
    const { mapCursorSdkEvent } = await load(join(AG10, "events.mjs"));
    const narrate = mapCursorSdkEvent({
      type: "assistant",
      run_id: "run-1",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Implementing the fix." }],
      },
    });
    expect(narrate?.family).toBe("engine.narrating");
    expect(narrate?.engine).toBe("cursor");

    const shellStart = mapCursorSdkEvent({
      type: "tool_call",
      run_id: "run-1",
      call_id: "c1",
      name: "Shell",
      status: "running",
      args: { command: "npm test" },
    });
    expect(shellStart?.family).toBe("command.started");

    const writeDone = mapCursorSdkEvent({
      type: "tool_call",
      run_id: "run-1",
      call_id: "c2",
      name: "Write",
      status: "completed",
      args: { path: "src/a.ts" },
    });
    expect(writeDone?.family).toBe("file.modified");

    const read = mapCursorSdkEvent({
      type: "tool_call",
      run_id: "run-1",
      call_id: "c3",
      name: "Read",
      status: "running",
      args: { path: "src/a.ts" },
    });
    expect(read?.family).toBe("file.read");
  });

  it("formatCollabHandoff renders cursor engine journal entries", async () => {
    const { formatCollabHandoff } = await load(join(AG9, "collaborate.mjs"));
    const text = formatCollabHandoff([
      {
        engine: "cursor",
        phase: "turn_end",
        detail: "fixed validation",
        changedFiles: ["src/x.ts"],
      },
      {
        engine: "antigravity",
        phase: "turn_start",
        detail: "continue",
      },
    ]);
    expect(text).toContain("[cursor]");
    expect(text).toContain("fixed validation");
    expect(text).toContain("[antigravity]");
  });
});
