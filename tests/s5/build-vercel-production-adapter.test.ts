import { describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import {
  makeProductionDeployCommand, makeProductionInspectCommand,
  makeProductionConfigCommand,
  makeProductionReconciliationPageCommand, parseProductionDeploymentReceipt,
  parseProductionDeploymentStatus, parseProductionReconciliationPage,
  combineProductionReconciliation, executeProductionVercelCommand,
  reconcileProductionDeployment,
} from "../../scripts/pathcode-cli/build/index.mjs";

const operationId = "11111111-1111-4111-8111-111111111111";
const buildId = "22222222-2222-4222-8222-222222222222";
const providerDeploymentId = "dpl_12345678";
const url = "https://path-production.vercel.app";
const common = { projectRef: "production-project", teamRef: "team-a", operationId, buildId };

describe("P10.3B Production deployment provider boundary; mocked CLI only", () => {
  it("builds a new Production deployment command with automatic domain assignment suppressed", () => {
    const spec = makeProductionDeployCommand(common);
    expect(spec).toMatchObject({ ok: true, executable: "vercel", shell: false });
    expect(spec.argv).toEqual(["deploy", "--target", "production", "--skip-domain", "--project", "production-project",
      "--meta", `pathOperationId=${operationId}`, "--meta", `pathBuildId=${buildId}`,
      "--meta", "pathProjectRef=production-project", "--json", "--no-wait", "--yes", "--scope", "team-a"]);
    expect(spec.argv).not.toContain("--prod");
  });

  it("keeps Production Config values in stdin and out of argv, display, and safe result", async () => {
    const secretLike = "CONFIG_VALUE_SENTINEL_DO_NOT_LOG";
    const spec = makeProductionConfigCommand({ operation: "add", variableName: "PUBLIC_ORIGIN", value: secretLike,
      projectRef: "production-project", teamRef: "team-a" });
    expect(spec.argv).toEqual(["env", "add", "PUBLIC_ORIGIN", "production", "--type", "config", "--yes",
      "--project", "production-project", "--scope", "team-a"]);
    expect(spec.stdinPayload).toBe(secretLike);
    expect(spec.argv.join(" ") + spec.display).not.toContain(secretLike);
    const child = new EventEmitter() as any;
    child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = { end: vi.fn((value?: string) => { if (value) stdin.push(value); }) }; child.kill = vi.fn();
    const stdin: string[] = [];
    const resultPromise = executeProductionVercelCommand(spec, { cwd: "/tmp", mode: "production_config_write",
      context: { operation: "add", variableName: "PUBLIC_ORIGIN", projectRef: "production-project", teamRef: "team-a" },
      spawnImpl: () => child });
    child.emit("close", 0);
    const result = await resultPromise;
    expect(stdin.join("")).toBe(secretLike);
    expect(result).toEqual({ ok: true, acknowledged: true });
    expect(JSON.stringify(result) + JSON.stringify(spec.argv)).not.toContain(secretLike);
  });

  it("reduces the installed CLI 59.10.0 noninteractive deploy JSON receipt without fixture-only fields", () => {
    // Mirrors dist/commands/deploy/index.js:getDeploymentOutputJson (id, url,
    // inspectorUrl, readyState, target, deploymentApiUrl) inside the successful
    // noninteractive { status, deployment, message, next } envelope.
    const cliReceipt = { status: "ok", deployment: { id: providerDeploymentId, url,
      inspectorUrl: "https://vercel.com/acme/project/production-deployment", readyState: "READY",
      target: "production", deploymentApiUrl: "https://api.vercel.com/v13/deployments/dpl_12345678" },
      message: "Deployment ready.", next: [] };
    const reduced = parseProductionDeploymentReceipt(cliReceipt,
      { projectRef: "production-project" });
    expect(reduced).toEqual({ ok: true, providerDeploymentId, url, target: "production", providerState: "READY" });
    expect(parseProductionDeploymentReceipt({ id: providerDeploymentId, url, target: "production", readyState: "READY" },
      { projectRef: "production-project" })).toEqual(reduced);
    expect(parseProductionDeploymentReceipt({ id: providerDeploymentId, url, target: "preview" },
      { projectRef: "production-project" })).toMatchObject({ ok: false, code: "PROVIDER_RECEIPT_UNSAFE" });
    expect(parseProductionDeploymentReceipt({ id: null, url, target: "production" },
      { projectRef: "production-project" })).toMatchObject({ ok: false });
    expect(parseProductionDeploymentReceipt({ id: providerDeploymentId, url, target: "production", secret: "sentinel" },
      { projectRef: "production-project" })).toMatchObject({ ok: false });
    expect(parseProductionDeploymentReceipt({ status: "ok", deployment: { id: providerDeploymentId, url,
      target: "production", readyState: "INITIALIZING" }, secret: "sentinel" }, { projectRef: "production-project" }))
      .toMatchObject({ ok: false, code: "PROVIDER_RECEIPT_UNSAFE" });
  });

  it("requires exact Production project, provider ID, target, state, URL and timestamp for status", () => {
    const raw = { id: providerDeploymentId, name: "production-project", url: "path-production.vercel.app",
      target: "production", readyState: "READY", createdAt: 1, aliases: [] };
    expect(parseProductionDeploymentStatus(raw, { providerDeploymentId, projectName: "production-project", url }))
      .toMatchObject({ ok: true, providerDeploymentId, url, target: "production", providerState: "READY" });
    for (const invalid of [
      { ...raw, id: "dpl_87654321" }, { ...raw, name: "other-project" }, { ...raw, target: "preview" },
      { ...raw, readyState: "UNKNOWN" }, { ...raw, url: "other.vercel.app" }, { ...raw, createdAt: -1 },
      { ...raw, aliases: {} }, { ...raw, leaked: true },
    ]) expect(parseProductionDeploymentStatus(invalid, { providerDeploymentId, projectName: "production-project", url })).toMatchObject({ ok: false });
  });

  it("correlates Production rows to the exact operation and fails closed on missing or duplicate evidence", () => {
    const input = { mode: "METADATA_FILTERED_OPERATION", projectName: "production-project", projectRef: "production-project",
      operationId, buildId, windowStart: "2026-10-06T00:00:00.000Z", windowEnd: "2026-10-06T00:05:00.000Z" };
    const row = { id: providerDeploymentId, url: "path-production.vercel.app", name: "production-project",
      state: "READY", target: "production", customEnvironment: null, createdAt: Date.parse("2026-10-06T00:02:00.000Z"),
      meta: { pathOperationId: operationId, pathBuildId: buildId, pathProjectRef: "production-project" } };
    const page = { contextName: "production-project", deployments: [row], pagination: { count: 1, next: null, prev: null } };
    const result = parseProductionReconciliationPage(page, input);
    expect(result).toMatchObject({ ok: true, matches: [{ providerDeploymentId, url, target: "production" }] });
    expect(parseProductionReconciliationPage({ ...page, deployments: [{ ...row, meta: {} }] }, input))
      .toMatchObject({ ok: false, code: "PROVIDER_RECONCILE_INCOMPLETE" });
    expect(parseProductionReconciliationPage({ ...page, contextName: "other-project" }, input))
      .toMatchObject({ ok: false, code: "PROVIDER_RECONCILE_UNSAFE" });
    const source = (mode: string, matches: unknown[]) => ({ ok: true, completed: true, nextCursor: null, mode, matches });
    const match = result.ok ? result.matches[0] : null;
    expect(combineProductionReconciliation(source("METADATA_FILTERED_OPERATION", [match]),
      source("PROJECT_WINDOW", [match]))).toMatchObject({ ok: true, outcome: "UNIQUE_FACTUAL_MATCH", match: { providerDeploymentId } });
    expect(combineProductionReconciliation(source("METADATA_FILTERED_OPERATION", [match, match]),
      source("PROJECT_WINDOW", [match]))).toMatchObject({ ok: false, outcome: "PROVIDER_RECONCILE_AMBIGUOUS" });
    expect(combineProductionReconciliation(source("METADATA_FILTERED_OPERATION", [match]),
      source("PROJECT_WINDOW", []))).toMatchObject({ ok: false, outcome: "PROVIDER_RECONCILE_CONFLICT" });
    expect(combineProductionReconciliation(source("METADATA_FILTERED_OPERATION", [match]),
      source("PROJECT_WINDOW", [{ ...match, createdAt: match.createdAt + 1 }]))).toMatchObject({ ok: false, outcome: "PROVIDER_RECONCILE_CONFLICT" });
    expect(combineProductionReconciliation(source("METADATA_FILTERED_OPERATION", []),
      source("PROJECT_WINDOW", []))).toMatchObject({ ok: true, outcome: "VALID_ZERO_ZERO_EVIDENCE_CANDIDATE" });
  });

  it("uses the exact read-only Production list and inspect command forms", () => {
    expect(makeProductionInspectCommand({ providerDeploymentId, teamRef: "team-a" }).argv)
      .toEqual(["inspect", providerDeploymentId, "--json", "--scope", "team-a"]);
    expect(makeProductionReconciliationPageCommand({ ...common, mode: "PROJECT_WINDOW",
      windowStart: "2026-10-06T00:00:00.000Z", windowEnd: "2026-10-06T00:05:00.000Z" }).argv)
      .toEqual(["list", "production-project", "--target", "production", "--json", "--limit", "100",
        "--scope", "team-a"]);
  });

  it("completes missing row IDs with one cached read-only inspect before provider-ID combination", async () => {
    const input = { ...common, projectName: "production-project", windowStart: "2026-10-06T00:00:00.000Z",
      windowEnd: "2026-10-06T00:05:00.000Z" };
    const row: any = { url: "path-production.vercel.app", name: "production-project", state: "READY", target: "production",
      customEnvironment: null, createdAt: Date.parse("2026-10-06T00:02:00.000Z"),
      meta: { pathOperationId: operationId, pathBuildId: buildId, pathProjectRef: "production-project" } };
    const identity = vi.fn(async (_spec: any, context: any) => ({ ok: true, providerDeploymentId,
      url: context.url, providerState: "READY", target: "production", createdAt: row.createdAt }));
    const result = await reconcileProductionDeployment(input, {
      executePage: async (_spec: any, context: any) => ({ ok: true, mode: context.mode, matches: [{
        providerDeploymentId: null, url, providerState: "READY", target: "production", createdAt: row.createdAt,
      }], nextCursor: null, completed: true }),
      executeIdentity: identity,
    });
    expect(result).toMatchObject({ ok: true, outcome: "UNIQUE_FACTUAL_MATCH", match: { providerDeploymentId, url } });
    expect(identity).toHaveBeenCalledTimes(1);
  });

  it("does not let a first-source identity cache rescue invalid second-source list evidence", async () => {
    const input = { ...common, projectName: "production-project", windowStart: "2026-10-06T00:00:00.000Z",
      windowEnd: "2026-10-06T00:05:00.000Z" };
    const at = Date.parse("2026-10-06T00:02:00.000Z");
    const baseRow = { url: "path-production.vercel.app", name: "production-project", state: "READY", target: "production",
      customEnvironment: null, createdAt: at, meta: { pathOperationId: operationId, pathBuildId: buildId,
        pathProjectRef: "production-project" } };
    const identity = vi.fn(async (_spec: any, context: any) => ({ ok: true, providerDeploymentId,
      url: context.url, providerState: "READY", target: "production", createdAt: at }));
    const result = await reconcileProductionDeployment(input, {
      executePage: async (_spec: any, context: any) => {
        const row = context.mode === "METADATA_FILTERED_OPERATION" ? baseRow : { ...baseRow, meta: {} };
        return parseProductionReconciliationPage({ contextName: "production-project", deployments: [row],
          pagination: { count: 1, next: null, prev: null } }, { ...input, mode: context.mode });
      },
      executeIdentity: identity,
    });
    expect(identity).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ ok: false, outcome: "PROVIDER_RECONCILE_INCOMPLETE" });
  });

  it("rejects mutated deploy arguments before spawn and reduces mocked execution without raw forwarding", async () => {
    const spawnImpl = vi.fn(() => { throw new Error("must not spawn invalid command"); });
    const command = makeProductionDeployCommand(common);
    const invalid = await executeProductionVercelCommand({ ...command, argv: [...command.argv, "--debug"] }, {
      cwd: "/tmp", mode: "production_deploy_receipt", context: common, spawnImpl: spawnImpl as any,
    });
    expect(invalid).toMatchObject({ ok: false, code: "PROVIDER_COMMAND_INVALID" });
    expect(spawnImpl).not.toHaveBeenCalled();

    const child = new EventEmitter() as any;
    child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough();
    child.kill = vi.fn();
    const safeSpawn = vi.fn(() => child);
    const resultPromise = executeProductionVercelCommand(command, { cwd: "/tmp", mode: "production_deploy_receipt",
      context: common, spawnImpl: safeSpawn });
    child.stdout.end(JSON.stringify({ id: providerDeploymentId, url, target: "production", readyState: "INITIALIZING" }));
    child.emit("close", 0);
    const result = await resultPromise;
    expect(result).toEqual({ ok: true, providerDeploymentId, url, target: "production", providerState: "INITIALIZING" });
    expect(JSON.stringify(result)).not.toContain("raw");
  });
});
