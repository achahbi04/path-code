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
import { Readable, Writable } from "node:stream";

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
  frameEngineerObjective,
  frameEvaluateObjective,
  mechanicalProbeBinding,
} from "../../scripts/pathcode-cli/build/index.mjs";
import { isReadOnlyAssessmentObjective } from "../../scripts/pathcode-cli/ag1/task-worktree.mjs";

describe("S5 PATH Build", () => {
  let dir: string;
  let runtimeRoot: string;

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
      required: true,
      status: "UNKNOWN",
      evidence: [],
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
    expect(rec.outcomeCriteria[0]!.status).toBe("UNKNOWN");
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

  it(
    "controller fake loop reaches BUILD COMPLETE",
    async () => {
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
    expect(ran.awaitingReview).toBe(true);
    expect(ran.build?.loop.status).toBe("awaiting_review");
    expect(existsSync(join(target, "package.json"))).toBe(false);
    const applied = await controller.applyCandidate(started.build.buildId);
    expect(applied.ok).toBe(true);
    const finished = await controller.runUntilDone(started.build.buildId, {
      maxSteps: 6,
    });
    expect(finished.done).toBe(true);
    expect(finished.build?.loop.status).toBe("complete");
    expect(existsSync(join(target, "package.json"))).toBe(true);
    expect(existsSync(join(target, "src", "path-build-marker.txt"))).toBe(true);

    // Idempotent consume
    const child = finished.build.children[0];
    expect(child).toBeDefined();
    const again = await controller.consumeChildResult(
      started.build.buildId,
      child!.taskId,
    );
    expect(again.deduped).toBe(true);
  },
    60_000,
  );

  it(
    "product-level steer bumps revision and demotes PROVEN",
    async () => {
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
    await controller.applyCandidate(started.build.buildId);
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
    expect(rec.productBrief?.intentRevision).toBe(rec.intent.outcomeRevision);
    expect(rec.productBrief?.stale).toBe(true);
    expect(rec.outcomeCriteria.every((c) => c.status === "UNKNOWN")).toBe(true);
    expect(
      rec.intent.explicitRequirements.some((r) =>
        /offline/i.test(r.statement),
      ),
    ).toBe(true);
    const reran = await controller.runUntilDone(started.build.buildId, {
      maxSteps: 8,
    });
    if (reran.awaitingReview) {
      await controller.applyCandidate(started.build.buildId);
    }
    const reranDone = await controller.runUntilDone(started.build.buildId, {
      maxSteps: 6,
    });
    expect(reranDone.done).toBe(true);
    expect(reran.build.intent.outcomeRevision).toBe(rec.intent.outcomeRevision);
    const changed = await controller.applyConversation(started.build.buildId, {
      message: "Make the product output friendlier",
    });
    expect(changed.ok).toBe(true);
    expect(changed.build.loop.status).toBe("running");
    expect(changed.build.productBrief?.intentRevision).toBe(
      changed.build.intent.outcomeRevision,
    );
    expect(
      changed.build.outcomeCriteria.every((c) => c.status === "UNKNOWN"),
    ).toBe(true);
    const changedRun = await controller.runUntilDone(started.build.buildId, {
      maxSteps: 8,
    });
    if (changedRun.awaitingReview) {
      await controller.applyCandidate(started.build.buildId);
    }
    const changedDone = await controller.runUntilDone(started.build.buildId, {
      maxSteps: 6,
    });
    expect(changedDone.done).toBe(true);
  },
    180_000,
  );

  it("persists selected element exactly for the next engineer objective", async () => {
    const target = join(dir, "selected-element");
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
    const started = await controller.startBuild("Build a small web page", {
      targetDir: target,
      initialCriteria: [
        { id: "c-runnable", statement: "runnable", required: true },
        { id: "c-outcome", statement: "outcome", required: true },
      ],
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const supplied = {
      buildId: started.build.buildId,
      tag: "h1",
      text: "Original title",
      selector: "main > h1",
      rect: { x: 1, y: 2, width: 300, height: 40 },
      sourceFile: "invented.tsx",
      sourceHint: "also-invented",
    };
    const changed = await controller.applyConversation(started.build.buildId, {
      message: "Make this title warmer",
      element: supplied,
    });
    expect(changed.ok).toBe(true);
    const record = readBuildRecord(runtimeRoot, started.build.buildId);
    expect(record).not.toBeNull();
    if (!record) return;
    const persisted = record.loop.pendingSelectedElement;
    expect(persisted).toBeTruthy();
    if (!persisted) return;
    expect(persisted.sourceFile).toBeUndefined();
    expect(persisted.sourceHint).toBeUndefined();
    const objective = frameEngineerObjective(record, "Apply the change.");
    expect(objective).toContain(JSON.stringify(persisted));

    let after = readBuildRecord(runtimeRoot, started.build.buildId);
    let engineer = null;
    for (let i = 0; i < 4; i += 1) {
      await controller.tick(started.build.buildId);
      after = readBuildRecord(runtimeRoot, started.build.buildId);
      engineer = [...(after?.children || [])]
        .reverse()
        .find((c) => c.kind === "engineer");
      if (engineer?.objective) break;
    }
    expect(after).not.toBeNull();
    if (!after) return;
    expect(engineer?.objective).toContain(JSON.stringify(persisted));
    expect(after.loop.pendingSelectedElement).toBeNull();
  }, 60_000);

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
    expect(rec.intent.explicitRequirements[0]!.status).toBe("SATISFIED");
  });

  it("mechanical text and filenames do not prove semantic criteria", () => {
    const target = join(dir, "semantic-proof");
    const origin = ensureBuildOrigin({ targetDir: target });
    expect(origin.ok).toBe(true);
    if (!origin.ok) return;
    writeFileSync(
      join(origin.binding.projectRoot, "package.json"),
      JSON.stringify({ scripts: { test: "node -e \"process.exit(0)\"" } }),
    );
    writeFileSync(
      join(origin.binding.projectRoot, "index.html"),
      "<h1>Emergency response</h1><button>Get help</button>",
    );
    const rec = createBuildRecordSkeleton({ outcome: "Emergency response site" });
    rec.projectBindings.push(origin.binding);
    rec.outcomeCriteria.push({
      id: "c-semantic",
      statement: "Clearly explains why the emergency product matters",
      required: true,
      status: "UNKNOWN",
      evidence: [],
    });
    const probe = mechanicalProbeBinding({
      record: rec,
      bindingId: origin.binding.bindingId,
    });
    expect(rec.outcomeCriteria[0]!.status).toBe("UNKNOWN");
    expect(probe.observations.some((row) => row.id === "c-semantic")).toBe(true);
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
    expect(rec.intent.explicitRequirements[0]!.status).toBe("SATISFIED");
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
    expect(rec.intent.explicitRequirements[0]!.status).toBe("SATISFIED");
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
    expect(rec.intent.explicitRequirements[0]!.status).toBe("UNKNOWN");
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

describe("S5 unbound operator entrypoint", () => {
  let emptyDir: string;
  let prevCwd: string | undefined;
  let prevEnv: Record<string, string | undefined>;

  beforeEach(() => {
    emptyDir = mkdtempSync(join(tmpdir(), "path-s5-empty-"));
    prevCwd = process.cwd();
    prevEnv = {
      PATHCODE_RUNTIME_ROOT: process.env.PATHCODE_RUNTIME_ROOT,
      PATHCODE_BUILD_FAKE: process.env.PATHCODE_BUILD_FAKE,
      PATHCODE_GATEWAY_FAKE_ENGINE: process.env.PATHCODE_GATEWAY_FAKE_ENGINE,
      PATHCODE_USE_GATEWAY: process.env.PATHCODE_USE_GATEWAY,
    };
    process.env.PATHCODE_RUNTIME_ROOT = join(emptyDir, ".path-runtime");
    process.env.PATHCODE_BUILD_FAKE = "1";
    delete process.env.PATHCODE_GATEWAY_FAKE_ENGINE;
    process.env.PATHCODE_USE_GATEWAY = "0";
    process.chdir(emptyDir);
  });

  afterEach(() => {
    try {
      if (prevCwd) process.chdir(prevCwd);
    } catch {
      // ignore
    }
    for (const [k, v] of Object.entries(prevEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    try {
      rmSync(emptyDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  function createReplTty(lines: string[]) {
    const queue = [...lines];
    const chunks: string[] = [];

    const stdin = new Readable({ read() {} }) as Readable & {
      isTTY: boolean;
      isRaw: boolean;
      setRawMode: (mode: boolean) => Readable;
    };
    stdin.isTTY = true;
    stdin.isRaw = false;
    stdin.setRawMode = function setRawMode(mode: boolean) {
      this.isRaw = mode;
      return this;
    };

    const feedNext = () => {
      const next = queue.shift();
      if (next === undefined) {
        stdin.push(null);
        return;
      }
      setImmediate(() => stdin.push(`${next}\n`));
    };

    let feedArmed = true;
    const stdout = new Writable({
      write(chunk, _encoding, callback) {
        const text = String(chunk);
        chunks.push(text);
        if (text.includes("\u001b[?2004l")) {
          feedArmed = true;
        }
        if (feedArmed && text.includes("\u001b]7878;path-idle-composer\u0007")) {
          feedArmed = false;
          setImmediate(() => feedNext());
        } else if (feedArmed && text.endsWith("> ")) {
          feedArmed = false;
          setImmediate(() => feedNext());
        }
        callback();
      },
    }) as Writable & { isTTY: boolean; columns: number };
    stdout.isTTY = true;
    stdout.columns = 100;

    const stderr = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(String(chunk));
        callback();
      },
    });

    return { stdin, stdout, stderr, output: () => chunks.join("") };
  }

  it("non-interactive empty dir still exits NOT_A_PROJECT", async () => {
    const { runPathcodeMain } = await import(
      new URL("../../scripts/pathcode.mjs", import.meta.url).href
    );
    const chunks: string[] = [];
    const write = (s: string) => {
      chunks.push(s);
      return true;
    };
    const code = await runPathcodeMain([], {
      stdin: { isTTY: false },
      stdout: { isTTY: false, write, columns: 80 },
      stderr: { isTTY: false, write },
    });
    expect(code).toBe(2);
    expect(chunks.join("")).toMatch(/existing project directory/);
  });

  it("interactive empty dir opens unbound; /build start git-inits; Code stays honest", async () => {
    const { runPathcodeMain } = await import(
      new URL("../../scripts/pathcode.mjs", import.meta.url).href
    );
    let ag1Calls = 0;
    const tty = createReplTty([
      "please fix the tests",
      "/build help",
      "/build start Build a tiny offline hello CLI with a README",
      "/exit",
    ]);
    const code = await runPathcodeMain([], {
      stdin: tty.stdin,
      stdout: tty.stdout,
      stderr: tty.stderr,
      // After origin the directory is a real project; never run live AG1 here.
      runAg1Session: async () => {
        ag1Calls += 1;
        throw new Error("AG1 must not run in unbound-entry unit test");
      },
      // Runtime bootstrap is unrelated to this REPL protocol regression and can
      // install/repair a venv; keep this unit test deterministic.
      ensureRuntime: async () => ({ ok: true }),
    });
    const out = tty.output();
    expect(code).toBe(0);
    expect(out).not.toMatch(/PATH needs an existing project directory/);
    expect(out).toMatch(/Goodbye/);
    // Unbound Code must refuse before origin — AG1 never runs.
    expect(ag1Calls).toBe(0);
    // Origin seam: git-init only, no scaffold manifests.
    expect(existsSync(join(emptyDir, ".git"))).toBe(true);
    expect(existsSync(join(emptyDir, "package.json"))).toBe(false);
  }, 10_000);
});
