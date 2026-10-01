/** P8.2B — S2 historical tree adoption and S4 restore reconciliation. */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createBuildRecordSkeleton, readBuildRecord, writeBuildRecord } from "../../scripts/pathcode-cli/build/record.mjs";
import { restoreHistoricalProductVersion, recoverPendingHistoricalRestore } from "../../scripts/pathcode-cli/build/historical-restore.mjs";
import { listProductVersions, compareProductVersions } from "../../scripts/pathcode-cli/build/versions.mjs";
import { createBuildController, createBuildCoordinatorService } from "../../scripts/pathcode-cli/build/index.mjs";

const roots: string[] = [];
const temporary = () => { const path = mkdtempSync(join(tmpdir(), "path-p82b-")); roots.push(path); return path; };
afterEach(() => { for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true }); });

function git(root: string, args: string[]) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
  if (result.status !== 0) throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  return result.stdout.trim();
}

function fixture() {
  const root = temporary(); const runtimeRoot = temporary();
  git(root, ["init", "--template="]);
  git(root, ["config", "user.name", "PATH Test"]);
  git(root, ["config", "user.email", "path@example.test"]);
  writeFileSync(join(root, "product.txt"), "first\n");
  git(root, ["add", "product.txt"]); git(root, ["commit", "-m", "first"]);
  const first = git(root, ["rev-parse", "HEAD"]);
  writeFileSync(join(root, "product.txt"), "second\n");
  git(root, ["add", "product.txt"]); git(root, ["commit", "-m", "second"]);
  const second = git(root, ["rev-parse", "HEAD"]);
  const branch = git(root, ["symbolic-ref", "--short", "HEAD"]);
  const record = createBuildRecordSkeleton({ outcome: "Create a product", buildId: "build-one" });
  record.projectBindings.push({ bindingId: "binding-one", projectRoot: root });
  record.productBranch = branch;
  record.authoritativeSha = second;
  record.adoptionHistory = [
    { buildId: record.buildId, projectRoot: root, adoptedSha: first, sourceSha: first, mode: "merge", taskId: "task-first" },
    { buildId: record.buildId, projectRoot: root, adoptedSha: second, sourceSha: second, mode: "merge", taskId: "task-second" },
  ];
  record.loop.status = "paused";
  record.coordinator = { autoRun: false, owner: "path-build-coordinator" };
  writeBuildRecord(runtimeRoot, record);
  return { root, runtimeRoot, first, second, record };
}

function pending(f: ReturnType<typeof fixture>, candidateSha: string | null) {
  const record = readBuildRecord(f.runtimeRoot, f.record.buildId)!;
  record.pendingRestore = {
    operationId: "11111111-1111-4111-8111-111111111111",
    expectedAuthoritativeSha: f.second, targetAdoptionIndex: 0, targetSha: f.first,
    targetTreeSha: git(f.root, ["rev-parse", `${f.first}^{tree}`]), candidateSha,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  writeBuildRecord(f.runtimeRoot, record);
  return record.pendingRestore;
}

function candidate(f: ReturnType<typeof fixture>) {
  const tree = git(f.root, ["rev-parse", `${f.first}^{tree}`]);
  return git(f.root, ["commit-tree", tree, "-p", f.second, "-m", "prepared restore"]);
}

describe("P8.2B canonical historical restore", () => {
  it("makes the old tree current through a new forward commit and one adoption event", () => {
    const f = fixture();
    const before = readBuildRecord(f.runtimeRoot, f.record.buildId)!;
    const result = restoreHistoricalProductVersion({ runtimeRoot: f.runtimeRoot, buildId: f.record.buildId,
      adoptionIndex: 0, expectedAuthoritativeSha: f.second });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const after = readBuildRecord(f.runtimeRoot, f.record.buildId)!;
    const restored = after.authoritativeSha!;
    expect(restored).not.toBe(f.first);
    expect(restored).not.toBe(f.second);
    expect(git(f.root, ["rev-list", "--parents", "-n", "1", restored])).toBe(`${restored} ${f.second}`);
    expect(git(f.root, ["rev-parse", "HEAD"])).toBe(restored);
    expect(git(f.root, ["rev-parse", "HEAD^{tree}"])).toBe(git(f.root, ["rev-parse", `${f.first}^{tree}`]));
    expect(git(f.root, ["status", "--porcelain=v1", "-uall"])).toBe("");
    expect(readFileSync(join(f.root, "product.txt"), "utf8")).toBe("first\n");
    expect(after.pendingRestore).toBeUndefined();
    expect(after.adoptionHistory!.slice(0, 2)).toEqual(before.adoptionHistory);
    expect(after.adoptionHistory![2]).toMatchObject({ parentSha: f.second, sourceSha: restored,
      adoptedSha: restored, mode: "historical_restore", restoreTargetAdoptionIndex: 0,
      restoreTargetSha: f.first, restoreOperationId: result.operationId });
    expect((after.adoptionHistory![2] as any).taskId).toBeUndefined();
    expect(result.operationId).toBeTruthy();
    expect(listProductVersions({ runtimeRoot: f.runtimeRoot, buildId: f.record.buildId })).toMatchObject({
      ok: true, current: { sha: restored, adoptionIndex: 2 } });
    expect(compareProductVersions({ runtimeRoot: f.runtimeRoot, buildId: f.record.buildId,
      base: { kind: "adoption", adoptionIndex: 0 }, target: { kind: "current" } })).toMatchObject({
        ok: true, summary: { changedFiles: 0 } });
    expect(restoreHistoricalProductVersion({ runtimeRoot: f.runtimeRoot, buildId: f.record.buildId,
      adoptionIndex: 0, expectedAuthoritativeSha: f.second })).toMatchObject({ ok: true, deduped: true });
    expect(readBuildRecord(f.runtimeRoot, f.record.buildId)!.adoptionHistory).toHaveLength(3);
  });

  it("rejects stale authority, dirty trees, foreign selectors and same-tree requests without mutation", () => {
    const f = fixture();
    const before = JSON.stringify(readBuildRecord(f.runtimeRoot, f.record.buildId));
    expect(restoreHistoricalProductVersion({ runtimeRoot: f.runtimeRoot, buildId: f.record.buildId,
      adoptionIndex: 0, expectedAuthoritativeSha: f.first })).toMatchObject({ ok: false, code: "STALE_AUTHORITY" });
    expect(restoreHistoricalProductVersion({ runtimeRoot: f.runtimeRoot, buildId: f.record.buildId,
      adoptionIndex: 9, expectedAuthoritativeSha: f.second })).toMatchObject({ ok: false, code: "VERSION_NOT_FOUND" });
    expect(restoreHistoricalProductVersion({ runtimeRoot: f.runtimeRoot, buildId: f.record.buildId,
      adoptionIndex: 0, expectedAuthoritativeSha: f.second, targetSha: f.first } as any)).toMatchObject({ ok: false, code: "INVALID_RESTORE_REQUEST" });
    expect(JSON.stringify(readBuildRecord(f.runtimeRoot, f.record.buildId))).toBe(before);
    expect(restoreHistoricalProductVersion({ runtimeRoot: f.runtimeRoot, buildId: f.record.buildId,
      adoptionIndex: 0, expectedAuthoritativeSha: f.second })).toMatchObject({ ok: true });
    const done = readBuildRecord(f.runtimeRoot, f.record.buildId)!;
    expect(done.adoptionHistory).toHaveLength(3);
    expect(before).not.toBe(JSON.stringify(done));

    const g = fixture();
    writeFileSync(join(g.root, "product.txt"), "dirty\n");
    expect(restoreHistoricalProductVersion({ runtimeRoot: g.runtimeRoot, buildId: g.record.buildId,
      adoptionIndex: 0, expectedAuthoritativeSha: g.second })).toMatchObject({ ok: false, code: "PRIMARY_DIRTY" });
    expect(readBuildRecord(g.runtimeRoot, g.record.buildId)!.pendingRestore).toBeUndefined();
    git(g.root, ["restore", "product.txt"]);
    expect(restoreHistoricalProductVersion({ runtimeRoot: g.runtimeRoot, buildId: g.record.buildId,
      adoptionIndex: 1, expectedAuthoritativeSha: g.second })).toMatchObject({ ok: true, noOp: true });
    expect(readBuildRecord(g.runtimeRoot, g.record.buildId)!.adoptionHistory).toHaveLength(2);
  });

  it("recovers A by abort, B by adoption, C by exact once finalization, and D by hard block", () => {
    const a = fixture(); pending(a, null);
    expect(recoverPendingHistoricalRestore({ runtimeRoot: a.runtimeRoot, buildId: a.record.buildId })).toMatchObject({ ok: true, aborted: true });
    expect(readBuildRecord(a.runtimeRoot, a.record.buildId)!.pendingRestore).toBeUndefined();
    expect(git(a.root, ["rev-parse", "HEAD"])).toBe(a.second);

    const b = fixture(); const rb = candidate(b); pending(b, rb);
    expect(recoverPendingHistoricalRestore({ runtimeRoot: b.runtimeRoot, buildId: b.record.buildId })).toMatchObject({ ok: true, adoptedSha: rb });
    expect(readBuildRecord(b.runtimeRoot, b.record.buildId)!.adoptionHistory).toHaveLength(3);

    const c = fixture(); const rc = candidate(c); pending(c, rc); git(c.root, ["merge", "--ff-only", rc]);
    expect(readBuildRecord(c.runtimeRoot, c.record.buildId)!.authoritativeSha).toBe(c.second);
    expect(recoverPendingHistoricalRestore({ runtimeRoot: c.runtimeRoot, buildId: c.record.buildId })).toMatchObject({ ok: true, adoptedSha: rc });
    expect(recoverPendingHistoricalRestore({ runtimeRoot: c.runtimeRoot, buildId: c.record.buildId })).toMatchObject({ ok: true, skipped: true });
    expect(readBuildRecord(c.runtimeRoot, c.record.buildId)!.adoptionHistory).toHaveLength(3);

    const d = fixture(); const wrong = git(d.root, ["rev-parse", "HEAD~1"]); pending(d, wrong);
    expect(recoverPendingHistoricalRestore({ runtimeRoot: d.runtimeRoot, buildId: d.record.buildId })).toMatchObject({ ok: false, code: "RESTORE_CANDIDATE_MISMATCH" });
    expect(readBuildRecord(d.runtimeRoot, d.record.buildId)).toMatchObject({ pendingRestore: { candidateSha: wrong }, loop: { status: "blocked" } });
  });

  it("deduplicates an operation identity and hard-blocks drift without changing authority", () => {
    const f = fixture(); const restored = candidate(f); const op = pending(f, restored);
    git(f.root, ["merge", "--ff-only", restored]);
    const record = readBuildRecord(f.runtimeRoot, f.record.buildId)!;
    record.adoptionHistory!.push({ parentSha: f.second, sourceSha: restored,
      adoptedSha: restored, mode: "historical_restore", restoreTargetAdoptionIndex: 0,
      restoreTargetSha: f.first, restoreOperationId: op.operationId });
    writeBuildRecord(f.runtimeRoot, record);
    expect(recoverPendingHistoricalRestore({ runtimeRoot: f.runtimeRoot, buildId: f.record.buildId })).toMatchObject({ ok: true, adoptedSha: restored });
    expect(readBuildRecord(f.runtimeRoot, f.record.buildId)!.adoptionHistory).toHaveLength(3);

    const d = fixture(); pending(d, candidate(d));
    writeFileSync(join(d.root, "product.txt"), "outside change\n");
    expect(recoverPendingHistoricalRestore({ runtimeRoot: d.runtimeRoot, buildId: d.record.buildId })).toMatchObject({ ok: false, code: "PRIMARY_DIRTY" });
    expect(readBuildRecord(d.runtimeRoot, d.record.buildId)).toMatchObject({ authoritativeSha: d.second,
      pendingRestore: { expectedAuthoritativeSha: d.second }, loop: { status: "blocked" } });
  });

  it("reconciles pending restore before the complete-Build startup shortcut", async () => {
    const f = fixture(); const restored = candidate(f); pending(f, restored);
    git(f.root, ["merge", "--ff-only", restored]);
    const record = readBuildRecord(f.runtimeRoot, f.record.buildId)!;
    record.loop.status = "complete";
    writeBuildRecord(f.runtimeRoot, record);
    const service = await createBuildCoordinatorService({ runtimeRoot: f.runtimeRoot,
      packageRoot: process.cwd(), fakeMode: true });
    try {
      await service.whenReady;
      expect(readBuildRecord(f.runtimeRoot, f.record.buildId)).toMatchObject({
        authoritativeSha: restored, loop: { status: "paused" } });
      expect(readBuildRecord(f.runtimeRoot, f.record.buildId)!.pendingRestore).toBeUndefined();
    } finally { await service.close(); }
  });

  it("keeps runtime SHA projection and surface mutations outside product authority", async () => {
    const f = fixture();
    const controller = createBuildController({ runtimeRoot: f.runtimeRoot, fakeMode: true, gateway: {} as any });
    expect(controller.patchRuntimeState(f.record.buildId, { authoritativeSha: f.first })).toMatchObject({ ok: false, code: "STALE_AUTHORITY" });
    expect(readBuildRecord(f.runtimeRoot, f.record.buildId)!.authoritativeSha).toBe(f.second);
    expect(controller.patchRuntimeState(f.record.buildId, { authoritativeSha: f.second, runtimeHealth: "ok" })).toMatchObject({ ok: true });
    const service = await createBuildCoordinatorService({ runtimeRoot: f.runtimeRoot, packageRoot: process.cwd(), fakeMode: true });
    try {
      await service.whenReady;
      pending(f, candidate(f));
      expect(await service.dispatch("build.surfaceEdit", {
        buildId: f.record.buildId, action: "title", input: { displayTitle: "Stale title" } })).toMatchObject({ ok: false, code: "RESTORE_PENDING" });
      expect(await service.dispatch("build.apply", { buildId: f.record.buildId })).toMatchObject({ ok: false, code: "RESTORE_PENDING" });
      expect(await service.dispatch("runtime.sync", { buildId: f.record.buildId })).toMatchObject({ ok: false, code: "RESTORE_PENDING" });
      expect(readBuildRecord(f.runtimeRoot, f.record.buildId)!.pendingRestore).toBeTruthy();
      expect(recoverPendingHistoricalRestore({ runtimeRoot: f.runtimeRoot, buildId: f.record.buildId }).ok).toBe(true);
      const newSha = readBuildRecord(f.runtimeRoot, f.record.buildId)!.authoritativeSha;
      expect(await service.dispatch("build.surfaceEdit", {
        buildId: f.record.buildId, action: "title", input: { displayTitle: "New title" } })).toMatchObject({ ok: true, displayTitle: "New title" });
      expect(readBuildRecord(f.runtimeRoot, f.record.buildId)!.authoritativeSha).toBe(newSha);
    } finally { await service.close(); }
  });
});
