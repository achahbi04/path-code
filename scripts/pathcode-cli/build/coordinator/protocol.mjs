export const BUILD_COORDINATOR_PROTOCOL_VERSION = 1;

export const BuildCoordinatorMethods = Object.freeze({
  HELLO: "coordinator.hello",
  STATUS: "coordinator.status",
  BUILD_START: "build.start",
  BUILD_GET: "build.get",
  BUILD_LIST: "build.list",
  BUILD_LATEST: "build.latest",
  BUILD_EVENTS: "build.events",
  BUILD_ENVIRONMENTS_LIST: "build.environments.list",
  BUILD_ENVIRONMENT_READ: "build.environments.read",
  BUILD_SECRET_BINDING_READ: "build.environments.readSecretBinding",
  BUILD_ENVIRONMENT_MUTATE: "build.environments.mutate",
  BUILD_ENVIRONMENT_VERIFY_LOCAL: "build.environments.verifyLocal",
  BUILD_DEPLOYMENTS_LIST: "build.deployments.list",
  BUILD_DEPLOYMENT_PREFLIGHT: "build.deployments.preflight",
  BUILD_DEPLOYMENT_MAPPING_MUTATE: "build.deployments.mappingMutate",
  BUILD_DEPLOYMENT_PREPARE: "build.deployments.prepare",
  BUILD_DEPLOYMENT_TRANSITION: "build.deployments.transition",
  BUILD_MESSAGE: "build.message",
  BUILD_STOP: "build.stop",
  BUILD_PAUSE: "build.pause",
  BUILD_RESUME: "build.resume",
  BUILD_RECOVER: "build.recover",
  BUILD_APPLY: "build.apply",
  BUILD_DISCARD: "build.discard",
  BUILD_RESTORE_HISTORICAL: "build.restoreHistorical",
  BUILD_SURFACE_EDIT: "build.surfaceEdit",
  BUILD_TICK: "build.tick",
  BUILD_RUN: "build.run",
  BUILD_ENSURE_LOOP: "build.ensureLoop",
  RUNTIME_GET: "runtime.get",
  RUNTIME_SYNC: "runtime.sync",
  RUNTIME_START: "runtime.start",
  RUNTIME_RESTART: "runtime.restart",
  RUNTIME_EVIDENCE: "runtime.evidence",
  RUNTIME_STOP: "runtime.stop",
  SHUTDOWN: "coordinator.shutdown",
});

export function makeCoordinatorRequest(method, params = {}) {
  return {
    id: `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    method,
    params,
  };
}

export function makeCoordinatorError(id, code, message) {
  return { id, error: { code, message } };
}
