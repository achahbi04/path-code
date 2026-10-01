/** P7.2 — Build reference inputs are factual turn snapshots, never blob paths. */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBuildRecordSkeleton, readBuildRecord, resolveBuildRecordPath, writeBuildRecord } from "../../scripts/pathcode-cli/build/record.mjs";
import { createLinkedCreatorReference, storeUploadedCreatorReference } from "../../scripts/pathcode-cli/build/references.mjs";
import { snapshotCreatorReferenceInput, validateCreatorReferenceInput, prepareCreatorReferencesForEngine } from "../../scripts/pathcode-cli/build/reference-input.mjs";
import { createBuildController } from "../../scripts/pathcode-cli/build/index.mjs";
import { createCheckpointSkeleton, readTaskCheckpoint, writeTaskCheckpoint } from "../../scripts/pathcode-cli/ag10/task-checkpoint.mjs";

const roots: string[] = [];
function temp(label: string) { const root = mkdtempSync(join(tmpdir(), `path-p72-${label}-`)); roots.push(root); return root; }
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function build(runtimeRoot: string, projectRoot: string, buildId: string) {
  const record = createBuildRecordSkeleton({ outcome: "Make a product", buildId });
  record.projectBindings.push({ bindingId: `bind-${buildId}`, projectRoot });
  writeBuildRecord(runtimeRoot, record);
  return record;
}

describe("P7.2 creator reference turn input", () => {
  it("snapshots only current Build references and rejects cross-Build IDs and caller paths", () => {
    const runtimeRoot = temp("runtime");
    const projectA = temp("a"); const projectB = temp("b");
    build(runtimeRoot, projectA, "build-a"); build(runtimeRoot, projectB, "build-b");
    const a = storeUploadedCreatorReference({ runtimeRoot, buildId: "build-a", bytes: Buffer.from("image"), filename: "a.png", mediaType: "image/png" });
    const b = storeUploadedCreatorReference({ runtimeRoot, buildId: "build-b", bytes: Buffer.from("other"), filename: "b.png", mediaType: "image/png" });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    const snap = snapshotCreatorReferenceInput({ runtimeRoot, buildId: "build-a", bindingId: "bind-build-a", projectRoot: projectA });
    expect(snap.ok).toBe(true);
    if (!snap.ok) return;
    expect(snap.references).toHaveLength(1);
    expect(snap.references[0]?.referenceId).toBe(a.reference.referenceId);
    expect(JSON.stringify(snap.references)).not.toContain(".blob");
    expect(validateCreatorReferenceInput({ runtimeRoot, buildId: "build-a", projectRoot: projectA, references: snap.references })).toMatchObject({ ok: true });
    expect(validateCreatorReferenceInput({ runtimeRoot, buildId: "build-b", projectRoot: projectB, references: snap.references })).toMatchObject({ ok: false });
    expect(validateCreatorReferenceInput({ runtimeRoot, buildId: "build-a", projectRoot: projectA, references: [{ ...snap.references[0], path: "/etc/passwd" } as any] })).toMatchObject({ ok: false });
    expect(validateCreatorReferenceInput({ runtimeRoot, buildId: "build-a", projectRoot: projectA, references: [{ ...snap.references[0], referenceId: b.reference.referenceId } as any] })).toMatchObject({ ok: false });
  });

  it("passes creator URLs as text without fetching, and uploaded bytes only through proven adapter shapes", () => {
    const runtimeRoot = temp("runtime"); const projectRoot = temp("project");
    build(runtimeRoot, projectRoot, "build-one");
    createLinkedCreatorReference({ runtimeRoot, buildId: "build-one", url: "http://127.0.0.1:1/design", label: "Design" });
    const image = storeUploadedCreatorReference({ runtimeRoot, buildId: "build-one", bytes: Buffer.from("image bytes"), filename: "design.png", mediaType: "image/png" });
    expect(image.ok).toBe(true);
    const snap = snapshotCreatorReferenceInput({ runtimeRoot, buildId: "build-one", bindingId: "bind-build-one", projectRoot });
    if (!snap.ok) throw new Error("snapshot failed");
    const input = { runtimeRoot, buildId: "build-one", projectRoot, references: snap.references };
    const cursor = prepareCreatorReferencesForEngine({ ...input, engineId: "cursor", engineMode: "native_sdk" });
    expect(cursor).toMatchObject({ ok: true, attachments: [{ type: "image", data: Buffer.from("image bytes").toString("base64"), mimeType: "image/png" }] });
    if (cursor.ok) expect(cursor.contextText).toContain("http://127.0.0.1:1/design");
    const copilot = prepareCreatorReferencesForEngine({ ...input, engineId: "copilot", engineMode: "native_sdk" });
    expect(copilot).toMatchObject({ ok: true, attachments: [{ type: "blob", data: Buffer.from("image bytes").toString("base64") }] });
    expect(prepareCreatorReferencesForEngine({ ...input, engineId: "antigravity", engineMode: "bridge" })).toMatchObject({ ok: false, code: "REFERENCE_INPUT_UNSUPPORTED" });
    expect(prepareCreatorReferencesForEngine({ ...input, engineId: "copilot", engineMode: "cli_fallback" })).toMatchObject({ ok: false, code: "REFERENCE_INPUT_UNSUPPORTED" });
    const linksOnly = { ...input, references: snap.references.filter((r: any) => r.kind === "linked") };
    expect(prepareCreatorReferencesForEngine({ ...linksOnly, engineId: "antigravity", engineMode: "bridge" })).toMatchObject({ ok: true, attachments: [] });
  });

  it("keeps a selected Build child snapshot stable when later references are added", async () => {
    const runtimeRoot = temp("runtime"); const projectRoot = temp("project");
    build(runtimeRoot, projectRoot, "build-one");
    const first = createLinkedCreatorReference({ runtimeRoot, buildId: "build-one", url: "https://example.com/first" });
    expect(first.ok).toBe(true);
    const calls: any[] = [];
    const controller = createBuildController({ runtimeRoot, fakeMode: false, gateway: {
      async bindProject() { return { ok: true }; },
      async startTask(_objective: string, extra: any) { calls.push(extra); return { ok: true, taskId: extra.taskId }; },
      async awaitTask() { return {}; },
    } as any });
    const dispatched = await controller.dispatchChild("build-one", "engineer", "Build the product");
    expect(dispatched.ok).toBe(true);
    const child = readBuildRecord(runtimeRoot, "build-one")?.children[0];
    expect(child?.referenceInputs).toHaveLength(1);
    expect(calls[0].creatorReferenceInputs).toEqual(child?.referenceInputs);
    expect(calls[0].creatorReferenceBuildId).toBe("build-one");
    createLinkedCreatorReference({ runtimeRoot, buildId: "build-one", url: "https://example.com/later" });
    expect(readBuildRecord(runtimeRoot, "build-one")?.children[0]?.referenceInputs).toEqual(child?.referenceInputs);
    expect(readFileSync(resolveBuildRecordPath(runtimeRoot, "build-one"), "utf8")).not.toContain(".blob");
  });

  it("keeps task input references separate from model provenance and current preferences", () => {
    const runtimeRoot = temp("runtime"); const projectRoot = temp("project");
    build(runtimeRoot, projectRoot, "build-history");
    const first = createLinkedCreatorReference({ runtimeRoot, buildId: "build-history", url: "https://example.com/first" });
    expect(first.ok).toBe(true);
    const snap = snapshotCreatorReferenceInput({ runtimeRoot, buildId: "build-history", bindingId: "bind-build-history", projectRoot });
    if (!snap.ok) throw new Error("snapshot failed");
    const cp = createCheckpointSkeleton({ taskId: "task-history", sessionId: "task-history", worktreePath: projectRoot,
      creatorReferenceBuildId: "build-history", referenceInputs: snap.references,
      engineTurns: [{ engine: "cursor", modelExecution: { requestedModel: "composer-2.5", actualModelKnown: false } }],
    });
    writeTaskCheckpoint(runtimeRoot, cp);
    const before = readTaskCheckpoint(runtimeRoot, "task-history");
    createLinkedCreatorReference({ runtimeRoot, buildId: "build-history", url: "https://example.com/later" });
    expect(readTaskCheckpoint(runtimeRoot, "task-history")?.referenceInputs).toEqual(snap.references);
    expect(readTaskCheckpoint(runtimeRoot, "task-history")?.engineTurns).toEqual(before?.engineTurns);
  });
});
