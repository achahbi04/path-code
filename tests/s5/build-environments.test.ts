import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createBuildRecordSkeleton, createBuildCoordinatorService, readBuildEvents,
  readBuildRecord, writeBuildRecord, resolveBuildRecordPath,
  listBuildEnvironments, readBuildEnvironment, readBuildSecretBinding,
} from "../../scripts/pathcode-cli/build/index.mjs";
import { resolvePathPackageRoot } from "../../scripts/pathcode-cli/paths.mjs";

describe("P9.1 reference-only Build environment authority", () => {
  let runtimeRoot = "";
  let service: Awaited<ReturnType<typeof createBuildCoordinatorService>> | null = null;
  const ids: string[] = [];

  afterEach(async () => {
    await service?.close();
    service = null;
    if (runtimeRoot) rmSync(runtimeRoot, { recursive: true, force: true });
    runtimeRoot = "";
    ids.length = 0;
  });

  async function setup() {
    runtimeRoot = mkdtempSync(join(tmpdir(), "path-p9-environments-"));
    for (const name of ["a", "b"]) {
      const record = createBuildRecordSkeleton({ outcome: `Build ${name}` });
      record.projectBindings.push({ bindingId: `binding-${name}`, projectRoot: join(runtimeRoot, `project-${name}`) });
      record.loop.status = "paused";
      writeBuildRecord(runtimeRoot, record);
      ids.push(record.buildId);
    }
    service = await createBuildCoordinatorService({ runtimeRoot, packageRoot: resolvePathPackageRoot(), fakeMode: true });
    await service.whenReady;
    const dispatch = (method: string, params: Record<string, unknown>) => service!.dispatch(method, params);
    const mutate = (buildId: string, action: string, expectedEnvironmentRevision: number, input: Record<string, unknown>) =>
      dispatch("build.environments.mutate", { buildId, action, expectedEnvironmentRevision, input });
    return { dispatch, mutate, a: ids[0]!, b: ids[1]! };
  }

  it("keeps old records readable, generates opaque IDs, and serializes revision guarded edits", async () => {
    const { dispatch, mutate, a } = await setup();
    expect(readBuildRecord(runtimeRoot, a)?.environments).toBeUndefined();
    expect(listBuildEnvironments(runtimeRoot, a)).toMatchObject({ ok: true, revision: 0, items: [] });
    const created = await mutate(a, "create_environment", 0, { name: "Development" });
    expect(created).toMatchObject({ ok: true, revision: 1 });
    expect(created.environmentId).toMatch(/^[0-9a-f-]{36}$/);
    const envId = created.environmentId;
    expect(await mutate(a, "create_environment", 1, { name: "development" })).toMatchObject({ ok: false, code: "ENVIRONMENT_NAME_CONFLICT" });
    expect(await mutate(a, "rename_environment", 1, { environmentId: envId, name: "Local" })).toMatchObject({ ok: true, revision: 2 });
    expect(readBuildEnvironment(runtimeRoot, a, envId)).toMatchObject({ ok: true, environment: { environmentId: envId, name: "Local" } });
    expect(await mutate(a, "set_config", 1, { environmentId: envId, variableName: "PUBLIC_API_URL", value: "https://example.test" })).toMatchObject({ ok: false, code: "ENVIRONMENT_REVISION_STALE" });
    const [first, second] = await Promise.all([
      mutate(a, "set_config", 2, { environmentId: envId, variableName: "PUBLIC_API_URL", value: "https://example.test" }),
      mutate(a, "set_config", 2, { environmentId: envId, variableName: "FEATURE_FLAG", value: "on" }),
    ]);
    expect([first.ok, second.ok].sort()).toEqual([false, true]);
    expect(listBuildEnvironments(runtimeRoot, a)).toMatchObject({ revision: 3 });
    expect(await mutate(a, "set_config", 3, { environmentId: envId, variableName: "DISPLAY_NAME", value: "Example" })).toMatchObject({ ok: true, revision: 4 });
    const beforeRead = readFileSync(resolveBuildRecordPath(runtimeRoot, a), "utf8");
    expect(readBuildEnvironment(runtimeRoot, a, envId)).toMatchObject({ ok: true, environment: {
      variables: expect.arrayContaining([{ kind: "config", variableName: "DISPLAY_NAME", value: "Example",
        createdAt: expect.any(String), updatedAt: expect.any(String) }]),
    } });
    expect(await dispatch("build.environments.list", { buildId: a })).toMatchObject({ ok: true, revision: 4 });
    expect(readFileSync(resolveBuildRecordPath(runtimeRoot, a), "utf8")).toBe(beforeRead);
    expect(await mutate(a, "delete_environment", 4, { environmentId: envId })).toMatchObject({ ok: false, code: "ENVIRONMENT_NOT_EMPTY" });
  });

  it("stores only unknown-presence descriptors and rejects secret material everywhere", async () => {
    const { mutate, a } = await setup();
    const envId = (await mutate(a, "create_environment", 0, { name: "production" })).environmentId;
    const sentinel = "do-not-persist-secret-material";
    for (const key of ["value", "secretValue", "plaintext", "token", "password", "providerProjectRef"]) {
      expect(await mutate(a, "bind_secret", 1, { environmentId: envId, variableName: "STRIPE_SECRET_KEY", backend: "vercel_env", [key]: sentinel })).toMatchObject({ ok: false });
    }
    expect(await mutate(a, "set_config", 1, { environmentId: envId, variableName: "STRIPE_SECRET_KEY", value: sentinel })).toMatchObject({ ok: false, code: "CONFIG_SECRET_NAME_REJECTED" });
    expect(await mutate(a, "set_config", 1, { environmentId: envId, variableName: "PUBLIC_API_URL", value: "Bearer fake-token" })).toMatchObject({ ok: false, code: "CONFIG_VALUE_INVALID" });
    for (const variableName of ["PATHCODE_INTERNAL", "OPENAI_API_KEY", "CURSOR_API_KEY", "GH_TOKEN", "VERCEL_TOKEN"]) {
      expect(await mutate(a, "bind_secret", 1, { environmentId: envId, variableName, backend: "vercel_env" })).toMatchObject({ ok: false, code: "VARIABLE_NAME_RESERVED" });
    }
    const bound = await mutate(a, "bind_secret", 1, { environmentId: envId, variableName: "STRIPE_SECRET_KEY", backend: "vercel_env" });
    expect(bound).toMatchObject({ ok: true, revision: 2 });
    const ref = bound.secretRef;
    const read = readBuildSecretBinding(runtimeRoot, a, envId, ref);
    expect(read).toMatchObject({ ok: true, binding: {
      secretRef: ref, backend: "vercel_env", bindingState: "configured", presenceState: "unknown",
      descriptor: { provider: "vercel", teamRef: null, projectRef: null, targetRef: null, bindingRef: null },
    } });
    expect(JSON.stringify(read)).not.toContain(sentinel);
    expect(readFileSync(resolveBuildRecordPath(runtimeRoot, a), "utf8")).not.toContain(sentinel);
    expect(JSON.stringify(readBuildEvents(runtimeRoot, a))).not.toContain(sentinel);
    expect(existsSync(join(runtimeRoot, "project-a", ".env.local"))).toBe(false);
  });

  it("admits benign creator GIT names while reserving evidenced Git controls", async () => {
    const { mutate, a } = await setup();
    const envId = (await mutate(a, "create_environment", 0, { name: "development" })).environmentId;
    for (const [index, variableName] of ["GIT_PRODUCT_NAME", "GIT_COMMIT_DISPLAY", "GIT_FEATURE_ENABLED"].entries()) {
      expect(await mutate(a, "set_config", index + 1, { environmentId: envId, variableName, value: `ordinary-${index}` }))
        .toMatchObject({ ok: true, revision: index + 2 });
    }
    expect(readBuildEnvironment(runtimeRoot, a, envId)).toMatchObject({ ok: true, environment: {
      variables: expect.arrayContaining([
        expect.objectContaining({ kind: "config", variableName: "GIT_PRODUCT_NAME", value: "ordinary-0" }),
        expect.objectContaining({ kind: "config", variableName: "GIT_COMMIT_DISPLAY", value: "ordinary-1" }),
        expect.objectContaining({ kind: "config", variableName: "GIT_FEATURE_ENABLED", value: "ordinary-2" }),
      ]),
    } });
    for (const variableName of [
      "GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR", "GIT_DISCOVERY_ACROSS_FILESYSTEM",
      "GIT_CONFIG_GLOBAL", "GIT_CONFIG_SYSTEM", "GIT_CONFIG_NOSYSTEM", "GIT_CONFIG_COUNT",
      "GIT_CONFIG_KEY_0", "GIT_CONFIG_VALUE_0", "GIT_CEILING_DIRECTORIES",
      "GIT_ASKPASS", "GIT_TERMINAL_PROMPT", "GIT_OPTIONAL_LOCKS", "GIT_NO_REPLACE_OBJECTS",
      "GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL", "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL",
      "PATHCODE_RUNTIME_ROOT", "OPENAI_API_KEY", "VERCEL_TOKEN",
    ]) {
      expect(await mutate(a, "set_config", 4, { environmentId: envId, variableName, value: "ordinary" }))
        .toMatchObject({ ok: false, code: "VARIABLE_NAME_RESERVED" });
    }
    expect(await mutate(a, "set_config", 4, { environmentId: envId, variableName: "GIT_PRODUCT_SECRET", value: "ordinary" }))
      .toMatchObject({ ok: false, code: "CONFIG_SECRET_NAME_REJECTED" });
    expect(await mutate(a, "set_config", 4, { environmentId: envId, variableName: "GIT_PRODUCT_NAME", value: "Bearer disguised-value" }))
      .toMatchObject({ ok: false, code: "CONFIG_VALUE_INVALID" });
    expect(listBuildEnvironments(runtimeRoot, a)).toMatchObject({ revision: 4 });
  });

  it("requires explicit kind/backend replacement and leaves external material untouched on unbind/delete", async () => {
    const { mutate, a } = await setup();
    const envId = (await mutate(a, "create_environment", 0, { name: "local" })).environmentId;
    expect(await mutate(a, "set_config", 1, { environmentId: envId, variableName: "FEATURE_FLAG", value: "on" })).toMatchObject({ ok: true, revision: 2 });
    expect(await mutate(a, "bind_secret", 2, { environmentId: envId, variableName: "FEATURE_FLAG", backend: "local_env_file" })).toMatchObject({ ok: false, code: "VARIABLE_KIND_CONFLICT" });
    const local = await mutate(a, "bind_secret", 2, { environmentId: envId, variableName: "FEATURE_FLAG", backend: "local_env_file", replace: true });
    expect(local).toMatchObject({ ok: true, revision: 3 });
    expect(readBuildSecretBinding(runtimeRoot, a, envId, local.secretRef)).toMatchObject({ ok: true, binding: {
      descriptor: { source: ".env.local" }, presenceState: "unknown", safetyState: "unknown",
    } });
    expect(await mutate(a, "set_config", 3, { environmentId: envId, variableName: "FEATURE_FLAG", value: "off" })).toMatchObject({ ok: false, code: "VARIABLE_KIND_CONFLICT" });
    expect(await mutate(a, "set_config", 3, { environmentId: envId, variableName: "FEATURE_FLAG", value: "off", replace: true })).toMatchObject({ ok: true, revision: 4 });
    expect(readBuildSecretBinding(runtimeRoot, a, envId, local.secretRef)).toMatchObject({ ok: false, code: "SECRET_BINDING_NOT_FOUND" });
    const bound = await mutate(a, "bind_secret", 4, { environmentId: envId, variableName: "PRODUCT_KEY", backend: "local_env_file" });
    expect(await mutate(a, "unbind_secret", 5, { environmentId: envId, variableName: "PRODUCT_KEY" })).toMatchObject({ ok: true, backendMaterialChanged: false, revision: 6 });
    expect(await mutate(a, "remove_config", 6, { environmentId: envId, variableName: "FEATURE_FLAG" })).toMatchObject({ ok: true, revision: 7 });
    expect(await mutate(a, "delete_environment", 7, { environmentId: envId })).toMatchObject({ ok: true, revision: 8 });
    expect(readBuildSecretBinding(runtimeRoot, a, envId, bound.secretRef)).toMatchObject({ ok: false });
  });

  it("rejects foreign environment and secret IDs without exposing another Build", async () => {
    const { mutate, a, b } = await setup();
    const envId = (await mutate(a, "create_environment", 0, { name: "private" })).environmentId;
    const ref = (await mutate(a, "bind_secret", 1, { environmentId: envId, variableName: "PRODUCT_KEY", backend: "local_env_file" })).secretRef;
    expect(readBuildEnvironment(runtimeRoot, b, envId)).toMatchObject({ ok: false, code: "ENVIRONMENT_NOT_FOUND" });
    expect(readBuildSecretBinding(runtimeRoot, b, envId, ref)).toMatchObject({ ok: false, code: "ENVIRONMENT_NOT_FOUND" });
    expect(await mutate(b, "unbind_secret", 0, { environmentId: envId, variableName: "PRODUCT_KEY" })).toMatchObject({ ok: false, code: "ENVIRONMENT_NOT_FOUND" });
    expect(listBuildEnvironments(runtimeRoot, b)).toMatchObject({ revision: 0, items: [] });
    expect(await mutate(a, "bind_secret", 2, { environmentId: envId, variableName: "PUBLIC_PRODUCT_KEY", backend: "local_env_file" })).toMatchObject({ ok: false, code: "SECRET_PUBLIC_NAME_REJECTED" });
  });
});
