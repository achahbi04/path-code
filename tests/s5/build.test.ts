/**
 * S5 — focused Build unit/mechanical tests (Option A′).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  ensureBuildOrigin,
  createBuildController,
  captureBindingReality,
  makeEvidenceRef,
  classifyEvidenceFreshness,
  changesIndependentOfScope,
  applyStaleInvalidation,
  createBuildRecordSkeleton,
  writeBuildRecord,
  readBuildRecord,
  parseStatusDirectives,
  realityRefreshDepthA,
  frameEvaluateObjective,
  mechanicalProbeBinding,
} from "../../scripts/pathcode-cli/build/index.mjs";
import { isReadOnlyAssessmentObjective } from "../../scripts/pathcode-cli/ag1/task-worktree.mjs";

describe("S5 PATH Build", () => {
  /** @type {string} */
  let dir;
  /** @type {string} */
  let runtimeRoot;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "path-s5-"));
    runtimeRoot = join(dir, "runtime");
  });

  afterEach(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("origin: empty dir becomes bindable after git init only", () => {
    const target = join(dir, "app");
    const origin = ensureBuildOrigin({ targetDir: target });
    expect(origin.ok).toBe(true);
    if (!origin.ok) return;
    expect(existsSync(join(origin.binding.projectRoot, ".git"))).toBe(true);
    expect(origin.admission.unversioned).toBe(true);
    // no scaffold package.json from origin itself
    expect(existsSync(join(origin.binding.projectRoot, "package.json"))).toBe(
      false,
    );
  });

  it("evidence freshness: dirty fingerprint mismatch is stale", () => {
    const target = join(dir, "proj");
    const origin = ensureBuildOrigin({ targetDir: target });
    expect(origin.ok).toBe(true);
    if (!origin.ok) return;
    writeFileSync(join(origin.binding.projectRoot, "a.txt"), "1\n");
    const r1 = captureBindingReality(origin.binding.projectRoot);
    const ref = makeEvidenceRef(
      {
        kind: "fs",
        ref: "a.txt",
        bindingId: origin.binding.bindingId,
        scope: ["a.txt"],
      },
      r1,
    );
    writeFileSync(join(origin.binding.projectRoot, "a.txt"), "2\n");
    const r2 = captureBindingReality(origin.binding.projectRoot);
    const fresh = classifyEvidenceFreshness(ref, r2);
    expect(fresh.fresh).toBe(false);
  });

  it("isReadOnlyAssessmentObjective: evaluate framing stays read-only when outcome mentions Create", () => {
    const rec = createBuildRecordSkeleton({
      outcome: "Create a runnable Node service with tests",
    });
    rec.intent.explicitRequirements.push({
      id: "req-1",
      statement: "Must run locally",
      status: "UNKNOWN",
    });
    rec.outcomeCriteria.push({
      id: "c1",
      statement: "Service is runnable",
      required: true,
      status: "UNKNOWN",
      evidence: [],
      updatedAt: new Date().toISOString(),
    });
    const objective = frameEvaluateObjective(rec);
    expect(objective).toMatch(/Create a runnable Node service/i);
    expect(isReadOnlyAssessmentObjective(objective)).toBe(true);
  });

  it("independence: docs change does not intersect src/auth scope", () => {
    expect(
      changesIndependentOfScope(["README.md"], ["src/auth/"]),
    ).toBe(true);
    expect(
      changesIndependentOfScope(["src/auth/session.ts"], ["src/auth/"]),
    ).toBe(false);
  });

  it("invalidation: demotes PROVEN when impact unknown", () => {
    const rec = createBuildRecordSkeleton({ outcome: "demo" });
    rec.projectBindings.push({
      bindingId: "b1",
      projectRoot: dir,
    });
    rec.outcomeCriteria.push({
      id: "c1",
      statement: "auth works",
      required: true,
      status: "PROVEN",
      evidence: [
        makeEvidenceRef({
          kind: "fs",
          ref: "x",
          bindingId: "b1",
          headSha: "abc",
          dirtyFingerprint: "old",
          scope: [], // unknown path scope
        }),
      ],
      updatedAt: new Date().toISOString(),
    });
    const { demoted } = applyStaleInvalidation(rec, {
      bindingId: "b1",
      changedFiles: ["src/auth/x.ts"],
      reality: {
        projectRoot: dir,
        headSha: "def",
        dirtyFingerprint: "new",
        changedFiles: ["src/auth/x.ts"],
        statusPorcelain: " M src/auth/x.ts",
        branch: null,
        configFingerprint: "cfg",
        exists: true,
      },
    });
    expect(demoted).toContain("c1");
    expect(rec.outcomeCriteria[0].status).toBe("UNKNOWN");
  });

  it("parseStatusDirectives reads criterion lines", () => {
    const parsed = parseStatusDirectives(
      "CRITERION c-runnable: PROVEN — tests pass\nREQUIREMENT req-1: SATISFIED — offline ok\n",
    );
    expect(parsed).toEqual([
      { id: "c-runnable", status: "PROVEN", note: "tests pass" },
      { id: "req-1", status: "SATISFIED", note: "offline ok" },
    ]);
  });

  it("controller fake loop reaches BUILD COMPLETE", async () => {
    const target = join(dir, "greenfield");
    const controller = createBuildController({
      runtimeRoot,
      fakeMode: true,
      gateway: {
        async bindProject() {
          return { ok: true };
        },
        async startTask() {
          return { ok: true };
        },
        async awaitTask() {
          return {};
        },
      },
    });

    const started = await controller.startBuild(
      "Build a tiny runnable Node marker service with tests",
      {
        targetDir: target,
        explicitRequirements: [
          { id: "req-local", statement: "Must run locally without cloud SaaS" },
        ],
        initialCriteria: [
          {
            id: "c-runnable",
            statement: "Core software is runnable with project-native checks",
            required: true,
          },
          {
            id: "c-outcome",
            statement: "Software advances the stated outcome",
            required: true,
          },
        ],
      },
    );
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    const ran = await controller.runUntilDone(started.build.buildId, {
      maxSteps: 8,
    });
    expect(ran.ok).toBe(true);
    expect(ran.done).toBe(true);
    expect(ran.build?.loop.status).toBe("complete");
    expect(existsSync(join(target, "package.json"))).toBe(true);
    expect(existsSync(join(target, "src", "path-build-marker.txt"))).toBe(true);

    // Idempotent consume
    const child = ran.build.children[0];
    const again = await controller.consumeChildResult(
      started.build.buildId,
      child.taskId,
    );
    expect(again.deduped).toBe(true);
  });

  it("product-level steer bumps revision and demotes PROVEN", async () => {
    const target = join(dir, "steer");
    const controller = createBuildController({
      runtimeRoot,
      fakeMode: true,
      gateway: {
        async bindProject() {
          return { ok: true };
        },
        async startTask() {
          return { ok: true };
        },
        async awaitTask() {
          return {};
        },
      },
    });
    const started = await controller.startBuild("v1 outcome", {
      targetDir: target,
      initialCriteria: [
        { id: "c1", statement: "thing", required: true },
      ],
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    await controller.runUntilDone(started.build.buildId, { maxSteps: 6 });
    let rec = readBuildRecord(runtimeRoot, started.build.buildId);
    expect(rec?.loop.status).toBe("complete");
    const revised = await controller.reviseIntent(started.build.buildId, {
      addRequirements: [{ statement: "offline operation is mandatory" }],
      note: "steer test",
    });
    expect(revised.ok).toBe(true);
    rec = revised.build;
    expect(rec.intent.outcomeRevision).toBeGreaterThan(1);
    expect(rec.loop.status).toBe("running");
    expect(
      rec.intent.explicitRequirements.some((r) =>
        /offline/i.test(r.statement),
      ),
    ).toBe(true);
  });

  it("mechanical probe: README requirement satisfied from README.md", () => {
    const target = join(dir, "readme-req");
    const origin = ensureBuildOrigin({ targetDir: target });
    expect(origin.ok).toBe(true);
    if (!origin.ok) return;
    writeFileSync(
      join(origin.binding.projectRoot, "package.json"),
      JSON.stringify({ scripts: { test: "node -e \"process.exit(0)\"" } }),
    );
    writeFileSync(
      join(origin.binding.projectRoot, "README.md"),
      "# Demo\n\nRun tests with `npm test`.\n",
    );
    const rec = createBuildRecordSkeleton({ outcome: "demo" });
    rec.projectBindings.push(origin.binding);
    rec.intent.explicitRequirements.push({
      id: "req-readme",
      statement: "Include a short README.md describing how to run tests",
      required: true,
      status: "UNKNOWN",
      evidence: [],
    });
    const probe = mechanicalProbeBinding({
      record: rec,
      bindingId: origin.binding.bindingId,
    });
    expect(probe.ok).toBe(true);
    expect(rec.intent.explicitRequirements[0].status).toBe("SATISFIED");
  });

  it("mechanical probe: README on task worktree satisfies req-readme", () => {
    const target = join(dir, "readme-worktree");
    const origin = ensureBuildOrigin({ targetDir: target });
    expect(origin.ok).toBe(true);
    if (!origin.ok) return;
    const worktree = join(dir, "readme-worktree-wt");
    mkdirSync(worktree, { recursive: true });
    writeFileSync(
      join(origin.binding.projectRoot, "package.json"),
      JSON.stringify({ scripts: { test: "node -e \"process.exit(0)\"" } }),
    );
    writeFileSync(
      join(worktree, "README.md"),
      "# Demo\n\nRun tests with `npm test`.\n",
    );
    const rec = createBuildRecordSkeleton({ outcome: "demo" });
    rec.projectBindings.push(origin.binding);
    rec.intent.explicitRequirements.push({
      id: "req-readme",
      statement: "Include a short README.md describing how to run tests",
      required: true,
      status: "UNKNOWN",
      evidence: [],
    });
    const probe = mechanicalProbeBinding({
      record: rec,
      bindingId: origin.binding.bindingId,
      worktreePath: worktree,
    });
    expect(probe.ok).toBe(true);
    expect(existsSync(join(origin.binding.projectRoot, "README.md"))).toBe(
      false,
    );
    expect(rec.intent.explicitRequirements[0].status).toBe("SATISFIED");
  });

  it("mechanical probe: README on task branch via git show satisfies req-readme", () => {
    const target = join(dir, "readme-git-branch");
    const origin = ensureBuildOrigin({ targetDir: target });
    expect(origin.ok).toBe(true);
    if (!origin.ok) return;
    const root = origin.binding.projectRoot;
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ scripts: { test: "node -e \"process.exit(0)\"" } }),
    );
    spawnSync("git", ["add", "package.json"], { cwd: root });
    spawnSync("git", ["commit", "-m", "pkg"], { cwd: root });
    writeFileSync(
      join(root, "README.md"),
      "# Demo\n\nRun tests with `npm test`.\n",
    );
    spawnSync("git", ["checkout", "-b", "path/task-readme"], { cwd: root });
    spawnSync("git", ["add", "README.md"], { cwd: root });
    spawnSync("git", ["commit", "-m", "readme"], { cwd: root });
    spawnSync("git", ["checkout", "main"], { cwd: root });

    const rec = createBuildRecordSkeleton({ outcome: "demo" });
    rec.projectBindings.push(origin.binding);
    rec.intent.explicitRequirements.push({
      id: "req-readme",
      statement: "Include a short README.md describing how to run tests",
      required: true,
      status: "UNKNOWN",
      evidence: [],
    });
    const probe = mechanicalProbeBinding({
      record: rec,
      bindingId: origin.binding.bindingId,
      taskBranch: "path/task-readme",
      changedFiles: ["README.md"],
    });
    expect(probe.ok).toBe(true);
    expect(existsSync(join(root, "README.md"))).toBe(false);
    expect(rec.intent.explicitRequirements[0].status).toBe("SATISFIED");
  });

  it("mechanical probe: does not create README when missing (engineer-owned)", () => {
    const target = join(dir, "readme-no-materialize");
    const origin = ensureBuildOrigin({ targetDir: target });
    expect(origin.ok).toBe(true);
    if (!origin.ok) return;
    writeFileSync(
      join(origin.binding.projectRoot, "package.json"),
      JSON.stringify({
        name: "demo-cli",
        scripts: { test: "node -e \"process.exit(0)\"" },
      }),
    );
    const rec = createBuildRecordSkeleton({ outcome: "demo" });
    rec.projectBindings.push(origin.binding);
    rec.intent.explicitRequirements.push({
      id: "req-readme",
      statement: "Include a short README.md describing how to run tests",
      required: true,
      status: "UNKNOWN",
      evidence: [],
    });
    const probe = mechanicalProbeBinding({
      record: rec,
      bindingId: origin.binding.bindingId,
    });
    expect(probe.ok).toBe(true);
    expect(existsSync(join(origin.binding.projectRoot, "README.md"))).toBe(
      false,
    );
    expect(rec.intent.explicitRequirements[0].status).toBe("UNKNOWN");
  });

  it("Depth A refresh writes reality delta", () => {
    const target = join(dir, "delta");
    const origin = ensureBuildOrigin({ targetDir: target });
    expect(origin.ok).toBe(true);
    if (!origin.ok) return;
    const rec = createBuildRecordSkeleton({ outcome: "x" });
    rec.projectBindings.push(origin.binding);
    writeBuildRecord(runtimeRoot, rec);
    const refresh = realityRefreshDepthA({
      runtimeRoot,
      record: rec,
      bindingId: origin.binding.bindingId,
    });
    expect(refresh.ok).toBe(true);
    if (!refresh.ok) return;
    expect(refresh.delta.depth).toBe("A");
    expect(refresh.delta.bindingId).toBe(origin.binding.bindingId);
  });
});
