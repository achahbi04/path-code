import { describe, expect, it } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { parseVercelConfigMetadata, planVercelConfigProjection, makeVercelConfigCommand,
  createVercelChildEnv, makePreviewReadCommands, makePreviewDeployCommand,
  makePreviewInspectCommand, makePreviewReconcileCommand, parsePreviewAuth,
  parsePreviewProjectList, parsePreviewDeploymentReceipt, parsePreviewDeploymentStatus,
  parsePreviewReconciliation, executeVercelAdapterCommand } from "../../scripts/pathcode-cli/build/index.mjs";

const operationId = "11111111-1111-4111-8111-111111111111";
const id = "dpl_12345678";
const projectRef = "project-a";

describe("P10.2A installed CLI 59.10.0 preview contracts; no provider calls", () => {
  it("reduces readable Config and rejects plaintext Secret without leaking either sentinel", () => {
    const configSentinel = "P10_CONFIG_RAW_SENTINEL";
    const secretSentinel = "P10_SECRET_RAW_SENTINEL";
    const raw = { envs: [{ key: "API_URL", type: "encrypted", visibility: "config", target: ["preview"],
      value: configSentinel, gitBranch: null }] };
    const safe = parseVercelConfigMetadata(raw);
    expect(safe).toEqual({ ok: true, variables: [{ name: "API_URL", visibility: "config", target: "preview", origin: "unknown" }] });
    expect(JSON.stringify(safe)).not.toContain(configSentinel);
    const secret = parseVercelConfigMetadata({ envs: [{ key: "API_KEY", type: "sensitive", visibility: "secret",
      target: ["preview"], value: secretSentinel }] });
    expect(secret).toEqual({ ok: false, code: "PROVIDER_METADATA_UNSAFE" });
    expect(JSON.stringify(secret)).not.toContain(secretSentinel);
    expect(parseVercelConfigMetadata({ envs: [{ ...raw.envs[0], visibility: "secret" }] })).toMatchObject({ ok: false });
    expect(parseVercelConfigMetadata({ envs: [{ ...raw.envs[0], gitBranch: "main" }] })).toMatchObject({ ok: false });
  });

  it("retains drift checks and does not infer origin from a variable name", () => {
    const metadata = parseVercelConfigMetadata({ envs: [{ key: "EXTRA", type: "encrypted", visibility: "config", target: ["preview"], value: "hidden" }] });
    expect(planVercelConfigProjection({ config: [], metadata, target: "preview" })).toMatchObject({ ok: false, code: "PROVIDER_CONFIG_EXTRA" });
    const system = parseVercelConfigMetadata({ envs: [{ key: "SYSTEM_X", type: "system", visibility: "config", target: ["preview"] }] });
    expect(planVercelConfigProjection({ config: [], metadata: system, target: "preview" })).toMatchObject({ ok: true });
    const secret = parseVercelConfigMetadata({ envs: [{ key: "API_URL", type: "sensitive", visibility: "secret", target: ["preview"] }] });
    expect(planVercelConfigProjection({ config: [{ kind: "config", variableName: "API_URL", value: "x" }], metadata: secret, target: "preview" }))
      .toMatchObject({ ok: false, code: "PROVIDER_CONFIG_CONFLICT" });
    const duplicate = parseVercelConfigMetadata({ envs: [
      { key: "API_URL", type: "encrypted", visibility: "config", target: ["preview"] },
      { key: "API_URL", type: "encrypted", visibility: "config", target: ["preview"] },
    ] });
    expect(planVercelConfigProjection({ config: [{ kind: "config", variableName: "API_URL", value: "x" }], metadata: duplicate, target: "preview" }))
      .toMatchObject({ ok: false, code: "PROVIDER_CONFIG_AMBIGUOUS" });
  });

  it("uses typed Config add/update, scoped project, stdin only, and no shell", () => {
    const sentinel = "P10_LIVE_CONFIG_SENTINEL_DO_NOT_EXPOSE";
    for (const operation of ["add", "update"]) {
      const c = makeVercelConfigCommand({ operation, variableName: "PUBLIC_URL", target: "preview", value: sentinel,
        projectRef, teamRef: "team-a" });
      expect(c).toMatchObject({ ok: true, shell: false, stdinPayload: sentinel });
      expect(c.argv).toEqual(["env", operation, "PUBLIC_URL", "preview", "--type", "config", "--yes", "--project", projectRef, "--scope", "team-a"]);
      expect(JSON.stringify(c.argv) + c.display).not.toContain(sentinel);
      expect(c.argv).not.toContain("--value");
    }
    // CLI treats empty stdin as missing and strips a sole trailing newline.
    expect(makeVercelConfigCommand({ operation: "add", variableName: "X", target: "preview", value: "" })).toMatchObject({ ok: false });
    expect(makeVercelConfigCommand({ operation: "update", variableName: "X", target: "preview", value: "line\n" })).toMatchObject({ ok: false });
  });

  it("constructs narrow child env and exact read/preview/inspect/reconciliation commands", () => {
    const child = createVercelChildEnv({ PATH: "/bin", HOME: "/creator", OPENAI_API_KEY: "engine", GH_TOKEN: "github",
      VERCEL_TOKEN: "token", P9_CONFIG: "product", PATHCODE_X: "operator" });
    expect(child).toMatchObject({ PATH: "/bin", HOME: "/creator", NO_COLOR: "1" });
    expect(JSON.stringify(child)).not.toMatch(/engine|github|token|product|operator/);
    const read = makePreviewReadCommands({ projectRef, teamRef: "team-a" }) as { config: { argv: string[] }; auth: { argv: string[] } };
    expect(read.config.argv).toEqual(["env", "ls", "preview", "--json", "--project", projectRef, "--scope", "team-a"]);
    expect(read.auth.argv).toContain("whoami");
    const deploy = makePreviewDeployCommand({ projectRef, teamRef: "team-a", operationId }) as { argv: string[]; shell: boolean };
    expect(deploy.argv).toContain("pathOperationId=" + operationId);
    expect(deploy.argv).toContain("preview");
    expect(deploy.argv).not.toContain("--prod");
    expect(deploy.argv).not.toContain("--env");
    expect(deploy.shell).toBe(false);
    expect(makePreviewDeployCommand({ projectRef, operationId: "bad" })).toMatchObject({ ok: false });
    expect((makePreviewInspectCommand({ providerDeploymentId: id }) as { argv: string[] }).argv).toEqual(["inspect", id, "--json"]);
    expect((makePreviewReconcileCommand({ projectRef, operationId }) as { argv: string[] }).argv)
      .toContain("pathOperationId=" + operationId);
  });

  it("reduces auth/project and deployment receipt/status; rejects extra raw value fields", () => {
    expect(parsePreviewAuth({ username: "creator", email: "private@example.test", team: { id: "team-a", slug: "team-a" } }, "team-a"))
      .toEqual({ ok: true, authenticated: true, teamRef: "team-a" });
    expect(parsePreviewAuth({ loggedIn: false })).toMatchObject({ ok: false });
    const projects = { projects: [{ id: "project-a", name: "project-a", latestProductionUrl: "private" }],
      pagination: { next: null }, contextName: "creator", elapsed: 10 };
    expect(parsePreviewProjectList(projects, { projectRef })).toEqual({ ok: true, projectId: projectRef, projectName: projectRef });
    expect(parsePreviewProjectList({ ...projects, pagination: { next: 123 } }, { projectRef })).toMatchObject({ ok: false });
    const receipt = { id, url: "https://example.vercel.app", inspectorUrl: null,
      readyState: "BUILDING", target: "preview", deploymentApiUrl: "https://api.vercel.com" };
    expect(parsePreviewDeploymentReceipt(receipt)).toMatchObject({ ok: true, providerDeploymentId: id, providerState: "BUILDING" });
    expect(parsePreviewDeploymentReceipt({ ...receipt, target: null, readyState: null })).toMatchObject({ ok: true, target: null, providerState: null });
    expect(parsePreviewDeploymentReceipt({ status: "ok", deployment: receipt, message: "ignore", next: [] })).toMatchObject({ ok: true });
    expect(parsePreviewDeploymentReceipt({ ...receipt, value: "P10_PROVIDER_VALUE_SENTINEL" })).toEqual({ ok: false, code: "PROVIDER_RECEIPT_UNSAFE" });
    const status = { id, name: projectRef, url: "example.vercel.app", target: "preview", readyState: "READY", createdAt: 1 };
    expect(parsePreviewDeploymentStatus(status, id)).toMatchObject({ ok: true, providerState: "READY" });
    expect(parsePreviewDeploymentStatus({ ...status, env: { API_KEY: "hidden" } }, id)).toMatchObject({ ok: false });
    expect(parsePreviewDeploymentStatus(status, "dpl_other123")).toMatchObject({ ok: false });
  });

  it("reconciles only exact operation metadata; zero or ambiguous matches never retry", () => {
    const row = { id, url: "example.vercel.app", name: projectRef, state: "READY", target: "preview",
      createdAt: 1, meta: { pathOperationId: operationId } };
    const listing = { contextName: "creator", deployments: [row], pagination: { next: null } };
    expect(parsePreviewReconciliation(listing, { projectRef, operationId })).toMatchObject({ ok: true,
      match: { providerDeploymentId: id }, retry: false });
    expect(parsePreviewReconciliation({ ...listing, deployments: [] }, { projectRef, operationId }))
      .toEqual({ ok: true, match: null, retry: false });
    expect(parsePreviewReconciliation({ ...listing, deployments: [row, row] }, { projectRef, operationId }))
      .toMatchObject({ ok: false, code: "PROVIDER_RECONCILE_AMBIGUOUS" });
    expect(parsePreviewReconciliation({ ...listing, deployments: [{ ...row, meta: { pathOperationId: "other" } }] }, { projectRef, operationId }))
      .toMatchObject({ ok: false });
  });

  it("executor sends value via stdin with isolated env, returns only parsed facts", async () => {
    const sentinel = "P10_LIVE_CONFIG_SENTINEL_DO_NOT_EXPOSE";
    let observed: any = null;
    const fakeSpawn = (_bin: string, argv: string[], options: any) => {
      observed = { argv, options };
      const child = new EventEmitter() as any;
      child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
      let payload = "";
      child.stdin.on("data", (data: Buffer) => { payload += data.toString(); });
      child.stdin.on("finish", () => { observed.payload = payload; child.stdout.end(JSON.stringify({ acknowledged: true, value: sentinel }));
        queueMicrotask(() => child.emit("close", 0)); });
      child.kill = () => {};
      return child;
    };
    const spec = makeVercelConfigCommand({ operation: "add", variableName: "PUBLIC_URL", target: "preview", value: sentinel, projectRef });
    const result = await executeVercelAdapterCommand(spec, { cwd: "/tmp", parentEnv: { PATH: "/bin", OPENAI_API_KEY: "engine" },
      spawnImpl: fakeSpawn, mode: "config_write" });
    expect(result).toEqual({ ok: true, acknowledged: true });
    expect(observed.payload).toBe(sentinel);
    expect(JSON.stringify(observed.argv) + JSON.stringify(observed.options)).not.toContain(sentinel);
    expect(observed.options).toMatchObject({ shell: false, env: { PATH: "/bin", NO_COLOR: "1" } });
    expect(JSON.stringify(observed.options)).not.toContain("engine");
  });

  it("classifies installed noninteractive deployment envelopes without returning raw diagnostics", async () => {
    const receipt = { id, url: "https://example.vercel.app", inspectorUrl: null,
      readyState: "BUILDING", target: "preview", deploymentApiUrl: "https://api.vercel.com/v13/deployments/dpl_12345678" };
    const success = { status: "ok", deployment: receipt, message: "Deployment example.vercel.app ready.",
      next: [{ command: "vercel inspect example.vercel.app", when: "Inspect deployment" }] };
    expect(parsePreviewDeploymentReceipt(success)).toEqual({ ok: true, providerDeploymentId: id,
      url: receipt.url, target: "preview", providerState: "BUILDING" });
    expect(JSON.stringify(parsePreviewDeploymentReceipt(success))).not.toContain("inspectorUrl");
    const error = { status: "error", reason: "project_not_found", message: "RAW_DIAGNOSTIC_SENTINEL", next: [] };
    expect(parsePreviewDeploymentReceipt(error)).toEqual({ ok: false, code: "PROVIDER_SUBMISSION_REJECTED" });
    expect(JSON.stringify(parsePreviewDeploymentReceipt(error))).not.toContain("RAW_DIAGNOSTIC_SENTINEL");
    expect(parsePreviewDeploymentReceipt({ ...error, reason: "deploy_failed" }))
      .toEqual({ ok: false, code: "PROVIDER_SUBMISSION_OUTCOME_UNKNOWN" });
    expect(parsePreviewDeploymentReceipt({ ...error, deployment: receipt })).toEqual({ ok: false, code: "PROVIDER_RECEIPT_UNSAFE" });
    expect(parsePreviewDeploymentReceipt({ ...success, token: "SECRET_SENTINEL" })).toEqual({ ok: false, code: "PROVIDER_RECEIPT_UNSAFE" });
    expect(parsePreviewDeploymentReceipt({ ...receipt, value: "SECRET_SENTINEL" })).toEqual({ ok: false, code: "PROVIDER_RECEIPT_UNSAFE" });
    expect(parsePreviewDeploymentReceipt([{ ...success }, { ...success }])).toEqual({ ok: false, code: "PROVIDER_RECEIPT_UNSAFE" });
    const fakeSpawn = (_bin: string, _argv: string[], _options: unknown) => {
      const child = new EventEmitter() as any;
      child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
      child.stdin.on("finish", () => { child.stdout.end(JSON.stringify(error)); queueMicrotask(() => child.emit("close", 1)); });
      child.kill = () => {};
      return child;
    };
    const command = makePreviewDeployCommand({ projectRef, operationId });
    const result = await executeVercelAdapterCommand(command, { cwd: "/tmp", mode: "deploy_receipt", spawnImpl: fakeSpawn });
    expect(result).toEqual({ ok: false, code: "PROVIDER_SUBMISSION_REJECTED" });
    expect(JSON.stringify(result)).not.toContain("RAW_DIAGNOSTIC_SENTINEL");
  });
});
