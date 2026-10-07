import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createBuildRecordSkeleton, readBuildRecord, writeBuildRecord,
  createBuildCoordinatorService } from "../../scripts/pathcode-cli/build/index.mjs";
import { resolvePathPackageRoot } from "../../scripts/pathcode-cli/paths.mjs";

describe("P10.3B Production deployment authority; deterministic provider boundary", () => {
  let root = "";
  let service: Awaited<ReturnType<typeof createBuildCoordinatorService>> | null = null;
  afterEach(async () => {
    if (service) { await service.close(); service = null; }
    if (root) rmSync(root, { recursive: true, force: true });
    root = "";
  });

  it("persists explicit Production intent before submission and confirms deployment without release authority", async () => {
    root = mkdtempSync(join(tmpdir(), "path-p103b-"));
    const project = join(root, "product"); mkdirSync(project);
    const git = (args: string[]) => {
      const result = spawnSync("git", args, { cwd: project, encoding: "utf8" });
      expect(result.status, result.stderr).toBe(0); return result.stdout.trim();
    };
    git(["init", "-q"]); git(["config", "user.email", "path-test@example.test"]); git(["config", "user.name", "PATH Test"]);
    writeFileSync(join(project, "index.html"), "<h1>Production candidate</h1>");
    git(["add", "."]); git(["commit", "-qm", "authoritative product"]);
    const build = createBuildRecordSkeleton({ outcome: "Production candidate" });
    build.projectBindings.push({ bindingId: "product", projectRoot: project });
    build.authoritativeSha = git(["rev-parse", "HEAD"]);
    build.loop.status = "paused"; build.coordinator = { autoRun: false, owner: "path-build-coordinator" };
    writeBuildRecord(root, build);

    const providerCalls: string[] = [];
    const deployGate: { unblock?: () => void } = {};
    let enteredDeploy: (() => void) | null = null;
    const deployEntered = new Promise<void>((resolve) => { enteredDeploy = resolve; });
    const executor = vi.fn(async (_spec: any, options: any) => {
      providerCalls.push(options.mode);
      if (options.mode === "production_auth") return { ok: true, authenticated: true, teamRef: "team-a" };
      if (options.mode === "production_project") return { ok: true, projectId: "production-project", projectName: "production-project" };
      if (options.mode === "production_config_metadata") return { ok: true, variables: [] };
      if (options.mode === "production_config_write") return { ok: true, acknowledged: true };
      if (options.mode === "production_deploy_receipt") {
        enteredDeploy?.();
        await new Promise<void>((resolve) => { deployGate.unblock = resolve; });
        return { ok: true, providerDeploymentId: "dpl_12345678", url: "https://candidate.vercel.app",
          target: "production", providerState: "INITIALIZING" };
      }
      if (options.mode === "production_status") return { ok: true, providerDeploymentId: "dpl_12345678",
        url: "https://candidate.vercel.app", target: "production", providerState: "READY", createdAt: 1 };
      throw new Error(`Unexpected mocked provider mode ${options.mode}`);
    });
    service = await createBuildCoordinatorService({ runtimeRoot: root, packageRoot: resolvePathPackageRoot(),
      fakeMode: true, productionCommandExecutor: executor });
    const call = (method: string, params: Record<string, unknown> = {}) => service!.dispatch(method, { buildId: build.buildId, ...params });
    const M = { BUILD_ENVIRONMENT_MUTATE: "build.environments.mutate", BUILD_DEPLOYMENT_MAPPING_MUTATE: "build.deployments.mappingMutate",
      BUILD_DEPLOYMENT_PREPARE: "build.deployments.prepare", BUILD_PRODUCTION_DEPLOYMENT_PREPARE: "build.productionDeployments.prepare",
      BUILD_PRODUCTION_DEPLOYMENT_SUBMIT: "build.productionDeployments.submit", BUILD_DEPLOYMENTS_LIST: "build.deployments.list",
      BUILD_PRODUCTION_DEPLOYMENT_OBSERVE: "build.productionDeployments.observe" };

    const env = await call(M.BUILD_ENVIRONMENT_MUTATE, { action: "create_environment", expectedEnvironmentRevision: 0,
      input: { name: "production" } }) as any;
    const configured = await call(M.BUILD_ENVIRONMENT_MUTATE, { action: "set_config", expectedEnvironmentRevision: env.revision,
      input: { environmentId: env.environmentId, variableName: "PUBLIC_ORIGIN", value: "https://example.test" } }) as any;
    const mapping = await call(M.BUILD_DEPLOYMENT_MAPPING_MUTATE, { action: "set", expectedRevision: 0,
      environmentId: env.environmentId, teamRef: "team-a", projectRef: "production-project", targetRef: "production" }) as any;
    expect(mapping).toMatchObject({ ok: true, revision: 1 });

    const forbiddenGeneric = await call(M.BUILD_DEPLOYMENT_PREPARE, { environmentId: env.environmentId,
      expectedRevision: 1, expectedEnvironmentRevision: configured.revision });
    expect(forbiddenGeneric).toMatchObject({ ok: false, code: "DEPLOY_TARGET_FORBIDDEN" });
    expect(readBuildRecord(root, build.buildId)!.deployments!.pendingOperation).toBeNull();

    const prepared = await call(M.BUILD_PRODUCTION_DEPLOYMENT_PREPARE, { environmentId: env.environmentId,
      expectedRevision: 1, expectedEnvironmentRevision: configured.revision }) as any;
    expect(prepared).toMatchObject({ ok: true, revision: 2 });
    const durable = readBuildRecord(root, build.buildId)!;
    expect(durable.deployments!.pendingOperation).toMatchObject({ state: "prepared", snapshot: {
      sourceSha: build.authoritativeSha, treeSha: expect.any(String), environmentId: env.environmentId,
      environmentRevision: configured.revision, mappingId: mapping.mappingId, provider: "vercel",
      teamRef: "team-a", projectRef: "production-project", target: "production",
      configSnapshot: [{ kind: "config", variableName: "PUBLIC_ORIGIN", value: "https://example.test" }], secretBindings: [],
    } });
    const submitting = call(M.BUILD_PRODUCTION_DEPLOYMENT_SUBMIT, { operationId: prepared.operationId,
      deploymentId: prepared.deploymentId, expectedRevision: prepared.revision });
    await new Promise((resolve) => setTimeout(resolve, 100));
    await deployEntered;
    expect(readBuildRecord(root, build.buildId)!.deployments!.pendingOperation).toMatchObject({
      state: "submitting", submissionBoundaryAt: expect.any(String), reconciliationWindow: {
        windowStart: expect.any(String), windowEnd: expect.any(String),
      },
    });
    // The Build mutation gate remains available while provider work is outstanding.
    const readWhileProviderWaits = await call(M.BUILD_DEPLOYMENTS_LIST);
    expect(readWhileProviderWaits).toMatchObject({ ok: true, pendingOperation: { state: "submitting" } });
    deployGate.unblock?.();
    expect(await submitting).toMatchObject({ ok: true, providerDeploymentId: "dpl_12345678", providerState: "INITIALIZING" });
    expect(providerCalls).toEqual(["production_auth", "production_project", "production_config_metadata",
      "production_config_write", "production_deploy_receipt"]);

    expect(await call(M.BUILD_PRODUCTION_DEPLOYMENT_OBSERVE, { operationId: prepared.operationId,
      deploymentId: prepared.deploymentId })).toMatchObject({ ok: true, revision: 8 });
    expect(providerCalls.slice(-3)).toEqual(["production_auth", "production_project", "production_status"]);
    const final = readBuildRecord(root, build.buildId)!.deployments!;
    expect(final.pendingOperation).toBeNull();
    expect(final.deployments[0]).toMatchObject({ target: "production", operationState: "confirmed",
      providerDeploymentId: "dpl_12345678", providerUrl: "https://candidate.vercel.app", providerState: "READY" });
    expect(final.releases).toEqual([]);
    expect(final.currentProductionReleaseId).toBeNull();
    expect(final.serving).toEqual({ state: "unknown", observedProviderDeploymentId: null, observedAt: null });
  });

  it("uses complete context through default service wiring and the real strict executor before mocked spawn", async () => {
    root = mkdtempSync(join(tmpdir(), "path-p103b-real-boundary-"));
    const project = join(root, "product"); mkdirSync(project);
    const git = (args: string[]) => {
      const result = spawnSync("git", args, { cwd: project, encoding: "utf8" });
      expect(result.status, result.stderr).toBe(0); return result.stdout.trim();
    };
    git(["init", "-q"]); git(["config", "user.email", "path-test@example.test"]); git(["config", "user.name", "PATH Test"]);
    writeFileSync(join(project, "index.html"), "<h1>Boundary candidate</h1>"); git(["add", "."]); git(["commit", "-qm", "source"]);
    const build = createBuildRecordSkeleton({ outcome: "Real executor boundary" });
    build.projectBindings.push({ bindingId: "product", projectRoot: project });
    build.authoritativeSha = git(["rev-parse", "HEAD"]); build.loop.status = "paused";
    build.coordinator = { autoRun: false, owner: "path-build-coordinator" }; writeBuildRecord(root, build);

    const providerDeploymentId = "dpl_12345678";
    const providerUrl = "https://candidate.vercel.app";
    const calls: string[][] = [];
    const spawnStub = vi.fn((_executable: string, argv: string[]) => {
      calls.push(argv);
      const child = new EventEmitter() as any;
      child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough();
      child.kill = vi.fn();
      let output: unknown;
      if (argv[0] === "whoami") output = { username: "creator", loggedIn: true, team: { id: "team-a" } };
      else if (argv[0] === "project") output = { projects: [{ id: "production-project", name: "production-project" }], pagination: { next: null } };
      else if (argv[0] === "env") output = { envs: [] };
      else if (argv[0] === "deploy") output = {};
      else if (argv[0] === "list") {
        const pending = readBuildRecord(root, build.buildId)!.deployments!.pendingOperation! as any;
        output = { contextName: "production-project", deployments: [{ url: "candidate.vercel.app",
          name: "production-project", state: "READY", target: "production", customEnvironment: null,
          createdAt: Date.parse(pending.reconciliationWindow!.windowStart) + 1000,
          meta: { pathOperationId: pending.operationId, pathBuildId: build.buildId,
            pathProjectRef: "production-project" } }], pagination: { count: 1, next: null, prev: null } };
      } else if (argv[0] === "inspect") output = { id: providerDeploymentId, name: "production-project",
        url: "candidate.vercel.app", target: "production", readyState: "READY", createdAt: 1 };
      else throw new Error(`Unexpected command ${argv[0]}`);
      queueMicrotask(() => { child.stdout.end(JSON.stringify(output)); child.emit("close", argv[0] === "deploy" ? 1 : 0); });
      return child;
    });
    service = await createBuildCoordinatorService({ runtimeRoot: root, packageRoot: resolvePathPackageRoot(),
      fakeMode: true, productionSpawnImpl: spawnStub as any });
    const call = (method: string, params: Record<string, unknown> = {}) => service!.dispatch(method, { buildId: build.buildId, ...params });
    const env = await call("build.environments.mutate", { action: "create_environment", expectedEnvironmentRevision: 0,
      input: { name: "production" } }) as any;
    await call("build.deployments.mappingMutate", { action: "set", expectedRevision: 0, environmentId: env.environmentId,
      teamRef: "team-a", projectRef: "production-project", targetRef: "production" });
    const prepared = await call("build.productionDeployments.prepare", { environmentId: env.environmentId,
      expectedRevision: 1, expectedEnvironmentRevision: env.revision }) as any;
    expect(await call("build.productionDeployments.submit", { operationId: prepared.operationId,
      deploymentId: prepared.deploymentId, expectedRevision: prepared.revision }))
      .toMatchObject({ ok: false, code: "PROVIDER_SUBMISSION_OUTCOME_UNKNOWN", state: "uncertain" });
    expect(await call("build.productionDeployments.reconcile", { operationId: prepared.operationId,
      deploymentId: prepared.deploymentId })).toMatchObject({ ok: true, outcome: "UNIQUE_FACTUAL_MATCH",
        match: { providerDeploymentId, url: providerUrl } });
    expect(await call("build.productionDeployments.observe", { operationId: prepared.operationId,
      deploymentId: prepared.deploymentId })).toMatchObject({ ok: true, state: "confirmed" });
    expect(calls.map((argv) => argv[0])).toEqual(["whoami", "project", "env", "deploy", "whoami", "project",
      "list", "inspect", "list", "whoami", "project", "inspect"]);
    expect(calls[1]).toContain("--scope"); expect(calls[1]).toContain("team-a");
    expect(calls[3]).toEqual(expect.arrayContaining(["--target", "production", "--skip-domain", "--json", "--no-wait", "--yes", "--scope", "team-a"]));
    expect(calls[6]).toContain("--environment"); expect(calls[6]).toContain("production");
    expect(calls[6]).not.toContain("--target");
    expect(calls[6]).toContain("--meta");
    expect(calls[7]).toEqual(["inspect", "https://candidate.vercel.app", "--json", "--scope", "team-a"]);
    expect(calls[8]).not.toContain("pathOperationId=");
    expect(calls[11]).toEqual(["inspect", providerDeploymentId, "--json", "--scope", "team-a"]);
    expect(spawnStub).toHaveBeenCalledTimes(12);
  });

  it("allows P9 mutation and local verification after Production preparation, then rejects stale continuation before provider work", async () => {
    root = mkdtempSync(join(tmpdir(), "path-p103b-stale-p9-"));
    const project = join(root, "product"); mkdirSync(project);
    const git = (args: string[]) => {
      const result = spawnSync("git", args, { cwd: project, encoding: "utf8" });
      expect(result.status, result.stderr).toBe(0); return result.stdout.trim();
    };
    git(["init", "-q"]); git(["config", "user.email", "path-test@example.test"]); git(["config", "user.name", "PATH Test"]);
    writeFileSync(join(project, "index.html"), "<h1>Stale P9 candidate</h1>");
    writeFileSync(join(project, ".gitignore"), ".env.local\n"); git(["add", "."]); git(["commit", "-qm", "source"]);
    const build = createBuildRecordSkeleton({ outcome: "Stale P9 snapshot" });
    build.projectBindings.push({ bindingId: "product", projectRoot: project });
    build.authoritativeSha = git(["rev-parse", "HEAD"]); build.loop.status = "paused";
    build.coordinator = { autoRun: false, owner: "path-build-coordinator" }; writeBuildRecord(root, build);
    const executor = vi.fn();
    service = await createBuildCoordinatorService({ runtimeRoot: root, packageRoot: resolvePathPackageRoot(),
      fakeMode: true, productionCommandExecutor: executor });
    const call = (method: string, params: Record<string, unknown> = {}) => service!.dispatch(method, { buildId: build.buildId, ...params });
    const env = await call("build.environments.mutate", { action: "create_environment", expectedEnvironmentRevision: 0,
      input: { name: "production" } }) as any;
    await call("build.deployments.mappingMutate", { action: "set", expectedRevision: 0, environmentId: env.environmentId,
      teamRef: "team-a", projectRef: "production-project", targetRef: "production" });
    const prepared = await call("build.productionDeployments.prepare", { environmentId: env.environmentId,
      expectedRevision: 1, expectedEnvironmentRevision: env.revision }) as any;
    const bound = await call("build.environments.mutate", { action: "bind_secret", expectedEnvironmentRevision: env.revision,
      input: { environmentId: env.environmentId, variableName: "PRODUCT_KEY", backend: "local_env_file" } }) as any;
    expect(bound).toMatchObject({ ok: true });
    writeFileSync(join(project, ".env.local"), "PRODUCT_KEY=LOCAL_ONLY_TEST_VALUE\n");
    const reverified = await call("build.environments.verifyLocal", { environmentId: env.environmentId,
      variableName: "PRODUCT_KEY", expectedEnvironmentRevision: bound.revision });
    expect(reverified).toMatchObject({ ok: true, presenceState: "verified_present", safetyState: "verified_safe" });
    expect(await call("build.productionDeployments.submit", { operationId: prepared.operationId,
      deploymentId: prepared.deploymentId, expectedRevision: prepared.revision }))
      .toMatchObject({ ok: false, code: "ENVIRONMENT_REVISION_STALE" });
    expect(executor).not.toHaveBeenCalled();
    expect(readBuildRecord(root, build.buildId)!.deployments!.pendingOperation)
      .toMatchObject({ operationId: prepared.operationId, state: "prepared", snapshot: { environmentRevision: env.revision } });
  });

  it("keeps Production methods unavailable to the Preview-scoped control plane", async () => {
    root = mkdtempSync(join(tmpdir(), "path-p103b-scoped-"));
    const build = createBuildRecordSkeleton({ outcome: "Scoped" }); writeBuildRecord(root, build);
    service = await createBuildCoordinatorService({ runtimeRoot: root, packageRoot: resolvePathPackageRoot(),
      fakeMode: true, scopedBuildId: build.buildId, productionCommandExecutor: vi.fn() });
    expect(await service.dispatch("build.productionDeployments.prepare", { buildId: build.buildId,
      environmentId: "environment", expectedRevision: 0, expectedEnvironmentRevision: 0 }))
      .toMatchObject({ ok: false, code: "COORDINATOR_SCOPE_FORBIDDEN" });
  });

  it("classifies an uncertain Production submission and never resubmits after zero-zero evidence", async () => {
    root = mkdtempSync(join(tmpdir(), "path-p103b-uncertain-"));
    const project = join(root, "product"); mkdirSync(project);
    const git = (args: string[]) => {
      const result = spawnSync("git", args, { cwd: project, encoding: "utf8" });
      expect(result.status, result.stderr).toBe(0); return result.stdout.trim();
    };
    git(["init", "-q"]); git(["config", "user.email", "path-test@example.test"]); git(["config", "user.name", "PATH Test"]);
    writeFileSync(join(project, "index.html"), "<h1>Uncertain candidate</h1>"); git(["add", "."]); git(["commit", "-qm", "source"]);
    const build = createBuildRecordSkeleton({ outcome: "Uncertain Production" });
    build.projectBindings.push({ bindingId: "product", projectRoot: project });
    build.authoritativeSha = git(["rev-parse", "HEAD"]); build.loop.status = "paused";
    build.coordinator = { autoRun: false, owner: "path-build-coordinator" }; writeBuildRecord(root, build);
    const deploy = vi.fn(async () => ({ ok: false, code: "PROVIDER_SUBMISSION_OUTCOME_UNKNOWN" }));
    const executor = vi.fn(async (_spec: any, options: any) => {
      if (options.mode === "production_auth") return { ok: true, authenticated: true, teamRef: "team-a" };
      if (options.mode === "production_project") return { ok: true, projectId: "prod", projectName: "prod" };
      if (options.mode === "production_config_metadata") return { ok: true, variables: [] };
      if (options.mode === "production_deploy_receipt") return deploy();
      if (options.mode === "production_reconcile_page") return { ok: true, mode: options.context.mode,
        matches: [], nextCursor: null, completed: true };
      throw new Error(`Unexpected mocked provider mode ${options.mode}`);
    });
    service = await createBuildCoordinatorService({ runtimeRoot: root, packageRoot: resolvePathPackageRoot(),
      fakeMode: true, productionCommandExecutor: executor });
    const call = (method: string, params: Record<string, unknown> = {}) => service!.dispatch(method, { buildId: build.buildId, ...params });
    const env = await call("build.environments.mutate", { action: "create_environment", expectedEnvironmentRevision: 0,
      input: { name: "production" } }) as any;
    const mapping = await call("build.deployments.mappingMutate", { action: "set", expectedRevision: 0,
      environmentId: env.environmentId, teamRef: "team-a", projectRef: "prod", targetRef: "production" }) as any;
    expect(mapping.ok).toBe(true);
    const prepared = await call("build.productionDeployments.prepare", { environmentId: env.environmentId,
      expectedRevision: 1, expectedEnvironmentRevision: env.revision }) as any;
    const submitted = await call("build.productionDeployments.submit", { operationId: prepared.operationId,
      deploymentId: prepared.deploymentId, expectedRevision: prepared.revision });
    expect(submitted).toMatchObject({ ok: false, code: "PROVIDER_SUBMISSION_OUTCOME_UNKNOWN", state: "uncertain" });
    expect(readBuildRecord(root, build.buildId)!.deployments!.pendingOperation).toMatchObject({ state: "uncertain" });
    expect(await call("build.productionDeployments.submit", { operationId: prepared.operationId,
      deploymentId: prepared.deploymentId, expectedRevision: readBuildRecord(root, build.buildId)!.deployments!.revision }))
      .toMatchObject({ ok: false, code: "DEPLOY_TRANSITION_INVALID" });
    expect(deploy).toHaveBeenCalledTimes(1);
    const zero = await call("build.productionDeployments.reconcile", { operationId: prepared.operationId,
      deploymentId: prepared.deploymentId });
    expect(zero).toMatchObject({ ok: true, outcome: "VALID_ZERO_ZERO_EVIDENCE_CANDIDATE", match: null });
    expect(deploy).toHaveBeenCalledTimes(1);
    expect(readBuildRecord(root, build.buildId)!.deployments!.pendingOperation).toMatchObject({ state: "uncertain" });
    expect(readBuildRecord(root, build.buildId)!.deployments!.releases).toEqual([]);
  });

  it("does not repeat a Production Config write whose provider outcome is uncertain", async () => {
    root = mkdtempSync(join(tmpdir(), "path-p103b-config-uncertain-"));
    const project = join(root, "product"); mkdirSync(project);
    const git = (args: string[]) => {
      const result = spawnSync("git", args, { cwd: project, encoding: "utf8" });
      expect(result.status, result.stderr).toBe(0); return result.stdout.trim();
    };
    git(["init", "-q"]); git(["config", "user.email", "path-test@example.test"]); git(["config", "user.name", "PATH Test"]);
    writeFileSync(join(project, "index.html"), "<h1>Config uncertain</h1>"); git(["add", "."]); git(["commit", "-qm", "source"]);
    const build = createBuildRecordSkeleton({ outcome: "Production Config uncertain" });
    build.projectBindings.push({ bindingId: "product", projectRoot: project }); build.authoritativeSha = git(["rev-parse", "HEAD"]);
    build.loop.status = "paused"; build.coordinator = { autoRun: false, owner: "path-build-coordinator" }; writeBuildRecord(root, build);
    const configWrite = vi.fn(async () => ({ ok: false, code: "PROVIDER_TIMEOUT" }));
    const deploy = vi.fn();
    const executor = vi.fn(async (_spec: any, options: any) => {
      if (options.mode === "production_auth") return { ok: true, authenticated: true, teamRef: "team-a" };
      if (options.mode === "production_project") return { ok: true, projectId: "prod", projectName: "prod" };
      if (options.mode === "production_config_metadata") return { ok: true, variables: [] };
      if (options.mode === "production_config_write") return configWrite();
      if (options.mode === "production_deploy_receipt") return deploy();
      throw new Error(`Unexpected mocked provider mode ${options.mode}`);
    });
    service = await createBuildCoordinatorService({ runtimeRoot: root, packageRoot: resolvePathPackageRoot(),
      fakeMode: true, productionCommandExecutor: executor });
    const call = (method: string, params: Record<string, unknown> = {}) => service!.dispatch(method, { buildId: build.buildId, ...params });
    const env = await call("build.environments.mutate", { action: "create_environment", expectedEnvironmentRevision: 0,
      input: { name: "production" } }) as any;
    const config = await call("build.environments.mutate", { action: "set_config", expectedEnvironmentRevision: env.revision,
      input: { environmentId: env.environmentId, variableName: "PUBLIC_ORIGIN", value: "https://example.test" } }) as any;
    await call("build.deployments.mappingMutate", { action: "set", expectedRevision: 0, environmentId: env.environmentId,
      teamRef: "team-a", projectRef: "prod", targetRef: "production" });
    const prepared = await call("build.productionDeployments.prepare", { environmentId: env.environmentId,
      expectedRevision: 1, expectedEnvironmentRevision: config.revision }) as any;
    expect(await call("build.productionDeployments.submit", { operationId: prepared.operationId,
      deploymentId: prepared.deploymentId, expectedRevision: prepared.revision }))
      .toMatchObject({ ok: false, code: "PROVIDER_CONFIG_OUTCOME_UNKNOWN", state: "config_projection_incomplete" });
    const pending = readBuildRecord(root, build.buildId)!.deployments!.pendingOperation!;
    expect(pending).toMatchObject({ state: "config_projection_incomplete", configProjectionAttempt: {
      variableName: "PUBLIC_ORIGIN", operation: "add", state: "uncertain",
    } });
    expect(await call("build.productionDeployments.submit", { operationId: prepared.operationId,
      deploymentId: prepared.deploymentId, expectedRevision: readBuildRecord(root, build.buildId)!.deployments!.revision }))
      .toMatchObject({ ok: false, code: "PROVIDER_CONFIG_OUTCOME_UNKNOWN" });
    expect(configWrite).toHaveBeenCalledTimes(1);
    expect(deploy).not.toHaveBeenCalled();
  });
});
