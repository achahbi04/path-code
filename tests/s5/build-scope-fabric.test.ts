/**
 * S5 scope fidelity, primary peer selection, and executor provenance.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  explicitCreatorConstraints,
  frameEngineerObjective,
} from "../../scripts/pathcode-cli/build/objectives.mjs";
import {
  primaryAdapterFor,
  primaryRotationAttempt,
  selectPrimaryEngine,
} from "../../scripts/pathcode-cli/ag10/engine-contract.mjs";
import { createBuildController } from "../../scripts/pathcode-cli/build/index.mjs";
import { extractProviderProvenance } from "../../scripts/pathcode-cli/build/reconcile.mjs";
import {
  createCheckpointSkeleton,
  writeTaskCheckpoint,
} from "../../scripts/pathcode-cli/ag10/task-checkpoint.mjs";
import {
  buildEngineeringReportModel,
  formatEngineeringReportPlain,
} from "../../scripts/pathcode-cli/engineering-report.mjs";

const READY = { antigravity: true, copilot: true, cursor: true };

function followUpRecord(message: string) {
  return {
    authoritativeSha: "abc123",
    intent: { outcome: "Build a small bakery page with a secondary CTA", outcomeRevision: 2 },
    conversation: [
      {
        role: "user",
        intentRevision: 2,
        text: message,
      },
    ],
    children: [
      { kind: "engineer", adoptedSha: "abc123", dispatchState: "consumed" },
    ],
    projectBindings: [{ originGitInit: true }],
    productBrief: { productKind: "web" },
    hypotheses: {},
    loop: {},
  };
}

describe("scope fidelity objectives", () => {
  it("keeps a narrow follow-up request controlling and drops greenfield mandates", () => {
    const message =
      'Change the secondary CTA text from "Learn how ICE works" to "Explore how ICE works". Do not change anything else.';
    const objective = frameEngineerObjective(followUpRecord(message), message);
    expect(objective).toContain("CURRENT CREATOR REQUEST");
    expect(objective).toContain(message);
    expect(objective).toContain("EXPLICIT CREATOR CONSTRAINTS");
    expect(objective).toContain("Do not change anything else.");
    expect(objective).toContain("Preserve unrelated existing product behavior");
    expect(objective).toContain("preserve the existing project's runnability");
    expect(objective).toContain("inspect the diff this turn produced");
    expect(objective).not.toContain("Establish or modify architecture");
    expect(objective).not.toContain("previewable website");
    expect(objective).not.toContain("Highest-value gap");
    expect(explicitCreatorConstraints(message)).toEqual([
      "Do not change anything else.",
    ]);
  });

  it("still allows a greenfield build to carry the creator request as the only product instruction", () => {
    const outcome = "Build a polished public website for ICE";
    const record = {
      intent: { outcome, outcomeRevision: 1 },
      productBrief: { productKind: "web" },
      projectBindings: [{ originGitInit: true }],
      conversation: [
        { role: "user", intentRevision: 1, text: outcome },
      ],
      children: [],
    };
    const objective = frameEngineerObjective(record, outcome);
    expect(objective).toContain("CURRENT CREATOR REQUEST");
    expect(objective).toContain(outcome);
    expect(objective).toContain("Do NOT run `git init`");
    expect(objective).not.toContain("Establish or modify architecture, manifests, code, tests, and config as needed.");
    expect(objective).not.toContain("Highest-value gap");
    expect(objective).not.toContain(
      "Establish the software architecture, manifests, and runnable structure required by the outcome.",
    );
  });

  it("does not invent a one-file limit for a complex follow-up", () => {
    const objective = frameEngineerObjective(
      followUpRecord("Add authentication."),
      "Add authentication.",
    );
    expect(objective).toContain("Add authentication.");
    expect(objective).toContain("reasonably required to satisfy the current request");
    expect(objective).not.toContain("only touch one file");
    expect(objective).not.toContain("Establish or modify architecture, manifests, code, tests, and config as needed.");
    expect(objective).toContain("(none stated beyond the request itself)");
  });
});

describe("primary fabric selection", () => {
  it("can select each ready peer from the existing rotation", () => {
    const selected = [0, 1, 2].map(
      (attempt) =>
        selectPrimaryEngine({
          attempt,
          ready: READY,
          prefer: null,
          lastEngine: null,
          preferContinuity: false,
        }).engine,
    );
    expect(new Set(selected)).toEqual(new Set(["antigravity", "copilot", "cursor"]));
    expect(selected[0]).not.toBe(selected[1]);
  });

  it("does not leave every no-preference task on the first candidate", () => {
    const seen = new Set<string>();
    for (let n = 0; n < 40; n += 1) {
      const taskId = `task-${n}`;
      seen.add(
        selectPrimaryEngine({
          taskId,
          ready: READY,
          prefer: null,
          lastEngine: null,
          preferContinuity: false,
        }).engine,
      );
    }
    expect(seen.size).toBe(3);
    expect(primaryRotationAttempt("task-0")).not.toBe(primaryRotationAttempt("task-1"));
  });

  it("honors a ready preference and does not invoke an unready one", () => {
    const preferred = selectPrimaryEngine({
      attempt: 0,
      ready: READY,
      prefer: "copilot",
      lastEngine: null,
      preferContinuity: false,
    });
    expect(preferred.engine).toBe("copilot");
    expect(preferred.preferredHonored).toBe(true);
    expect(primaryAdapterFor(preferred, READY)).toBe("copilot");

    const unready = selectPrimaryEngine({
      attempt: 0,
      ready: { antigravity: true, copilot: false, cursor: true },
      prefer: "copilot",
      lastEngine: null,
      preferContinuity: false,
    });
    expect(unready.engine).not.toBe("copilot");
    expect(unready.preferredHonored).toBe(false);
    expect(
      primaryAdapterFor(unready, { antigravity: true, copilot: false, cursor: true }),
    ).not.toBe("copilot");
    expect(primaryAdapterFor({ engine: "cursor" }, { antigravity: true, copilot: true, cursor: false })).toBeNull();
  });
});

describe("executor provenance", () => {
  it("keeps an Antigravity primary when Cursor and Copilot are only attached", () => {
    const provenance = extractProviderProvenance({
      cursorMode: "native_sdk",
      copilotMode: "native_sdk",
      cursorSessionId: "agent-attached",
      copilotSessionId: "path-attached",
      agSessionMode: "ACTIVE",
      latestEngineTurn: null,
      engineTurns: [
        {
          engine: "antigravity",
          role: "primary",
          mode: "bridge",
          provider: "Vertex AI",
          model: "gemini-2.5-flash",
          sessionId: "task-ag",
          state: "finished",
        },
      ],
    });
    expect(provenance.provider).toBe("antigravity");
    expect(provenance.model).toBe("gemini-2.5-flash");
    expect(provenance.engineMode).toBe("bridge");
    const plain = formatEngineeringReportPlain(
      buildEngineeringReportModel(
        {
          taskObjective: "change the CTA",
          executor: "antigravity",
          executionProvider: "Vertex AI",
          executionModel: "gemini-2.5-flash",
          engineMode: "bridge",
          cursorMode: "native_sdk",
          resultClassification: "VERIFIED",
        },
        {
          executor: "antigravity",
          executionProvider: "Vertex AI",
          executionModel: "gemini-2.5-flash",
          engineMode: "bridge",
          cursorMode: "native_sdk",
        },
      ),
    );
    expect(plain).toMatch(/executor\s+antigravity/);
    expect(plain).toMatch(/model\s+gemini-2\.5-flash/);
    expect(plain).not.toMatch(/cursor\s+native_sdk/);
  });

  it("records cursor and copilot primaries from execution turns", () => {
    expect(
      extractProviderProvenance({
        cursorMode: "native_sdk",
        copilotMode: "native_sdk",
        engineTurns: [{ engine: "cursor", role: "primary", mode: "native_sdk", model: "composer-2.5", sessionId: "agent-1" }],
      }).provider,
    ).toBe("cursor");
    expect(
      extractProviderProvenance({
        cursorMode: "native_sdk",
        agSessionMode: "ACTIVE",
        engineTurns: [{ engine: "copilot", role: "primary", mode: "native_sdk", model: null, sessionId: "path-1" }],
      }).provider,
    ).toBe("copilot");
  });

  it("keeps the primary turn when a repair turn follows", () => {
    const provenance = extractProviderProvenance({
      engineTurns: [
        { engine: "copilot", role: "primary", mode: "native_sdk", model: null, state: "finished" },
        { engine: "antigravity", role: "repair", mode: "bridge", model: "gemini-2.5-flash", state: "finished" },
      ],
    });
    expect(provenance.provider).toBe("copilot");
    expect(provenance.turns).toHaveLength(2);
    expect(provenance.turns[1]?.engine).toBe("antigravity");
  });

  it("leaves an unknown model unknown", () => {
    const provenance = extractProviderProvenance({
      engineTurns: [{ engine: "copilot", role: "primary", mode: "cli_fallback", model: null }],
    });
    expect(provenance.model).toBeNull();
    const plain = formatEngineeringReportPlain(
      buildEngineeringReportModel(
        { taskObjective: "edit", executor: "copilot", engineMode: "cli_fallback" },
        { executor: "copilot", engineMode: "cli_fallback" },
      ),
    );
    expect(plain).toMatch(/model\s+unknown/);
  });
});

describe("product brief transport", () => {
  it("stops after one unreadable brief instead of paying for another", async () => {
    const dir = mkdtempSync(join(tmpdir(), "path-s5-brief-"));
    const runtimeRoot = join(dir, "rt");
    const target = join(dir, "proj");
    const controller = createBuildController({
      runtimeRoot,
      gateway: {
        async bindProject() {
          return { ok: true };
        },
        async startTask(_objective: string, extra: { taskId: string; cwd?: string }) {
          writeTaskCheckpoint(
            runtimeRoot,
            createCheckpointSkeleton({
              taskId: extra.taskId,
              worktreePath: extra.cwd || target,
              finalState: "completed",
              validation: { classification: "VERIFIED" },
            }),
          );
          return { ok: true, taskId: extra?.taskId };
        },
        async awaitTask() {
          return {};
        },
        async getResult() {
          return { result: { engineResultText: "I changed the page." } };
        },
      },
    });
    const started = await controller.startBuild("Build a small page with a secondary CTA", {
      targetDir: target,
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const ran = await controller.runUntilDone(started.build.buildId, { maxSteps: 6 });
    const briefs = (ran.build?.children || []).filter((child) => child.kind === "brief");
    expect(briefs.length).toBeLessThanOrEqual(2);
    expect(ran.build?.loop.status).toBe("blocked");
    expect(ran.build?.loop.blockedReason || "").toMatch(/PRODUCT_BRIEF_UNREADABLE/);
    rmSync(dir, { recursive: true, force: true });
  });
});
