import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createBuildRecordSkeleton, recoverDeploymentFoundation,
  transitionDeploymentOperation, PREVIEW_DEPLOY_EXECUTION_TIMEOUT_MS,
  PROVIDER_CREATION_TIME_SAFETY_ALLOWANCE_MS,
  DEPLOY_RECONCILIATION_WINDOW_MISSING } from "../../scripts/pathcode-cli/build/index.mjs";
import type { NoDeploymentObservedReconciliationEvidence } from "../../scripts/pathcode-cli/build/index.mjs";

const operationId = "11111111-1111-1111-1111-111111111111";
const deploymentId = "22222222-2222-2222-2222-222222222222";
const mappingId = "33333333-3333-3333-3333-333333333333";
const failureCode = "PROVIDER_SUBMISSION_NOT_OBSERVED";
const at = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

function fixture(ageMs = 600_000, submissionLagMs = 600_000, referenceNowMs = Date.now()) {
  const record = createBuildRecordSkeleton({ outcome: "Preview" });
  const uncertainAt = new Date(referenceNowMs - ageMs).toISOString();
  const submissionBoundaryAt = new Date(referenceNowMs - ageMs - submissionLagMs).toISOString();
  const reconciliationWindow = {
    windowStart: new Date(Date.parse(submissionBoundaryAt) - PROVIDER_CREATION_TIME_SAFETY_ALLOWANCE_MS).toISOString(),
    windowEnd: new Date(Date.parse(submissionBoundaryAt) + PREVIEW_DEPLOY_EXECUTION_TIMEOUT_MS +
      PROVIDER_CREATION_TIME_SAFETY_ALLOWANCE_MS).toISOString(),
  };
  record.deployments = {
    schema: "pathcode.p10.deployments.v1", revision: 4,
    mappings: [{ mappingId, environmentId: "environment-a", provider: "vercel", teamRef: "team_a",
      projectRef: "project-a", targetRef: "preview", updatedAt: uncertainAt }],
    deployments: [{ deploymentId, operationId, target: "preview", mappingId, environmentId: "environment-a",
      sourceSha: "source-a", providerDeploymentId: null, providerUrl: null, providerState: null,
      operationState: "uncertain", failureCode: null, requestedAt: submissionBoundaryAt, completedAt: null,
      submissionBoundaryAt, reconciliationWindow }],
    releases: [], currentProductionReleaseId: null,
    serving: { state: "unknown", observedProviderDeploymentId: null, observedAt: null },
    pendingOperation: { operationId, deploymentId, kind: "deploy", state: "uncertain", providerDeploymentId: null,
      snapshot: { mappingId, environmentId: "environment-a", sourceSha: "source-a" },
      createdAt: submissionBoundaryAt, updatedAt: uncertainAt, submissionBoundaryAt, reconciliationWindow },
  };
  const evidence: NoDeploymentObservedReconciliationEvidence = {
    buildId: record.buildId, operationId, deploymentId, mappingId, teamRef: "team_a",
    projectRef: "project-a", target: "preview", pathOperationId: operationId,
    windowStart: reconciliationWindow.windowStart, windowEnd: reconciliationWindow.windowEnd,
    metadataFilteredLookup: { completed: true, exhausted: true, nextCursor: null, exactMatchCount: 0 },
    projectWindowLookup: { completed: true, exhausted: true, nextCursor: null, exactOperationMatchCount: 0 },
    completedAt: new Date(referenceNowMs).toISOString(),
  };
  return { record, evidence };
}

function close(record: ReturnType<typeof fixture>["record"], evidence: object,
  overrides: Record<string, unknown> = {}) {
  return transitionDeploymentOperation(record, { operationId, deploymentId, state: "failed", failureCode,
    reconciliationEvidence: evidence, ...overrides });
}

describe("P10 uncertain submission with no observed provider deployment", () => {
  it("keeps the canonical provider-time allowance rationale and window formula in source", () => {
    const source = readFileSync(new URL("../../scripts/pathcode-cli/build/deployments.mjs", import.meta.url), "utf8");
    const declaration = source.indexOf("export const PROVIDER_CREATION_TIME_SAFETY_ALLOWANCE_MS");
    expect(declaration).toBeGreaterThan(0);
    const contract = source.slice(source.lastIndexOf("/**", declaration), declaration);
    expect(contract).toMatch(/PATH\/provider clock offset/i);
    expect(contract).toMatch(/provider-side latency[\s\S]*deployment-createdAt stamp/i);
    expect(contract).toMatch(/\*\/\s*$/);
    const windowFunction = source.match(/function submissionWindow\(boundaryAt\) \{([\s\S]*?)\n\}/)?.[1];
    expect(windowFunction).toBeDefined();
    expect(windowFunction).toMatch(/windowStart:\s*new Date\(boundary - PROVIDER_CREATION_TIME_SAFETY_ALLOWANCE_MS\)/);
    expect(windowFunction).toMatch(/windowEnd:\s*new Date\(boundary \+ PREVIEW_DEPLOY_EXECUTION_TIMEOUT_MS \+\s*PROVIDER_CREATION_TIME_SAFETY_ALLOWANCE_MS\)/);
    expect(windowFunction).not.toMatch(/\b(?:30_?000|300_?000)\b/);
  });

  it("terminalizes the same attempt without a provider identity, release, or retry", () => {
    const { record, evidence } = fixture();
    expect(recoverDeploymentFoundation(record)).toMatchObject({ state: "provider_outcome_uncertain", retry: false });
    const result = close(record, evidence);
    expect(result).toMatchObject({ ok: true, revision: 5 });
    const authority = result.record!.deployments!;
    expect(authority.pendingOperation).toBeNull();
    expect(recoverDeploymentFoundation(result.record!)).toEqual({ ok: true, state: "idle" });
    const historical = structuredClone(result.record!);
    delete historical.deployments!.deployments[0]!.submissionBoundaryAt;
    delete historical.deployments!.deployments[0]!.reconciliationWindow;
    expect(recoverDeploymentFoundation(historical)).toEqual({ ok: true, state: "idle" });
    expect(authority.deployments).toHaveLength(1);
    expect(authority.deployments[0]).toMatchObject({ operationId, deploymentId, operationState: "failed",
      failureCode, providerDeploymentId: null, providerUrl: null, providerState: null });
    expect(authority.releases).toEqual([]);
    expect(authority.currentProductionReleaseId).toBeNull();
    expect(authority.serving.state).toBe("unknown");
    expect(result.record!.authoritativeSha).toBe(record.authoritativeSha);
    expect(result.record!.environments).toEqual(record.environments);
    expect(authority.mappings).toEqual(record.deployments!.mappings);
    expect(close(result.record!, evidence)).toMatchObject({ ok: false, code: "DEPLOY_OPERATION_NOT_FOUND" });
    expect(transitionDeploymentOperation(result.record!, { operationId, deploymentId, state: "submitting" }))
      .toMatchObject({ ok: false, code: "DEPLOY_OPERATION_NOT_FOUND" });
  });

  it("rejects wrong identities, target, state, and caller settlement assertions", () => {
    const { record, evidence } = fixture();
    for (const [key, value] of [
      ["buildId", "foreign-build"], ["operationId", "foreign-operation"],
      ["deploymentId", "foreign-deployment"], ["mappingId", "foreign-mapping"],
      ["teamRef", "foreign-team"], ["projectRef", "foreign-project"],
      ["pathOperationId", "foreign-operation"], ["target", "production"],
    ] as const) {
      expect(close(record, { ...evidence, [key]: value })).toMatchObject({ ok: false, code: "DEPLOY_TRANSITION_INVALID" });
    }
    expect(close(record, evidence, { operationId: "foreign-operation" })).toMatchObject({ ok: false });
    expect(close(record, evidence, { deploymentId: "foreign-deployment" })).toMatchObject({ ok: false });
    expect(close(record, evidence, { settlementThresholdSatisfied: true })).toMatchObject({ ok: false });
    expect(close(record, { ...evidence, settlementThresholdSatisfied: true })).toMatchObject({ ok: false });
    record.deployments!.pendingOperation!.state = "submitting";
    expect(close(record, evidence)).toMatchObject({ ok: false, code: "DEPLOY_TRANSITION_INVALID" });
    record.deployments!.pendingOperation!.state = "uncertain";
    record.deployments!.mappings[0]!.targetRef = "production";
    expect(close(record, evidence)).toMatchObject({ ok: false, code: "DEPLOY_TRANSITION_INVALID" });
  });

  it("requires both complete, exhausted, zero-match searches and exact fields", () => {
    const { record, evidence } = fixture();
    for (const key of Object.keys(evidence)) {
      const missing = { ...evidence } as Record<string, unknown>;
      delete missing[key];
      expect(close(record, missing), key).toMatchObject({ ok: false, code: "DEPLOY_TRANSITION_INVALID" });
    }
    expect(close(record, { ...evidence, raw: "PROVIDER_RAW_SENTINEL" })).toMatchObject({ ok: false });
    for (const side of ["metadataFilteredLookup", "projectWindowLookup"] as const) {
      for (const key of Object.keys(evidence[side])) {
        const missing = { ...evidence[side] } as Record<string, unknown>;
        delete missing[key];
        expect(close(record, { ...evidence, [side]: missing }), `${side}.${key}`)
          .toMatchObject({ ok: false, code: "DEPLOY_TRANSITION_INVALID" });
      }
    }
    for (const [side, field, value] of [
      ["metadataFilteredLookup", "completed", false], ["metadataFilteredLookup", "exhausted", false],
      ["metadataFilteredLookup", "nextCursor", "more"], ["metadataFilteredLookup", "exactMatchCount", 1],
      ["projectWindowLookup", "completed", false], ["projectWindowLookup", "exhausted", false],
      ["projectWindowLookup", "nextCursor", "more"], ["projectWindowLookup", "exactOperationMatchCount", 1],
    ] as const) {
      expect(close(record, { ...evidence, [side]: { ...evidence[side], [field]: value } }),
        `${side}.${field}`).toMatchObject({ ok: false, code: "DEPLOY_TRANSITION_INVALID" });
    }
    expect(close(record, { ...evidence, projectWindowLookup: { ...evidence.projectWindowLookup,
      totalProjectDeployments: 0 } })).toMatchObject({ ok: false });
    expect(close(record, { ...evidence, metadataFilteredLookup: {
      completed: true, exhausted: true, nextCursor: null, exactOperationMatchCount: 0,
    } })).toMatchObject({ ok: false, code: "DEPLOY_TRANSITION_INVALID" });
    expect(close(record, { ...evidence, projectWindowLookup: {
      completed: true, exhausted: true, nextCursor: null, exactMatchCount: 0,
    } })).toMatchObject({ ok: false, code: "DEPLOY_TRANSITION_INVALID" });
    expect(close(record, { ...evidence, projectWindowLookup: {
      ...evidence.projectWindowLookup, totalDeploymentsObserved: 0,
    } })).toMatchObject({ ok: false, code: "DEPLOY_TRANSITION_INVALID" });
    expect(close(record, { ...evidence, metadataFilteredLookup: { ...evidence.metadataFilteredLookup,
      value: "PROVIDER_RAW_SENTINEL" } })).toMatchObject({ ok: false });
    expect(transitionDeploymentOperation(record, { operationId, deploymentId, state: "failed",
      failureCode: "PROVIDER_SUBMISSION_FAILED", reconciliationEvidence: evidence }))
      .toMatchObject({ ok: false, code: "DEPLOY_TRANSITION_INVALID" });
  });

  it("calculates settlement age from PATH uncertain time and validates the window", () => {
    const { record, evidence } = fixture(30_000);
    const premature = { ...evidence, windowStart: at(-60_000), windowEnd: at(-15_000) };
    expect(close(record, premature)).toMatchObject({ ok: false, code: "DEPLOY_TRANSITION_INVALID" });
    const aged = fixture();
    for (const change of [
      { completedAt: "not-a-date" }, { windowStart: "2026-99-99T00:00:00.000Z" },
      { windowStart: at(-540_000) }, { windowEnd: at(60_000) },
      { completedAt: at(60_000) },
    ]) expect(close(aged.record, { ...aged.evidence, ...change })).toMatchObject({ ok: false });
    expect(close(aged.record, aged.evidence)).toMatchObject({ ok: true });
  });

  it("freezes the internally computed window on submitting and preserves it through uncertain and receipt", () => {
    const { record } = fixture();
    const op = record.deployments!.pendingOperation!;
    const deployment = record.deployments!.deployments[0]!;
    op.state = "prepared";
    op.snapshot = { ...(op.snapshot as object), configNames: [] };
    op.configReceipts = [];
    delete op.submissionBoundaryAt; delete op.reconciliationWindow;
    delete deployment.submissionBoundaryAt; delete deployment.reconciliationWindow;
    for (const extra of [{ submissionBoundaryAt: at(0) }, { windowStart: at(0) },
      { windowEnd: at(0) }, { reconciliationWindow: { windowStart: at(0), windowEnd: at(0) } }])
      expect(transitionDeploymentOperation(record, { operationId, deploymentId,
        state: "submitting", ...extra })).toMatchObject({ ok: false, code: "DEPLOY_TRANSITION_INVALID" });
    const before = Date.now();
    const submitting = transitionDeploymentOperation(record, { operationId, deploymentId, state: "submitting" });
    const after = Date.now();
    expect(submitting).toMatchObject({ ok: true });
    const submittedOp = submitting.record!.deployments!.pendingOperation!;
    const boundary = Date.parse(submittedOp.submissionBoundaryAt as string);
    expect(boundary).toBeGreaterThanOrEqual(before);
    expect(boundary).toBeLessThanOrEqual(after);
    expect(submittedOp.reconciliationWindow).toEqual({
      windowStart: new Date(boundary - PROVIDER_CREATION_TIME_SAFETY_ALLOWANCE_MS).toISOString(),
      windowEnd: new Date(boundary + PREVIEW_DEPLOY_EXECUTION_TIMEOUT_MS +
        PROVIDER_CREATION_TIME_SAFETY_ALLOWANCE_MS).toISOString(),
    });
    expect(submitting.record!.deployments!.deployments[0]).toMatchObject({
      submissionBoundaryAt: submittedOp.submissionBoundaryAt,
      reconciliationWindow: submittedOp.reconciliationWindow });
    expect(recoverDeploymentFoundation(submitting.record!)).toEqual({ ok: true,
      state: "provider_outcome_uncertain", retry: false });
    const uncertain = transitionDeploymentOperation(submitting.record!, { operationId, deploymentId, state: "uncertain" });
    expect(uncertain).toMatchObject({ ok: true });
    expect(uncertain.record!.deployments!.pendingOperation).toMatchObject({
      submissionBoundaryAt: submittedOp.submissionBoundaryAt,
      reconciliationWindow: submittedOp.reconciliationWindow });
    const receipt = transitionDeploymentOperation(uncertain.record!, { operationId, deploymentId,
      state: "submitted", providerDeploymentId: "dpl_12345678", providerUrl: "https://example.vercel.app" });
    expect(receipt).toMatchObject({ ok: true });
    expect(receipt.record!.deployments!.pendingOperation).toMatchObject({
      submissionBoundaryAt: submittedOp.submissionBoundaryAt,
      reconciliationWindow: submittedOp.reconciliationWindow });
    expect(receipt.record!.deployments!.deployments[0]).toMatchObject({
      submissionBoundaryAt: submittedOp.submissionBoundaryAt,
      reconciliationWindow: submittedOp.reconciliationWindow });
    const ready = transitionDeploymentOperation(receipt.record!, { operationId, deploymentId,
      state: "provider_observation", providerDeploymentId: "dpl_12345678",
      providerUrl: "https://example.vercel.app", providerState: "READY" });
    expect(ready).toMatchObject({ ok: true });
    const confirmed = transitionDeploymentOperation(ready.record!, { operationId, deploymentId,
      state: "confirmed", providerDeploymentId: "dpl_12345678" });
    expect(confirmed).toMatchObject({ ok: true });
    expect(confirmed.record!.deployments!.pendingOperation).toBeNull();
    expect(confirmed.record!.deployments!.deployments[0]).toMatchObject({
      submissionBoundaryAt: submittedOp.submissionBoundaryAt,
      reconciliationWindow: submittedOp.reconciliationWindow });
    const error = transitionDeploymentOperation(receipt.record!, { operationId, deploymentId,
      state: "provider_observation", providerDeploymentId: "dpl_12345678",
      providerUrl: "https://example.vercel.app", providerState: "ERROR" });
    const failed = transitionDeploymentOperation(error.record!, { operationId, deploymentId,
      state: "failed", failureCode: "PROVIDER_BUILD_FAILED" });
    expect(failed).toMatchObject({ ok: true });
    expect(failed.record!.deployments!.deployments[0]).toMatchObject({
      submissionBoundaryAt: submittedOp.submissionBoundaryAt,
      reconciliationWindow: submittedOp.reconciliationWindow });
    for (const field of ["submissionBoundaryAt", "windowStart", "windowEnd"])
      expect(transitionDeploymentOperation(uncertain.record!, { operationId, deploymentId,
        state: "submitted", providerDeploymentId: "dpl_12345678", providerUrl: "https://example.vercel.app",
        [field]: at(0) })).toMatchObject({ ok: false, code: "DEPLOY_TRANSITION_INVALID" });
  });

  it("keeps a multi-hour submission window separate from uncertain settlement timing", () => {
    const premature = fixture(30_000, 4 * 60 * 60 * 1000);
    expect(Date.parse(premature.evidence.windowEnd)).toBeLessThan(Date.parse(premature.record.deployments!.pendingOperation!.updatedAt as string));
    expect(close(premature.record, premature.evidence)).toMatchObject({ ok: false, code: "DEPLOY_TRANSITION_INVALID" });
    const aged = fixture(120_000, 4 * 60 * 60 * 1000);
    expect(close(aged.record, aged.evidence)).toMatchObject({ ok: true });
    for (const change of [
      { windowStart: new Date(Date.parse(aged.evidence.windowStart) - 1).toISOString() },
      { windowEnd: new Date(Date.parse(aged.evidence.windowEnd) + 1).toISOString() },
      { windowStart: new Date(Date.parse(aged.evidence.windowStart) + 1).toISOString(),
        windowEnd: new Date(Date.parse(aged.evidence.windowEnd) + 1).toISOString() },
      { windowStart: new Date(Date.parse(aged.evidence.windowStart) + 1).toISOString() },
      { windowEnd: new Date(Date.parse(aged.evidence.windowEnd) - 1).toISOString() },
    ]) expect(close(aged.record, { ...aged.evidence, ...change })).toMatchObject({ ok: false });
  });

  it("retains lower chronology while allowing uncertain time after the frozen window", () => {
    const aged = fixture(600_000, 4 * 60 * 60 * 1000);
    const op = aged.record.deployments!.pendingOperation!;
    const start = Date.parse(aged.evidence.windowStart);
    const end = Date.parse(aged.evidence.windowEnd);
    expect(Date.parse(op.updatedAt as string)).toBeGreaterThan(end);
    expect(close(aged.record, aged.evidence)).toMatchObject({ ok: true });
    op.updatedAt = new Date(start - 1).toISOString();
    expect(close(aged.record, aged.evidence)).toMatchObject({ ok: false, code: "DEPLOY_TRANSITION_INVALID" });
    op.updatedAt = new Date(start).toISOString();
    expect(close(aged.record, aged.evidence)).toMatchObject({ ok: true });
    op.updatedAt = new Date(start + 60_000).toISOString();
    expect(close(aged.record, { ...aged.evidence, completedAt: new Date(end - 1).toISOString() }))
      .toMatchObject({ ok: false, code: "DEPLOY_TRANSITION_INVALID" });
    expect(close(aged.record, { ...aged.evidence, completedAt: new Date(Date.now() + 60_000).toISOString() }))
      .toMatchObject({ ok: false, code: "DEPLOY_TRANSITION_INVALID" });
    expect(close(aged.record, { ...aged.evidence, windowStart: new Date(start + 1).toISOString() }))
      .toMatchObject({ ok: false, code: "DEPLOY_TRANSITION_INVALID" });
    expect(close(aged.record, { ...aged.evidence, metadataFilteredLookup: {
      ...aged.evidence.metadataFilteredLookup, exactMatchCount: 1 } }))
      .toMatchObject({ ok: false, code: "DEPLOY_TRANSITION_INVALID" });
    const premature = fixture(30_000, 4 * 60 * 60 * 1000);
    expect(close(premature.record, premature.evidence)).toMatchObject({ ok: false, code: "DEPLOY_TRANSITION_INVALID" });
    const settled = fixture(120_000, 4 * 60 * 60 * 1000);
    expect(close(settled.record, settled.evidence)).toMatchObject({ ok: true });
  });

  it("settles from the same uncertain time across independently frozen submission windows", () => {
    const now = Date.now();
    const makePair = (ageMs: number) => {
      return { first: fixture(ageMs, 600_000, now), second: fixture(ageMs, 1_200_000, now) };
    };
    const premature = makePair(30_000);
    expect(premature.first.record.deployments!.pendingOperation!.updatedAt)
      .toBe(premature.second.record.deployments!.pendingOperation!.updatedAt);
    expect(premature.first.evidence.completedAt).toBe(premature.second.evidence.completedAt);
    expect(premature.first.evidence.windowStart).not.toBe(premature.second.evidence.windowStart);
    for (const item of [premature.first, premature.second])
      expect(close(item.record, item.evidence)).toMatchObject({ ok: false, code: "DEPLOY_TRANSITION_INVALID" });
    const settled = makePair(120_000);
    expect(settled.first.record.deployments!.pendingOperation!.updatedAt)
      .toBe(settled.second.record.deployments!.pendingOperation!.updatedAt);
    expect(settled.first.evidence.completedAt).toBe(settled.second.evidence.completedAt);
    expect(settled.first.evidence.windowStart).not.toBe(settled.second.evidence.windowStart);
    for (const item of [settled.first, settled.second])
      expect(close(item.record, item.evidence)).toMatchObject({ ok: true });
  });

  it("fails closed for a legacy pending operation without inventing a window", () => {
    const { record } = fixture();
    const op = record.deployments!.pendingOperation!;
    const deployment = record.deployments!.deployments[0]!;
    delete op.submissionBoundaryAt; delete op.reconciliationWindow;
    delete deployment.submissionBoundaryAt; delete deployment.reconciliationWindow;
    expect(DEPLOY_RECONCILIATION_WINDOW_MISSING).toBe("DEPLOY_RECONCILIATION_WINDOW_MISSING");
    for (const state of ["submitting", "uncertain"]) {
      op.state = state;
      expect(recoverDeploymentFoundation(record)).toEqual({ ok: false,
        code: DEPLOY_RECONCILIATION_WINDOW_MISSING, retry: false });
      expect(transitionDeploymentOperation(record, { operationId, deploymentId,
        state: state === "submitting" ? "uncertain" : "failed",
        failureCode: failureCode, reconciliationEvidence: fixture().evidence })).toMatchObject({ ok: false,
          code: DEPLOY_RECONCILIATION_WINDOW_MISSING });
    }
    expect(op.reconciliationWindow).toBeUndefined();
    expect(record.deployments!.deployments).toHaveLength(1);
  });
});
