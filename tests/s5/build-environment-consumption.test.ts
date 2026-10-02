import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createBuildRecordSkeleton, writeBuildRecord, readBuildRecord, readBuildEvents,
  createBuildCoordinatorService, createProductRuntimeEnv,
  createBuildRuntimeManager,
} from "../../scripts/pathcode-cli/build/index.mjs";
const { runPathcodeDoctor } = await import(new URL("../../scripts/pathcode-cli/ag5/doctor.mjs", import.meta.url).href);
import { resolveExactLocalEnvValues } from "../../scripts/pathcode-cli/build/runtime/local-env-resolve.mjs";
import { inspectVercelEnvironmentMetadata, verifyVercelEnvironmentPresence } from "../../scripts/pathcode-cli/build/vercel-metadata.mjs";
import { resolvePathPackageRoot } from "../../scripts/pathcode-cli/paths.mjs";

const dirs: string[] = [];
const services: Array<Awaited<ReturnType<typeof createBuildCoordinatorService>>> = [];
function temp(prefix: string) { const dir = mkdtempSync(join(tmpdir(), prefix)); dirs.push(dir); return dir; }
afterEach(async () => {
  for (const service of services.splice(0)) await service.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function setup() {
  const runtimeRoot = temp("p9-b-runtime-");
  const projectRoot = temp("p9-b-product-");
  const git = (args: string[]) => spawnSync("git", args, { cwd: projectRoot, encoding: "utf8" });
  expect(git(["init", "-q"]).status).toBe(0);
  writeFileSync(join(projectRoot, ".gitignore"), ".env.local\n");
  const build = createBuildRecordSkeleton({ outcome: "Product" });
  build.projectBindings.push({ bindingId: "binding", projectRoot });
  build.loop.status = "paused";
  writeBuildRecord(runtimeRoot, build);
  const service = await createBuildCoordinatorService({ runtimeRoot, packageRoot: resolvePathPackageRoot(), fakeMode: true });
  await service.whenReady;
  services.push(service);
  const dispatch = (method: string, params: Record<string, unknown>) => service.dispatch(method, params);
  const mutate = (action: string, revision: number, input: Record<string, unknown>) =>
    dispatch("build.environments.mutate", { buildId: build.buildId, action, expectedEnvironmentRevision: revision, input });
  const env = await mutate("create_environment", 0, { name: "my mutable label" });
  expect(env.ok).toBe(true);
  return { runtimeRoot, projectRoot, buildId: build.buildId, environmentId: env.environmentId as string, dispatch, mutate, git };
}

const plan = { kind: "spawn", port: 4321, env: { PORT: "4321", HOST: "127.0.0.1", HOSTNAME: "127.0.0.1" } };

describe("P9.2B exact local product consumer", () => {
  it("selects by opaque environmentId and combines only bound config/local secret with the contained host env", async () => {
    const x = await setup();
    expect(await x.mutate("set_config", 1, { environmentId: x.environmentId, variableName: "FEATURE_FLAG", value: "on" })).toMatchObject({ ok: true, revision: 2 });
    expect(await x.mutate("bind_secret", 2, { environmentId: x.environmentId, variableName: "PRODUCT_KEY", backend: "local_env_file" })).toMatchObject({ ok: true, revision: 3 });
    writeFileSync(join(x.projectRoot, ".env.local"), " # comment\n PRODUCT_KEY = 'P9_LOCAL_SECRET_SENTINEL=ok' # note\n");
    const selection = { runtimeRoot: x.runtimeRoot, buildId: x.buildId, environmentId: x.environmentId, projectRoot: x.projectRoot };
    const host = { PATH: process.env.PATH, OPENAI_API_KEY: "OPERATOR_SENTINEL", VERCEL_TOKEN: "OPERATOR_SENTINEL" };
    const before = { ...process.env };
    expect(createProductRuntimeEnv(plan, host)).not.toHaveProperty("PRODUCT_KEY");
    const child = createProductRuntimeEnv(plan, host, selection);
    expect(child).toMatchObject({ FEATURE_FLAG: "on", PRODUCT_KEY: "P9_LOCAL_SECRET_SENTINEL=ok", PORT: "4321" });
    expect(child).not.toHaveProperty("OPENAI_API_KEY");
    expect(child).not.toHaveProperty("VERCEL_TOKEN");
    expect(process.env).toEqual(before);
    expect(() => createProductRuntimeEnv(plan, host, { ...selection, environmentId: "my mutable label" })).toThrow();
    expect(() => createProductRuntimeEnv(plan, host, { ...selection, buildId: "foreign" })).toThrow();
    expect(JSON.stringify(readBuildRecord(x.runtimeRoot, x.buildId))).not.toContain("P9_LOCAL_SECRET_SENTINEL");
    expect(JSON.stringify(readBuildEvents(x.runtimeRoot, x.buildId))).not.toContain("P9_LOCAL_SECRET_SENTINEL");
  });

  it("blocks native loader bypass, unsafe Git state, and protected controls", async () => {
    const x = await setup();
    await x.mutate("bind_secret", 1, { environmentId: x.environmentId, variableName: "PRODUCT_KEY", backend: "local_env_file" });
    const selection = { runtimeRoot: x.runtimeRoot, buildId: x.buildId, environmentId: x.environmentId, projectRoot: x.projectRoot };
    writeFileSync(join(x.projectRoot, ".env.local"), "PRODUCT_KEY=ok\nUNBOUND_SECRET=do-not-read\n");
    expect(() => createProductRuntimeEnv(plan, process.env, selection)).toThrow();
    expect(resolveExactLocalEnvValues({ projectRoot: x.projectRoot, exactNames: ["PRODUCT_KEY"], allowedNativeNames: ["PRODUCT_KEY"] }))
      .toMatchObject({ ok: false, code: "LOCAL_ENV_NATIVE_LOAD_UNSAFE" });
    writeFileSync(join(x.projectRoot, ".env.local"), "PRODUCT_KEY=ok\n");
    expect(createProductRuntimeEnv(plan, process.env, selection)).toHaveProperty("PRODUCT_KEY", "ok");
    expect(x.git(["add", "-f", ".env.local"]).status).toBe(0);
    expect(() => createProductRuntimeEnv(plan, process.env, selection)).toThrow();
    expect(await x.mutate("set_config", 2, { environmentId: x.environmentId, variableName: "PORT", value: "bad" })).toMatchObject({ ok: true });
    expect(() => createProductRuntimeEnv(plan, process.env, selection)).toThrow();
  });

  it("parses a narrow grammar, rejects duplicates and shell/interpolation syntax, and never returns an unrequested value", async () => {
    const x = await setup();
    const file = join(x.projectRoot, ".env.local");
    writeFileSync(file, " A = \"alpha=one\" # comment\nB=unrequested-sentinel\n");
    const allowed = ["A", "B"];
    const result = resolveExactLocalEnvValues({ projectRoot: x.projectRoot, exactNames: ["A"], allowedNativeNames: allowed });
    expect(result).toMatchObject({ ok: true, values: { A: "alpha=one" } });
    expect(JSON.stringify(result)).not.toContain("unrequested-sentinel");
    for (const content of ["A=1\nA=2\n", "export A=1\n", "A=$(whoami)\n", "A=\\n", "A=1#ambiguous\n"]) {
      writeFileSync(file, content);
      expect(resolveExactLocalEnvValues({ projectRoot: x.projectRoot, exactNames: ["A"], allowedNativeNames: allowed }).ok).toBe(false);
    }
  });

  it("does not borrow a missing local value from parent env or another backend", async () => {
    const x = await setup();
    await x.mutate("bind_secret", 1, { environmentId: x.environmentId, variableName: "PRODUCT_KEY", backend: "local_env_file" });
    writeFileSync(join(x.projectRoot, ".env.local"), "# empty\n");
    const selected = { runtimeRoot: x.runtimeRoot, buildId: x.buildId,
      environmentId: x.environmentId, projectRoot: x.projectRoot };
    expect(resolveExactLocalEnvValues({ projectRoot: x.projectRoot,
      exactNames: ["PRODUCT_KEY"], allowedNativeNames: ["PRODUCT_KEY"] }))
      .toMatchObject({ ok: false, code: "LOCAL_SECRET_MISSING" });
    const prior = process.env.PRODUCT_KEY;
    try {
      process.env.PRODUCT_KEY = "PARENT_SECRET_SENTINEL";
      expect(() => createProductRuntimeEnv(plan, process.env, selected)).toThrow();
    } finally {
      if (prior === undefined) delete process.env.PRODUCT_KEY;
      else process.env.PRODUCT_KEY = prior;
    }
    expect(await x.mutate("bind_secret", 2, { environmentId: x.environmentId,
      variableName: "PRODUCT_KEY", backend: "vercel_env", replace: true })).toMatchObject({ ok: true });
    expect(() => createProductRuntimeEnv(plan, process.env, selected)).toThrow();
  });

  it("records local verification facts without value or secretRef in audit and rejects a replaced binding", async () => {
    const x = await setup();
    const bound = await x.mutate("bind_secret", 1, { environmentId: x.environmentId, variableName: "PRODUCT_KEY", backend: "local_env_file" });
    writeFileSync(join(x.projectRoot, ".env.local"), "PRODUCT_KEY=VERIFICATION_SENTINEL\n");
    const verified = await x.dispatch("build.environments.verifyLocal", { buildId: x.buildId, environmentId: x.environmentId,
      variableName: "PRODUCT_KEY", expectedEnvironmentRevision: 2 });
    expect(verified).toMatchObject({ ok: true, revision: 3, presenceState: "verified_present", safetyState: "verified_safe" });
    expect(JSON.stringify(verified)).not.toContain("VERIFICATION_SENTINEL");
    expect(JSON.stringify(readBuildEvents(x.runtimeRoot, x.buildId))).not.toContain(bound.secretRef);
    expect(JSON.stringify(readBuildEvents(x.runtimeRoot, x.buildId))).not.toContain("VERIFICATION_SENTINEL");
    expect(await x.mutate("bind_secret", 3, { environmentId: x.environmentId, variableName: "PRODUCT_KEY", backend: "local_env_file", replace: true }))
      .toMatchObject({ ok: true, revision: 4 });
    expect(await x.dispatch("build.environments.verifyLocal", { buildId: x.buildId, environmentId: x.environmentId,
      variableName: "PRODUCT_KEY", expectedEnvironmentRevision: 3 })).toMatchObject({ ok: false, code: "STALE_ENVIRONMENT_AUTHORITY" });
    const replacement = readBuildRecord(x.runtimeRoot, x.buildId)!.environments!.items[0]!.variables[0]!;
    expect(replacement).toMatchObject({ presenceState: "unknown", safetyState: "unknown" });
    expect(JSON.stringify(readBuildRecord(x.runtimeRoot, x.buildId))).not.toContain("VERIFICATION_SENTINEL");
  });

  it("starts a product child with only the selected binding and keeps it out of runtime records and doctor", async () => {
    const x = await setup();
    const bound = await x.mutate("bind_secret", 1, { environmentId: x.environmentId, variableName: "PRODUCT_KEY", backend: "local_env_file" });
    writeFileSync(join(x.projectRoot, ".env.local"), "PRODUCT_KEY=CHILD_ONLY_SENTINEL\n");
    writeFileSync(join(x.projectRoot, "package.json"), JSON.stringify({ scripts: { start: "node server.mjs" } }));
    writeFileSync(join(x.projectRoot, "server.mjs"), `
      import { createServer } from 'node:http';
      createServer((req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ hasProductKey: process.env.PRODUCT_KEY === 'CHILD_ONLY_SENTINEL',
          hasOperatorKey: Boolean(process.env.OPENAI_API_KEY) }));
      }).listen(Number(process.env.PORT), process.env.HOST);
    `);
    const manager = createBuildRuntimeManager({ runtimeRoot: x.runtimeRoot });
    try {
      const started = await manager.start(x.buildId, x.projectRoot, { environmentId: x.environmentId });
      expect(started.ok).toBe(true);
      if (!started.ok) return;
      expect(await (await fetch(started.runtime.url)).json()).toEqual({ hasProductKey: true, hasOperatorKey: false });
      expect(JSON.stringify(started)).not.toContain("CHILD_ONLY_SENTINEL");
      expect(JSON.stringify(await manager.inspect(x.buildId))).not.toContain("CHILD_ONLY_SENTINEL");
      const runtimeState = readFileSync(join(x.runtimeRoot, "metadata", "build-runtimes", `${x.buildId}.runtime.json`), "utf8");
      expect(runtimeState).not.toContain("CHILD_ONLY_SENTINEL");
      const report = runPathcodeDoctor({ buildId: x.buildId, runtimeRoot: x.runtimeRoot,
        packageRoot: resolvePathPackageRoot(), cwd: x.projectRoot,
        env: { PATH: process.env.PATH, HOME: temp("p9-b-doctor-home-") } });
      expect(JSON.stringify(report)).toContain("PRODUCT_KEY");
      expect(JSON.stringify(report)).not.toContain("CHILD_ONLY_SENTINEL");
      const p9Rows = report.rows.filter((row: { name: string }) => row.name.startsWith("P9 "));
      expect(JSON.stringify(p9Rows)).not.toContain(x.projectRoot);
      expect(JSON.stringify(report)).not.toContain(bound.secretRef);
    } finally { await manager.stopAll(); }
  }, 30_000);
});

describe("P9.2B Vercel metadata boundary", () => {
  it("fails closed on any value field and has no live provider verification path", () => {
    const sentinel = "P9_TEST_PROVIDER_SECRET_SENTINEL";
    const expected = { variableName: "PRODUCT_KEY", targetRef: "production" };
    const unsafe = inspectVercelEnvironmentMetadata({ envs: [{ key: "PRODUCT_KEY", target: ["production"], value: sentinel }] }, expected);
    expect(unsafe).toEqual({ ok: false, code: "PROVIDER_METADATA_UNSAFE" });
    expect(JSON.stringify(unsafe)).not.toContain(sentinel);
    expect(inspectVercelEnvironmentMetadata({ envs: [{ key: "PRODUCT_KEY", target: ["production"] }] }, expected))
      .toMatchObject({ ok: true, presenceState: "verified_present" });
    expect(verifyVercelEnvironmentPresence()).toMatchObject({ ok: false, code: "PROVIDER_VERIFICATION_UNAVAILABLE" });
  });

  it("stores only explicit locators and keeps Vercel presence unknown", async () => {
    const x = await setup();
    const bound = await x.mutate("bind_secret", 1, { environmentId: x.environmentId,
      variableName: "PRODUCT_KEY", backend: "vercel_env" });
    expect(await x.mutate("set_vercel_locator", 2, { environmentId: x.environmentId,
      variableName: "PRODUCT_KEY", secretRef: bound.secretRef,
      projectRef: "prj_factual", targetRef: "production", teamRef: null, bindingRef: null }))
      .toMatchObject({ ok: true, revision: 3 });
    const entry = readBuildRecord(x.runtimeRoot, x.buildId)!.environments!.items[0]!.variables[0]!;
    expect(entry).toMatchObject({ presenceState: "unknown", descriptor: { projectRef: "prj_factual", targetRef: "production" } });
    expect(await x.dispatch("build.environments.verifyLocal", { buildId: x.buildId,
      environmentId: x.environmentId, variableName: "PRODUCT_KEY", expectedEnvironmentRevision: 3 }))
      .toMatchObject({ ok: false, code: "SECRET_BINDING_NOT_FOUND" });
    expect(JSON.stringify(readBuildRecord(x.runtimeRoot, x.buildId))).not.toContain("P9_TEST_PROVIDER_SECRET_SENTINEL");
  });
});
