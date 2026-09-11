/**
 * Phase GC1-a — verified Cloud Workstations infrastructure constants.
 * Operator-verified; do not invent alternate values.
 */

export const GC1_PROJECT_ID = "path-code-gc1-260910";
export const GC1_REGION = "europe-west4";
export const GC1_CONTROL_SA =
  "pathcode-gc1-control@path-code-gc1-260910.iam.gserviceaccount.com";
export const GC1_RUNTIME_SA =
  "pathcode-gc1-runtime@path-code-gc1-260910.iam.gserviceaccount.com";
export const GC1_CLUSTER = "pathcode-gc1-cluster";
export const GC1_CONFIG = "pathcode-gc1-config";
export const GC1_PROBE_WORKSTATION = "pathcode-gc1-probe";
export const GC1_MACHINE_TYPE = "e2-standard-2";
export const GC1_RESOURCE_PREFIX = "pathcode-gc1-";

/** Cost fences baked into workstation config create payloads. */
export const GC1_COST_FENCES = Object.freeze({
  poolSize: 0,
  idleTimeout: "900s",
  runningTimeout: "3600s",
});

export const GC1_HEALTH_CHECK_COMMAND = "echo HEALTH_CHECK_OK";
export const GC1_HEALTH_CHECK_EXPECTED = "HEALTH_CHECK_OK";

export const GC1_SSH_USER = "user";
/** Local OpenSSH noise lines that may appear on stderr without being remote stderr. */
export const GC1_LOCAL_SSH_NOISE_RE =
  /^(Warning: Permanently added |WARNING: This command is using service account impersonation|Picking local unused port |Listening on port )/u;

/**
 * Command-channel readiness poll: VM may be STATE_RUNNING before the
 * container agent has wired stdout. Production GC1-c window = 180s @ 2s.
 */
export const GC1_EXECUTION_READY_INTERVAL_MS = 2_000;
export const GC1_EXECUTION_READY_DEADLINE_MS = 180_000;
/** @deprecated prefer deadline/interval — kept for GC1-a test compatibility */
export const GC1_EXECUTION_READY_ATTEMPTS = Math.ceil(
  GC1_EXECUTION_READY_DEADLINE_MS / GC1_EXECUTION_READY_INTERVAL_MS,
);

export const GC1_AUTH_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
export const GC1_WORKSTATIONS_API_BASE = "https://workstations.googleapis.com/v1";

/** Default bounded deadline for provision/start/probe steps (ms). */
export const GC1_DEFAULT_DEADLINE_MS = 180_000;

export const GC1_ERROR = Object.freeze({
  AUTH_IMPERSONATION_UNAVAILABLE: "GC1_AUTH_IMPERSONATION_UNAVAILABLE",
  WORKSTATION_NOT_READY: "GC1_WORKSTATION_NOT_READY",
  EXECUTION_NOT_READY: "GC1_EXECUTION_NOT_READY",
  LIVE_SMOKE_FORBIDDEN: "GC1_LIVE_SMOKE_FORBIDDEN",
});

export function clusterName(projectId = GC1_PROJECT_ID, region = GC1_REGION) {
  return `projects/${projectId}/locations/${region}/workstationClusters/${GC1_CLUSTER}`;
}

export function configName(
  projectId = GC1_PROJECT_ID,
  region = GC1_REGION,
  configId = GC1_CONFIG,
) {
  return `${clusterName(projectId, region)}/workstationConfigs/${configId}`;
}

export function workstationName(
  workstationId = GC1_PROBE_WORKSTATION,
  projectId = GC1_PROJECT_ID,
  region = GC1_REGION,
  configId = GC1_CONFIG,
) {
  return `${configName(projectId, region, configId)}/workstations/${workstationId}`;
}

export function locationParent(
  projectId = GC1_PROJECT_ID,
  region = GC1_REGION,
) {
  return `projects/${projectId}/locations/${region}`;
}

/**
 * Config create body with cost fences + Runtime SA identity (never Control SA).
 */
export function buildConfigCreateBody() {
  return {
    idleTimeout: GC1_COST_FENCES.idleTimeout,
    runningTimeout: GC1_COST_FENCES.runningTimeout,
    host: {
      gceInstance: {
        machineType: GC1_MACHINE_TYPE,
        poolSize: GC1_COST_FENCES.poolSize,
        serviceAccount: GC1_RUNTIME_SA,
      },
    },
  };
}

export const GC1_CLUSTER_TEARDOWN_COMMAND =
  `gcloud workstations clusters delete ${GC1_CLUSTER}` +
  ` --project=${GC1_PROJECT_ID} --region=${GC1_REGION} --quiet`;
