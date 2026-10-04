import { describe, expect, it } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import {
  PREVIEW_RECONCILIATION_CODES as C, MAX_RECONCILIATION_PAGES,
  MAX_RECONCILIATION_INSPECTIONS, makePreviewReconciliationPageCommand,
  parsePreviewReconciliationPage, combinePreviewReconciliation,
  makeNoDeploymentObservedEvidence, reconcilePreviewWindow,
  makePreviewReconcileCommand, parsePreviewReconciliation,
  parsePreviewDeploymentStatus, executeVercelAdapterCommand,
} from "../../scripts/pathcode-cli/build/index.mjs";

const operationId = "11111111-1111-4111-8111-111111111111";
const projectRef = "project-a";
const windowStart = "2026-10-03T19:30:00.000Z";
const windowEnd = "2026-10-03T20:15:00.000Z";
const at = (time: string) => Date.parse(time);
const context = { projectRef, projectName: projectRef, operationId, windowStart, windowEnd };
const filtered = "METADATA_FILTERED_OPERATION";
const projectWindow = "PROJECT_WINDOW";
const row = (id = "dpl_12345678", time = "2026-10-03T19:45:00.000Z", meta: object | undefined = { pathOperationId: operationId }) =>
  ({ id, url: `example-${id.slice(4)}.vercel.app`, name: projectRef, state: "READY", target: "preview",
    createdAt: at(time), ...(meta === undefined ? {} : { meta }) });
const page = (deployments: object[], next: number | null = null) =>
  ({ contextName: "creator", deployments, pagination: { count: deployments.length, next, prev: null } });
const reduced = (mode: string, deployments: object[] = [], next: number | null = null) =>
  parsePreviewReconciliationPage(page(deployments, next), { ...context, mode }) as any;
const complete = (mode: string, matches: object[] = []) => ({ ok: true, mode, windowStart, windowEnd,
  completed: true, exhausted: true, nextCursor: null, matches, exactMatchCount: matches.length,
  totalDeploymentsObserved: matches.length });
const safeMatch = (providerDeploymentId: string) => ({ providerDeploymentId,
  url: `https://example-${providerDeploymentId.slice(4)}.vercel.app`, providerState: "READY",
  target: "preview", createdAt: at("2026-10-03T19:45:00.000Z") });

function fakeSpawnFor(pages: (argv: string[]) => object, seen: string[][] = []) {
  return (_bin: string, argv: string[], options: any) => {
    expect(options.shell).toBe(false);
    seen.push([...argv]);
    const child = new EventEmitter() as any;
    child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.stdin.on("finish", () => {
      child.stdout.end(JSON.stringify(pages(argv)));
      queueMicrotask(() => child.emit("close", 0));
    });
    child.kill = () => {};
    return child;
  };
}

describe("bounded Preview reconciliation through installed CLI list shape", () => {
  it("preserves legacy no-window command, single-page result and ambiguity code", () => {
    const legacy = makePreviewReconcileCommand({ projectRef, operationId }) as any;
    expect(legacy.argv).not.toContain("--next");
    expect(legacy.argv).toContain(`pathOperationId=${operationId}`);
    expect(parsePreviewReconciliation(page([row()]), { projectRef, operationId })).toMatchObject({
      ok: true, match: { providerDeploymentId: "dpl_12345678" }, retry: false });
    expect(parsePreviewReconciliation(page([row(), row("dpl_87654321")]), { projectRef, operationId }))
      .toEqual({ ok: false, code: C.AMBIGUOUS });
    expect(C.AMBIGUOUS).toBe("PROVIDER_RECONCILE_AMBIGUOUS");
    expect(new Set(Object.values(C)).size).toBe(Object.values(C).length);
  });

  it("requires a canonical shared bounded window and constructs only read commands", () => {
    for (const changes of [{ windowStart: undefined }, { windowEnd: undefined },
      { windowStart: "bad" }, { windowEnd: "bad" }, { windowStart: windowEnd },
      { windowStart: "2026-10-03T20:16:00.000Z" }])
      expect(makePreviewReconciliationPageCommand({ ...context, mode: filtered, ...changes })).toEqual({ ok: false, code: C.INVALID });
    const f = makePreviewReconciliationPageCommand({ ...context, mode: filtered, teamRef: "team_a" }) as any;
    const p = makePreviewReconciliationPageCommand({ ...context, mode: projectWindow, nextCursor: 123 }) as any;
    expect(f.argv).toEqual(["list", projectRef, "--environment", "preview", "--meta",
      `pathOperationId=${operationId}`, "--json", "--limit", "100", "--scope", "team_a"]);
    expect(p.argv).toEqual(["list", projectRef, "--environment", "preview", "--json", "--limit", "100", "--next", "123"]);
    expect(f.shell).toBe(false);
    expect(MAX_RECONCILIATION_PAGES).toBe(20);
    expect(MAX_RECONCILIATION_INSPECTIONS).toBe(20);
  });

  it("executor refuses an altered bounded-list command before any provider spawn", async () => {
    const spec = makePreviewReconciliationPageCommand({ ...context, mode: projectWindow }) as any;
    let spawned = false;
    const spawnImpl = () => { spawned = true; throw new Error("must not spawn"); };
    const bad = { ...spec, argv: [...spec.argv, "--all"] };
    const result = await executeVercelAdapterCommand(bad, { cwd: "/tmp", mode: "reconcile_page",
      context: { ...context, mode: projectWindow, teamRef: null, nextCursor: null }, spawnImpl });
    expect(result).toEqual({ ok: false, code: "PROVIDER_COMMAND_INVALID" });
    expect(spawned).toBe(false);
  });

  it("uses creation time for membership, ignores lifecycle times and unrelated metadata", () => {
    const inside = { ...row(), buildingAt: at("2026-10-03T21:00:00.000Z"), ready: at("2026-10-03T21:05:00.000Z"),
      meta: { pathOperationId: operationId, opaque: "RAW_METADATA_SENTINEL" } };
    const newer = row("dpl_newer123", "2026-10-03T20:16:00.000Z");
    const older = row("dpl_older123", "2026-10-03T19:29:00.000Z");
    const result = reduced(projectWindow, [newer, inside, older]);
    expect(result).toMatchObject({ ok: true, exactMatchCount: 1, totalDeploymentsObserved: 1,
      matches: [{ providerDeploymentId: "dpl_12345678", createdAt: at("2026-10-03T19:45:00.000Z") }] });
    expect(JSON.stringify(result)).not.toContain("RAW_METADATA_SENTINEL");
    const mutableOnly = { ...row(), createdAt: undefined, buildingAt: at("2026-10-03T19:45:00.000Z") };
    expect(reduced(projectWindow, [mutableOnly])).toEqual({ ok: false, code: C.UNSAFE });
    expect(reduced(projectWindow, [{ ...row(), target: null }])).toMatchObject({
      ok: true, exactMatchCount: 1, matches: [{ target: "preview" }] });
  });

  it("keeps provider cursor factual, handles non-monotonic rows, and fails unsafe pages", () => {
    const first = reduced(projectWindow, [row()], 123);
    expect(first).toMatchObject({ ok: true, exhausted: false, nextCursor: 123 });
    const second = reduced(projectWindow, [row("dpl_older123", "2026-10-03T19:00:00.000Z")], 80);
    expect(second).toMatchObject({ ok: true, exhausted: false, nextCursor: 80, exactMatchCount: 0 });
    expect(reduced(projectWindow, [row("dpl_later123")])).toMatchObject({ ok: true, exhausted: true, exactMatchCount: 1 });
    expect(reduced(projectWindow, [{ ...row(), env: { API_KEY: "RAW_SECRET_SENTINEL" } }]))
      .toEqual({ ok: false, code: C.UNSAFE });
    expect(reduced(projectWindow, [{ ...row(), createdAt: undefined }])).toEqual({ ok: false, code: C.UNSAFE });
    expect(reduced(filtered, [{ ...row(), meta: { pathOperationId: "another" } }])).toEqual({ ok: false, code: C.UNSAFE });
    expect(parsePreviewDeploymentStatus({ ...row(), readyState: "READY" }, "dpl_12345678"))
      .toMatchObject({ ok: false }); // status parser is not metadata-aware
  });

  it("matches only exact operation metadata; absent list metadata cannot create correspondence", () => {
    const other = { ...row("dpl_other123", "2026-10-03T19:45:00.000Z") } as Record<string, unknown>;
    delete other.meta;
    expect(reduced(projectWindow, [other])).toMatchObject({ ok: true, exactMatchCount: 0, totalDeploymentsObserved: 1 });
    expect(reduced(projectWindow, [row("dpl_other123", "2026-10-03T19:45:00.000Z", { pathOperationId: "other" })]))
      .toMatchObject({ ok: true, exactMatchCount: 0 });
    expect(reduced(projectWindow, [row()])).toMatchObject({ ok: true, exactMatchCount: 1 });
  });

  it("applies one canonical combiner to zero, unique, conflict, ambiguity and incomplete", () => {
    const zeroF = complete(filtered), zeroP = complete(projectWindow);
    const oneF = complete(filtered, [safeMatch("dpl_12345678")]);
    const oneP = complete(projectWindow, [safeMatch("dpl_12345678")]);
    expect(combinePreviewReconciliation(zeroF, zeroP)).toMatchObject({ ok: true, outcome: "VALID_ZERO_ZERO_EVIDENCE_CANDIDATE", retry: false });
    expect(combinePreviewReconciliation(oneF, oneP)).toMatchObject({ ok: true, outcome: "UNIQUE_FACTUAL_MATCH", retry: false });
    expect(combinePreviewReconciliation(complete(filtered, [{ ...safeMatch("dpl_12345678"),
      env: { TOKEN: "RAW_SECRET_SENTINEL" } }]), oneP)).toEqual({ ok: false, code: C.INCOMPLETE });
    expect(combinePreviewReconciliation(oneF, zeroP)).toEqual({ ok: false, code: C.CONFLICT });
    expect(combinePreviewReconciliation(zeroF, oneP)).toEqual({ ok: false, code: C.CONFLICT });
    expect(combinePreviewReconciliation(oneF, complete(projectWindow, [safeMatch("dpl_other123")])))
      .toEqual({ ok: false, code: C.CONFLICT });
    expect(combinePreviewReconciliation(complete(filtered, [safeMatch("dpl_12345678"),
      safeMatch("dpl_87654321")]), zeroP)).toEqual({ ok: false, code: C.AMBIGUOUS });
    expect(combinePreviewReconciliation({ ...zeroF, nextCursor: 123, exhausted: false }, zeroP))
      .toEqual({ ok: false, code: C.INCOMPLETE });
    expect(combinePreviewReconciliation(zeroF, { ...zeroP, windowEnd: windowStart }))
      .toEqual({ ok: false, code: C.INCOMPLETE });
  });

  it("maps reporting fields explicitly into frozen B5R evidence", () => {
    const identity = { buildId: "22222222-2222-4222-8222-222222222222", operationId,
      deploymentId: "33333333-3333-4333-8333-333333333333",
      mappingId: "44444444-4444-4444-8444-444444444444", teamRef: "team_a", projectRef, target: "preview" };
    const evidence = makeNoDeploymentObservedEvidence(identity, complete(filtered),
      { ...complete(projectWindow), totalDeploymentsObserved: 7 }, "2026-10-03T21:00:00.000Z") as any;
    expect(evidence.ok).toBe(true);
    expect(evidence.evidence.metadataFilteredLookup).toEqual({ completed: true, exhausted: true, nextCursor: null, exactMatchCount: 0 });
    expect(evidence.evidence.projectWindowLookup).toEqual({ completed: true, exhausted: true, nextCursor: null, exactOperationMatchCount: 0 });
    expect(JSON.stringify(evidence)).not.toContain("totalDeploymentsObserved");
    expect(makeNoDeploymentObservedEvidence(identity, complete(filtered),
      { ...complete(projectWindow), exhausted: false }, "2026-10-03T21:00:00.000Z"))
      .toEqual({ ok: false, code: C.INCOMPLETE });
  });

  it("traverses both sources to natural exhaustion with the exact cursor and same window", async () => {
    const seen: string[][] = [];
    const spawn = fakeSpawnFor((argv) => {
      const isFiltered = argv.includes("--meta");
      const hasNext = argv.includes("--next");
      if (!hasNext) return page(isFiltered ? [] : [row("dpl_older123", "2026-10-03T19:00:00.000Z")], 123);
      return page(isFiltered ? [] : [row()], null);
    }, seen);
    const result = await reconcilePreviewWindow(context, { cwd: "/tmp", spawnImpl: spawn }) as any;
    expect(result).toMatchObject({ ok: false, code: C.CONFLICT });
    expect(seen).toHaveLength(4);
    expect(seen[1]).toContain("123"); expect(seen[3]).toContain("123");
    expect(seen.every((argv) => argv[0] === "list" && !argv.includes("--prod"))).toBe(true);
  });

  it("reaches factual zero/zero after natural exhaustion, including unrelated project deployments", async () => {
    const seen: string[][] = [];
    const unrelated = { ...row("dpl_other123") } as Record<string, unknown>;
    delete unrelated.meta;
    const spawn = fakeSpawnFor((argv) => page(argv.includes("--meta") ? [] : [unrelated]), seen);
    const result = await reconcilePreviewWindow(context, { cwd: "/tmp", spawnImpl: spawn }) as any;
    expect(result).toMatchObject({ ok: true, outcome: "VALID_ZERO_ZERO_EVIDENCE_CANDIDATE",
      metadataFilteredLookup: { exhausted: true, nextCursor: null, exactMatchCount: 0 },
      projectWindowLookup: { exhausted: true, nextCursor: null, exactMatchCount: 0,
        totalDeploymentsObserved: 1, inspectionCount: 0 }, retry: false });
    expect(seen).toHaveLength(2);
    expect(seen.every((argv) => argv[0] === "list" && !argv.includes("inspect"))).toBe(true);
  });

  it("repeats read-only reconciliation for the same operation and frozen window without a submission", async () => {
    const seen: string[][] = [];
    const spawn = fakeSpawnFor(() => page([]), seen);
    const first = await reconcilePreviewWindow(context, { cwd: "/tmp", spawnImpl: spawn });
    const second = await reconcilePreviewWindow(context, { cwd: "/tmp", spawnImpl: spawn });
    expect(second).toEqual(first);
    expect(first).toMatchObject({ ok: true, outcome: "VALID_ZERO_ZERO_EVIDENCE_CANDIDATE",
      windowStart, windowEnd, retry: false });
    expect(seen).toHaveLength(4);
    expect(seen.every((argv) => argv[0] === "list" && !argv.includes("deploy"))).toBe(true);
  });

  it("continues across inside/older/inside pages and never turns them into false zero", async () => {
    const seen: string[][] = [];
    const spawn = fakeSpawnFor((argv) => {
      const cursor = argv.indexOf("--next");
      if (cursor < 0) return page([row()], 200);
      if (argv[cursor + 1] === "200") return page([row("dpl_older123", "2026-10-03T19:00:00.000Z")], 100);
      return page([row("dpl_later123")], null);
    }, seen);
    const result = await reconcilePreviewWindow(context, { cwd: "/tmp", spawnImpl: spawn });
    expect(result).toEqual({ ok: false, code: C.AMBIGUOUS });
    expect(seen).toHaveLength(6);
  });

  it("returns incomplete at a remaining cursor/page bound and never authorizes zero", async () => {
    let count = 0;
    const spawn = fakeSpawnFor(() => { count += 1; return page([], count + 100); });
    const result = await reconcilePreviewWindow(context, { cwd: "/tmp", spawnImpl: spawn });
    expect(result).toEqual({ ok: false, code: C.INCOMPLETE });
    expect(count).toBe(MAX_RECONCILIATION_PAGES);
  });

  it("fails closed on an unsafe later page without returning raw provider data", async () => {
    let count = 0;
    const spawn = fakeSpawnFor(() => { count += 1; return count === 1 ? page([], 123) :
      page([{ ...row(), env: { TOKEN: "RAW_SECRET_SENTINEL" } }], null); });
    const result = await reconcilePreviewWindow(context, { cwd: "/tmp", spawnImpl: spawn });
    expect(result).toEqual({ ok: false, code: C.INCOMPLETE });
    expect(JSON.stringify(result)).not.toContain("RAW_SECRET_SENTINEL");
  });

  it("pure non-authoritative outcomes cannot mutate a pending PATH operation or authorize another submission", () => {
    const pending = Object.freeze({ operationId, deploymentId: "deployment-a", state: "uncertain",
      providerDeploymentId: null, windowStart, windowEnd });
    const zeroF = complete(filtered), zeroP = complete(projectWindow);
    for (const result of [
      combinePreviewReconciliation({ ...zeroF, exhausted: false, nextCursor: 99 }, zeroP),
      combinePreviewReconciliation(complete(filtered, [safeMatch("dpl_12345678")]), zeroP),
      combinePreviewReconciliation(complete(filtered, [safeMatch("dpl_12345678"),
        safeMatch("dpl_87654321")]), zeroP),
    ]) {
      expect(result).toMatchObject({ ok: false });
      expect(JSON.stringify(result)).not.toContain("retry\":true");
      expect(pending).toEqual({ operationId, deploymentId: "deployment-a", state: "uncertain",
        providerDeploymentId: null, windowStart, windowEnd });
    }
  });
});
