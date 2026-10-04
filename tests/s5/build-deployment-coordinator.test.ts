import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createBuildRecordSkeleton, createBuildCoordinatorClient, readBuildRecord,
  resolveBuildRecordPath, startBuildCoordinatorServer, writeBuildRecord } from "../../scripts/pathcode-cli/build/index.mjs";
import { resolvePathPackageRoot } from "../../scripts/pathcode-cli/paths.mjs";

describe("P10 Preview transaction through the scoped coordinator", () => {
  let root = "";
  let server: Awaited<ReturnType<typeof startBuildCoordinatorServer>> | null = null;
  let client: ReturnType<typeof createBuildCoordinatorClient> | null = null;
  afterEach(async () => {
    client?.close(); client = null;
    if (server) { await server.stop(); server = null; }
    if (root) rmSync(root, { recursive: true, force: true });
    root = "";
  });
  function git(cwd: string, ...args: string[]) {
    const result = spawnSync("git", args, { cwd, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    return result.stdout.trim();
  }
  async function setup(configNames: string[] = []) {
    root = mkdtempSync(join(tmpdir(), "path-p10-coordinator-"));
    const project = join(root, "product");
    mkdirSync(project);
    git(project, "init", "-q");
    git(project, "config", "user.email", "path-test@example.test");
    git(project, "config", "user.name", "PATH Test");
    writeFileSync(join(project, "index.html"), "<h1>adopted</h1>");
    git(project, "add", "."); git(project, "commit", "-qm", "adopted");
    const target = createBuildRecordSkeleton({ outcome: "Preview" });
    target.projectBindings.push({ bindingId: "product", projectRoot: project });
    target.authoritativeSha = git(project, "rev-parse", "HEAD");
    target.loop.status = "paused";
    target.coordinator = { autoRun: false, owner: "path-build-coordinator" };
    const other = createBuildRecordSkeleton({ outcome: "Unrelated" });
    other.loop.status = "paused";
    other.coordinator = { autoRun: false, owner: "path-build-coordinator" };
    writeBuildRecord(root, target); writeBuildRecord(root, other);
    const otherPath = resolveBuildRecordPath(root, other.buildId);
    const unrelatedBefore = readFileSync(otherPath);
    server = await startBuildCoordinatorServer({ runtimeRoot: root,
      packageRoot: resolvePathPackageRoot(), scopedBuildId: target.buildId });
    client = createBuildCoordinatorClient({ runtimeRoot: root, socketPath: server.socketPath });
    await client.connect();
    const created = await client.mutateEnvironment(target.buildId, "create_environment", 0, { name: "preview" });
    expect(created).toMatchObject({ ok: true, revision: 1 });
    const environmentId = created.environmentId!;
    let environmentRevision = 1;
    for (const variableName of configNames) {
      const set = await client.mutateEnvironment(target.buildId, "set_config", environmentRevision,
        { environmentId, variableName, value: "ordinary-value" });
      expect(set).toMatchObject({ ok: true });
      environmentRevision = set.revision!;
    }
    const mapping = await client.mutateDeploymentMapping(target.buildId, { action: "set", expectedRevision: 0,
      environmentId, teamRef: null, projectRef: "product", targetRef: "preview" });
    expect(mapping).toMatchObject({ ok: true, revision: 1 });
    const prepare = (expectedRevision = 1) => client!.prepareDeployment(target.buildId,
      { environmentId, expectedRevision, expectedEnvironmentRevision: environmentRevision });
    const transition = (operationId: string, deploymentId: string, expectedRevision: number,
      state: string, extra: Record<string, unknown> = {}) => client!.transitionDeployment(target.buildId,
      { operationId, deploymentId, expectedRevision, state, ...extra });
    return { target, other, otherPath, unrelatedBefore, environmentId, environmentRevision, prepare, transition };
  }

  it("persists intent first, accepts zero Config, reconciles uncertain submission, and finalizes Preview once", async () => {
    const s = await setup();
    expect(await s.prepare(0)).toMatchObject({ ok: false, code: "DEPLOY_REVISION_STALE" });
    expect(await client!.prepareDeployment(s.other.buildId, {})).toMatchObject({ ok: false, code: "COORDINATOR_SCOPE_FORBIDDEN" });
    const prepared = await s.prepare();
    expect(prepared).toMatchObject({ ok: true, revision: 2 });
    const operationId = prepared.operationId!;
    const deploymentId = prepared.deploymentId!;
    const initial = readBuildRecord(root, s.target.buildId)!.deployments!;
    expect(initial.pendingOperation).toMatchObject({ operationId, deploymentId, state: "prepared",
      configReceipts: [], providerDeploymentId: null });
    expect(initial.deployments).toMatchObject([{ operationId, deploymentId, providerDeploymentId: null,
      providerUrl: null, operationState: "prepared" }]);
    expect(await s.prepare(2)).toMatchObject({ ok: false, code: "DEPLOY_OPERATION_PENDING" });
    expect(await s.transition(operationId, deploymentId, 1, "submitting"))
      .toMatchObject({ ok: false, code: "DEPLOY_REVISION_STALE" });
    expect(await s.transition(operationId, deploymentId, 2, "submitting"))
      .toMatchObject({ ok: true, revision: 3 });
    expect(await s.transition(operationId, deploymentId, 3, "uncertain"))
      .toMatchObject({ ok: true, revision: 4 });
    expect(await s.transition(operationId, deploymentId, 4, "submitting"))
      .toMatchObject({ ok: false });
    expect(await s.transition("wrong-operation", deploymentId, 4, "submitted", { providerDeploymentId: "dpl_12345678",
      providerUrl: "https://example.vercel.app" })).toMatchObject({ ok: false, code: "DEPLOY_OPERATION_NOT_FOUND" });
    expect(await s.transition(operationId, "wrong-deployment", 4, "submitted", { providerDeploymentId: "dpl_12345678",
      providerUrl: "https://example.vercel.app" })).toMatchObject({ ok: false, code: "DEPLOY_OPERATION_NOT_FOUND" });
    expect(await s.transition(operationId, deploymentId, 4, "submitted", { providerDeploymentId: "dpl_12345678",
      providerUrl: "https://example.vercel.app", value: "RAW_SENTINEL" }))
      .toMatchObject({ ok: false, code: "DEPLOY_TRANSITION_INVALID" });
    expect(await s.transition(operationId, deploymentId, 4, "submitted", { providerDeploymentId: "dpl_12345678",
      providerUrl: "https://example.vercel.app" })).toMatchObject({ ok: true, revision: 5 });
    expect(await s.transition(operationId, deploymentId, 5, "provider_observation", {
      providerDeploymentId: "dpl_87654321", providerUrl: "https://example.vercel.app", providerState: "READY" }))
      .toMatchObject({ ok: false, code: "DEPLOY_TRANSITION_INVALID" });
    expect(await s.transition(operationId, deploymentId, 5, "provider_observation", {
      providerDeploymentId: "dpl_12345678", providerUrl: "https://example.vercel.app",
      providerState: "READY", value: "RAW_SENTINEL" }))
      .toMatchObject({ ok: false, code: "DEPLOY_TRANSITION_INVALID" });
    expect(await s.transition(operationId, deploymentId, 5, "provider_observation", {
      providerDeploymentId: "dpl_12345678", providerUrl: "https://example.vercel.app", providerState: "BUILDING" }))
      .toMatchObject({ ok: true, revision: 6 });
    expect(await s.transition(operationId, deploymentId, 6, "confirmed", { providerDeploymentId: "dpl_12345678" }))
      .toMatchObject({ ok: false, code: "DEPLOY_TRANSITION_INVALID" });
    expect(await s.transition(operationId, deploymentId, 6, "provider_observation", {
      providerDeploymentId: "dpl_12345678", providerUrl: "https://example.vercel.app", providerState: "READY" }))
      .toMatchObject({ ok: true, revision: 7 });
    expect(await s.transition(operationId, deploymentId, 7, "confirmed", { providerDeploymentId: "dpl_12345678" }))
      .toMatchObject({ ok: true, revision: 8 });
    expect(await s.transition(operationId, deploymentId, 8, "confirmed", { providerDeploymentId: "dpl_12345678" }))
      .toMatchObject({ ok: false, code: "DEPLOY_OPERATION_NOT_FOUND" });
    const final = readBuildRecord(root, s.target.buildId)!.deployments!;
    expect(final.pendingOperation).toBeNull();
    expect(final.deployments).toMatchObject([{ deploymentId, operationId, providerDeploymentId: "dpl_12345678",
      providerState: "READY", operationState: "confirmed", target: "preview" }]);
    expect(final.releases).toEqual([]);
    expect(final.currentProductionReleaseId).toBeNull();
    expect(readFileSync(s.otherPath)).toEqual(s.unrelatedBefore);
    expect(readFileSync(resolveBuildRecordPath(root, s.target.buildId), "utf8")).not.toContain("RAW_SENTINEL");
    expect(await client!.request("build.restoreHistorical", { buildId: s.target.buildId }))
      .toMatchObject({ ok: false, code: "COORDINATOR_SCOPE_FORBIDDEN" });
  });

  it("retains partial Config progress and blocks submission until every safe receipt exists", async () => {
    const s = await setup(["CONFIG_A", "CONFIG_B"]);
    const prepared = await s.prepare();
    const op = prepared.operationId!;
    const dep = prepared.deploymentId!;
    expect(await s.transition(op, dep, 2, "config_receipt", { variableName: "CONFIG_A" }))
      .toMatchObject({ ok: true, revision: 3 });
    expect(await s.transition(op, dep, 3, "submitting"))
      .toMatchObject({ ok: false, code: "CONFIG_PROJECTION_INCOMPLETE" });
    expect(await s.transition(op, dep, 3, "config_projection_incomplete"))
      .toMatchObject({ ok: true, revision: 4 });
    expect(readBuildRecord(root, s.target.buildId)!.deployments!.pendingOperation)
      .toMatchObject({ state: "config_projection_incomplete", configReceipts: [{ variableName: "CONFIG_A" }] });
    expect(await s.transition(op, dep, 4, "config_receipt", { variableName: "CONFIG_B" }))
      .toMatchObject({ ok: true, revision: 5 });
    expect(await s.transition(op, dep, 5, "submitting"))
      .toMatchObject({ ok: true, revision: 6 });
    expect(readFileSync(s.otherPath)).toEqual(s.unrelatedBefore);
  });

  it("persists factual provider failure without a release or retry", async () => {
    const s = await setup();
    const prepared = await s.prepare();
    const op = prepared.operationId!;
    const dep = prepared.deploymentId!;
    expect(await s.transition(op, dep, 2, "submitting")).toMatchObject({ ok: true, revision: 3 });
    expect(await s.transition(op, dep, 3, "submitted", { providerDeploymentId: "dpl_12345678",
      providerUrl: "https://example.vercel.app" })).toMatchObject({ ok: true, revision: 4 });
    expect(await s.transition(op, dep, 4, "failed", { failureCode: "PROVIDER_BUILD_FAILED" }))
      .toMatchObject({ ok: false, code: "DEPLOY_TRANSITION_INVALID" });
    expect(await s.transition(op, dep, 4, "provider_observation", { providerDeploymentId: "dpl_12345678",
      providerUrl: "https://example.vercel.app", providerState: "ERROR" }))
      .toMatchObject({ ok: true, revision: 5 });
    expect(await s.transition(op, dep, 5, "failed", { failureCode: "PROVIDER_BUILD_FAILED" }))
      .toMatchObject({ ok: true, revision: 6 });
    const authority = readBuildRecord(root, s.target.buildId)!.deployments!;
    expect(authority.pendingOperation).toBeNull();
    expect(authority.deployments).toMatchObject([{ operationState: "failed", providerState: "ERROR",
      failureCode: "PROVIDER_BUILD_FAILED" }]);
    expect(authority.releases).toEqual([]);
    expect(authority.currentProductionReleaseId).toBeNull();
  });

  it("terminalizes only the exact aged uncertain Preview after two exhausted zero-match searches", async () => {
    const s = await setup();
    const prepared = await s.prepare();
    const operationId = prepared.operationId!;
    const deploymentId = prepared.deploymentId!;
    expect(await s.transition(operationId, deploymentId, 2, "submitting")).toMatchObject({ ok: true, revision: 3 });
    expect(await s.transition(operationId, deploymentId, 3, "uncertain")).toMatchObject({ ok: true, revision: 4 });
    const record = readBuildRecord(root, s.target.buildId)!;
    const sourceSha = record.authoritativeSha;
    const environmentBefore = structuredClone(record.environments);
    const mappingBefore = structuredClone(record.deployments!.mappings);
    const uncertainAt = new Date(Date.now() - 600_000);
    record.deployments!.pendingOperation!.updatedAt = uncertainAt.toISOString();
    writeBuildRecord(root, record);
    const evidence = {
      buildId: s.target.buildId, operationId, deploymentId,
      mappingId: mappingBefore[0]!.mappingId, teamRef: null, projectRef: "product",
      target: "preview", pathOperationId: operationId,
      windowStart: new Date(uncertainAt.getTime() - 60_000).toISOString(),
      windowEnd: new Date(uncertainAt.getTime() + 60_000).toISOString(),
      metadataFilteredLookup: { completed: true, exhausted: true, nextCursor: null, exactMatchCount: 0 },
      projectWindowLookup: { completed: true, exhausted: true, nextCursor: null, exactOperationMatchCount: 0 },
      completedAt: new Date().toISOString(),
    };
    const failure = { failureCode: "PROVIDER_SUBMISSION_NOT_OBSERVED", reconciliationEvidence: evidence };
    expect(await s.transition(operationId, deploymentId, 3, "failed", failure))
      .toMatchObject({ ok: false, code: "DEPLOY_REVISION_STALE" });
    expect(await s.transition(operationId, deploymentId, 4, "failed", {
      ...failure, reconciliationEvidence: { ...evidence, projectWindowLookup: {
        ...evidence.projectWindowLookup, exactOperationMatchCount: 1 } },
    })).toMatchObject({ ok: false, code: "DEPLOY_TRANSITION_INVALID" });
    expect(await s.transition(operationId, deploymentId, 4, "failed", failure))
      .toMatchObject({ ok: true, revision: 5 });
    const final = readBuildRecord(root, s.target.buildId)!;
    expect(final.deployments!.pendingOperation).toBeNull();
    expect(final.deployments!.deployments).toHaveLength(1);
    expect(final.deployments!.deployments[0]).toMatchObject({ operationId, deploymentId,
      operationState: "failed", failureCode: "PROVIDER_SUBMISSION_NOT_OBSERVED",
      providerDeploymentId: null, providerUrl: null, providerState: null });
    expect(final.deployments!.mappings).toEqual(mappingBefore);
    expect(final.authoritativeSha).toBe(sourceSha);
    expect(final.environments).toEqual(environmentBefore);
    expect(final.deployments!.releases).toEqual([]);
    expect(final.deployments!.currentProductionReleaseId).toBeNull();
    expect(await s.transition(operationId, deploymentId, 5, "submitting"))
      .toMatchObject({ ok: false, code: "DEPLOY_OPERATION_NOT_FOUND" });
    expect(readFileSync(s.otherPath)).toEqual(s.unrelatedBefore);
  });

  it("keeps production preparation outside the scoped Preview transaction", async () => {
    const s = await setup();
    expect(await client!.mutateDeploymentMapping(s.target.buildId, { action: "set", expectedRevision: 1,
      environmentId: s.environmentId, teamRef: null, projectRef: "product", targetRef: "production" }))
      .toMatchObject({ ok: true, revision: 2 });
    expect(await s.prepare(2)).toMatchObject({ ok: false, code: "DEPLOY_TARGET_FORBIDDEN" });
    expect(readBuildRecord(root, s.target.buildId)!.deployments).toMatchObject({
      revision: 2, pendingOperation: null, deployments: [], releases: [], currentProductionReleaseId: null });
    expect(readFileSync(s.otherPath)).toEqual(s.unrelatedBefore);
  });
});
