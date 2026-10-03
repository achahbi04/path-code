import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createBuildRecordSkeleton, createBuildCoordinatorService, readBuildRecord,
  writeBuildRecord, listBuildDeployments, prepareDeploymentSource, cleanupDeploymentSource,
  isUnsafeDeploymentPath, canonicalConfigDigest, transitionDeploymentOperation,
  recoverDeploymentFoundation, reconcileServing, productionActionEligibility,
  parseVercelConfigMetadata, planVercelConfigProjection, makeVercelConfigCommand,
  parseVercelDeploymentReceipt, parseVercelServingObservation } from "../../scripts/pathcode-cli/build/index.mjs";
import { validateDeploymentLocator, prepareFixtureReleaseOperation, finalizeFixtureRelease } from "../../scripts/pathcode-cli/build/index.mjs";
import { resolvePathPackageRoot } from "../../scripts/pathcode-cli/paths.mjs";

describe("P10.1 deployment foundation without live provider work", () => {
  let root = "";
  let service: Awaited<ReturnType<typeof createBuildCoordinatorService>> | null = null;
  afterEach(async () => { await service?.close(); service = null; if (root) rmSync(root, { recursive: true, force: true }); root = ""; });
  function git(cwd: string, ...args: string[]) {
    const r = spawnSync("git", args, { cwd, encoding: "utf8" });
    expect(r.status, r.stderr).toBe(0);
    return r.stdout.trim();
  }
  async function setup() {
    root = mkdtempSync(join(tmpdir(), "path-p10-foundation-"));
    const project = join(root, "creator-product");
    const runtimeRoot = join(root, "runtime");
    mkdirSync(project); mkdirSync(runtimeRoot);
    git(project, "init", "-q");
    git(project, "config", "user.email", "path-test@example.test");
    git(project, "config", "user.name", "PATH Test");
    writeFileSync(join(project, "index.html"), "<h1>adopted</h1>");
    writeFileSync(join(project, ".env.example"), "EXAMPLE=not-a-secret\n");
    git(project, "add", "."); git(project, "commit", "-qm", "adopted");
    const sha = git(project, "rev-parse", "HEAD");
    const record = createBuildRecordSkeleton({ outcome: "Deploy test" });
    record.projectBindings.push({ bindingId: "product", projectRoot: project });
    record.authoritativeSha = sha;
    record.loop.status = "paused";
    writeBuildRecord(runtimeRoot, record);
    service = await createBuildCoordinatorService({ runtimeRoot, packageRoot: resolvePathPackageRoot(), fakeMode: true });
    await service.whenReady;
    const call = (method: string, params: Record<string, unknown>) => service!.dispatch(method, { buildId: record.buildId, ...params });
    const env = await call("build.environments.mutate", { action: "create_environment", expectedEnvironmentRevision: 0, input: { name: "Any label" } });
    const environmentId = env.environmentId;
    return { root, project, runtimeRoot, buildId: record.buildId, sha, environmentId, call };
  }

  it("uses only current adopted tree; dirty checkout cannot enter prepared source", async () => {
    const s = await setup();
    expect(listBuildDeployments(s.runtimeRoot, s.buildId)).toMatchObject({ ok: true, revision: 0, deployments: [] });
    writeFileSync(join(s.project, "index.html"), "<h1>dirty</h1>");
    writeFileSync(join(s.project, "untracked.txt"), "dirty");
    const source = prepareDeploymentSource({ runtimeRoot: s.runtimeRoot, buildId: s.buildId });
    expect(source).toMatchObject({ ok: true, authoritativeSha: s.sha, framework: "static" });
    expect(readFileSync(join(source.workspace, "index.html"), "utf8")).toContain("adopted");
    expect(readFileSync(join(s.project, "index.html"), "utf8")).toContain("dirty");
    expect(cleanupDeploymentSource({ runtimeRoot: s.runtimeRoot, workspace: source.workspace })).toMatchObject({ ok: true });
    const record = readBuildRecord(s.runtimeRoot, s.buildId)!;
    record.pendingRestore = { operationId: "test", expectedAuthoritativeSha: s.sha, targetAdoptionIndex: 0,
      targetSha: s.sha, targetTreeSha: git(s.project, "rev-parse", `${s.sha}^{tree}`), candidateSha: null,
      createdAt: new Date().toISOString() };
    writeBuildRecord(s.runtimeRoot, record);
    expect(prepareDeploymentSource({ runtimeRoot: s.runtimeRoot, buildId: s.buildId })).toMatchObject({ ok: false, code: "RESTORE_PENDING" });
  });

  it("rejects committed sensitive paths and preserves safe example", async () => {
    const s = await setup();
    for (const path of [".env", ".env.local", "nested/.env.production", "keys/private.pem", ".ssh/id_rsa", ".vercel/project.json", "credentials.json"]) {
      expect(isUnsafeDeploymentPath(path)).toBe(true);
    }
    expect(isUnsafeDeploymentPath(".env.example")).toBe(false);
    writeFileSync(join(s.project, ".env"), "SENTINEL=no-output");
    git(s.project, "add", ".env"); git(s.project, "commit", "-qm", "unsafe");
    const record = readBuildRecord(s.runtimeRoot, s.buildId)!;
    record.authoritativeSha = git(s.project, "rev-parse", "HEAD");
    writeBuildRecord(s.runtimeRoot, record);
    expect(prepareDeploymentSource({ runtimeRoot: s.runtimeRoot, buildId: s.buildId })).toMatchObject({ ok: false, code: "DEPLOY_SOURCE_PATH_UNSAFE" });
  });

  it("rejects a committed symlink before materialization", async () => {
    const s = await setup();
    symlinkSync("/outside-product", join(s.project, "escape"));
    git(s.project, "add", "escape"); git(s.project, "commit", "-qm", "symlink");
    const record = readBuildRecord(s.runtimeRoot, s.buildId)!;
    record.authoritativeSha = git(s.project, "rev-parse", "HEAD");
    writeBuildRecord(s.runtimeRoot, record);
    expect(prepareDeploymentSource({ runtimeRoot: s.runtimeRoot, buildId: s.buildId }))
      .toMatchObject({ ok: false, code: "DEPLOY_SOURCE_LINK_UNSAFE" });
  });

  it("serializes mappings, checks P9 locators, and snapshots only safe config identity", async () => {
    const s = await setup();
    const mapping = await s.call("build.deployments.mappingMutate", { action: "set", expectedRevision: 0,
      environmentId: s.environmentId, teamRef: null, projectRef: "project-a", targetRef: "preview" });
    expect(mapping).toMatchObject({ ok: true, revision: 1 });
    expect(mapping.mappingId).toMatch(/^[0-9a-f-]{36}$/);
    expect(await s.call("build.deployments.mappingMutate", { action: "set", expectedRevision: 0,
      environmentId: s.environmentId, projectRef: "project-b", targetRef: "preview" })).toMatchObject({ ok: false, code: "DEPLOY_REVISION_STALE" });
    expect(await s.call("build.environments.mutate", { action: "set_config", expectedEnvironmentRevision: 1,
      input: { environmentId: s.environmentId, variableName: "FEATURE_FLAG", value: "P10_CONFIG_VALUE_SENTINEL_DO_NOT_EXPOSE" } })).toMatchObject({ ok: true, revision: 2 });
    expect(await s.call("build.environments.mutate", { action: "bind_secret", expectedEnvironmentRevision: 2,
      input: { environmentId: s.environmentId, variableName: "STRIPE_SECRET_KEY", backend: "vercel_env" } })).toMatchObject({ ok: true, revision: 3 });
    const preflight = await s.call("build.deployments.preflight", { environmentId: s.environmentId });
    expect(preflight).toMatchObject({ ok: true,
      unknownSecretPresence: true, creatorAcknowledgementRequired: true, targetRef: "preview" });
    expect(await s.call("build.deployments.prepare", { environmentId: s.environmentId, expectedRevision: 1,
      expectedEnvironmentRevision: 3 })).toMatchObject({ ok: false, code: "SECRET_PRESENCE_ACK_REQUIRED" });
    const prepared = await s.call("build.deployments.prepare", { environmentId: s.environmentId, expectedRevision: 1,
      expectedEnvironmentRevision: 3, acknowledgeUnknownPresence: true });
    expect(prepared).toMatchObject({ ok: true, revision: 2 });
    const persisted = readFileSync(join(s.runtimeRoot, "metadata", "builds", `${s.buildId}.build.json`), "utf8");
    const p10 = JSON.stringify(listBuildDeployments(s.runtimeRoot, s.buildId));
    expect(p10).not.toContain("P10_CONFIG_VALUE_SENTINEL_DO_NOT_EXPOSE");
    expect(p10).not.toContain("secretRef");
    const malformed = readBuildRecord(s.runtimeRoot, s.buildId)!;
    (malformed.deployments!.deployments[0] as Record<string, unknown>).token = "P10_UNEXPECTED_FIELD_SENTINEL";
    writeBuildRecord(s.runtimeRoot, malformed);
    expect(JSON.stringify(listBuildDeployments(s.runtimeRoot, s.buildId))).not.toContain("P10_UNEXPECTED_FIELD_SENTINEL");
    expect(persisted).toContain("P10_CONFIG_VALUE_SENTINEL_DO_NOT_EXPOSE"); // P9 remains config authority.
    expect(listBuildDeployments(s.runtimeRoot, s.buildId).pendingOperation).toMatchObject({ state: "prepared" });
  });

  it("config commands and metadata remain value-free and fail closed", () => {
    const sentinel = "P10_CONFIG_VALUE_SENTINEL_DO_NOT_EXPOSE";
    const command = makeVercelConfigCommand({ operation: "add", variableName: "PUBLIC_URL", target: "preview", value: sentinel });
    expect(command).toMatchObject({ executable: "vercel", shell: false, stdinPayload: sentinel,
      argv: ["env", "add", "PUBLIC_URL", "preview", "--visibility", "config", "--yes"] });
    expect(JSON.stringify(command.argv) + command.display).not.toContain(sentinel);
    expect(makeVercelConfigCommand({ operation: "add", variableName: "--value", target: "preview", value: sentinel })).toMatchObject({ ok: false });
    const unsafe = parseVercelConfigMetadata({ variables: [{ name: "PUBLIC_URL", visibility: "config", target: "preview", origin: "user", value: "P10_PROVIDER_VALUE_SENTINEL" }] });
    expect(unsafe).toEqual({ ok: false, code: "PROVIDER_METADATA_UNSAFE" });
    expect(JSON.stringify(unsafe)).not.toContain("P10_PROVIDER_VALUE_SENTINEL");
    const metadata = parseVercelConfigMetadata({ variables: [{ name: "PUBLIC_URL", visibility: "config", target: "preview", origin: "user" }] });
    expect(planVercelConfigProjection({ config: [{ kind: "config", variableName: "PUBLIC_URL", value: sentinel }], metadata, target: "preview" }))
      .toMatchObject({ ok: true, actions: [{ operation: "update", variableName: "PUBLIC_URL" }] });
    expect(planVercelConfigProjection({ config: [], metadata, target: "preview" })).toMatchObject({ ok: false, code: "PROVIDER_CONFIG_EXTRA" });
    expect(planVercelConfigProjection({ config: [{ kind: "secret", variableName: "PUBLIC_URL", value: sentinel }], metadata, target: "preview" })).toMatchObject({ ok: false });
    expect(canonicalConfigDigest([{ kind: "config", variableName: "B", value: "2" }, { kind: "config", variableName: "A", value: "1" }]))
      .toBe(canonicalConfigDigest([{ kind: "config", variableName: "A", value: "1" }, { kind: "config", variableName: "B", value: "2" }]));
    expect(parseVercelDeploymentReceipt({ id: "dpl_12345678", url: "https://example.vercel.app", status: "READY", projectRef: "project-a", target: "preview", createdAt: "2026-01-01T00:00:00Z", value: "P10_PROVIDER_VALUE_SENTINEL" }))
      .toMatchObject({ ok: false, code: "PROVIDER_RECEIPT_UNSAFE" });
  });

  it("requires exact P9 Vercel locators and blocks local-only bindings", () => {
    const mapping = { teamRef: null, projectRef: "project-a", targetRef: "preview" };
    const secret = { kind: "secret", backend: "vercel_env", presenceState: "unknown", descriptor: {
      teamRef: null, projectRef: null, targetRef: null, bindingRef: null } };
    expect(validateDeploymentLocator(mapping, [secret])).toMatchObject({ ok: true, unknownSecretPresence: true });
    expect(validateDeploymentLocator(mapping, [{ ...secret, descriptor: { ...secret.descriptor, projectRef: "project-a", targetRef: "preview" } }])).toMatchObject({ ok: true });
    expect(validateDeploymentLocator(mapping, [{ ...secret, descriptor: { ...secret.descriptor, projectRef: "project-b" } }])).toMatchObject({ ok: false, code: "DEPLOY_PROVIDER_LOCATOR_MISMATCH" });
    expect(validateDeploymentLocator(mapping, [{ kind: "secret", backend: "local_env_file" }])).toMatchObject({ ok: false, code: "LOCAL_ONLY_SECRET_FOR_REMOTE_DEPLOY" });
  });

  it("durably models config receipts and a verified release without provider execution", () => {
    const record = createBuildRecordSkeleton({ outcome: "Fixture" });
    const operationId = "11111111-1111-1111-1111-111111111111";
    const deploymentId = "deployment-a";
    const snapshot = { configNames: ["A", "B"], sourceSha: "source", treeSha: "tree", environmentId: "env",
      environmentRevision: 1, mappingId: "map", configDigest: "digest" };
    record.deployments = { schema: "pathcode.p10.deployments.v1", revision: 1,
      mappings: [{ mappingId: "map", provider: "vercel", environmentId: "env", teamRef: null,
        projectRef: "project-a", targetRef: "production", updatedAt: "2026-01-01T00:00:00Z" }],
      deployments: [{ deploymentId, operationId, target: "production", sourceSha: "source", environmentId: "env",
        mappingId: "map", providerDeploymentId: null, providerState: null, operationState: "prepared" }],
      releases: [], currentProductionReleaseId: null,
      serving: { state: "unknown", observedProviderDeploymentId: null, observedAt: null },
      pendingOperation: { operationId, kind: "deploy", deploymentId, state: "prepared", snapshot,
        configReceipts: [], providerDeploymentId: null, createdAt: "2026-01-01T00:00:00Z" } };
    expect(transitionDeploymentOperation(record, { operationId, state: "submitting" })).toMatchObject({ ok: false, code: "CONFIG_PROJECTION_INCOMPLETE" });
    const first = transitionDeploymentOperation(record, { operationId, state: "config_receipt", variableName: "A" });
    expect(first).toMatchObject({ ok: true, record: { deployments: { pendingOperation: { state: "config_projection_incomplete" } } } });
    expect(recoverDeploymentFoundation(first.record!)).toMatchObject({ state: "config_projection_incomplete", retry: false });
    const second = transitionDeploymentOperation(first.record!, { operationId, state: "config_receipt", variableName: "B" });
    const submitting = transitionDeploymentOperation(second.record!, { operationId, state: "submitting" });
    expect(submitting).toMatchObject({ ok: true });
    const uncertain = transitionDeploymentOperation(submitting.record!, { operationId, state: "uncertain" });
    expect(recoverDeploymentFoundation(uncertain.record!)).toMatchObject({ state: "provider_outcome_uncertain", retry: false });
    const submitted = transitionDeploymentOperation(uncertain.record!, { operationId, state: "submitted",
      providerDeploymentId: "dpl_12345678", providerUrl: "https://example.vercel.app" });
    const confirmed = transitionDeploymentOperation(submitted.record!, { operationId, state: "confirmed", providerState: "READY" });
    expect(confirmed).toMatchObject({ ok: true, record: { deployments: { pendingOperation: null } } });
    const releaseOp = prepareFixtureReleaseOperation(confirmed.record!, { action: "reestablish", deploymentId,
      expectedRevision: confirmed.record!.deployments!.revision, projectRef: "project-a" });
    expect(releaseOp).toMatchObject({ ok: true });
    const serving = parseVercelServingObservation({ projectRef: "project-a", target: "production",
      deploymentId: "dpl_12345678", url: null, observedAt: "2026-01-01T00:00:00Z" });
    const released = finalizeFixtureRelease(releaseOp.record, { operationId: releaseOp.operationId,
      deploymentId, action: "reestablish", safeObservation: serving });
    expect(released).toMatchObject({ ok: true, record: { deployments: { serving: { state: "verified" }, releases: [expect.any(Object)] } } });
  });

  it("preserves partial and uncertain operations without retry; serving drift never moves release pointer", () => {
    const record = createBuildRecordSkeleton({ outcome: "Fixture" });
    const op = "11111111-1111-1111-1111-111111111111";
    record.deployments = { schema: "pathcode.p10.deployments.v1", revision: 0, mappings: [], deployments: [{
      deploymentId: "dep", operationId: op, target: "production", sourceSha: "source", environmentId: "env",
      providerDeploymentId: "dpl_12345678", providerState: "READY", operationState: "confirmed",
    }], releases: [{ releaseId: "release-old", deploymentId: "dep", providerDeploymentId: "dpl_12345678", projectRef: "project-a" }],
    currentProductionReleaseId: "release-old", serving: { state: "unknown", observedProviderDeploymentId: null, observedAt: null },
    pendingOperation: null };
    const observation = parseVercelServingObservation({ projectRef: "project-a", target: "production", deploymentId: "dpl_87654321", url: null, observedAt: "2026-01-01T00:00:00Z" });
    const drift = reconcileServing(record, observation);
    expect(drift).toMatchObject({ ok: true, serving: { state: "drifted" }, record: { deployments: { currentProductionReleaseId: "release-old" } } });
    expect(drift.record.deployments!.releases).toHaveLength(1);
    expect(productionActionEligibility(drift.record, "rollback", "dep")).toMatchObject({ ok: false, code: "RELEASE_SERVING_UNVERIFIED" });
    expect(reconcileServing(record, null)).toMatchObject({ ok: true, serving: { state: "unknown" }, record: { deployments: { currentProductionReleaseId: "release-old" } } });
    record.deployments.pendingOperation = { operationId: op, kind: "deploy", deploymentId: "dep", state: "uncertain", providerDeploymentId: null };
    expect(recoverDeploymentFoundation(record)).toEqual({ ok: true, state: "provider_outcome_uncertain", retry: false });
    expect(transitionDeploymentOperation(record, { operationId: op, state: "confirmed", providerState: "READY" })).toMatchObject({ ok: false });
  });
});
