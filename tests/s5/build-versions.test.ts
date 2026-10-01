/** P8.0 — observational product versions from S2 adoption records and Git. */
import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createBuildRecordSkeleton, resolveBuildRecordPath, writeBuildRecord } from "../../scripts/pathcode-cli/build/record.mjs";
import { listProductVersions, readProductVersion } from "../../scripts/pathcode-cli/build/index.mjs";

const roots: string[] = [];
const temp = (label: string) => { const root = mkdtempSync(join(tmpdir(), `path-p80-${label}-`)); roots.push(root); return root; };
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function git(root: string, args: string[]) {
  const run = spawnSync("git", args, { cwd: root, encoding: "utf8", env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" } });
  if (run.status !== 0) throw new Error(run.stderr || `git ${args.join(" ")} failed`);
  return run.stdout.trim();
}
function repo() {
  const root = temp("project");
  git(root, ["init", "--template="]);
  git(root, ["config", "user.name", "PATH Test"]);
  git(root, ["config", "user.email", "path@example.test"]);
  writeFileSync(join(root, "product.txt"), "origin\n");
  git(root, ["add", "product.txt"]); git(root, ["commit", "-m", "origin"]);
  const origin = git(root, ["rev-parse", "HEAD"]);
  writeFileSync(join(root, "product.txt"), "first\n");
  git(root, ["add", "product.txt"]); git(root, ["commit", "-m", "first adoption"]);
  const first = git(root, ["rev-parse", "HEAD"]);
  writeFileSync(join(root, "product.txt"), "second\n");
  git(root, ["add", "product.txt"]); git(root, ["commit", "-m", "second adoption"]);
  const second = git(root, ["rev-parse", "HEAD"]);
  return { root, origin, first, second };
}
function build(runtimeRoot: string, buildId: string, projectRoot: string, authoritativeSha: string | null, history: any[]) {
  const record = createBuildRecordSkeleton({ outcome: "Make a product", buildId });
  record.projectBindings.push({ bindingId: `binding-${buildId}`, projectRoot });
  if (authoritativeSha) record.authoritativeSha = authoritativeSha;
  record.adoptionHistory = history;
  writeBuildRecord(runtimeRoot, record);
  return record;
}

describe("P8.0 canonical product version projection", () => {
  it("lists adopted history in stored order and derives current solely from authoritativeSha", () => {
    const runtimeRoot = temp("runtime"); const { root, origin, first, second } = repo();
    build(runtimeRoot, "build-one", root, first, [
      { buildId: "build-one", projectRoot: root, adoptedSha: first, parentSha: origin, sourceSha: first, taskId: "task-a", actionId: "engineer:a", intentRevision: 1, engine: "cursor", mode: "fast_forward", adoptedAt: "2026-01-01T00:00:00.000Z", files: ["product.txt"] },
      { buildId: "build-one", projectRoot: root, adoptedSha: second, parentSha: first, sourceSha: second, taskId: "task-b", engine: "copilot", adoptedAt: "2026-01-02T00:00:00.000Z" },
    ]);
    const recordPath = resolveBuildRecordPath(runtimeRoot, "build-one");
    const beforeRecord = readFileSync(recordPath, "utf8");
    const beforeHead = git(root, ["rev-parse", "HEAD"]);
    const beforeStatus = git(root, ["status", "--porcelain=v1", "-uall"]);
    const beforeCount = git(root, ["rev-list", "--count", "HEAD"]);
    const beforeFiles = readdirSync(join(runtimeRoot, "metadata", "builds")).sort();
    const listed = listProductVersions({ runtimeRoot, buildId: "build-one" });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.current).toEqual({ sha: first, adoptionIndex: 0, git: { resolvable: true, reason: null } });
    expect(listed.versions.map((v) => [v.adoptionIndex, v.sha, v.current, v.taskId, v.git.resolvable])).toEqual([
      [0, first, true, "task-a", true], [1, second, false, "task-b", true],
    ]);
    expect(listed.versions[0]).toMatchObject({ parentSha: origin, actionId: "engineer:a", intentRevision: 1, engine: "cursor", files: ["product.txt"], recordedBuildMatches: true, recordedBindingMatches: true });
    expect(readProductVersion({ runtimeRoot, buildId: "build-one", adoptionIndex: 1 })).toMatchObject({ ok: true, version: { sha: second, current: false } });
    expect(readProductVersion({ runtimeRoot, buildId: "build-one", adoptionIndex: 9 })).toMatchObject({ ok: false, code: "VERSION_NOT_FOUND" });
    expect(readFileSync(recordPath, "utf8")).toBe(beforeRecord);
    expect(git(root, ["rev-parse", "HEAD"])).toBe(beforeHead);
    expect(git(root, ["status", "--porcelain=v1", "-uall"])).toBe(beforeStatus);
    expect(git(root, ["rev-list", "--count", "HEAD"])).toBe(beforeCount);
    expect(readdirSync(join(runtimeRoot, "metadata", "builds")).sort()).toEqual(beforeFiles);
    expect(readFileSync(join(root, "product.txt"), "utf8")).toBe("second\n");
  });

  it("reports unresolved historical SHA without deleting or replacing it", () => {
    const runtimeRoot = temp("runtime"); const { root, origin } = repo();
    const missing = "a".repeat(40);
    build(runtimeRoot, "build-missing", root, origin, [
      { adoptedSha: missing, taskId: "missing-task", adoptedAt: "2026-01-01T00:00:00.000Z" },
      { adoptedSha: "not-a-sha", taskId: "bad-task" },
    ]);
    const before = readFileSync(resolveBuildRecordPath(runtimeRoot, "build-missing"), "utf8");
    const listed = listProductVersions({ runtimeRoot, buildId: "build-missing" });
    expect(listed).toMatchObject({ ok: true, current: { sha: origin, adoptionIndex: null, git: { resolvable: true } }, versions: [
      { sha: missing, current: false, git: { resolvable: false, reason: "commit_unavailable" } },
      { sha: "not-a-sha", current: false, git: { resolvable: false, reason: "invalid_sha" } },
    ] });
    expect(readFileSync(resolveBuildRecordPath(runtimeRoot, "build-missing"), "utf8")).toBe(before);
  });

  it("uses only the canonical Build binding and never a recorded or caller supplied path", () => {
    const runtimeRoot = temp("runtime"); const a = repo(); const b = repo();
    build(runtimeRoot, "build-a", a.root, a.first, [{ buildId: "build-b", adoptedSha: a.first, projectRoot: b.root, taskId: "foreign-root" }]);
    build(runtimeRoot, "build-b", b.root, b.first, [{ adoptedSha: b.first, projectRoot: b.root }]);
    const listed = listProductVersions({ runtimeRoot, buildId: "build-a" });
    expect(listed).toMatchObject({ ok: true, projectRoot: realpathSync(a.root), versions: [{ sha: a.first, recordedBuildMatches: false, recordedBindingMatches: false }] });
    expect(readProductVersion({ runtimeRoot, buildId: "build-a", adoptionIndex: 0, projectRoot: b.root } as any)).toMatchObject({ ok: true, version: { sha: a.first } });
    expect(listProductVersions({ runtimeRoot, buildId: "../build-b" })).toMatchObject({ ok: false, code: "INVALID_BUILD_ID" });
    expect(listProductVersions({ runtimeRoot, buildId: "build-a/../build-b" })).toMatchObject({ ok: false, code: "INVALID_BUILD_ID" });
    expect(listProductVersions({ runtimeRoot, buildId: "build-b" })).toMatchObject({ ok: true, versions: [{ sha: b.first }] });
  });

  it("does not create runtime directories for a missing Build", () => {
    const runtimeRoot = join(temp("empty"), "absent-runtime");
    expect(listProductVersions({ runtimeRoot, buildId: "build-none" })).toMatchObject({ ok: false, code: "BUILD_NOT_FOUND" });
    expect(existsSync(runtimeRoot)).toBe(false);
  });
});
