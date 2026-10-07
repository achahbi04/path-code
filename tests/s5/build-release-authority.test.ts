import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBuildRecordSkeleton, readBuildRecord, writeBuildRecord,
  listBuildDeployments,
  createBuildCoordinatorService, prepareReleaseOperation, transitionReleaseOperation,
  finalizeReleaseOperation, reconcileServing, makeProductionAliasesCommand,
  makeProductionServingEffectCommand, parseProductionAliasPage, observeProductionServing,
  executeProductionReleaseCommand, makeProductionReleaseInspectCommand,
  startPathBuildSurface } from "../../scripts/pathcode-cli/build/index.mjs";
import { resolvePathPackageRoot } from "../../scripts/pathcode-cli/paths.mjs";

const ID1 = "dpl_12345678";
const ID2 = "dpl_87654321";
const at = "2026-10-07T10:00:00.000Z";

function readyRecord({ current = false, serving = "unknown", history = false }: {
  current?: boolean; serving?: "unknown" | "verified" | "drifted"; history?: boolean;
} = {}) {
  const record = createBuildRecordSkeleton({ outcome: "Release test" });
  const priorRelease = { releaseId: "release-r1", operationId: "11111111-1111-1111-1111-111111111111",
    deploymentId: "deployment-a", action: "publish", providerDeploymentId: ID1, provider: "vercel",
    teamRef: "team-a", projectRef: "production-project", mappingId: "mapping-a", sourceSha: "source-a",
    environmentId: "environment-a", environmentRevision: 1, releasedAt: at, previousReleaseId: null };
  record.deployments = { schema: "pathcode.p10.deployments.v1", revision: 4,
    mappings: [{ mappingId: "mapping-a", provider: "vercel", environmentId: "environment-a",
      teamRef: "team-a", projectRef: "production-project", targetRef: "production", updatedAt: at }],
    deployments: [{ deploymentId: "deployment-a", operationId: "11111111-1111-1111-1111-111111111111",
      target: "production", sourceSha: "source-a", treeSha: "tree-a", environmentId: "environment-a",
      environmentRevision: 1, mappingId: "mapping-a", provider: "vercel", teamRef: "team-a",
      projectRef: "production-project", providerDeploymentId: ID1, providerUrl: "https://one.vercel.app",
      providerState: "READY", operationState: "confirmed" },
      { deploymentId: "deployment-b", operationId: "22222222-2222-2222-2222-222222222222",
        target: "production", sourceSha: "source-b", treeSha: "tree-b", environmentId: "environment-a",
        environmentRevision: 1, mappingId: "mapping-a", provider: "vercel", teamRef: "team-a",
        projectRef: "production-project", providerDeploymentId: ID2, providerUrl: "https://two.vercel.app",
        providerState: "READY", operationState: "confirmed" }],
    releases: history ? [priorRelease] : [], releaseOperations: [],
    currentProductionReleaseId: current ? priorRelease.releaseId : null,
    serving: { state: serving, observedProviderDeploymentId: serving === "verified" ? ID1 : null,
      observedAt: serving === "verified" ? at : null }, pendingOperation: null };
  return record;
}

describe("P10.3C bounded Production release authority", () => {
  let root = "";
  let service: Awaited<ReturnType<typeof createBuildCoordinatorService>> | null = null;
  afterEach(async () => { await service?.close(); service = null; if (root) rmSync(root, { recursive: true, force: true }); root = ""; });

  it("creates a durable bootstrap publish intent and finalizes only after exact target serving proof", () => {
    const record = readyRecord();
    const prepared = prepareReleaseOperation(record, { action: "publish", deploymentId: "deployment-a", expectedRevision: 4 });
    expect(prepared).toMatchObject({ ok: true, record: { deployments: {
      currentProductionReleaseId: null, pendingOperation: { kind: "publish", state: "prepared", expectedCurrentReleaseId: null },
      releaseOperations: [{ kind: "publish", state: "prepared", expectedCurrentReleaseId: null }], releases: [] } } });
    const switching = transitionReleaseOperation(prepared.record!, { operationId: prepared.operationId!,
      deploymentId: "deployment-a", state: "switching" });
    const verifying = transitionReleaseOperation(switching.record!, { operationId: prepared.operationId!,
      deploymentId: "deployment-a", state: "verifying", effectAccepted: true });
    expect(verifying.record!.deployments!.currentProductionReleaseId).toBeNull();
    expect(verifying.record!.deployments!.releases).toHaveLength(0); // effect receipt/state is not release authority
    const finalized = finalizeReleaseOperation(verifying.record!, { operationId: prepared.operationId!,
      deploymentId: "deployment-a", action: "publish", expectedCurrentReleaseId: null,
      safeObservation: { ok: true, providerDeploymentId: ID1, projectRef: "production-project",
        teamRef: "team-a", target: "production", url: "https://one.vercel.app", observedAt: at } });
    expect(finalized).toMatchObject({ ok: true, record: { deployments: {
      releases: [{ action: "publish", previousReleaseId: null, providerDeploymentId: ID1 }],
      serving: { state: "verified", observedProviderDeploymentId: ID1 }, pendingOperation: null } } });
    expect(finalized.record!.deployments!.currentProductionReleaseId).toBe(finalized.releaseId);
  });

  it("rejects first-publish finalization when another release pointer wins the race", () => {
    const prepared = prepareReleaseOperation(readyRecord(), { action: "publish", deploymentId: "deployment-a", expectedRevision: 4 });
    const switching = transitionReleaseOperation(prepared.record!, { operationId: prepared.operationId!, deploymentId: "deployment-a", state: "switching" });
    const verifying = transitionReleaseOperation(switching.record!, { operationId: prepared.operationId!, deploymentId: "deployment-a", state: "verifying", effectAccepted: true });
    const drifted = structuredClone(verifying.record!);
    drifted.deployments!.currentProductionReleaseId = "concurrent-release";
    expect(finalizeReleaseOperation(drifted, { operationId: prepared.operationId!, deploymentId: "deployment-a",
      action: "publish", expectedCurrentReleaseId: null, safeObservation: { ok: true, providerDeploymentId: ID1,
        projectRef: "production-project", teamRef: "team-a", target: "production", observedAt: at } }))
      .toMatchObject({ ok: false, code: "RELEASE_AUTHORITY_STALE" });
  });

  it("rejects stale rollback and reestablish pointers after provider work", () => {
    const rollbackBase = readyRecord({ current: true, serving: "verified", history: true });
    rollbackBase.deployments!.releases.push({ ...rollbackBase.deployments!.releases[0], releaseId: "release-r2",
      deploymentId: "deployment-b", providerDeploymentId: ID2 });
    rollbackBase.deployments!.currentProductionReleaseId = "release-r2";
    rollbackBase.deployments!.serving.observedProviderDeploymentId = ID2;
    const rollback = prepareReleaseOperation(rollbackBase, { action: "rollback", deploymentId: "deployment-a", expectedRevision: 4 });
    const rollbackSwitch = transitionReleaseOperation(rollback.record!, { operationId: rollback.operationId!, deploymentId: "deployment-a", state: "switching" });
    const rollbackVerifying = transitionReleaseOperation(rollbackSwitch.record!, { operationId: rollback.operationId!, deploymentId: "deployment-a", state: "verifying", effectAccepted: true });
    const rollbackRace = structuredClone(rollbackVerifying.record!);
    rollbackRace.deployments!.currentProductionReleaseId = "release-r1";
    expect(finalizeReleaseOperation(rollbackRace, { operationId: rollback.operationId!, deploymentId: "deployment-a",
      action: "rollback", expectedCurrentReleaseId: "release-r2", safeObservation: { ok: true,
        providerDeploymentId: ID1, projectRef: "production-project", teamRef: "team-a", target: "production", observedAt: at } }))
      .toMatchObject({ ok: false, code: "RELEASE_AUTHORITY_STALE" });

    const reestablish = prepareReleaseOperation(readyRecord({ current: true, serving: "drifted", history: true }),
      { action: "reestablish", deploymentId: "deployment-a", expectedRevision: 4 });
    const reestablishSwitch = transitionReleaseOperation(reestablish.record!, { operationId: reestablish.operationId!, deploymentId: "deployment-a", state: "switching" });
    const reestablishVerifying = transitionReleaseOperation(reestablishSwitch.record!, { operationId: reestablish.operationId!, deploymentId: "deployment-a", state: "verifying", effectAccepted: true });
    const reestablishRace = structuredClone(reestablishVerifying.record!);
    reestablishRace.deployments!.currentProductionReleaseId = "changed-release";
    expect(finalizeReleaseOperation(reestablishRace, { operationId: reestablish.operationId!, deploymentId: "deployment-a",
      action: "reestablish", expectedCurrentReleaseId: "release-r1", safeObservation: { ok: true,
        providerDeploymentId: ID1, projectRef: "production-project", teamRef: "team-a", target: "production", observedAt: at } }))
      .toMatchObject({ ok: false, code: "RELEASE_AUTHORITY_STALE" });
  });

  it("requires verified serving for subsequent publish and appends rather than overwriting history", () => {
    const unverified = readyRecord({ current: true, serving: "drifted", history: true });
    expect(prepareReleaseOperation(unverified, { action: "publish", deploymentId: "deployment-b", expectedRevision: 4 }))
      .toMatchObject({ ok: false, code: "RELEASE_SERVING_UNVERIFIED" });
    const ready = readyRecord({ current: true, serving: "verified", history: true });
    const prepared = prepareReleaseOperation(ready, { action: "publish", deploymentId: "deployment-b", expectedRevision: 4 });
    const switching = transitionReleaseOperation(prepared.record!, { operationId: prepared.operationId!, deploymentId: "deployment-b", state: "switching" });
    const verifying = transitionReleaseOperation(switching.record!, { operationId: prepared.operationId!, deploymentId: "deployment-b", state: "verifying", effectAccepted: true });
    const done = finalizeReleaseOperation(verifying.record!, { operationId: prepared.operationId!, deploymentId: "deployment-b",
      action: "publish", expectedCurrentReleaseId: "release-r1", safeObservation: { ok: true, providerDeploymentId: ID2,
        projectRef: "production-project", teamRef: "team-a", target: "production", observedAt: at } });
    expect(done).toMatchObject({ ok: true, record: { deployments: { releases: [expect.any(Object), {
      action: "publish", previousReleaseId: "release-r1", providerDeploymentId: ID2 }] } } });
  });

  it("requires a historical eligible rollback target and appends a new rollback decision", () => {
    const ready = readyRecord({ current: true, serving: "verified", history: true });
    expect(prepareReleaseOperation(ready, { action: "rollback", deploymentId: "deployment-b", expectedRevision: 4 }))
      .toMatchObject({ ok: false, code: "ROLLBACK_TARGET_INVALID" });
    const prepared = prepareReleaseOperation(ready, { action: "rollback", deploymentId: "deployment-a", expectedRevision: 4 });
    expect(prepared).toMatchObject({ ok: false, code: "ROLLBACK_TARGET_INVALID" });
    const withSecondHistory = structuredClone(ready);
    withSecondHistory.deployments!.releases.push({ ...withSecondHistory.deployments!.releases[0], releaseId: "release-r2",
      deploymentId: "deployment-b", providerDeploymentId: ID2 });
    withSecondHistory.deployments!.currentProductionReleaseId = "release-r2";
    const rollback = prepareReleaseOperation(withSecondHistory, { action: "rollback", deploymentId: "deployment-a", expectedRevision: 4 });
    expect(rollback).toMatchObject({ ok: true, record: { deployments: { pendingOperation: { kind: "rollback", targetReleaseId: "release-r1" } } } });
  });

  it("reestablishes the current deployment without appending a release and retains the operation audit", () => {
    const ready = readyRecord({ current: true, serving: "drifted", history: true });
    const prepared = prepareReleaseOperation(ready, { action: "reestablish", deploymentId: "deployment-a", expectedRevision: 4 });
    expect(prepared).toMatchObject({ ok: true });
    const switching = transitionReleaseOperation(prepared.record!, { operationId: prepared.operationId!, deploymentId: "deployment-a", state: "switching" });
    const verifying = transitionReleaseOperation(switching.record!, { operationId: prepared.operationId!, deploymentId: "deployment-a", state: "verifying", effectAccepted: true });
    const done = finalizeReleaseOperation(verifying.record!, { operationId: prepared.operationId!, deploymentId: "deployment-a",
      action: "reestablish", expectedCurrentReleaseId: "release-r1", safeObservation: { ok: true, providerDeploymentId: ID1,
        projectRef: "production-project", teamRef: "team-a", target: "production", observedAt: at } });
    expect(done).toMatchObject({ ok: true, releaseId: null, record: { deployments: {
      currentProductionReleaseId: "release-r1", releases: [{ releaseId: "release-r1" }],
      releaseOperations: [{ kind: "reestablish", state: "completed", resultReleaseId: null }],
      serving: { state: "verified", observedProviderDeploymentId: ID1 } } } });
    expect(prepareReleaseOperation(readyRecord(), { action: "reestablish", deploymentId: "deployment-a", expectedRevision: 4 }))
      .toMatchObject({ ok: false, code: "REESTABLISH_NOT_REQUIRED" });
  });

  it("does not repeat an uncertain serving effect", () => {
    const prepared = prepareReleaseOperation(readyRecord(), { action: "publish", deploymentId: "deployment-a", expectedRevision: 4 });
    const switching = transitionReleaseOperation(prepared.record!, { operationId: prepared.operationId!, deploymentId: "deployment-a", state: "switching" });
    const uncertain = transitionReleaseOperation(switching.record!, { operationId: prepared.operationId!, deploymentId: "deployment-a",
      state: "uncertain", failureCode: "RELEASE_EFFECT_UNCERTAIN" });
    expect(transitionReleaseOperation(uncertain.record!, { operationId: prepared.operationId!, deploymentId: "deployment-a", state: "switching" }))
      .toMatchObject({ ok: false, code: "RELEASE_TRANSITION_INVALID" });
  });

  it("requires a fresh explicit release operation after safe-stop and retains the stopped audit", () => {
    const prepared = prepareReleaseOperation(readyRecord({ current: true, serving: "drifted", history: true }),
      { action: "reestablish", deploymentId: "deployment-a", expectedRevision: 4 });
    const switching = transitionReleaseOperation(prepared.record!, { operationId: prepared.operationId!, deploymentId: "deployment-a", state: "switching" });
    const stopped = transitionReleaseOperation(switching.record!, { operationId: prepared.operationId!, deploymentId: "deployment-a",
      state: "safe_stop", failureCode: "SERVING_OBSERVATION_UNKNOWN" });
    const next = prepareReleaseOperation(stopped.record!, { action: "reestablish", deploymentId: "deployment-a",
      expectedRevision: stopped.revision! });
    expect(next).toMatchObject({ ok: true, record: { deployments: {
      pendingOperation: { kind: "reestablish", state: "prepared" },
      releaseOperations: [{ operationId: prepared.operationId, state: "safe_stop",
        supersededByOperationId: expect.any(String) }, { kind: "reestablish", state: "prepared" }] } } });
    expect(next.operationId).not.toBe(prepared.operationId);
  });

  it("does not let a superseded safe-stop release operation regain authority", () => {
    const preparedA = prepareReleaseOperation(readyRecord(),
      { action: "publish", deploymentId: "deployment-a", expectedRevision: 4 });
    const switchingA = transitionReleaseOperation(preparedA.record!, { operationId: preparedA.operationId!,
      deploymentId: "deployment-a", state: "switching" });
    const stoppedA = transitionReleaseOperation(switchingA.record!, { operationId: preparedA.operationId!,
      deploymentId: "deployment-a", state: "safe_stop", failureCode: "SERVING_OBSERVATION_UNKNOWN" });
    const preparedB = prepareReleaseOperation(stoppedA.record!,
      { action: "publish", deploymentId: "deployment-b", expectedRevision: stoppedA.revision! });

    expect(preparedB).toMatchObject({ ok: true, record: { deployments: {
      pendingOperation: { operationId: expect.any(String), deploymentId: "deployment-b", state: "prepared" },
      releaseOperations: [
        { operationId: preparedA.operationId, state: "safe_stop", supersededByOperationId: expect.any(String) },
        { kind: "publish", deploymentId: "deployment-b", state: "prepared" },
      ], releases: [], currentProductionReleaseId: null,
    } } });
    expect(preparedB.operationId).not.toBe(preparedA.operationId);

    // A late observation for A's original target cannot transition or finalize A
    // once B is the canonical pending operation.
    expect(transitionReleaseOperation(preparedB.record!, { operationId: preparedA.operationId!,
      deploymentId: "deployment-a", state: "verifying", effectAccepted: true }))
      .toMatchObject({ ok: false, code: "RELEASE_OPERATION_NOT_FOUND" });
    expect(finalizeReleaseOperation(preparedB.record!, { operationId: preparedA.operationId!,
      deploymentId: "deployment-a", action: "publish", expectedCurrentReleaseId: null,
      safeObservation: { ok: true, providerDeploymentId: ID1, projectRef: "production-project",
        teamRef: "team-a", target: "production", observedAt: at } }))
      .toMatchObject({ ok: false, code: "RELEASE_OPERATION_NOT_FOUND" });
    expect(preparedB.record!.deployments!.releases).toHaveLength(0);
    expect(preparedB.record!.deployments!.currentProductionReleaseId).toBeNull();
    expect(preparedB.record!.deployments!.pendingOperation).toMatchObject({
      operationId: preparedB.operationId, deploymentId: "deployment-b", state: "prepared" });
  });

  it("normalizes persisted pre-C deployment authority without releaseOperations", () => {
    root = mkdtempSync(join(tmpdir(), "path-p103c-pre-c-state-"));
    const build = createBuildRecordSkeleton({ outcome: "Pre-C release state" });
    const preC = readyRecord({ current: true, serving: "verified", history: true });
    delete (preC.deployments as any).releaseOperations;
    build.deployments = preC.deployments!;
    writeBuildRecord(root, build);

    const persisted = readBuildRecord(root, build.buildId)!;
    expect(Object.hasOwn(persisted.deployments!, "releaseOperations")).toBe(false);
    const projected = listBuildDeployments(root, build.buildId);

    expect(projected).toMatchObject({ ok: true, schema: "pathcode.p10.deployments.v1",
      releaseOperations: [], releases: preC.deployments!.releases,
      currentProductionReleaseId: preC.deployments!.currentProductionReleaseId,
      serving: preC.deployments!.serving, pendingOperation: null });
    expect(projected.deployments).toMatchObject(preC.deployments!.deployments.map((deployment) => ({
      deploymentId: deployment.deploymentId, operationId: deployment.operationId,
      target: deployment.target, sourceSha: deployment.sourceSha, treeSha: deployment.treeSha,
      environmentId: deployment.environmentId, environmentRevision: deployment.environmentRevision,
      mappingId: deployment.mappingId, provider: deployment.provider,
      providerDeploymentId: deployment.providerDeploymentId, providerUrl: deployment.providerUrl,
      operationState: deployment.operationState, providerState: deployment.providerState,
    })));
    expect(projected.releases).toEqual(preC.deployments!.releases);
    expect(projected.currentProductionReleaseId).toBe("release-r1");
    expect(projected.releaseOperations).toEqual([]);
    expect(readBuildRecord(root, build.buildId)!.deployments).toEqual(preC.deployments);
  });

  it("refuses to finalize when factual serving identifies another deployment", () => {
    const prepared = prepareReleaseOperation(readyRecord(), { action: "publish", deploymentId: "deployment-a", expectedRevision: 4 });
    const switching = transitionReleaseOperation(prepared.record!, { operationId: prepared.operationId!, deploymentId: "deployment-a", state: "switching" });
    const verifying = transitionReleaseOperation(switching.record!, { operationId: prepared.operationId!, deploymentId: "deployment-a", state: "verifying", effectAccepted: true });
    expect(finalizeReleaseOperation(verifying.record!, { operationId: prepared.operationId!, deploymentId: "deployment-a",
      action: "publish", expectedCurrentReleaseId: null, safeObservation: { ok: true, providerDeploymentId: ID2,
        projectRef: "production-project", teamRef: "team-a", target: "production", observedAt: at } }))
      .toMatchObject({ ok: false, code: "RELEASE_SERVING_UNVERIFIED" });
    expect(verifying.record!.deployments!.currentProductionReleaseId).toBeNull();
  });

  it("strictly reduces team-scoped alias rows and rejects unsafe rows", () => {
    expect(parseProductionAliasPage({ aliases: [{ alias: "project.vercel.app", deploymentId: ID1,
      url: "https://project.vercel.app", createdAt: 1 }], pagination: { count: 1, next: null, prev: null } }))
      .toEqual({ ok: true, aliases: [{ alias: "project.vercel.app", providerDeploymentId: ID1 }], nextCursor: null, completed: true });
    expect(parseProductionAliasPage({ aliases: [{ alias: "x", deploymentId: ID1, token: "secret" }],
      pagination: { count: 1, next: null, prev: null } })).toMatchObject({ ok: false, code: "PROVIDER_SERVING_UNKNOWN" });
    expect((makeProductionAliasesCommand({ teamRef: "team-a" }) as any).argv).toEqual(["alias", "ls", "--json", "--limit", "100", "--scope", "team-a"]);
    expect((makeProductionServingEffectCommand({ action: "publish", providerDeploymentId: ID1, teamRef: "team-a" }) as any).argv[0]).toBe("promote");
    expect((makeProductionServingEffectCommand({ action: "reestablish", providerDeploymentId: ID1, teamRef: "team-a" }) as any).argv[0]).toBe("promote");
    expect((makeProductionServingEffectCommand({ action: "rollback", providerDeploymentId: ID1, teamRef: "team-a" }) as any).argv[0]).toBe("rollback");
  });

  it("uses strict provider inspect facts to reject wrong project and wrong team scope", async () => {
    const spec = makeProductionReleaseInspectCommand({ providerDeploymentId: ID1, teamRef: "team-a" }) as any;
    const spawnImpl = vi.fn((_executable: string, _argv: string[], _options: any) => {
      const child = new EventEmitter() as EventEmitter & { stdout: PassThrough; stderr: PassThrough; kill: () => void };
      child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = vi.fn() as any;
      queueMicrotask(() => { child.stdout.end(JSON.stringify({ id: ID1, name: "wrong-project", url: "one.vercel.app",
        target: "production", readyState: "READY", createdAt: 1 })); child.emit("close", 0); });
      return child;
    });
    expect(await executeProductionReleaseCommand(spec, { cwd: "/tmp", mode: "release_inspect",
      context: { providerDeploymentId: ID1, projectName: "production-project", projectRef: "production-project", teamRef: "team-a" },
      spawnImpl: spawnImpl as any })).toMatchObject({ ok: false, code: "PROVIDER_SERVING_UNKNOWN" });
    expect(await executeProductionReleaseCommand(spec, { cwd: "/tmp", mode: "release_inspect",
      context: { providerDeploymentId: ID1, projectName: "production-project", projectRef: "production-project", teamRef: "team-b" },
      spawnImpl: spawnImpl as any })).toMatchObject({ ok: false, code: "PROVIDER_COMMAND_INVALID" });
  });

  it("requires a unique alias-to-Production-deployment correspondence and rejects wrong project/target", async () => {
    const base = { teamRef: "team-a", projectRef: "production-project", projectName: "production-project",
      executeAliases: vi.fn(async () => ({ ok: true, aliases: [{ alias: "production-project.vercel.app", providerDeploymentId: ID1 }], nextCursor: null })),
      executeInspect: vi.fn(async (_spec: any, context: any) => ({ ok: true, providerDeploymentId: context.providerDeploymentId,
        url: "https://one.vercel.app", projectRef: "production-project", teamRef: "team-a", target: "production", providerState: "READY" })) };
    expect(await observeProductionServing(base)).toMatchObject({ ok: true, providerDeploymentId: ID1, target: "production" });
    const wrongProject = { ...base, executeInspect: vi.fn(async () => ({ ok: true, providerDeploymentId: ID1,
      url: "https://one.vercel.app", projectRef: "other-project", teamRef: "team-a", target: "production", providerState: "READY" })) };
    expect(await observeProductionServing(wrongProject)).toMatchObject({ ok: false, code: "PROVIDER_SERVING_UNKNOWN" });
    const wrongTarget = { ...base, executeInspect: vi.fn(async () => ({ ok: true, providerDeploymentId: ID1,
      url: "https://one.vercel.app", projectRef: "production-project", teamRef: "team-a", target: "preview", providerState: "READY" })) };
    expect(await observeProductionServing(wrongTarget)).toMatchObject({ ok: false, code: "PROVIDER_SERVING_UNKNOWN" });
    const ambiguous = { ...base, executeAliases: vi.fn(async () => ({ ok: true, aliases: [
      { alias: "production-project.vercel.app", providerDeploymentId: ID1 },
      { alias: "production-project.vercel.app", providerDeploymentId: ID2 }], nextCursor: null })) };
    expect(await observeProductionServing(ambiguous)).toMatchObject({ ok: false, code: "PROVIDER_SERVING_UNKNOWN" });
    const customOnly = { ...base, executeAliases: vi.fn(async () => ({ ok: true,
      aliases: [{ alias: "custom.example.test", providerDeploymentId: ID1 }], nextCursor: null })) };
    expect(await observeProductionServing(customOnly)).toMatchObject({ ok: true, state: "unknown", providerDeploymentId: null });
  });

  it("never treats URL-only or missing deployment identity as serving authority", async () => {
    expect(await observeProductionServing({ teamRef: null, projectRef: "p", projectName: "p",
      executeAliases: async () => ({ ok: true, aliases: [], nextCursor: null }), executeInspect: vi.fn() }))
      .toMatchObject({ ok: true, state: "unknown", providerDeploymentId: null });
    const reduced = reconcileServing(readyRecord({ current: true, serving: "verified", history: true }), null);
    expect(reduced).toMatchObject({ ok: true, serving: { state: "unknown", observedProviderDeploymentId: null } });
  });

  it("uses real strict release command validation and stubbed spawn for bootstrap publish", async () => {
    root = mkdtempSync(join(tmpdir(), "path-p103c-"));
    const build = createBuildRecordSkeleton({ outcome: "Release integration" });
    build.loop.status = "paused"; build.coordinator = { autoRun: false, owner: "path-build-coordinator" };
    build.deployments = readyRecord().deployments!;
    writeBuildRecord(root, build);
    const commands: string[][] = [];
    const spawnImpl = vi.fn((executable: string, argv: string[]) => {
      expect(executable).toBe("vercel"); commands.push(argv);
      const child = new EventEmitter() as EventEmitter & { stdout: PassThrough; stderr: PassThrough; kill: () => void };
      child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = vi.fn() as any;
      const stdout = argv[0] === "alias" ? JSON.stringify({ aliases: [{ alias: "production-project.vercel.app",
        deploymentId: ID1, url: "https://production-project.vercel.app", createdAt: 1 }], pagination: { count: 1, next: null, prev: null } }) :
        argv[0] === "inspect" ? JSON.stringify({ id: ID1, name: "production-project", url: "one.vercel.app",
          target: "production", readyState: "READY", createdAt: 1 }) : "";
      queueMicrotask(() => { if (stdout) child.stdout.end(stdout); child.emit("close", 0); });
      return child;
    });
    service = await createBuildCoordinatorService({ runtimeRoot: root, packageRoot: resolvePathPackageRoot(), fakeMode: true,
      productionCommandExecutor: async (_spec: any, options: any) => options.mode === "production_auth"
        ? { ok: true, authenticated: true, teamRef: "team-a" }
        : { ok: true, projectId: "production-project", projectName: "production-project" },
      releaseSpawnImpl: spawnImpl as any });
    const call = (method: string, params: Record<string, unknown>) => service!.dispatch(method, { buildId: build.buildId, ...params });
    const prepared = await call("build.releases.prepare", { action: "publish", deploymentId: "deployment-a", expectedRevision: 4 }) as any;
    expect(prepared).toMatchObject({ ok: true, revision: 5 });
    expect(readBuildRecord(root, build.buildId)!.deployments!.pendingOperation).toMatchObject({ kind: "publish", state: "prepared" });
    const completed = await call("build.releases.execute", { operationId: prepared.operationId,
      deploymentId: "deployment-a", expectedRevision: prepared.revision }) as any;
    expect(completed).toMatchObject({ ok: true, outcome: "FINALIZED", action: "publish" });
    expect(commands.filter((argv) => argv[0] === "promote")).toHaveLength(1);
    expect(commands.some((argv) => argv[0] === "deploy")).toBe(false);
    expect(readBuildRecord(root, build.buildId)!.deployments).toMatchObject({
      serving: { state: "verified", observedProviderDeploymentId: ID1 }, releases: [{ action: "publish" }],
      currentProductionReleaseId: expect.any(String) });
    expect(spawnImpl).toHaveBeenCalledWith("vercel", expect.any(Array), expect.objectContaining({ shell: false }));
  });

  it("preserves an uncertain effect and refuses to issue a second serving switch", async () => {
    root = mkdtempSync(join(tmpdir(), "path-p103c-uncertain-"));
    const build = createBuildRecordSkeleton({ outcome: "Uncertain release" });
    build.loop.status = "paused"; build.coordinator = { autoRun: false, owner: "path-build-coordinator" };
    build.deployments = readyRecord().deployments!;
    writeBuildRecord(root, build);
    const modes: string[] = [];
    const executor = vi.fn(async (_spec: any, options: any) => {
      modes.push(options.mode);
      if (options.mode === "release_inspect") return { ok: true, providerDeploymentId: options.context.providerDeploymentId,
        url: "https://one.vercel.app", projectRef: "production-project", teamRef: "team-a", target: "production", providerState: "READY" };
      if (options.mode === "release_effect") return { ok: false, code: "RELEASE_EFFECT_UNCERTAIN" };
      if (options.mode === "release_aliases") return { ok: true, aliases: [{ alias: "production-project.vercel.app",
        providerDeploymentId: ID2 }], nextCursor: null };
      throw new Error(`Unexpected release mode ${options.mode}`);
    });
    service = await createBuildCoordinatorService({ runtimeRoot: root, packageRoot: resolvePathPackageRoot(), fakeMode: true,
      productionCommandExecutor: async (_spec: any, options: any) => options.mode === "production_auth"
        ? { ok: true, authenticated: true, teamRef: "team-a" }
        : { ok: true, projectId: "production-project", projectName: "production-project" },
      releaseCommandExecutor: executor });
    const call = (method: string, params: Record<string, unknown>) => service!.dispatch(method, { buildId: build.buildId, ...params });
    const prepared = await call("build.releases.prepare", { action: "publish", deploymentId: "deployment-a", expectedRevision: 4 }) as any;
    const result = await call("build.releases.execute", { operationId: prepared.operationId,
      deploymentId: "deployment-a", expectedRevision: prepared.revision }) as any;
    expect(result).toMatchObject({ ok: false, outcome: "PROVIDER_SERVING_DRIFT" });
    const state = readBuildRecord(root, build.buildId)!.deployments!;
    expect(state.currentProductionReleaseId).toBeNull();
    expect(state.releases).toHaveLength(0);
    expect(state.pendingOperation).toMatchObject({ state: "safe_stop", kind: "publish" });
    expect(await call("build.releases.execute", { operationId: prepared.operationId,
      deploymentId: "deployment-a", expectedRevision: state.revision })).toMatchObject({ ok: false, code: "RELEASE_EFFECT_ALREADY_ATTEMPTED" });
    expect(modes.filter((mode) => mode === "release_effect")).toHaveLength(1);
  });

  it("does not perform serving effects during coordinator startup recovery", async () => {
    root = mkdtempSync(join(tmpdir(), "path-p103c-startup-"));
    const build = createBuildRecordSkeleton({ outcome: "Startup recovery" });
    build.loop.status = "paused"; build.coordinator = { autoRun: false, owner: "path-build-coordinator" };
    const fixture = structuredClone(build);
    fixture.deployments = readyRecord().deployments!;
    const prepared = prepareReleaseOperation(fixture,
      { action: "publish", deploymentId: "deployment-a", expectedRevision: 4 });
    build.deployments = prepared.record!.deployments!;
    writeBuildRecord(root, build);
    const releaseExecutor = vi.fn(async () => { throw new Error("startup must not call provider"); });
    service = await createBuildCoordinatorService({ runtimeRoot: root, packageRoot: resolvePathPackageRoot(),
      fakeMode: true, releaseCommandExecutor: releaseExecutor });
    await service.whenReady;
    expect(releaseExecutor).not.toHaveBeenCalled();
    expect(readBuildRecord(root, build.buildId)!.deployments!.pendingOperation).toMatchObject({ state: "prepared" });
    expect(readBuildRecord(root, build.buildId)!.deployments!.currentProductionReleaseId).toBeNull();
  });

  it("rejects non-confirmed, non-READY, Preview, and cross-project release targets", () => {
    for (const change of [
      (record: any) => { record.deployments.deployments[0].operationState = "submitted"; },
      (record: any) => { record.deployments.deployments[0].providerState = "BUILDING"; },
      (record: any) => { record.deployments.deployments[0].target = "preview"; },
      (record: any) => { record.deployments.deployments[0].teamRef = "other-team"; },
    ]) {
      const record = readyRecord(); change(record);
      expect(prepareReleaseOperation(record, { action: "publish", deploymentId: "deployment-a", expectedRevision: 4 }).ok).toBe(false);
    }
  });

  it("exposes bounded release preparation and read-only history through the Gateway surface", async () => {
    root = mkdtempSync(join(tmpdir(), "path-p103c-gateway-"));
    const build = createBuildRecordSkeleton({ outcome: "Release Gateway" });
    build.loop.status = "paused"; build.coordinator = { autoRun: false, owner: "path-build-coordinator" };
    build.deployments = readyRecord().deployments!;
    writeBuildRecord(root, build);
    const surface = await startPathBuildSurface({ packageRoot: resolvePathPackageRoot(), runtimeRoot: root,
      fakeMode: true, autoLoop: false, openBrowser: false, port: 0 });
    try {
      const prepared = await fetch(new URL(`/api/builds/${build.buildId}/releases/prepare`, surface.url), {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "publish", deploymentId: "deployment-a", expectedRevision: 4 }),
      });
      expect(prepared.status).toBe(200);
      const result = await prepared.json() as any;
      expect(result).toMatchObject({ ok: true, action: "publish", revision: 5 });
      const history = await fetch(new URL(`/api/builds/${build.buildId}/releases`, surface.url));
      expect(await history.json()).toMatchObject({ ok: true, releases: [],
        releaseOperations: [{ operationId: result.operationId, kind: "publish", state: "prepared" }],
        currentProductionReleaseId: null });
    } finally { await surface.stop({ teardownOwned: true }); }
  });
});
