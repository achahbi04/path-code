import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createBuildRecordSkeleton, createBuildCoordinatorClient, readBuildRecord,
  resolveBuildRecordPath, startBuildCoordinatorServer, writeBuildRecord,
  recoverDeploymentFoundation, makeNoDeploymentObservedEvidence,
  combinePreviewReconciliation, PREVIEW_RECONCILIATION_CODES, PREVIEW_DEPLOY_EXECUTION_TIMEOUT_MS,
  PROVIDER_CREATION_TIME_SAFETY_ALLOWANCE_MS } from "../../scripts/pathcode-cli/build/index.mjs";
import { resolvePathPackageRoot } from "../../scripts/pathcode-cli/paths.mjs";

describe("P10 Preview transaction through the scoped coordinator", () => {
  let root = "";
  let server: Awaited<ReturnType<typeof startBuildCoordinatorServer>> | null = null;
  let client: ReturnType<typeof createBuildCoordinatorClient> | null = null;
  afterEach(async () => {
    vi.useRealTimers();
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
  function ageFixtureSubmissionBoundary(record: NonNullable<ReturnType<typeof readBuildRecord>>, at: Date) {
    const boundary = at.toISOString();
    const window = {
      windowStart: new Date(at.getTime() - PROVIDER_CREATION_TIME_SAFETY_ALLOWANCE_MS).toISOString(),
      windowEnd: new Date(at.getTime() + PREVIEW_DEPLOY_EXECUTION_TIMEOUT_MS +
        PROVIDER_CREATION_TIME_SAFETY_ALLOWANCE_MS).toISOString(),
    };
    record.deployments!.pendingOperation!.submissionBoundaryAt = boundary;
    record.deployments!.pendingOperation!.reconciliationWindow = window;
    record.deployments!.deployments.at(-1)!.submissionBoundaryAt = boundary;
    record.deployments!.deployments.at(-1)!.reconciliationWindow = structuredClone(window);
    return window;
  }

  it("keeps scoped existing-operation recovery outside provider deploy execution", () => {
    const service = readFileSync(new URL("../../scripts/pathcode-cli/build/coordinator/service.mjs", import.meta.url), "utf8");
    const deployments = readFileSync(new URL("../../scripts/pathcode-cli/build/deployments.mjs", import.meta.url), "utf8");
    const startup = service.split("async function reconcileStartup() {")[1]?.split("async function runtimeState(")[0];
    const transaction = service.split("case BuildCoordinatorMethods.BUILD_DEPLOYMENT_PREPARE:")[1]
      ?.split("case BuildCoordinatorMethods.BUILD_ENVIRONMENT_READ:")[0];
    const recovery = deployments.split("export function recoverDeploymentFoundation(record) {")[1]
      ?.split("export function validateOperationSnapshot(")[0];
    expect(service).toContain("scopedControlPlane ? Promise.resolve([]) : reconcileStartup()");
    expect(startup).toContain("recoverDeploymentFoundation(build)");
    expect(transaction).toContain("prepareDeploymentOperation(runtimeRoot, buildId, request)");
    expect(transaction).toContain("transitionDeploymentOperation(record, input)");
    expect(recovery).toContain('state: "provider_outcome_uncertain", retry: false');
    for (const section of [startup, transaction, recovery]) {
      expect(section).toBeDefined();
      expect(section).not.toMatch(/\b(?:makePreviewDeployCommand|executeVercelAdapterCommand|deploy_receipt|vercel deploy)\b|\bspawn\s*\(/);
    }
    expect(service).not.toMatch(/from ["'][^"']*vercel-preview-adapter\.mjs["']/);
  });
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

  it("projects only canonical window timestamps from pending authority", async () => {
    const s = await setup();
    const prepared = await s.prepare();
    expect(await s.transition(prepared.operationId!, prepared.deploymentId!, 2, "submitting"))
      .toMatchObject({ ok: true, revision: 3 });
    const record = readBuildRecord(root, s.target.buildId)!;
    const window = record.deployments!.pendingOperation!.reconciliationWindow as Record<string, unknown>;
    window.rawProviderPayload = "RAW_SECRET_SENTINEL";
    (record.deployments!.deployments[0]!.reconciliationWindow as Record<string, unknown>).rawProviderPayload = "RAW_SECRET_SENTINEL";
    writeBuildRecord(root, record);
    const projected = await client!.listDeployments(s.target.buildId) as any;
    expect(projected.pendingOperation.reconciliationWindow).toEqual({
      windowStart: window.windowStart, windowEnd: window.windowEnd });
    expect(projected.deployments[0].reconciliationWindow).toEqual({
      windowStart: window.windowStart, windowEnd: window.windowEnd });
    expect(JSON.stringify(projected)).not.toContain("RAW_SECRET_SENTINEL");
    expect(readFileSync(s.otherPath)).toEqual(s.unrelatedBefore);
  });

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
    const frozen = readBuildRecord(root, s.target.buildId)!.deployments!.pendingOperation!;
    const projected = await client!.listDeployments(s.target.buildId) as any;
    expect(projected.pendingOperation).toMatchObject({ operationId, deploymentId,
      submissionBoundaryAt: frozen.submissionBoundaryAt,
      reconciliationWindow: frozen.reconciliationWindow });
    expect(projected.deployments[0]).toMatchObject({ submissionBoundaryAt: frozen.submissionBoundaryAt,
      reconciliationWindow: frozen.reconciliationWindow });
    expect(JSON.stringify(projected)).not.toContain("ordinary-value");
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
    const frozenWindow = ageFixtureSubmissionBoundary(record, new Date(uncertainAt.getTime() - 600_000));
    writeBuildRecord(root, record);
    const evidence = {
      buildId: s.target.buildId, operationId, deploymentId,
      mappingId: mappingBefore[0]!.mappingId, teamRef: null, projectRef: "product",
      target: "preview", pathOperationId: operationId,
      windowStart: frozenWindow.windowStart,
      windowEnd: frozenWindow.windowEnd,
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

  it("recovers a persisted submitting boundary after restart without a provider invocation or retry", async () => {
    const s = await setup();
    const prepared = await s.prepare();
    const operationId = prepared.operationId!;
    const deploymentId = prepared.deploymentId!;
    vi.useFakeTimers({ toFake: ["Date"] });
    expect(await s.transition(operationId, deploymentId, 2, "submitting"))
      .toMatchObject({ ok: true, revision: 3 });
    const onDisk = readBuildRecord(root, s.target.buildId)!;
    expect(onDisk.deployments!.pendingOperation).toMatchObject({ operationId, deploymentId,
      state: "submitting", providerDeploymentId: null });
    const frozenWindow = structuredClone(onDisk.deployments!.pendingOperation!.reconciliationWindow!) as
      { windowStart: string; windowEnd: string };
    const submissionBoundaryAt = onDisk.deployments!.pendingOperation!.submissionBoundaryAt;
    // No adapter/deploy stub is invoked; the durable boundary is the last act.
    client!.close(); client = null;
    await server!.stop(); server = null;
    server = await startBuildCoordinatorServer({ runtimeRoot: root,
      packageRoot: resolvePathPackageRoot(), scopedBuildId: s.target.buildId });
    client = createBuildCoordinatorClient({ runtimeRoot: root, socketPath: server.socketPath });
    await client.connect();
    const restarted = readBuildRecord(root, s.target.buildId)!;
    expect(restarted.deployments!.revision).toBe(3);
    expect(restarted.deployments!.pendingOperation).toMatchObject({ operationId, deploymentId, state: "submitting",
      submissionBoundaryAt, reconciliationWindow: frozenWindow });
    expect(recoverDeploymentFoundation(restarted)).toEqual({ ok: true,
      state: "provider_outcome_uncertain", retry: false });
    expect(await s.prepare(3)).toMatchObject({ ok: false, code: "DEPLOY_OPERATION_PENDING" });
    vi.setSystemTime(new Date(Date.parse(submissionBoundaryAt as string) + 4 * 60 * 60 * 1000));
    expect(await s.transition(operationId, deploymentId, 3, "uncertain"))
      .toMatchObject({ ok: true, revision: 4 });
    expect(await s.transition(operationId, deploymentId, 4, "submitting"))
      .toMatchObject({ ok: false });
    const uncertain = readBuildRecord(root, s.target.buildId)!;
    expect(uncertain.deployments!.pendingOperation).toMatchObject({ submissionBoundaryAt,
      reconciliationWindow: frozenWindow });
    const uncertainAt = uncertain.deployments!.pendingOperation!.updatedAt as string;
    expect(Date.parse(uncertainAt)).toBeGreaterThan(Date.parse(frozenWindow.windowEnd));
    expect(recoverDeploymentFoundation(uncertain)).toEqual({ ok: true,
      state: "provider_outcome_uncertain", retry: false });
    expect(await s.prepare(4)).toMatchObject({ ok: false, code: "DEPLOY_OPERATION_PENDING" });
    const incompleteSource = (mode: string) => ({ ok: true, mode, ...frozenWindow,
      completed: true, exhausted: false, nextCursor: 123, matches: [], exactMatchCount: 0 });
    expect(combinePreviewReconciliation(incompleteSource("METADATA_FILTERED_OPERATION"),
      incompleteSource("PROJECT_WINDOW"))).toEqual({ ok: false,
        code: PREVIEW_RECONCILIATION_CODES.INCOMPLETE });
    expect(uncertain.deployments!.pendingOperation).toMatchObject({ operationId, deploymentId,
      state: "uncertain", submissionBoundaryAt, reconciliationWindow: frozenWindow });
    client!.close(); client = null;
    await server!.stop(); server = null;
    server = await startBuildCoordinatorServer({ runtimeRoot: root,
      packageRoot: resolvePathPackageRoot(), scopedBuildId: s.target.buildId });
    client = createBuildCoordinatorClient({ runtimeRoot: root, socketPath: server.socketPath });
    await client.connect();
    const secondRestart = readBuildRecord(root, s.target.buildId)!;
    expect(secondRestart.deployments!.pendingOperation).toMatchObject({ operationId, deploymentId,
      submissionBoundaryAt, reconciliationWindow: frozenWindow });
    expect(recoverDeploymentFoundation(secondRestart)).toEqual({ ok: true,
      state: "provider_outcome_uncertain", retry: false });
    expect(secondRestart.deployments!.pendingOperation!.updatedAt).toBe(uncertainAt);
    expect(secondRestart.deployments!.deployments).toHaveLength(1);
    expect(secondRestart.deployments!.deployments[0]).toMatchObject({ operationId, deploymentId });
    expect(await s.prepare(4)).toMatchObject({ ok: false, code: "DEPLOY_OPERATION_PENDING" });
    const { windowStart, windowEnd } = frozenWindow;
    const source = (mode: string) => ({ ok: true, mode, windowStart, windowEnd,
      completed: true, exhausted: true, nextCursor: null, matches: [],
      exactMatchCount: 0, totalDeploymentsObserved: 0 });
    const filtered = source("METADATA_FILTERED_OPERATION");
    const projectWindow = source("PROJECT_WINDOW");
    expect(combinePreviewReconciliation(filtered, projectWindow)).toMatchObject({
      ok: true, outcome: "VALID_ZERO_ZERO_EVIDENCE_CANDIDATE", retry: false });
    expect(await s.prepare(4)).toMatchObject({ ok: false, code: "DEPLOY_OPERATION_PENDING" });
    const mapping = uncertain.deployments!.mappings[0]!;
    const evidenceAtCurrentTime = () => makeNoDeploymentObservedEvidence({ buildId: s.target.buildId, operationId,
      deploymentId, mappingId: mapping.mappingId, teamRef: null,
      projectRef: "product", target: "preview" }, filtered, projectWindow,
    new Date().toISOString()) as any;
    const premature = evidenceAtCurrentTime();
    expect(premature.ok).toBe(true);
    expect(await s.transition(operationId, deploymentId, 4, "failed", {
      failureCode: "PROVIDER_SUBMISSION_NOT_OBSERVED", reconciliationEvidence: premature.evidence,
    })).toMatchObject({ ok: false, code: "DEPLOY_TRANSITION_INVALID" });
    expect(readBuildRecord(root, s.target.buildId)!.deployments!.pendingOperation!.updatedAt).toBe(uncertainAt);
    vi.setSystemTime(new Date(Date.parse(uncertainAt) + 120_000));
    const mapped = evidenceAtCurrentTime();
    expect(mapped.ok).toBe(true);
    expect(await s.transition(operationId, deploymentId, 4, "failed", {
      failureCode: "PROVIDER_SUBMISSION_NOT_OBSERVED", reconciliationEvidence: mapped.evidence,
    })).toMatchObject({ ok: true, revision: 5 });
    const final = readBuildRecord(root, s.target.buildId)!.deployments!;
    expect(final.pendingOperation).toBeNull();
    expect(final.deployments).toHaveLength(1);
    expect(final.deployments[0]).toMatchObject({ operationId, deploymentId, operationState: "failed",
      failureCode: "PROVIDER_SUBMISSION_NOT_OBSERVED", providerDeploymentId: null, providerUrl: null });
    expect(final.releases).toEqual([]);
    expect(final.currentProductionReleaseId).toBeNull();
    expect(readFileSync(s.otherPath)).toEqual(s.unrelatedBefore);
  });

  it("retains a known provider identity through unknown status and a polling stop", async () => {
    const s = await setup();
    const prepared = await s.prepare();
    const operationId = prepared.operationId!;
    const deploymentId = prepared.deploymentId!;
    expect(await s.transition(operationId, deploymentId, 2, "submitting"))
      .toMatchObject({ ok: true, revision: 3 });
    expect(await s.transition(operationId, deploymentId, 3, "submitted", {
      providerDeploymentId: "dpl_12345678", providerUrl: "https://example.vercel.app",
    })).toMatchObject({ ok: true, revision: 4 });
    const before = readBuildRecord(root, s.target.buildId)!;
    expect(recoverDeploymentFoundation(before)).toEqual({ ok: true,
      state: "provider_verification_required", retry: false });
    expect(before.deployments!.pendingOperation).toMatchObject({ operationId, deploymentId,
      state: "submitted", providerDeploymentId: "dpl_12345678" });
    expect(await s.prepare(4)).toMatchObject({ ok: false, code: "DEPLOY_OPERATION_PENDING" });
    client!.close(); client = null;
    await server!.stop(); server = null;
    server = await startBuildCoordinatorServer({ runtimeRoot: root,
      packageRoot: resolvePathPackageRoot(), scopedBuildId: s.target.buildId });
    const after = readBuildRecord(root, s.target.buildId)!;
    expect(after.deployments!.pendingOperation).toMatchObject({ operationId, deploymentId,
      state: "submitted", providerDeploymentId: "dpl_12345678" });
    expect(after.deployments!.deployments[0]).toMatchObject({ providerDeploymentId: "dpl_12345678",
      operationState: "submitted", providerState: null });
    expect(recoverDeploymentFoundation(after)).toEqual({ ok: true,
      state: "provider_verification_required", retry: false });
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
