import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createBuildCoordinatorService, createBuildRecordSkeleton,
  emptyBuildIntegrationAuthority, INTEGRATIONS_SCHEMA, listBuildIntegrationCatalog,
  listBuildIntegrations, readBuildIntegration, prepareBuildIntegrationMutation,
  readBuildRecord, resolveBuildRecordPath, readBuildEvents,
  writeBuildRecord,
} from "../../scripts/pathcode-cli/build/index.mjs";
import { resolvePathPackageRoot } from "../../scripts/pathcode-cli/paths.mjs";

const COORD = {
  catalog: "build.integrations.catalog", list: "build.integrations.list",
  read: "build.integrations.read", mutate: "build.integrations.mutate",
} as const;

describe("P12.1 Build integration authority", () => {
  let root = "";
  let service: Awaited<ReturnType<typeof createBuildCoordinatorService>> | null = null;
  const builds: string[] = [];
  afterEach(async () => {
    await service?.close(); service = null;
    if (root) rmSync(root, { recursive: true, force: true });
    root = ""; builds.length = 0;
  });

  function setupBuild(name = "Build") {
    if (!root) root = mkdtempSync(join(tmpdir(), "path-p12-integrations-"));
    const record = createBuildRecordSkeleton({ outcome: name });
    record.projectBindings.push({ bindingId: `binding-${record.buildId}`, projectRoot: join(root, record.buildId) });
    record.loop.status = "paused";
    writeBuildRecord(root, record);
    builds.push(record.buildId);
    return record.buildId;
  }

  function mutate(buildId: string,
    action: "create_integration" | "rename_integration" | "delete_integration" | "bind_environment" |
      "unbind_environment" | "bind_credential" | "unbind_credential",
    expectedIntegrationRevision: number, input: Record<string, unknown>) {
    const result = prepareBuildIntegrationMutation(root, buildId, { action, expectedIntegrationRevision, input });
    if (result.ok) writeBuildRecord(root, result.record);
    return result;
  }

  async function ensureService() {
    if (!service) {
      service = await createBuildCoordinatorService({ runtimeRoot: root, packageRoot: resolvePathPackageRoot(), fakeMode: true });
      await service.whenReady;
    }
    return service;
  }

  async function createEnvironment(buildId: string) {
    const coordinator = await ensureService();
    const created = await coordinator.dispatch("build.environments.mutate", { buildId, action: "create_environment",
      expectedEnvironmentRevision: 0, input: { name: "development" } });
    if (!created.ok) throw new Error(created.code);
    const added = await coordinator.dispatch("build.environments.mutate", { buildId, action: "bind_secret",
      expectedEnvironmentRevision: 1, input: { environmentId: created.environmentId,
        variableName: "GITHUB_TOKEN_REF", backend: "vercel_env" } });
    if (!added.ok) throw new Error(added.code);
    const config = await coordinator.dispatch("build.environments.mutate", { buildId, action: "set_config",
      expectedEnvironmentRevision: 2, input: { environmentId: created.environmentId,
        variableName: "PUBLIC_REPO_NAME", value: "config-only-value" } });
    if (!config.ok) throw new Error(config.code);
    return { environmentId: created.environmentId!, secretRef: added.secretRef!, configValue: "config-only-value" };
  }

  it("reads legacy Builds as deterministic empty authority without persisting", () => {
    const buildId = setupBuild();
    const path = resolveBuildRecordPath(root, buildId);
    const before = readFileSync(path, "utf8");
    expect(emptyBuildIntegrationAuthority()).toEqual({ schema: INTEGRATIONS_SCHEMA, revision: 0, items: [] });
    expect(listBuildIntegrations(root, buildId)).toEqual({ ok: true, buildId, schema: INTEGRATIONS_SCHEMA, revision: 0, items: [] });
    expect(readBuildIntegration(root, buildId, "missing")).toEqual({ ok: false, code: "INTEGRATION_NOT_FOUND" });
    expect(readFileSync(path, "utf8")).toBe(before);
    expect(readBuildRecord(root, buildId)?.integrations).toBeUndefined();
  });

  it("freezes the GitHub metadata-only catalog and rejects unsupported providers", () => {
    expect(listBuildIntegrationCatalog()).toEqual([{ providerKey: "github", displayName: "GitHub",
      credentialRoles: [{ role: "token", required: true }] }]);
    const buildId = setupBuild();
    expect(mutate(buildId, "create_integration", 0, { providerKey: "gitlab", label: "GitLab" }))
      .toMatchObject({ ok: false, code: "INTEGRATION_PROVIDER_UNSUPPORTED" });
    expect(readBuildRecord(root, buildId)?.integrations).toBeUndefined();
  });

  it("creates, renames, and deletes integrations with strict labels and exact revision increments", () => {
    const buildId = setupBuild();
    const created = mutate(buildId, "create_integration", 0, { providerKey: "github", label: "Source" });
    expect(created).toMatchObject({ ok: true, revision: 1, providerKey: "github" });
    if (!created.ok) return;
    expect(created.integrationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(mutate(buildId, "create_integration", 1, { providerKey: "github", label: "source" }))
      .toMatchObject({ ok: false, code: "INTEGRATION_LABEL_CONFLICT" });
    expect(mutate(buildId, "create_integration", 1, { providerKey: "github", label: "Bearer abc123" }))
      .toMatchObject({ ok: false, code: "INTEGRATION_LABEL_INVALID" });
    expect(mutate(buildId, "create_integration", 1, { providerKey: "github", label: " private\n" }))
      .toMatchObject({ ok: false, code: "INTEGRATION_LABEL_INVALID" });
    expect(mutate(buildId, "rename_integration", 1, { integrationId: created.integrationId, label: "Source" }))
      .toMatchObject({ ok: false, code: "INTEGRATION_UNCHANGED" });
    expect(mutate(buildId, "rename_integration", 0, { integrationId: created.integrationId, label: "Code" }))
      .toMatchObject({ ok: false, code: "INTEGRATION_REVISION_STALE" });
    const renamed = mutate(buildId, "rename_integration", 1, { integrationId: created.integrationId, label: "Code" });
    expect(renamed).toMatchObject({ ok: true, revision: 2 });
    expect(mutate(buildId, "delete_integration", 2, { integrationId: created.integrationId }))
      .toMatchObject({ ok: true, revision: 3 });
    expect(readBuildRecord(root, buildId)?.integrations?.items).toEqual([]);
  });

  it("binds only same-Build P9 environments and secret references, then resets verification on credential changes", async () => {
    const buildId = setupBuild();
    const foreignBuild = setupBuild("Foreign Build");
    const local = await createEnvironment(buildId);
    const foreign = await createEnvironment(foreignBuild);
    const localEnvironmentBefore = structuredClone(readBuildRecord(root, buildId)?.environments);
    const integration = mutate(buildId, "create_integration", 0, { providerKey: "github", label: "Repo" });
    const foreignIntegration = mutate(foreignBuild, "create_integration", 0, { providerKey: "github", label: "Foreign Repo" });
    if (!integration.ok) throw new Error(integration.code);
    if (!foreignIntegration.ok) throw new Error(foreignIntegration.code);
    const foreignBinding = mutate(foreignBuild, "bind_environment", 1, {
      integrationId: foreignIntegration.integrationId, environmentId: foreign.environmentId,
    });
    if (!foreignBinding.ok) throw new Error(foreignBinding.code);
    const foreignBefore = readFileSync(resolveBuildRecordPath(root, foreignBuild));
    expect(mutate(buildId, "bind_environment", 1, { integrationId: integration.integrationId, environmentId: foreign.environmentId }))
      .toMatchObject({ ok: false, code: "ENVIRONMENT_NOT_FOUND" });
    expect(mutate(buildId, "rename_integration", 1, { integrationId: foreignIntegration.integrationId, label: "Hijack" }))
      .toMatchObject({ ok: false, code: "INTEGRATION_NOT_FOUND" });
    const binding = mutate(buildId, "bind_environment", 1, { integrationId: integration.integrationId, environmentId: local.environmentId });
    expect(binding).toMatchObject({ ok: true, revision: 2 });
    if (!binding.ok) return;
    expect(mutate(buildId, "bind_environment", 2, { integrationId: integration.integrationId, environmentId: local.environmentId }))
      .toMatchObject({ ok: false, code: "INTEGRATION_ENVIRONMENT_ALREADY_BOUND" });
    const integrationNow = readBuildIntegration(root, buildId, integration.integrationId);
    expect(integrationNow).toMatchObject({ ok: true, integration: { bindings: [{ verification: {
      state: "unverified", adapterVersion: null, providerAccountRef: null, capabilities: [], verifiedAt: null, failureCode: null,
    } }] } });
    expect(mutate(buildId, "delete_integration", 2, { integrationId: integration.integrationId }))
      .toMatchObject({ ok: false, code: "INTEGRATION_NOT_EMPTY" });
    const readyRecord = readBuildRecord(root, buildId)!;
    readyRecord.integrations!.items[0]!.bindings[0]!.verification = { state: "ready", adapterVersion: "github.identity.v1",
      providerAccountRef: "acct_123", capabilities: ["repos.read"], verifiedAt: "2026-01-01T00:00:00.000Z", failureCode: null };
    writeBuildRecord(root, readyRecord);
    const beforeRename = structuredClone(readyRecord.integrations!.items[0]!.bindings[0]!.verification);
    const renamed = mutate(buildId, "rename_integration", 2, { integrationId: integration.integrationId, label: "GitHub App" });
    expect(renamed).toMatchObject({ ok: true, revision: 3 });
    expect(readBuildIntegration(root, buildId, integration.integrationId)).toMatchObject({ ok: true,
      integration: { bindings: [{ verification: beforeRename }] } });
    expect(mutate(buildId, "bind_credential", 3, { integrationId: integration.integrationId,
      bindingId: binding.bindingId, role: "owner", secretRef: local.secretRef }))
      .toMatchObject({ ok: false, code: "INTEGRATION_CREDENTIAL_ROLE_UNSUPPORTED" });
    expect(mutate(buildId, "bind_credential", 3, { integrationId: integration.integrationId,
      bindingId: foreignBinding.bindingId, role: "token", secretRef: local.secretRef }))
      .toMatchObject({ ok: false, code: "INTEGRATION_BINDING_NOT_FOUND" });
    expect(mutate(buildId, "bind_credential", 3, { integrationId: integration.integrationId,
      bindingId: binding.bindingId, role: "token", secretRef: foreign.secretRef }))
      .toMatchObject({ ok: false, code: "INTEGRATION_SECRET_REF_NOT_FOUND" });
    expect(mutate(buildId, "bind_credential", 3, { integrationId: integration.integrationId,
      bindingId: binding.bindingId, role: "token", secretRef: local.configValue }))
      .toMatchObject({ ok: false, code: "INTEGRATION_SECRET_REF_NOT_FOUND" });
    expect(mutate(buildId, "bind_credential", 3, { integrationId: integration.integrationId,
      bindingId: binding.bindingId, role: "token", secretRef: local.configValue }))
      .toMatchObject({ ok: false, code: "INTEGRATION_SECRET_REF_NOT_FOUND" });
    const bound = mutate(buildId, "bind_credential", 3, { integrationId: integration.integrationId,
      bindingId: binding.bindingId, role: "token", secretRef: local.secretRef });
    expect(bound).toMatchObject({ ok: true, revision: 4 });
    expect(readBuildIntegration(root, buildId, integration.integrationId)).toMatchObject({ ok: true,
      integration: { bindings: [{ credentials: [{ role: "token", secretRef: local.secretRef },], verification: {
        state: "unverified", adapterVersion: null, providerAccountRef: null, capabilities: [], verifiedAt: null, failureCode: null,
      } }] } });
    expect(mutate(buildId, "bind_credential", 4, { integrationId: integration.integrationId,
      bindingId: binding.bindingId, role: "token", secretRef: local.secretRef }))
      .toMatchObject({ ok: false, code: "INTEGRATION_CREDENTIAL_ROLE_ALREADY_BOUND" });
    expect(mutate(buildId, "unbind_environment", 4, { integrationId: integration.integrationId, bindingId: binding.bindingId }))
      .toMatchObject({ ok: false, code: "INTEGRATION_BINDING_NOT_EMPTY" });
    const readyBeforeUnbind = readBuildRecord(root, buildId)!;
    readyBeforeUnbind.integrations!.items[0]!.bindings[0]!.verification = { state: "ready", adapterVersion: "github.identity.v1",
      providerAccountRef: "acct_123", capabilities: ["repos.read"], verifiedAt: "2026-01-01T00:00:00.000Z", failureCode: null };
    writeBuildRecord(root, readyBeforeUnbind);
    expect(mutate(buildId, "unbind_credential", 4, { integrationId: integration.integrationId,
      bindingId: binding.bindingId, role: "token" })).toMatchObject({ ok: true, revision: 5 });
    expect(readBuildIntegration(root, buildId, integration.integrationId)).toMatchObject({ ok: true,
      integration: { bindings: [{ verification: { state: "unverified", adapterVersion: null, providerAccountRef: null,
        capabilities: [], verifiedAt: null, failureCode: null } }] } });
    expect(mutate(buildId, "unbind_environment", 5, { integrationId: integration.integrationId, bindingId: binding.bindingId }))
      .toMatchObject({ ok: true, revision: 6 });
    expect(mutate(buildId, "delete_integration", 6, { integrationId: integration.integrationId }))
      .toMatchObject({ ok: true, revision: 7 });
    expect(readBuildRecord(root, buildId)?.environments).toEqual(localEnvironmentBefore);
    expect(readFileSync(resolveBuildRecordPath(root, foreignBuild))).toEqual(foreignBefore);
  });

  it("rejects malformed persisted authority and unknown mutation fields without writes", () => {
    const buildId = setupBuild();
    const record = readBuildRecord(root, buildId)!;
    record.integrations = { schema: "wrong", revision: 0, items: [], extra: true } as never;
    writeBuildRecord(root, record);
    const before = readFileSync(resolveBuildRecordPath(root, buildId), "utf8");
    expect(listBuildIntegrations(root, buildId)).toEqual({ ok: false, code: "INTEGRATIONS_INVALID" });
    expect(prepareBuildIntegrationMutation(root, buildId, { action: "create_integration", expectedIntegrationRevision: 0,
      input: { providerKey: "github", label: "Repo", secretValue: "sentinel" } })).toMatchObject({ ok: false, code: "INTEGRATION_MUTATION_INVALID" });
    expect(readFileSync(resolveBuildRecordPath(root, buildId), "utf8")).toBe(before);
  });

  it("rejects duplicate canonical IDs, labels, environment bindings, roles, and invalid verification shape", () => {
    const buildId = setupBuild();
    const created = mutate(buildId, "create_integration", 0, { providerKey: "github", label: "One" });
    if (!created.ok) throw new Error(created.code);
    const stamp = "2026-01-01T00:00:00.000Z";
    const verification = { state: "unverified", adapterVersion: null, providerAccountRef: null,
      capabilities: [], verifiedAt: null, failureCode: null };
    const integration = (integrationId: string, label: string, bindings: any[] = []) => ({
      integrationId, providerKey: "github", label, createdAt: stamp, updatedAt: stamp, bindings,
    });
    const binding = (bindingId: string, environmentId: string, credentials: any[] = [], v: any = verification) => ({
      bindingId, environmentId, credentials, verification: v, createdAt: stamp, updatedAt: stamp,
    });
    const i1 = "10000000-0000-4000-8000-000000000001", i2 = "20000000-0000-4000-8000-000000000002";
    const b1 = "30000000-0000-4000-8000-000000000003", b2 = "40000000-0000-4000-8000-000000000004";
    const e1 = "50000000-0000-4000-8000-000000000005", e2 = "60000000-0000-4000-8000-000000000006";
    const invalidItems = [
      [integration(i1, "One"), integration(i1, "Two")],
      [integration(i1, "One"), integration(i2, "one")],
      [integration(i1, "One", [binding(b1, e1), binding(b2, e1)])],
      [integration(i1, "One", [binding(b1, e1, [{ role: "token", secretRef: "secret-a" }, { role: "token", secretRef: "secret-b" }])])],
      [integration(i1, "One", [binding(b1, e1, [], { ...verification, extra: true })])],
      [integration(i1, "One", [binding(b1, e1, [], { ...verification, capabilities: ["repo.read", "repo.read"] })])],
      [integration(i1, "One", [binding(b1, e1)]), integration(i2, "Two", [binding(b1, e2)])],
    ];
    for (const items of invalidItems) {
      const record = readBuildRecord(root, buildId)!;
      record.integrations = { schema: INTEGRATIONS_SCHEMA, revision: 1, items } as never;
      writeBuildRecord(root, record);
      expect(listBuildIntegrations(root, buildId)).toEqual({ ok: false, code: "INTEGRATIONS_INVALID" });
    }
  });

  it("rejects incoherent persisted ready verification and accepts complete ready evidence", () => {
    const buildId = setupBuild();
    const stamp = "2026-01-01T00:00:00.000Z";
    const integration = mutate(buildId, "create_integration", 0, { providerKey: "github", label: "Ready State" });
    if (!integration.ok) throw new Error(integration.code);
    // Canonical validation is independent of live P9 state, so construct the persisted row directly.
    const record = readBuildRecord(root, buildId)!;
    const row: { bindingId: string; environmentId: string; credentials: unknown[];
      verification: { state: string; adapterVersion: string | null; providerAccountRef: string | null;
        capabilities: string[]; verifiedAt: string | null; failureCode: string | null };
      createdAt: string; updatedAt: string } = { bindingId: "20000000-0000-4000-8000-000000000002",
      environmentId: "10000000-0000-4000-8000-000000000001", credentials: [],
      verification: { state: "ready", adapterVersion: null, providerAccountRef: null,
        capabilities: [], verifiedAt: null, failureCode: null }, createdAt: stamp, updatedAt: stamp };
    record.integrations = { schema: INTEGRATIONS_SCHEMA, revision: 1, items: [{
      integrationId: "30000000-0000-4000-8000-000000000003", providerKey: "github", label: "Synthetic",
      createdAt: stamp, updatedAt: stamp, bindings: [row],
    }] } as never;
    writeBuildRecord(root, record);
    expect(listBuildIntegrations(root, buildId)).toEqual({ ok: false, code: "INTEGRATIONS_INVALID" });

    row.verification = { state: "ready", adapterVersion: "github.identity.v1", providerAccountRef: "acct_synthetic_1",
      capabilities: ["repos.read"], verifiedAt: stamp, failureCode: null };
    writeBuildRecord(root, record);
    expect(listBuildIntegrations(root, buildId)).toMatchObject({ ok: true, revision: 1,
      items: [{ bindings: [{ verification: { state: "ready", adapterVersion: "github.identity.v1",
        providerAccountRef: "acct_synthetic_1", verifiedAt: stamp } }] }] });
  });

  it("keeps credential material out of P12 projections, canonical P12 data, events, and mutation results", async () => {
    const buildId = setupBuild();
    const { environmentId, secretRef } = await createEnvironment(buildId);
    const sentinel = "ghp_SENTINEL_SECRET_MATERIAL_DO_NOT_PERSIST";
    const coordinator = await ensureService();
    const catalog = await coordinator.dispatch(COORD.catalog, {});
    const created = await coordinator.dispatch(COORD.mutate, { buildId,
      action: "create_integration", expectedIntegrationRevision: 0, input: { providerKey: "github", label: "Source" } });
    if (!created.ok) throw new Error(created.code);
    const bound = await coordinator.dispatch(COORD.mutate, { buildId,
      action: "bind_environment", expectedIntegrationRevision: 1,
      input: { integrationId: created.integrationId, environmentId } });
    const eventsBeforeRejected = readBuildEvents(root, buildId);
    const rejectedMaterial = await coordinator.dispatch(COORD.mutate, { buildId,
      action: "bind_credential", expectedIntegrationRevision: 2,
      input: { integrationId: created.integrationId, bindingId: bound.bindingId, role: "token", secretRef, tokenValue: sentinel } });
    expect(rejectedMaterial).toMatchObject({ ok: false, code: "INTEGRATION_MUTATION_INVALID" });
    expect(readBuildEvents(root, buildId)).toEqual(eventsBeforeRejected);
    const credential = await coordinator.dispatch(COORD.mutate, { buildId,
      action: "bind_credential", expectedIntegrationRevision: 2,
      input: { integrationId: created.integrationId, bindingId: bound.bindingId, role: "token", secretRef } });
    expect(catalog).toMatchObject({ ok: true, providers: [{ providerKey: "github" }] });
    expect(credential).toMatchObject({ ok: true, revision: 3 });
    expect(JSON.stringify(credential)).not.toContain(secretRef);
    const beforeReads = readFileSync(resolveBuildRecordPath(root, buildId));
    const listed = await coordinator.dispatch(COORD.list, { buildId });
    const read = await coordinator.dispatch(COORD.read, { buildId, integrationId: created.integrationId });
    expect(readFileSync(resolveBuildRecordPath(root, buildId))).toEqual(beforeReads);
    const recordText = readFileSync(resolveBuildRecordPath(root, buildId), "utf8");
    const eventsText = JSON.stringify(readBuildEvents(root, buildId));
    expect(JSON.stringify({ catalog, listed, read, recordText, eventsText, rejectedMaterial })).not.toContain(sentinel);
    expect(eventsText).not.toContain(secretRef);
    expect(recordText).not.toContain(sentinel);
    expect(readBuildRecord(root, buildId)?.integrations?.items[0]?.bindings[0]?.credentials)
      .toEqual([{ role: "token", secretRef }]);
    expect(await coordinator.dispatch(COORD.read, { buildId, integrationId: "foreign" }))
      .toMatchObject({ ok: false, code: "INTEGRATION_NOT_FOUND" });
  });

  it("serializes same-revision coordinator mutations and exposes no verification route or network adapter", async () => {
    const buildId = setupBuild();
    const coordinator = await ensureService();
    const [first, second] = await Promise.all(["One", "Two"].map((label) => coordinator.dispatch(
      COORD.mutate, { buildId, action: "create_integration",
        expectedIntegrationRevision: 0, input: { providerKey: "github", label } })));
    expect([first, second].filter((result) => result.ok)).toHaveLength(1);
    expect([first, second].find((result) => !result.ok)).toMatchObject({ code: "INTEGRATION_REVISION_STALE" });
    expect(readBuildRecord(root, buildId)?.integrations?.revision).toBe(1);
    expect(Object.values(COORD)).toEqual(["build.integrations.catalog", "build.integrations.list",
      "build.integrations.read", "build.integrations.mutate"]);
    const protocolText = readFileSync(new URL("../../scripts/pathcode-cli/build/coordinator/protocol.mjs", import.meta.url), "utf8");
    expect(protocolText).not.toContain("build.integrations.verify");
    const moduleText = readFileSync(new URL("../../scripts/pathcode-cli/build/integrations.mjs", import.meta.url), "utf8");
    expect(moduleText).not.toMatch(/from\s+["']node:(?:http|https|child_process)|\bfetch\s*\(/);
    expect(existsSync(new URL("../../scripts/pathcode-cli/build/github-adapter.mjs", import.meta.url))).toBe(false);
  });
});
