import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBuildRecordSkeleton, createBuildCoordinatorClient,
  readBuildRecord, resolveBuildRecordPath, startBuildCoordinatorServer,
  writeBuildRecord } from "../../scripts/pathcode-cli/build/index.mjs";
import { resolvePathPackageRoot } from "../../scripts/pathcode-cli/paths.mjs";

describe("exact-Build scoped coordinator control plane", () => {
  let root = "";
  let server: Awaited<ReturnType<typeof startBuildCoordinatorServer>> | null = null;
  let client: ReturnType<typeof createBuildCoordinatorClient> | null = null;
  afterEach(async () => {
    client?.close(); client = null;
    if (server) { await server.stop(); server = null; }
    if (root) rmSync(root, { recursive: true, force: true });
    root = "";
  });
  function setup() {
    root = mkdtempSync(join(tmpdir(), "path-scoped-coordinator-"));
    const target = createBuildRecordSkeleton({ outcome: "Selected Build" });
    const other = createBuildRecordSkeleton({ outcome: "Unrelated Build" });
    for (const record of [target, other]) {
      const projectRoot = join(root, record.buildId);
      mkdirSync(projectRoot);
      record.projectBindings.push({ bindingId: record.buildId, projectRoot });
      record.loop.status = "paused";
      record.coordinator = { autoRun: false, owner: "path-build-coordinator" };
      writeBuildRecord(root, record);
    }
    return { target, other, otherPath: resolveBuildRecordPath(root, other.buildId) };
  }

  it("serializes only exact-Build P9/P10 commands; unrelated record stays byte-identical", async () => {
    const { target, other, otherPath } = setup();
    const unrelatedBefore = readFileSync(otherPath);
    server = await startBuildCoordinatorServer({ runtimeRoot: root,
      packageRoot: resolvePathPackageRoot(), scopedBuildId: target.buildId });
    expect(readFileSync(otherPath)).toEqual(unrelatedBefore);
    client = createBuildCoordinatorClient({ runtimeRoot: root, socketPath: server.socketPath });
    await client.connect();
    const [a, b] = await Promise.all([
      client.mutateEnvironment(target.buildId, "create_environment", 0, { name: "preview" }),
      client.mutateEnvironment(target.buildId, "create_environment", 0, { name: "parallel" }),
    ]);
    expect([a, b].filter((result) => result.ok)).toHaveLength(1);
    expect([a, b].filter((result) => !result.ok)).toMatchObject([{ code: "ENVIRONMENT_REVISION_STALE" }]);
    const listed = await client.listEnvironments(target.buildId);
    if (!listed.ok) throw new Error(listed.code);
    expect(listed.items).toHaveLength(1);
    const environmentId = listed.items[0]!.environmentId;
    const mapping = await client.mutateDeploymentMapping(target.buildId, { action: "set", expectedRevision: 0,
      environmentId, teamRef: "team-test", projectRef: "project-test", targetRef: "preview" });
    expect(mapping).toMatchObject({ ok: true, revision: 1 });
    expect(await client.mutateDeploymentMapping(target.buildId, { action: "set", expectedRevision: 0,
      environmentId, teamRef: "team-test", projectRef: "other", targetRef: "preview" }))
      .toMatchObject({ ok: false, code: "DEPLOY_REVISION_STALE" });
    expect(await client.mutateEnvironment(target.buildId, "create_environment", 0, { name: "stale" }))
      .toMatchObject({ ok: false, code: "ENVIRONMENT_REVISION_STALE" });
    expect(await client.mutateEnvironment(other.buildId, "create_environment", 0, { name: "forbidden" }))
      .toMatchObject({ ok: false, code: "COORDINATOR_SCOPE_FORBIDDEN" });
    expect(await client.request("build.get", { buildId: target.buildId })).toMatchObject({ ok: false, code: "COORDINATOR_SCOPE_FORBIDDEN" });
    expect(await client.request("build.restoreHistorical", { buildId: target.buildId })).toMatchObject({ ok: false, code: "COORDINATOR_SCOPE_FORBIDDEN" });
    expect(readFileSync(otherPath)).toEqual(unrelatedBefore);
    const persisted = readBuildRecord(root, target.buildId)!;
    expect(persisted.environments?.items).toHaveLength(1);
    expect(persisted.deployments?.mappings).toHaveLength(1);
    expect(persisted.deployments?.pendingOperation).toBeNull();
  });

  it("uses the existing single-instance claim and rejects a second authoritative owner", async () => {
    const { target } = setup();
    server = await startBuildCoordinatorServer({ runtimeRoot: root,
      packageRoot: resolvePathPackageRoot(), scopedBuildId: target.buildId });
    await expect(startBuildCoordinatorServer({ runtimeRoot: root,
      packageRoot: resolvePathPackageRoot(), fakeMode: true })).rejects.toMatchObject({ code: "COORDINATOR_ALREADY_RUNNING" });
  });

  it("leaves normal startup recovery unchanged", async () => {
    const { otherPath } = setup();
    const before = readFileSync(otherPath);
    server = await startBuildCoordinatorServer({ runtimeRoot: root,
      packageRoot: resolvePathPackageRoot(), fakeMode: true });
    expect(readFileSync(otherPath)).not.toEqual(before);
  });
});
