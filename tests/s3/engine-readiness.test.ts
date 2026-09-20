import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  detectCopilotAuthArtifacts,
  probeAntigravityReadiness,
  probeCopilotReadiness,
  readinessToFabricLive,
} from "../../scripts/pathcode-cli/ag10/engine-readiness.mjs";
import { explainEngineSelection } from "../../scripts/pathcode-cli/ag10/engine-contract.mjs";
import { projectBuildForSurface } from "../../scripts/pathcode-cli/build/surface/product-view.mjs";

describe("S3 engine readiness", () => {
  it("does not invent Copilot authentication from an empty home", () => {
    const home = mkdtempSync(join(tmpdir(), "path-copilot-home-"));
    const auth = detectCopilotAuthArtifacts({}, { home });
    expect(auth.authenticated).toBe(false);
    const probe = probeCopilotReadiness({ env: {}, home });
    expect(probe.ready).toBe(false);
    expect(["NOT_INSTALLED", "AUTH_REQUIRED"]).toContain(probe.reason);
    rmSync(home, { recursive: true, force: true });
  });

  it("reports Antigravity readiness from existing auth detectors", () => {
    const none = probeAntigravityReadiness({ env: {}, home: tmpdir() });
    expect(none.engineId).toBe("antigravity");
    expect(none.ready).toBe(false);
    expect(none.reason).toBe("AUTH_REQUIRED");

    const ready = probeAntigravityReadiness({
      env: { GOOGLE_CLOUD_PROJECT: "path-code-test" },
    });
    expect(ready.ready).toBe(true);
    expect(ready.authenticated).toBe(true);
  });

  it("auto-selects a ready peer instead of an unready preferred engine", () => {
    const selected = explainEngineSelection({
      ready: { antigravity: true, copilot: false, cursor: true },
      prefer: "copilot",
      needs: ["code_edit"],
      preferContinuity: false,
    });
    expect(selected.engine).not.toBe("copilot");
    expect(selected.preferredHonored).toBe(false);

    const forced = explainEngineSelection({
      ready: { antigravity: true, copilot: false, cursor: true },
      prefer: "copilot",
      forcePrefer: true,
      preferContinuity: false,
    });
    expect(forced.engine).toBe("copilot");
    expect(forced.reason).toMatch(/forced preferred copilot/);
  });

  it("maps readiness probes into fabric live flags", () => {
    const mapped = readinessToFabricLive([
      {
        engineId: "copilot",
        installed: true,
        available: true,
        authenticated: false,
        ready: false,
        reason: "AUTH_REQUIRED",
        evidence: [],
        checkedAt: new Date().toISOString(),
      },
      {
        engineId: "cursor",
        installed: true,
        available: true,
        authenticated: true,
        ready: true,
        reason: null,
        evidence: [],
        checkedAt: new Date().toISOString(),
      },
    ]);
    expect(mapped.ready.copilot).toBe(false);
    expect(mapped.ready.cursor).toBe(true);
  });

  it("projects live engineering activity and event-backed labels", () => {
    const view = projectBuildForSurface(
      {
        buildId: "b-live",
        loop: { status: "running" },
        intent: { outcome: "ICE site", outcomeRevision: 1, explicitRequirements: [] },
        outcomeCriteria: [],
        projectBindings: [{ bindingId: "x", projectRoot: "/tmp/ice" }],
        children: [
          {
            kind: "engineer",
            taskId: "task-1",
            dispatchState: "dispatched",
            provider: "cursor",
            intentRevision: 1,
          },
        ],
        hypotheses: {},
        authoritativeSha: null,
        conversation: [
          {
            id: "m1",
            role: "user",
            text: "Build ICE",
            at: "2026-09-20T00:00:00Z",
            status: "being_applied",
          },
        ],
      },
      {
        events: [{ id: 3, type: "engineer.dispatched", at: "2026-09-20T00:00:00Z" }],
        checkpoint: {
          taskId: "task-1",
          inFlightEngine: "cursor",
          changedFiles: ["index.html"],
          sha: null,
        },
      },
    );
    expect(view.progressLabel).toMatch(/Engineering|architecture|Creating/i);
    expect(view.engineeringActivity?.engine).toBe("cursor");
    expect(view.engineeringActivity?.files).toContain("index.html");
    expect(view.conversation?.[0]?.status).toBe("being_applied");
    expect(view.phase).not.toBe("idle");
  });
});
