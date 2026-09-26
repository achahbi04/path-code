/**
 * Phase 3 — remove surviving automatic re-engineering paths (D2 / D3 / D4).
 *
 * Exit: the only thing that starts an engineer is a creator request or an
 * explicitly chosen fabric step.
 */
import { describe, expect, it } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

import {
  createBuildController,
  readBuildRecord,
  writeBuildRecord,
} from "../../scripts/pathcode-cli/build/index.mjs";
import { frameEngineerObjective } from "../../scripts/pathcode-cli/build/objectives.mjs";
import {
  createCheckpointSkeleton,
  writeTaskCheckpoint,
} from "../../scripts/pathcode-cli/ag10/task-checkpoint.mjs";

function git(cwd: string, args: string[]) {
  return spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      GIT_AUTHOR_NAME: "PATH Build",
      GIT_AUTHOR_EMAIL: "path-build@localhost",
      GIT_COMMITTER_NAME: "PATH Build",
      GIT_COMMITTER_EMAIL: "path-build@localhost",
    },
  });
}

const baseGateway = {
  async bindProject() {
    return { ok: true };
  },
  async awaitTask() {
    return {};
  },
};

describe("Phase 3 auto-reengineering removal", () => {
  it("D2: NON_WEB produces zero new children and no PATH repair objective", async () => {
    const runtimeRoot = mkdtempSync(join(tmpdir(), "path-p3-nonweb-rt-"));
    const target = mkdtempSync(join(tmpdir(), "path-p3-nonweb-proj-"));
    const controller = createBuildController({
      runtimeRoot,
      fakeMode: true,
      gateway: baseGateway,
    });
    const started = await controller.startBuild(
      "Build a dark-mode homepage website with a header",
      { targetDir: target },
    );
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    // Force web intent on the record, then consume a CLI-only engineer result.
    const record = readBuildRecord(runtimeRoot, started.build.buildId)!;
    record.productBrief = {
      ...(record.productBrief || {}),
      source: "cognitive",
      productKind: "web",
      intentRevision: record.intent.outcomeRevision,
      summary: "Website",
    };
    writeBuildRecord(runtimeRoot, record);

    const taskId = "cccccccc-cccc-cccc-cccc-cccccccccccc";
    const taskBranch = `path/task-${taskId}`;
    mkdirSync(join(target, "src"), { recursive: true });
    writeFileSync(join(target, "src", "cli.js"), "console.log('cli')\n");
    writeFileSync(
      join(target, "package.json"),
      `${JSON.stringify({ name: "cli-only", private: true }, null, 2)}\n`,
    );
    // Remove any web entry the fake origin may have created.
    try {
      const { unlinkSync, existsSync } = await import("node:fs");
      if (existsSync(join(target, "index.html"))) unlinkSync(join(target, "index.html"));
    } catch {
      // ignore
    }
    git(target, ["checkout", "-B", taskBranch]);
    git(target, ["add", "-A"]);
    git(target, ["commit", "-m", "cli only"]);
    const sha = String(git(target, ["rev-parse", "HEAD"]).stdout || "").trim();
    const baseline = String(git(target, ["rev-parse", "HEAD~1"]).stdout || "").trim();
    writeTaskCheckpoint(
      runtimeRoot,
      createCheckpointSkeleton({
        taskId,
        worktreePath: target,
        finalState: "VERIFIED",
        validation: { classification: "VERIFIED" },
        sha,
        baseline,
        branch: taskBranch,
        changedFiles: ["src/cli.js", "package.json"],
      }),
    );

    const before = readBuildRecord(runtimeRoot, started.build.buildId)!;
    const engineersBefore = (before.children || []).filter((c) => c.kind === "engineer").length;
    before.children.push({
      kind: "engineer",
      taskId,
      actionId: "engineer:nonweb",
      bindingId: before.projectBindings[0]!.bindingId,
      dispatchState: "terminal_seen",
      intentRevision: before.intent.outcomeRevision,
      classification: "VERIFIED",
      sourceSha: sha,
    });
    writeBuildRecord(runtimeRoot, before);

    await controller.consumeChildResult(started.build.buildId, taskId);
    const after = readBuildRecord(runtimeRoot, started.build.buildId)!;
    const engineers = (after.children || []).filter((child) => child.kind === "engineer");
    expect(engineers.length).toBe(engineersBefore + 1);
    const nonWeb = engineers.find((child) => child.taskId === taskId);
    expect(nonWeb?.classification).toMatch(/NOT_VERIFIED/i);
    expect(after.loop.forceNextKind).toBeUndefined();
    expect(after.loop.fabricSteps || []).toEqual([]);
    expect(after.pendingCandidate).toBeUndefined();
    expect(after.loop.status).toBe("blocked");
    expect(String(after.hypotheses?.proposedNextAction || "")).not.toMatch(
      /previewable website/i,
    );

    await controller.tick(started.build.buildId);
    const again = readBuildRecord(runtimeRoot, started.build.buildId)!;
    expect(
      (again.children || []).filter((child) => child.kind === "engineer").length,
    ).toBe(engineers.length);

    rmSync(runtimeRoot, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  }, 90_000);

  it("D3: follow-up fabric steps carry distinct step text with the creator request", async () => {
    const runtimeRoot = mkdtempSync(join(tmpdir(), "path-p3-fabric-rt-"));
    const target = mkdtempSync(join(tmpdir(), "path-p3-fabric-proj-"));
    const controller = createBuildController({
      runtimeRoot,
      fakeMode: true,
      gateway: baseGateway,
    });
    const started = await controller.startBuild("Build a marker page", {
      targetDir: target,
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    await controller.runUntilDone(started.build.buildId, { maxSteps: 8 });
    await controller.applyCandidate(started.build.buildId);

    await controller.applyConversation(started.build.buildId, {
      message: "add a logo to the homepage",
    });
    const steered = readBuildRecord(runtimeRoot, started.build.buildId)!;
    steered.loop.fabricSteps = [
      "Add the logo asset and mark",
      "Polish spacing like an Apple marketing page",
    ];
    writeBuildRecord(runtimeRoot, steered);

    const first = await controller.runUntilDone(started.build.buildId, { maxSteps: 8 });
    expect(first.build?.pendingCandidate?.status).toBe("pending");
    const afterFirst = readBuildRecord(runtimeRoot, started.build.buildId)!;
    const eng1 = [...(afterFirst.children || [])]
      .reverse()
      .find((child) => child.kind === "engineer");
    expect(eng1?.objective).toContain("add a logo to the homepage");
    expect(eng1?.objective).toContain("CURRENT FABRIC STEP");
    expect(eng1?.objective).toContain("Add the logo asset and mark");
    await controller.applyCandidate(started.build.buildId);

    const second = await controller.runUntilDone(started.build.buildId, { maxSteps: 8 });
    expect(second.build?.pendingCandidate?.status).toBe("pending");
    const afterSecond = readBuildRecord(runtimeRoot, started.build.buildId)!;
    const eng2 = [...(afterSecond.children || [])]
      .reverse()
      .find((child) => child.kind === "engineer");
    expect(eng2?.objective).toContain("add a logo to the homepage");
    expect(eng2?.objective).toContain("Polish spacing like an Apple marketing page");
    expect(eng1?.objective).not.toBe(eng2?.objective);

    rmSync(runtimeRoot, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  }, 90_000);

  it("D4: loaded forceNextKind evaluate/challenge never dispatches", async () => {
    const runtimeRoot = mkdtempSync(join(tmpdir(), "path-p3-eval-rt-"));
    const target = mkdtempSync(join(tmpdir(), "path-p3-eval-proj-"));
    const controller = createBuildController({
      runtimeRoot,
      fakeMode: true,
      gateway: baseGateway,
    });
    const started = await controller.startBuild("Build a marker page", {
      targetDir: target,
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    await controller.runUntilDone(started.build.buildId, { maxSteps: 8 });
    await controller.applyCandidate(started.build.buildId);

    const path = join(runtimeRoot, "metadata/builds", `${started.build.buildId}.build.json`);
    const raw = JSON.parse(readFileSync(path, "utf8"));
    raw.loop.status = "running";
    raw.loop.forceNextKind = "evaluate";
    writeFileSync(path, `${JSON.stringify(raw, null, 2)}\n`);

    const loaded = readBuildRecord(runtimeRoot, started.build.buildId)!;
    expect(loaded.loop.forceNextKind).toBeUndefined();

    // Persist a challenge force and tick — no cognitive child may appear.
    const again = readBuildRecord(runtimeRoot, started.build.buildId)!;
    again.loop.status = "running";
    again.loop.forceNextKind = "challenge";
    // Bypass writeBuildRecord strip to prove tick itself refuses.
    writeFileSync(path, `${JSON.stringify(again, null, 2)}\n`);

    const beforeKinds = (again.children || []).map((child) => child.kind);
    await controller.tick(started.build.buildId);
    const after = readBuildRecord(runtimeRoot, started.build.buildId)!;
    const kinds = (after.children || []).map((child) => child.kind);
    expect(kinds.filter((kind) => kind === "evaluate")).toHaveLength(
      beforeKinds.filter((kind) => kind === "evaluate").length,
    );
    expect(kinds.filter((kind) => kind === "challenge")).toHaveLength(
      beforeKinds.filter((kind) => kind === "challenge").length,
    );
    expect(after.loop.forceNextKind).not.toBe("evaluate");
    expect(after.loop.forceNextKind).not.toBe("challenge");

    rmSync(runtimeRoot, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  }, 90_000);

  it("follow-up framing keeps creator request and includes an explicit fabric step", () => {
    const record = {
      authoritativeSha: "abc123",
      intent: { outcome: "Build a site", outcomeRevision: 2 },
      conversation: [
        { role: "user", intentRevision: 2, text: "add a logo to the homepage" },
      ],
      children: [
        { kind: "engineer", adoptedSha: "abc123", dispatchState: "consumed" },
      ],
      projectBindings: [{ originGitInit: true }],
      productBrief: { productKind: "web" },
      hypotheses: {},
      loop: {},
    };
    const objective = frameEngineerObjective(record, "Add the logo asset and mark");
    expect(objective).toContain("CURRENT CREATOR REQUEST");
    expect(objective).toContain("add a logo to the homepage");
    expect(objective).toContain("CURRENT FABRIC STEP");
    expect(objective).toContain("Add the logo asset and mark");
    expect(objective).not.toContain("Establish or modify architecture");
  });

  it("startBuild seeds proposedNextAction as the verbatim creator outcome only", async () => {
    const runtimeRoot = mkdtempSync(join(tmpdir(), "path-p3-seed-rt-"));
    const target = mkdtempSync(join(tmpdir(), "path-p3-seed-proj-"));
    const outcome = "Build a dark-mode homepage with a main header";
    const controller = createBuildController({
      runtimeRoot,
      fakeMode: true,
      gateway: baseGateway,
    });
    const started = await controller.startBuild(outcome, { targetDir: target });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const afterStart = readBuildRecord(runtimeRoot, started.build.buildId)!;
    expect(afterStart.hypotheses.proposedNextAction).toBe(outcome);
    expect(afterStart.hypotheses.proposedNextAction).not.toMatch(
      /architecture|manifests|runnable structure/i,
    );

    await controller.runUntilDone(started.build.buildId, { maxSteps: 8 });
    const after = readBuildRecord(runtimeRoot, started.build.buildId)!;
    const eng = (after.children || []).find((child) => child.kind === "engineer");
    expect(eng?.objective).toContain("CURRENT CREATOR REQUEST");
    expect(eng?.objective).toContain(outcome);
    expect(eng?.objective).not.toContain(
      "Establish the software architecture, manifests, and runnable structure required by the outcome.",
    );
    expect(eng?.objective).not.toContain("Highest-value gap");

    rmSync(runtimeRoot, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  }, 60_000);

  it("provider fallback retries the same creator objective without PATH repair text", async () => {
    const runtimeRoot = mkdtempSync(join(tmpdir(), "path-p3-fallback-rt-"));
    const target = mkdtempSync(join(tmpdir(), "path-p3-fallback-proj-"));
    const outcome = "Build a marker page";
    const controller = createBuildController({
      runtimeRoot,
      fakeMode: true,
      gateway: baseGateway,
    });
    const started = await controller.startBuild(outcome, { targetDir: target });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const before = readBuildRecord(runtimeRoot, started.build.buildId)!;
    const seed = before.hypotheses.proposedNextAction;
    expect(seed).toBe(outcome);

    // Simulate Cursor-unavailable fallback: force another engineer without rewriting the objective seed.
    before.loop.preferredEngineOverride = "copilot";
    before.loop.forceNextKind = "engineer";
    before.loop.status = "running";
    writeBuildRecord(runtimeRoot, before);

    const afterForce = readBuildRecord(runtimeRoot, started.build.buildId)!;
    expect(afterForce.hypotheses.proposedNextAction).toBe(seed);
    expect(afterForce.hypotheses.proposedNextAction).not.toMatch(
      /previewable website|empty Build folder|architecture, manifests/i,
    );

    const framed = frameEngineerObjective(
      afterForce,
      afterForce.hypotheses.proposedNextAction || "",
    );
    expect(framed).toContain(outcome);
    expect(framed).not.toContain(
      "Establish the software architecture, manifests, and runnable structure required by the outcome.",
    );

    rmSync(runtimeRoot, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  }, 60_000);

  it("controller no longer writes the retired PATH NON_WEB / empty-tree repair sentences", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "scripts/pathcode-cli/build/controller.mjs",
      ),
      "utf8",
    );
    expect(source).not.toContain(
      "The previous result was not a previewable website for the current intent",
    );
    expect(source).not.toContain(
      "Previous engineer claimed success but left an empty Build folder",
    );
    expect(source).not.toContain(
      "Establish the previewable website named by the current intent in this Build folder",
    );
    expect(source).not.toContain(
      "Establish the software architecture, manifests, and runnable structure required by the outcome.",
    );
    expect(source).not.toContain("Re-align product with revised outcome:");
    expect(source).not.toMatch(
      /forceNextKind === ["']evaluate["']/,
    );
    expect(source).not.toMatch(
      /forceNextKind === ["']challenge["']/,
    );
  });
});
