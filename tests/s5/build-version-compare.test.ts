/** P8.1 — committed Build version comparison, with no Git or Build mutation. */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createBuildRecordSkeleton, resolveBuildRecordPath, writeBuildRecord } from "../../scripts/pathcode-cli/build/record.mjs";
import { compareProductVersions, listProductVersions } from "../../scripts/pathcode-cli/build/index.mjs";

const roots: string[] = [];
const temp = (label: string) => { const root = mkdtempSync(join(tmpdir(), `path-p81-${label}-`)); roots.push(root); return root; };
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function git(root: string, args: string[]) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" } });
  if (result.status !== 0) throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  return result.stdout.trim();
}
function repo() {
  const root = temp("repo");
  git(root, ["init", "--template="]);
  git(root, ["config", "user.name", "PATH Test"]);
  git(root, ["config", "user.email", "path@example.test"]);
  writeFileSync(join(root, "alpha.txt"), "one\n");
  writeFileSync(join(root, "old.txt"), "rename me\n");
  git(root, ["add", "."]); git(root, ["commit", "-m", "first"]);
  const first = git(root, ["rev-parse", "HEAD"]);
  writeFileSync(join(root, "alpha.txt"), "one\ntwo\n");
  writeFileSync(join(root, "added.txt"), "new\n");
  writeFileSync(join(root, "binary.bin"), Buffer.from([0, 1, 2]));
  git(root, ["mv", "old.txt", "new.txt"]);
  git(root, ["add", "."]); git(root, ["commit", "-m", "second"]);
  const second = git(root, ["rev-parse", "HEAD"]);
  writeFileSync(join(root, "head-only.txt"), "later\n");
  git(root, ["add", "."]); git(root, ["commit", "-m", "unadopted head"]);
  const head = git(root, ["rev-parse", "HEAD"]);
  return { root, first, second, head };
}
function build(runtimeRoot: string, buildId: string, root: string, current: string, history: any[]) {
  const record = createBuildRecordSkeleton({ outcome: "Build product", buildId });
  record.projectBindings.push({ bindingId: `binding-${buildId}`, projectRoot: root });
  record.authoritativeSha = current;
  record.adoptionHistory = history;
  writeBuildRecord(runtimeRoot, record);
}
const adoption = (adoptionIndex: number) => ({ kind: "adoption" as const, adoptionIndex });
const current = { kind: "current" as const };

describe("P8.1 canonical product version comparison", () => {
  it("compares committed historical/current states with factual status and stats, independent of HEAD and worktree", () => {
    const runtimeRoot = temp("runtime"); const { root, first, second, head } = repo();
    build(runtimeRoot, "build-one", root, second, [
      { buildId: "build-one", projectRoot: root, adoptedSha: first, taskId: "one" },
      { buildId: "build-one", projectRoot: root, adoptedSha: second, taskId: "two" },
    ]);
    writeFileSync(join(root, "alpha.txt"), "uncommitted and ignored by comparison\n");
    writeFileSync(join(root, "dirty-only.txt"), "untracked\n");
    const recordPath = resolveBuildRecordPath(runtimeRoot, "build-one");
    const beforeRecord = readFileSync(recordPath, "utf8");
    const beforeStatus = git(root, ["status", "--porcelain=v1", "-uall"]);
    const beforeHead = git(root, ["rev-parse", "HEAD"]);
    const beforeCount = git(root, ["rev-list", "--count", "HEAD"]);
    const beforeFiles = readdirSync(join(runtimeRoot, "metadata", "builds")).sort();
    const result = compareProductVersions({ runtimeRoot, buildId: "build-one", base: adoption(0), target: current });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.base).toMatchObject({ kind: "adoption", adoptionIndex: 0, sha: first });
    expect(result.target).toMatchObject({ kind: "current", adoptionIndex: 1, sha: second });
    expect(result.target.sha).not.toBe(head);
    expect(result.files.map((file) => [file.path, file.status, file.previousPath])).toEqual([
      ["added.txt", "A", null], ["alpha.txt", "M", null], ["binary.bin", "A", null], ["new.txt", "R100", "old.txt"],
    ]);
    expect(result.files.find((file) => file.path === "alpha.txt")).toMatchObject({ additions: 1, deletions: 0, binary: false, statsKnown: true });
    expect(result.files.find((file) => file.path === "binary.bin")).toMatchObject({ additions: null, deletions: null, binary: true, statsKnown: true });
    expect(result.summary).toMatchObject({ changedFiles: 4, additions: null, deletions: null, binaryFiles: 1, statsComplete: false });
    expect(result.files.some((file) => file.path === "head-only.txt" || file.path === "dirty-only.txt")).toBe(false);
    expect(readFileSync(recordPath, "utf8")).toBe(beforeRecord);
    expect(git(root, ["status", "--porcelain=v1", "-uall"])).toBe(beforeStatus);
    expect(git(root, ["rev-parse", "HEAD"])).toBe(beforeHead);
    expect(git(root, ["rev-list", "--count", "HEAD"])).toBe(beforeCount);
    expect(readdirSync(join(runtimeRoot, "metadata", "builds")).sort()).toEqual(beforeFiles);
  });

  it("keeps duplicate-SHA adoption positions distinct and accepts zero-change comparison", () => {
    const runtimeRoot = temp("runtime"); const { root, first } = repo();
    build(runtimeRoot, "build-duplicate", root, first, [
      { adoptedSha: first, taskId: "first-adoption" },
      { adoptedSha: first, taskId: "second-adoption" },
    ]);
    const result = compareProductVersions({ runtimeRoot, buildId: "build-duplicate", base: adoption(0), target: adoption(1) });
    expect(result).toMatchObject({ ok: true, base: { adoptionIndex: 0, sha: first }, target: { adoptionIndex: 1, sha: first }, files: [], summary: { changedFiles: 0 } });
    expect(listProductVersions({ runtimeRoot, buildId: "build-duplicate" })).toMatchObject({ ok: true, current: { adoptionIndex: 1 } });
  });

  it("rejects arbitrary SHA/ref/path selectors and reports each unresolved side without substituting HEAD", () => {
    const runtimeRoot = temp("runtime"); const a = repo(); const b = repo(); const missing = "f".repeat(40);
    build(runtimeRoot, "build-a", a.root, a.second, [{ adoptedSha: missing }, { adoptedSha: a.second }]);
    build(runtimeRoot, "build-b", b.root, b.second, [{ adoptedSha: b.second }]);
    const before = readFileSync(resolveBuildRecordPath(runtimeRoot, "build-a"), "utf8");
    expect(compareProductVersions({ runtimeRoot, buildId: "build-a", base: adoption(0), target: current })).toMatchObject({ ok: false, code: "VERSION_UNRESOLVED", side: "base", sha: missing });
    expect(compareProductVersions({ runtimeRoot, buildId: "build-a", base: current, target: adoption(0) })).toMatchObject({ ok: false, code: "VERSION_UNRESOLVED", side: "target", sha: missing });
    expect(compareProductVersions({ runtimeRoot, buildId: "build-a", base: { kind: "sha", sha: b.second } as any, target: current })).toMatchObject({ ok: false, code: "INVALID_VERSION_SELECTOR", side: "base" });
    expect(compareProductVersions({ runtimeRoot, buildId: "build-a", base: { kind: "current", sha: b.second } as any, target: current })).toMatchObject({ ok: false, code: "INVALID_VERSION_SELECTOR", side: "base" });
    expect(compareProductVersions({ runtimeRoot, buildId: "build-a", base: { kind: "ref", ref: "HEAD" } as any, target: current })).toMatchObject({ ok: false, code: "INVALID_VERSION_SELECTOR", side: "base" });
    expect(compareProductVersions({ runtimeRoot, buildId: "build-a", base: { kind: "current", projectRoot: b.root } as any, target: current })).toMatchObject({ ok: false, code: "INVALID_VERSION_SELECTOR", side: "base" });
    expect(compareProductVersions({ runtimeRoot, buildId: "build-a", base: adoption(9), target: current })).toMatchObject({ ok: false, code: "VERSION_NOT_FOUND", side: "base" });
    expect(compareProductVersions({ runtimeRoot, buildId: "../build-b", base: adoption(0), target: current })).toMatchObject({ ok: false, code: "INVALID_BUILD_ID" });
    expect(readFileSync(resolveBuildRecordPath(runtimeRoot, "build-a"), "utf8")).toBe(before);
  });

  it("fails when authoritative current is unresolved even while Git HEAD is valid", () => {
    const runtimeRoot = temp("runtime"); const { root, first, head } = repo(); const missing = "e".repeat(40);
    build(runtimeRoot, "build-current-missing", root, missing, [{ adoptedSha: first }]);
    expect(git(root, ["rev-parse", "HEAD"])).toBe(head);
    const result = compareProductVersions({ runtimeRoot, buildId: "build-current-missing", base: adoption(0), target: current });
    expect(result).toMatchObject({ ok: false, code: "VERSION_UNRESOLVED", side: "target", sha: missing });
    expect(git(root, ["rev-parse", "HEAD"])).toBe(head);
  });
});
