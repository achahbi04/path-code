/**
 * S3.2 — need-aware fabric routing + structured handoff (mechanical).
 */
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const CHECKOUT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const AG10 = join(CHECKOUT, "scripts/pathcode-cli/ag10");

async function load(path: string) {
  return import(`${pathToFileURL(path).href}?s32=${randomUUID()}`);
}

describe("S3.2 fabric routing", () => {
  it("exposes honest traits on each engine capability", async () => {
    const { buildEngineCapabilityList } = await load(
      join(AG10, "engine-contract.mjs"),
    );
    const list = buildEngineCapabilityList({
      cursor: { ready: true, mode: "native_sdk" },
      copilot: { ready: true, mode: "native_sdk" },
    });
    const byId = Object.fromEntries(list.map((e: { id: string }) => [e.id, e]));
    expect(byId.antigravity.traits).toContain("bridge");
    expect(byId.copilot.traits).toContain("lsp");
    expect(byId.cursor.traits).toContain("inflight_steer");
    expect(byId.cursor.steering).toBe("immediate");
    expect(byId.copilot.steering).toBe("boundary");
  });

  it("infers turn needs from validation failures without scoring engines", async () => {
    const { inferTurnNeeds } = await load(join(AG10, "engine-contract.mjs"));
    const repair = inferTurnNeeds({
      role: "repair",
      objective: "Fix the failing typecheck",
      validation: {
        checks: [
          { id: "typecheck-local-tsc", kind: "TYPECHECK", ok: false },
          { id: "npm-test", kind: "TEST", ok: true },
        ],
      },
    });
    expect(repair.needs).toContain("repair");
    expect(repair.needs).toContain("lsp");
    expect(repair.needs).toContain("shell");

    const assess = inferTurnNeeds({
      role: "primary",
      objective: "Assess the repository. Do not modify files. Report findings.",
    });
    expect(assess.needs).toContain("assessment");
  });

  it("routes inflight-steer needs to Cursor when ready", async () => {
    const { explainEngineSelection } = await load(
      join(AG10, "engine-contract.mjs"),
    );
    const sel = explainEngineSelection({
      role: "collab",
      ready: { antigravity: true, copilot: true, cursor: true },
      needs: ["inflight_steer", "code_edit"],
      preferContinuity: false,
      attempt: 0,
    });
    expect(sel.engine).toBe("cursor");
    expect(sel.candidates).toEqual(["cursor"]);
    expect(sel.reason).toMatch(/need/i);
  });

  it("routes lsp repair needs toward Copilot among fit peers", async () => {
    const { explainEngineSelection, buildEngineCapabilityList } = await load(
      join(AG10, "engine-contract.mjs"),
    );
    const capabilities = buildEngineCapabilityList({
      copilot: { ready: true, mode: "native_sdk" },
      cursor: { ready: true, mode: "native_sdk" },
    });
    // Only Copilot claims lsp — Cursor/AG remain ready but do not meet lsp need.
    const sel = explainEngineSelection({
      role: "repair",
      attempt: 0,
      ready: { antigravity: true, copilot: true, cursor: true },
      needs: ["repair", "lsp"],
      preferContinuity: false,
      capabilities,
    });
    expect(sel.engine).toBe("copilot");
    expect(sel.candidates).toEqual(["copilot"]);
  });

  it("honors preference and continuity without inventing a hierarchy", async () => {
    const { explainEngineSelection } = await load(
      join(AG10, "engine-contract.mjs"),
    );
    expect(
      explainEngineSelection({
        role: "primary",
        ready: { antigravity: true, copilot: true, cursor: true },
        prefer: "cursor",
      }).preferredHonored,
    ).toBe(true);

    const cont = explainEngineSelection({
      role: "collab",
      ready: { antigravity: true, copilot: true, cursor: true },
      lastEngine: "copilot",
      preferContinuity: true,
    });
    expect(cont.engine).toBe("copilot");
    expect(cont.continuityHonored).toBe(true);

    // Repair still rotates among ready peers when no narrowing needs.
    const r0 = explainEngineSelection({
      role: "repair",
      attempt: 0,
      ready: { antigravity: true, copilot: true, cursor: true },
      preferContinuity: false,
    });
    const r1 = explainEngineSelection({
      role: "repair",
      attempt: 1,
      ready: { antigravity: true, copilot: true, cursor: true },
      preferContinuity: false,
    });
    expect(r0.engine).not.toBe(r1.engine);
  });

  it("formats a fabric handoff that preserves engine identity", async () => {
    const { buildFabricHandoff, formatFabricHandoff } = await load(
      join(AG10, "engine-contract.mjs"),
    );
    const packet = buildFabricHandoff({
      fromEngine: "cursor",
      toEngine: "copilot",
      objective: "Fix typecheck failures",
      needs: ["repair", "lsp"],
      reason: "rotate among need-fit peers (copilot)",
      changedFiles: ["src/a.ts"],
      headSha: "abc1234",
      validationSummary: "typecheck failed",
      journal: [
        {
          engine: "cursor",
          phase: "turn_end",
          detail: "edited src/a.ts",
          changedFiles: ["src/a.ts"],
        },
      ],
    });
    const text = formatFabricHandoff(packet);
    expect(text).toContain("Previous collaborator: cursor");
    expect(text).toContain("Your turn: copilot");
    expect(text).toContain("[cursor]");
    expect(text).toContain("Turn needs: repair, lsp");
    expect(text).toContain("PATH fabric handoff");
  });
});
