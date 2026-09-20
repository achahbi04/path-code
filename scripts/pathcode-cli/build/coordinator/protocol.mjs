export const BUILD_COORDINATOR_PROTOCOL_VERSION = 1;

export const BuildCoordinatorMethods = Object.freeze({
  HELLO: "coordinator.hello",
  STATUS: "coordinator.status",
  BUILD_START: "build.start",
  BUILD_GET: "build.get",
  BUILD_LIST: "build.list",
  BUILD_LATEST: "build.latest",
  BUILD_EVENTS: "build.events",
  BUILD_MESSAGE: "build.message",
  BUILD_STOP: "build.stop",
  BUILD_RESUME: "build.resume",
  BUILD_RECOVER: "build.recover",
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
