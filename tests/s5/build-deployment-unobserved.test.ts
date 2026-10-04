import { describe, expect, it } from "vitest";
import { createBuildRecordSkeleton, recoverDeploymentFoundation,
  transitionDeploymentOperation } from "../../scripts/pathcode-cli/build/index.mjs";
import type { NoDeploymentObservedReconciliationEvidence } from "../../scripts/pathcode-cli/build/index.mjs";

const operationId = "11111111-1111-1111-1111-111111111111";
const deploymentId = "22222222-2222-2222-2222-222222222222";
const mappingId = "33333333-3333-3333-3333-333333333333";
const failureCode = "PROVIDER_SUBMISSION_NOT_OBSERVED";
const at = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

function fixture(ageMs = 600_000) {
  const record = createBuildRecordSkeleton({ outcome: "Preview" });
  const uncertainAt = at(-ageMs);
  record.deployments = {
    schema: "pathcode.p10.deployments.v1", revision: 4,
    mappings: [{ mappingId, environmentId: "environment-a", provider: "vercel", teamRef: "team_a",
      projectRef: "project-a", targetRef: "preview", updatedAt: uncertainAt }],
    deployments: [{ deploymentId, operationId, target: "preview", mappingId, environmentId: "environment-a",
      sourceSha: "source-a", providerDeploymentId: null, providerUrl: null, providerState: null,
      operationState: "uncertain", failureCode: null, requestedAt: at(-ageMs - 5_000), completedAt: null }],
    releases: [], currentProductionReleaseId: null,
    serving: { state: "unknown", observedProviderDeploymentId: null, observedAt: null },
    pendingOperation: { operationId, deploymentId, kind: "deploy", state: "uncertain", providerDeploymentId: null,
      snapshot: { mappingId, environmentId: "environment-a", sourceSha: "source-a" },
      createdAt: at(-ageMs - 5_000), updatedAt: uncertainAt },
  };
  const evidence: NoDeploymentObservedReconciliationEvidence = {
    buildId: record.buildId, operationId, deploymentId, mappingId, teamRef: "team_a",
    projectRef: "project-a", target: "preview", pathOperationId: operationId,
    windowStart: at(-ageMs - 60_000), windowEnd: at(-ageMs + 60_000),
    metadataFilteredLookup: { completed: true, exhausted: true, nextCursor: null, exactMatchCount: 0 },
    projectWindowLookup: { completed: true, exhausted: true, nextCursor: null, exactOperationMatchCount: 0 },
    completedAt: at(0),
  };
  return { record, evidence };
}

function close(record: ReturnType<typeof fixture>["record"], evidence: object,
  overrides: Record<string, unknown> = {}) {
  return transitionDeploymentOperation(record, { operationId, deploymentId, state: "failed", failureCode,
    reconciliationEvidence: evidence, ...overrides });
}

describe("P10 uncertain submission with no observed provider deployment", () => {
  it("terminalizes the same attempt without a provider identity, release, or retry", () => {
    const { record, evidence } = fixture();
    expect(recoverDeploymentFoundation(record)).toMatchObject({ state: "provider_outcome_uncertain", retry: false });
    const result = close(record, evidence);
    expect(result).toMatchObject({ ok: true, revision: 5 });
    const authority = result.record!.deployments!;
    expect(authority.pendingOperation).toBeNull();
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
});
