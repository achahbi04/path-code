import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBuildCoordinatorService, createBuildRecordSkeleton, listBuildDatabases, readBuildEvents, writeBuildRecord } from "../../scripts/pathcode-cli/build/index.mjs";
import { resolvePathPackageRoot } from "../../scripts/pathcode-cli/paths.mjs";

describe("P13.3 provisioning intent", () => {
  let root = ""; let service: Awaited<ReturnType<typeof createBuildCoordinatorService>> | null = null;
  afterEach(async () => { await service?.close(); service = null; if (root) rmSync(root, { recursive: true, force: true }); root = ""; });
  async function localProvisionFixture(adapters: any = {}) {
    root = mkdtempSync(join(tmpdir(), "path-p13-provision-race-"));
    const project = join(root, "project"); (await import("node:fs")).mkdirSync(project);
    execFileSync("git", ["init", "-q", project]); writeFileSync(join(project, ".gitignore"), ".env.local\n");
    writeFileSync(join(project, ".env.local"), "MANAGEMENT_TOKEN=synthetic-management\nPROVISION_PASSWORD=synthetic-password\n");
    const record = createBuildRecordSkeleton({ outcome: "synthetic" }); record.projectBindings.push({ bindingId: "test", projectRoot: project });
    record.loop.status = "paused"; writeBuildRecord(root, record);
    service = await createBuildCoordinatorService({ runtimeRoot: root, packageRoot: resolvePathPackageRoot(), fakeMode: true,
      databaseOperationAdapters: { supabase: { listProjects: async () => ({ ok: true, matches: [], truncated: false }),
        health: async () => ({ ok: true, projectStatus: "ACTIVE_HEALTHY" }), ...adapters } } }); await service.whenReady;
    const env = await service.dispatch("build.environments.mutate", { buildId: record.buildId, action: "create_environment",
      expectedEnvironmentRevision: 0, input: { name: "synthetic" } });
    let envRevision = env.revision; const refs: Record<string, string> = {};
    for (const variableName of ["MANAGEMENT_TOKEN", "PROVISION_PASSWORD"]) {
      const bound = await service.dispatch("build.environments.mutate", { buildId: record.buildId, action: "bind_secret",
        expectedEnvironmentRevision: envRevision++, input: { environmentId: env.environmentId, variableName, backend: "local_env_file" } });
      refs[variableName] = bound.secretRef;
    }
    for (const variableName of ["MANAGEMENT_TOKEN", "PROVISION_PASSWORD"]) {
      await service.dispatch("build.environments.verifyLocal", { buildId: record.buildId, environmentId: env.environmentId,
        variableName, expectedEnvironmentRevision: envRevision++ });
    }
    const made = await service.dispatch("build.databases.mutate", { buildId: record.buildId, action: "create_database",
      expectedDatabaseRevision: 0, input: { provider: "supabase", label: "Race DB", environmentId: env.environmentId, source: "path_provisioned" } });
    const bound = await service.dispatch("build.databases.mutate", { buildId: record.buildId, action: "bind_management_credential",
      expectedDatabaseRevision: made.revision, input: { databaseId: made.databaseId, secretRef: refs.MANAGEMENT_TOKEN } });
    const prepared = await service.dispatch("build.databases.provisionPrepare", { buildId: record.buildId, databaseId: made.databaseId,
      expectedDatabaseRevision: bound.revision, expectedEnvironmentRevision: envRevision, organizationSlug: "org-1", region: "eu-north-1",
      provisionPasswordSecretRef: refs.PROVISION_PASSWORD, acknowledgeProviderBilling: true });
    return { project, record, env, envRevision, refs, databaseId: made.databaseId, prepared };
  }
  it("durably prepares billing-acknowledged PATH intent without reading credentials or calling provider", async () => {
    root = mkdtempSync(join(tmpdir(), "path-p13-provision-"));
    const record = createBuildRecordSkeleton({ outcome: "synthetic" }); record.projectBindings.push({ bindingId: "test", projectRoot: root });
    record.loop.status = "paused"; writeBuildRecord(root, record);
    let providerCalls = 0;
    service = await createBuildCoordinatorService({ runtimeRoot: root, packageRoot: resolvePathPackageRoot(), fakeMode: true,
      databaseOperationAdapters: { supabase: { availableRegions: async () => { providerCalls++; return { ok: true, regions: [] }; },
        createProject: async () => { providerCalls++; return { ok: true }; } } } }); await service.whenReady;
    const env = await service.dispatch("build.environments.mutate", { buildId: record.buildId, action: "create_environment",
      expectedEnvironmentRevision: 0, input: { name: "synthetic" } });
    let envRevision = env.revision;
    const management = await service.dispatch("build.environments.mutate", { buildId: record.buildId, action: "bind_secret",
      expectedEnvironmentRevision: envRevision++, input: { environmentId: env.environmentId, variableName: "MANAGEMENT_TOKEN", backend: "vercel_env" } });
    const password = await service.dispatch("build.environments.mutate", { buildId: record.buildId, action: "bind_secret",
      expectedEnvironmentRevision: envRevision++, input: { environmentId: env.environmentId, variableName: "PROVISION_PASSWORD", backend: "vercel_env" } });
    const created = await service.dispatch("build.databases.mutate", { buildId: record.buildId, action: "create_database",
      expectedDatabaseRevision: 0, input: { provider: "supabase", label: "Inventory DB", environmentId: env.environmentId, source: "path_provisioned" } });
    const bound = await service.dispatch("build.databases.mutate", { buildId: record.buildId, action: "bind_management_credential",
      expectedDatabaseRevision: created.revision, input: { databaseId: created.databaseId, secretRef: management.secretRef } });
    const refused = await service.dispatch("build.databases.provisionPrepare", { buildId: record.buildId, databaseId: created.databaseId,
      expectedDatabaseRevision: bound.revision, expectedEnvironmentRevision: envRevision, organizationSlug: "org-1", region: "eu-north-1",
      provisionPasswordSecretRef: password.secretRef, acknowledgeProviderBilling: false });
    expect(refused).toMatchObject({ ok: false });
    expect((await service.dispatch("build.databases.list", { buildId: record.buildId })).revision).toBe(bound.revision);
    expect((await service.dispatch("build.databases.list", { buildId: record.buildId })).pendingOperation).toBeNull();
    const prepared = await service.dispatch("build.databases.provisionPrepare", { buildId: record.buildId, databaseId: created.databaseId,
      expectedDatabaseRevision: bound.revision, expectedEnvironmentRevision: envRevision, organizationSlug: "org-1", region: "eu-north-1",
      provisionPasswordSecretRef: password.secretRef, acknowledgeProviderBilling: true });
    expect(prepared).toMatchObject({ ok: true, state: "prepared", revision: bound.revision + 1 });
    const listed = await service.dispatch("build.databases.list", { buildId: record.buildId });
    expect(listed.pendingOperation).toMatchObject({ state: "prepared", expectedDatabaseRevision: prepared.revision,
      managementSecretRef: management.secretRef, provisionPasswordSecretRef: password.secretRef });
    expect(listed.pendingOperation.providerProjectName).toContain("inventory-db-");
    expect(providerCalls).toBe(0);
  });

  it("discovers regions through the full operation-adapter registry without mutating P13", async () => {
    root = mkdtempSync(join(tmpdir(), "path-p13-regions-registry-"));
    const project = join(root, "project"); (await import("node:fs")).mkdirSync(project);
    execFileSync("git", ["init", "-q", project]); writeFileSync(join(project, ".gitignore"), ".env.local\n");
    writeFileSync(join(project, ".env.local"), "MANAGEMENT_TOKEN=synthetic-management\nPROVISION_PASSWORD=synthetic-password\nUNRELATED_SECRET=synthetic-unrelated\n");
    const record = createBuildRecordSkeleton({ outcome: "synthetic" }); record.projectBindings.push({ bindingId: "test", projectRoot: project });
    record.loop.status = "paused"; writeBuildRecord(root, record);
    const regions = [{ code: "eu-north-1", name: "North Europe", provider: "aws", status: "AVAILABLE" }];
    let availableRegionsCalls = 0; let otherProviderCalls = 0;
    service = await createBuildCoordinatorService({ runtimeRoot: root, packageRoot: resolvePathPackageRoot(), fakeMode: true,
      databaseOperationAdapters: { supabase: {
        availableRegions: async (input: any) => {
          availableRegionsCalls++;
          expect(Object.keys(input).sort()).toEqual(["credential", "organizationSlug"]);
          expect(input.credential).toBe("synthetic-management");
          expect(input.credential).not.toBe("synthetic-password");
          expect(input.organizationSlug).toBe("org-synthetic");
          return { ok: true, regions };
        },
        createProject: async () => { otherProviderCalls++; return { ok: false }; },
        listProjects: async () => { otherProviderCalls++; return { ok: false }; },
        health: async () => { otherProviderCalls++; return { ok: false }; },
      } } }); await service.whenReady;
    const env = await service.dispatch("build.environments.mutate", { buildId: record.buildId, action: "create_environment",
      expectedEnvironmentRevision: 0, input: { name: "synthetic" } });
    let envRevision = env.revision; const secretRefs: Record<string, string> = {};
    for (const variableName of ["MANAGEMENT_TOKEN", "PROVISION_PASSWORD", "UNRELATED_SECRET"]) {
      const boundCredential = await service.dispatch("build.environments.mutate", { buildId: record.buildId, action: "bind_secret",
        expectedEnvironmentRevision: envRevision++, input: { environmentId: env.environmentId, variableName, backend: "local_env_file" } });
      secretRefs[variableName] = boundCredential.secretRef;
    }
    for (const variableName of Object.keys(secretRefs)) {
      const verified = await service.dispatch("build.environments.verifyLocal", { buildId: record.buildId,
        environmentId: env.environmentId, variableName, expectedEnvironmentRevision: envRevision++ });
      expect(verified.ok).toBe(true);
    }
    const made = await service.dispatch("build.databases.mutate", { buildId: record.buildId, action: "create_database",
      expectedDatabaseRevision: 0, input: { provider: "supabase", label: "Regions DB", environmentId: env.environmentId, source: "path_provisioned" } });
    const boundDatabase = await service.dispatch("build.databases.mutate", { buildId: record.buildId, action: "bind_management_credential",
      expectedDatabaseRevision: made.revision, input: { databaseId: made.databaseId, secretRef: secretRefs.MANAGEMENT_TOKEN } });
    expect(boundDatabase.ok).toBe(true);
    const before = listBuildDatabases(root, record.buildId);
    if (!before.ok) throw new Error("Synthetic database authority was unavailable");
    const discovered = await service.dispatch("build.databases.availableRegions", { buildId: record.buildId,
      databaseId: made.databaseId, organizationSlug: "org-synthetic", expectedDatabaseRevision: before.revision,
      expectedEnvironmentRevision: envRevision });
    const after = listBuildDatabases(root, record.buildId);
    if (!after.ok) throw new Error("Synthetic database authority was unavailable after region discovery");
    expect(discovered).toMatchObject({ ok: true, databaseId: made.databaseId, provider: "supabase", regions });
    expect(availableRegionsCalls).toBe(1); expect(otherProviderCalls).toBe(0);
    expect(after).toEqual(before);
  });

  it("rejects unbound names and unverified or unsafe local bindings during region discovery", async () => {
    let adapterCalls = 0;
    const fixture = await localProvisionFixture({ availableRegions: async () => { adapterCalls++; return { ok: true, regions: [] }; } });
    const dispatchRegions = (expectedEnvironmentRevision: number) => {
      const before = listBuildDatabases(root, fixture.record.buildId);
      if (!before.ok) throw new Error("Synthetic database authority was unavailable");
      return service!.dispatch("build.databases.availableRegions", { buildId: fixture.record.buildId,
        databaseId: fixture.databaseId, organizationSlug: "org-1", expectedDatabaseRevision: before.revision,
        expectedEnvironmentRevision });
    };

    writeFileSync(join(fixture.project, ".env.local"),
      "MANAGEMENT_TOKEN=synthetic-management\nPROVISION_PASSWORD=synthetic-password\nUNBOUND_EXTRA=synthetic-extra\n");
    expect(await dispatchRegions(fixture.envRevision)).toMatchObject({ ok: false, code: "DATABASE_CREDENTIAL_SOURCE_UNSAFE" });
    expect(adapterCalls).toBe(0);

    const unverified = await service!.dispatch("build.environments.mutate", { buildId: fixture.record.buildId, action: "bind_secret",
      expectedEnvironmentRevision: fixture.envRevision, input: { environmentId: fixture.env.environmentId,
        variableName: "UNVERIFIED_SECRET", backend: "local_env_file" } });
    writeFileSync(join(fixture.project, ".env.local"),
      "MANAGEMENT_TOKEN=synthetic-management\nPROVISION_PASSWORD=synthetic-password\nUNVERIFIED_SECRET=synthetic-unverified\n");
    expect(await dispatchRegions(unverified.revision)).toMatchObject({ ok: false, code: "DATABASE_CREDENTIAL_SOURCE_UNSAFE" });
    expect(adapterCalls).toBe(0);

    const unsafe = await service!.dispatch("build.environments.mutate", { buildId: fixture.record.buildId, action: "bind_secret",
      expectedEnvironmentRevision: unverified.revision, input: { environmentId: fixture.env.environmentId,
        variableName: "UNSAFE_SECRET", backend: "local_env_file" } });
    writeFileSync(join(fixture.project, ".env.local"),
      "MANAGEMENT_TOKEN=synthetic-management\nPROVISION_PASSWORD=synthetic-password\nUNVERIFIED_SECRET=synthetic-unverified\nUNSAFE_SECRET=synthetic-unsafe\n");
    writeFileSync(join(fixture.project, ".gitignore"), "");
    const rejectedUnsafe = await service!.dispatch("build.environments.verifyLocal", { buildId: fixture.record.buildId,
      environmentId: fixture.env.environmentId, variableName: "UNSAFE_SECRET", expectedEnvironmentRevision: unsafe.revision });
    expect(rejectedUnsafe).toMatchObject({ ok: true, safetyState: "verified_unsafe" });
    writeFileSync(join(fixture.project, ".gitignore"), ".env.local\n");
    expect(await dispatchRegions(rejectedUnsafe.revision)).toMatchObject({ ok: false, code: "DATABASE_CREDENTIAL_SOURCE_UNSAFE" });
    expect(adapterCalls).toBe(0);
  });

  it("fails closed when management material is missing and detects credential changes across the provider call", async () => {
    let adapterCalls = 0; let project = "";
    const fixture = await localProvisionFixture({ availableRegions: async () => {
      adapterCalls++;
      writeFileSync(join(project, ".env.local"), "MANAGEMENT_TOKEN=synthetic-management-changed\nPROVISION_PASSWORD=synthetic-password\n");
      return { ok: true, regions: [] };
    } });
    project = fixture.project;
    const dispatchRegions = (expectedEnvironmentRevision: number) => {
      const before = listBuildDatabases(root, fixture.record.buildId);
      if (!before.ok) throw new Error("Synthetic database authority was unavailable");
      return service!.dispatch("build.databases.availableRegions", { buildId: fixture.record.buildId,
        databaseId: fixture.databaseId, organizationSlug: "org-1", expectedDatabaseRevision: before.revision,
        expectedEnvironmentRevision });
    };
    writeFileSync(join(project, ".env.local"), "PROVISION_PASSWORD=synthetic-password\n");
    expect(await dispatchRegions(fixture.envRevision)).toMatchObject({ ok: false, code: "DATABASE_CREDENTIAL_MISSING" });
    expect(adapterCalls).toBe(0);

    writeFileSync(join(project, ".env.local"), "MANAGEMENT_TOKEN=synthetic-management\nPROVISION_PASSWORD=synthetic-password\n");
    expect(await dispatchRegions(fixture.envRevision)).toMatchObject({ ok: false, code: "DATABASE_CREDENTIAL_CHANGED" });
    expect(adapterCalls).toBe(1);
  });

  it("persists effect_started before exactly one synthetic project creation and records only reduced identity", async () => {
    root = mkdtempSync(join(tmpdir(), "path-p13-provision-effect-"));
    const project = join(root, "project"); (await import("node:fs")).mkdirSync(project);
    execFileSync("git", ["init", "-q", project]); writeFileSync(join(project, ".gitignore"), ".env.local\n");
    writeFileSync(join(project, ".env.local"), "MANAGEMENT_TOKEN=synthetic-management\nPROVISION_PASSWORD=synthetic-password\n");
    const record = createBuildRecordSkeleton({ outcome: "synthetic" }); record.projectBindings.push({ bindingId: "test", projectRoot: project });
    record.loop.status = "paused"; writeBuildRecord(root, record);
    let calls = 0; let listCalls = 0; let healthCalls = 0; let visibleStarted = false; let releaseCreate!: (value: any) => void; let enteredCreate!: () => void;
    const createEntered = new Promise<void>((resolve) => { enteredCreate = resolve; });
    const heldCreate = new Promise<any>((resolve) => { releaseCreate = resolve; });
    service = await createBuildCoordinatorService({ runtimeRoot: root, packageRoot: resolvePathPackageRoot(), fakeMode: true,
      databaseOperationAdapters: { supabase: { listProjects: async () => { listCalls++; return { ok: true, matches: [], truncated: false }; },
        health: async () => { healthCalls++; return { ok: true, projectStatus: "ACTIVE_HEALTHY" }; }, createProject: async (input: any) => {
        calls++; const rows = await service!.dispatch("build.databases.list", { buildId: record.buildId });
        visibleStarted = rows.pendingOperation?.state === "effect_started";
        expect(input).toMatchObject({ name: rows.pendingOperation.providerProjectName, organizationSlug: rows.pendingOperation.organizationSlug,
          region: rows.pendingOperation.region });
        enteredCreate();
        return heldCreate;
      } } } }); await service.whenReady;
    const env = await service.dispatch("build.environments.mutate", { buildId: record.buildId, action: "create_environment",
      expectedEnvironmentRevision: 0, input: { name: "synthetic" } });
    let envRevision = env.revision;
    const refs: Record<string, string> = {};
    for (const variableName of ["MANAGEMENT_TOKEN", "PROVISION_PASSWORD"]) {
      const bound = await service.dispatch("build.environments.mutate", { buildId: record.buildId, action: "bind_secret",
        expectedEnvironmentRevision: envRevision++, input: { environmentId: env.environmentId, variableName, backend: "local_env_file" } });
      refs[variableName] = bound.secretRef;
    }
    for (const variableName of ["MANAGEMENT_TOKEN", "PROVISION_PASSWORD"]) {
      const verified = await service.dispatch("build.environments.verifyLocal", { buildId: record.buildId,
        environmentId: env.environmentId, variableName, expectedEnvironmentRevision: envRevision++ });
      expect(verified.ok).toBe(true);
    }
    const made = await service.dispatch("build.databases.mutate", { buildId: record.buildId, action: "create_database",
      expectedDatabaseRevision: 0, input: { provider: "supabase", label: "Inventory DB", environmentId: env.environmentId, source: "path_provisioned" } });
    const bound = await service.dispatch("build.databases.mutate", { buildId: record.buildId, action: "bind_management_credential",
      expectedDatabaseRevision: made.revision, input: { databaseId: made.databaseId, secretRef: refs.MANAGEMENT_TOKEN } });
    const prepared = await service.dispatch("build.databases.provisionPrepare", { buildId: record.buildId, databaseId: made.databaseId,
      expectedDatabaseRevision: bound.revision, expectedEnvironmentRevision: envRevision, organizationSlug: "org-1", region: "eu-north-1",
      provisionPasswordSecretRef: refs.PROVISION_PASSWORD, acknowledgeProviderBilling: true });
    const executing = service.dispatch("build.databases.provisionExecute", { buildId: record.buildId, operationId: prepared.operationId,
      expectedDatabaseRevision: prepared.revision, expectedEnvironmentRevision: envRevision });
    await createEntered;
    const whileHeld = await service.dispatch("build.databases.list", { buildId: record.buildId });
    expect(whileHeld.pendingOperation).toMatchObject({ operationId: prepared.operationId, state: "effect_started" });
    releaseCreate({ ok: true, projectRef: "project123", projectName: whileHeld.pendingOperation.providerProjectName, organizationSlug: "org-1",
      region: "eu-north-1", projectStatus: "COMING_UP" });
    const executed = await executing;
    expect(executed).toMatchObject({ ok: true, state: "observed" }); expect(calls).toBe(1); expect(visibleStarted).toBe(true);
    const list = await service.dispatch("build.databases.list", { buildId: record.buildId });
    expect(list.items[0].providerTarget).toEqual({ organizationSlug: "org-1", projectRef: "project123", region: "eu-north-1" });
    expect(list.items[0].providerObservation.state).not.toBe("ready");
    expect(JSON.stringify(list)).not.toContain("synthetic-password");
    const completed = await service.dispatch("build.databases.provisionObserve", { buildId: record.buildId,
      operationId: prepared.operationId, expectedDatabaseRevision: executed.revision, expectedEnvironmentRevision: envRevision });
    expect(completed.code).toBeUndefined();
    expect(completed).toMatchObject({ ok: true, state: "completed" });
    expect(listCalls).toBe(0); expect(healthCalls).toBe(1);
    const final = await service.dispatch("build.databases.list", { buildId: record.buildId });
    expect(final.pendingOperation).toBeNull(); expect(final.operationHistory[0].state).toBe("completed");
    expect(final.operationHistory[0]).not.toHaveProperty("provisionPasswordSecretRef");
    expect(final.items[0].providerObservation).toMatchObject({ state: "ready", projectStatus: "ACTIVE_HEALTHY", failureCode: null });
    expect(final.items[0].connectionObservation.state).not.toBe("ready");
    expect(final.items[0].credentials.databaseUrlSecretRef).toBeNull();
    expect(calls).toBe(1);
    const events = readBuildEvents(root, record.buildId);
    expect(JSON.stringify([executed, completed, final, events])).not.toContain("synthetic-password");
    expect(JSON.stringify(events)).not.toContain(refs.PROVISION_PASSWORD);
    const retry = await service.dispatch("build.databases.provisionExecute", { buildId: record.buildId, operationId: prepared.operationId,
      expectedDatabaseRevision: completed.revision, expectedEnvironmentRevision: envRevision });
    expect(retry.ok).toBe(false); expect(calls).toBe(1);
  });
  it("does not repeat uncertain creates and keeps the operation recoverable", async () => {
    let calls = 0;
    const fixture = await localProvisionFixture({ createProject: async () => { calls++; return { ok: false, state: "uncertain", code: "DATABASE_PROVIDER_UNAVAILABLE" }; } });
    const first = await service!.dispatch("build.databases.provisionExecute", { buildId: fixture.record.buildId,
      operationId: fixture.prepared.operationId, expectedDatabaseRevision: fixture.prepared.revision, expectedEnvironmentRevision: fixture.envRevision });
    expect(first).toMatchObject({ ok: true, state: "uncertain" }); expect(calls).toBe(1);
    const after = await service!.dispatch("build.databases.list", { buildId: fixture.record.buildId });
    expect(after.pendingOperation).toMatchObject({ operationId: fixture.prepared.operationId, state: "uncertain" });
    expect(after.items[0].providerTarget.projectRef).toBeNull(); expect(after.operationHistory).toEqual([]);
    const retry = await service!.dispatch("build.databases.provisionExecute", { buildId: fixture.record.buildId,
      operationId: fixture.prepared.operationId, expectedDatabaseRevision: after.revision, expectedEnvironmentRevision: fixture.envRevision });
    expect(retry.ok).toBe(false); expect(calls).toBe(1);
  });
  it.each(["MANAGEMENT_TOKEN", "PROVISION_PASSWORD"] as const)("prevents a second create when %s material changes in flight", async (changedName) => {
    let calls = 0; let release!: (value: any) => void; let entered!: () => void;
    const enteredPromise = new Promise<void>((resolve) => { entered = resolve; }); const held = new Promise<any>((resolve) => { release = resolve; });
    const fixture = await localProvisionFixture({ createProject: async () => { calls++; entered(); return held; } });
    const pending = service!.dispatch("build.databases.provisionExecute", { buildId: fixture.record.buildId,
      operationId: fixture.prepared.operationId, expectedDatabaseRevision: fixture.prepared.revision, expectedEnvironmentRevision: fixture.envRevision });
    await enteredPromise;
    writeFileSync(join(fixture.project, ".env.local"), `MANAGEMENT_TOKEN=${changedName === "MANAGEMENT_TOKEN" ? "changed-management" : "synthetic-management"}\nPROVISION_PASSWORD=${changedName === "PROVISION_PASSWORD" ? "changed-password" : "synthetic-password"}\n`);
    release({ ok: true, projectRef: "project123", projectName: "race-db", organizationSlug: "org-1", region: "eu-north-1" });
    const result = await pending;
    expect(result.code).toBe("DATABASE_CREDENTIAL_CHANGED"); expect(calls).toBe(1);
    const after = await service!.dispatch("build.databases.list", { buildId: fixture.record.buildId });
    expect(after.pendingOperation).toMatchObject({ state: "effect_started" }); expect(after.items[0].providerTarget.projectRef).toBeNull();
    expect(after.operationHistory).toEqual([]);
    expect(readBuildEvents(root, fixture.record.buildId).filter((event: any) => ["database.provision_observed", "database.provision_completed", "database.provision_failed_no_effect"].includes(event.type))).toHaveLength(0);
  });
  it.each(["database", "environment"] as const)("prevents provider-result write after in-flight %s authority changes", async (change) => {
    let calls = 0; let release!: (value: any) => void; let entered!: () => void;
    const enteredPromise = new Promise<void>((resolve) => { entered = resolve; }); const held = new Promise<any>((resolve) => { release = resolve; });
    const fixture = await localProvisionFixture({ createProject: async () => { calls++; entered(); return held; } });
    const pending = service!.dispatch("build.databases.provisionExecute", { buildId: fixture.record.buildId,
      operationId: fixture.prepared.operationId, expectedDatabaseRevision: fixture.prepared.revision, expectedEnvironmentRevision: fixture.envRevision });
    await enteredPromise;
    if (change === "database") await service!.dispatch("build.databases.mutate", { buildId: fixture.record.buildId, action: "rename_database",
      expectedDatabaseRevision: fixture.prepared.revision + 1, input: { databaseId: fixture.databaseId, label: "Concurrent rename" } });
    else await service!.dispatch("build.environments.mutate", { buildId: fixture.record.buildId, action: "rename_environment",
      expectedEnvironmentRevision: fixture.envRevision, input: { environmentId: fixture.env.environmentId, name: "renamed" } });
    const during = await service!.dispatch("build.databases.list", { buildId: fixture.record.buildId });
    expect(during.pendingOperation.state).toBe("effect_started");
    // The in-flight external call is still held while the authoritative operation state is inspected.
    release({ ok: true, projectRef: "project123", projectName: during.pendingOperation.providerProjectName,
      organizationSlug: "org-1", region: "eu-north-1" });
    const result = await pending;
    expect(result.code).toBe(change === "database" ? "DATABASE_AUTHORITY_STALE" : "DATABASE_ENVIRONMENT_STALE"); expect(calls).toBe(1);
    const after = await service!.dispatch("build.databases.list", { buildId: fixture.record.buildId });
    expect(after.pendingOperation.state).toBe("effect_started"); expect(after.items[0].providerTarget.projectRef).toBeNull();
    expect(after.operationHistory).toEqual([]);
    expect(readBuildEvents(root, fixture.record.buildId).filter((event: any) => ["database.provision_observed", "database.provision_completed", "database.provision_failed_no_effect"].includes(event.type))).toHaveLength(0);
  });
  it("rejects a concurrent second execute while the first create is held", async () => {
    let calls = 0; let release!: (value: any) => void; let entered!: () => void;
    const enteredPromise = new Promise<void>((resolve) => { entered = resolve; }); const held = new Promise<any>((resolve) => { release = resolve; });
    const fixture = await localProvisionFixture({ createProject: async () => { calls++; entered(); return held; } });
    const first = service!.dispatch("build.databases.provisionExecute", { buildId: fixture.record.buildId, operationId: fixture.prepared.operationId,
      expectedDatabaseRevision: fixture.prepared.revision, expectedEnvironmentRevision: fixture.envRevision });
    await enteredPromise;
    const second = await service!.dispatch("build.databases.provisionExecute", { buildId: fixture.record.buildId, operationId: fixture.prepared.operationId,
      expectedDatabaseRevision: fixture.prepared.revision + 1, expectedEnvironmentRevision: fixture.envRevision });
    expect(second.ok).toBe(false); expect(calls).toBe(1);
    release({ ok: true, projectRef: "project123", projectName: "race-db", organizationSlug: "org-1", region: "eu-north-1" });
    await first; expect(calls).toBe(1);
  });
  it.each(["zero", "one", "multiple", "truncated"] as const)("reconciles unknown project refs safely with %s exact listing", async (caseName) => {
    let listCalls = 0; let healthCalls = 0; let createCalls = 0; let expectedName = "";
    const matches = caseName === "one" ? [{ projectRef: "project123", projectName: "exact-name", organizationSlug: "org-1", region: "eu-north-1", projectStatus: "COMING_UP" }]
      : caseName === "multiple" ? [1, 2].map((n) => ({ projectRef: `project${n}`, projectName: "exact-name", organizationSlug: "org-1", region: "eu-north-1", projectStatus: "COMING_UP" }))
      : caseName === "zero" ? [] : [{ projectRef: "project123", projectName: "exact-name", organizationSlug: "org-1", region: "eu-north-1", projectStatus: "COMING_UP" }];
    const fixture = await localProvisionFixture({ createProject: async () => { createCalls++; return { ok: false, state: "uncertain", code: "DATABASE_PROVIDER_UNAVAILABLE" }; },
      listProjects: async (input: any) => { listCalls++; expect(input.projectName).toBe(expectedName); return { ok: true,
        matches: matches.map((item) => ({ ...item, projectName: expectedName })), truncated: caseName === "truncated" }; },
      health: async () => { healthCalls++; return { ok: true, projectStatus: "COMING_UP" }; } });
    expectedName = (await service!.dispatch("build.databases.list", { buildId: fixture.record.buildId })).pendingOperation.providerProjectName;
    const created = await service!.dispatch("build.databases.provisionExecute", { buildId: fixture.record.buildId,
      operationId: fixture.prepared.operationId, expectedDatabaseRevision: fixture.prepared.revision, expectedEnvironmentRevision: fixture.envRevision });
    const authority = await service!.dispatch("build.databases.list", { buildId: fixture.record.buildId });
    const observed = await service!.dispatch("build.databases.provisionObserve", { buildId: fixture.record.buildId, operationId: fixture.prepared.operationId,
      expectedDatabaseRevision: authority.revision, expectedEnvironmentRevision: fixture.envRevision });
    expect(created).toMatchObject({ ok: true, state: "uncertain" }); expect(listCalls).toBe(1); expect(createCalls).toBe(1);
    if (caseName === "one") { expect(observed).toMatchObject({ ok: true, state: "observed" }); expect(healthCalls).toBe(1); }
    else if (caseName === "multiple") { expect(healthCalls).toBe(0); expect(observed.state).toBe("safe_stop"); }
    else { expect(healthCalls).toBe(0); expect(observed.state).toBe("uncertain"); }
    const after = await service!.dispatch("build.databases.list", { buildId: fixture.record.buildId });
    expect(after.pendingOperation).not.toBeNull(); expect(after.operationHistory).toEqual([]);
    expect(createCalls).toBe(1);
  });
  it("retains a not-ready project without polling or completing", async () => {
    let createCalls = 0; let listCalls = 0; let healthCalls = 0;
    const fixture = await localProvisionFixture({ createProject: async (input: any) => { createCalls++; return { ok: true,
      projectRef: "project123", projectName: input.name, organizationSlug: "org-1", region: "eu-north-1", projectStatus: "COMING_UP" }; },
      listProjects: async () => { listCalls++; return { ok: true, matches: [], truncated: false }; },
      health: async () => { healthCalls++; return { ok: true, projectStatus: "COMING_UP" }; } });
    const created = await service!.dispatch("build.databases.provisionExecute", { buildId: fixture.record.buildId,
      operationId: fixture.prepared.operationId, expectedDatabaseRevision: fixture.prepared.revision, expectedEnvironmentRevision: fixture.envRevision });
    const observed = await service!.dispatch("build.databases.provisionObserve", { buildId: fixture.record.buildId, operationId: fixture.prepared.operationId,
      expectedDatabaseRevision: created.revision, expectedEnvironmentRevision: fixture.envRevision });
    const after = await service!.dispatch("build.databases.list", { buildId: fixture.record.buildId });
    expect(observed).toMatchObject({ ok: true, state: "observed" }); expect(after.pendingOperation.state).toBe("observed");
    expect(after.operationHistory).toEqual([]); expect(after.items[0].providerObservation).toMatchObject({ state: "unavailable",
      projectStatus: "COMING_UP", failureCode: "DATABASE_PROVIDER_NOT_READY" });
    expect(createCalls).toBe(1); expect(listCalls).toBe(0); expect(healthCalls).toBe(1);
  });
  it("excludes provision password references and material from failed terminal history and events", async () => {
    let calls = 0;
    const fixture = await localProvisionFixture({ createProject: async () => { calls++; return { ok: false, state: "action_required", code: "DATABASE_PROVISION_REJECTED" }; } });
    const result = await service!.dispatch("build.databases.provisionExecute", { buildId: fixture.record.buildId,
      operationId: fixture.prepared.operationId, expectedDatabaseRevision: fixture.prepared.revision, expectedEnvironmentRevision: fixture.envRevision });
    const after = await service!.dispatch("build.databases.list", { buildId: fixture.record.buildId });
    const events = readBuildEvents(root, fixture.record.buildId);
    expect(result).toMatchObject({ ok: true, state: "failed_no_effect" }); expect(calls).toBe(1);
    expect(after.pendingOperation).toBeNull(); expect(after.operationHistory[0].state).toBe("failed_no_effect");
    expect(after.operationHistory[0]).not.toHaveProperty("provisionPasswordSecretRef");
    expect(JSON.stringify(after)).not.toContain(fixture.refs.PROVISION_PASSWORD);
    expect(JSON.stringify(events)).not.toContain(fixture.refs.PROVISION_PASSWORD);
    expect(JSON.stringify(result)).not.toContain("synthetic-password");
  });
});
