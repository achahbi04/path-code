/** P9.1 Build-owned configuration and secret-reference authority. No backend I/O. */
import { randomUUID } from "node:crypto";
import { readBuildRecord } from "./record.mjs";

export const ENVIRONMENTS_SCHEMA = "pathcode.p9.environments.v1";
const VARIABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SECRET_NAME = /(?:^|_)(?:SECRET|PASSWORD|PASSWD|TOKEN|PRIVATE_KEY|API_KEY|CREDENTIALS)(?:$|_)/i;
const OBVIOUS_SECRET_VALUE = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bBearer\s+\S+|\b(?:sk_live|sk_test|ghp|github_pat)_[A-Za-z0-9_]+\b|^[a-z][a-z0-9+.-]*:\/\/[^/@\s]+:[^/@\s]+@/i;
// PATHCODE_* is PATH-owned. Git reservations below are the specific controls
// used by PATH Git children or stripped by src/git/environment.ts.
// This is an admission guard, not a claim that arbitrary config text is secret-free.
const RESERVED_EXACT = new Set([
  "PATH", "HOME", "TMPDIR", "TMP", "TEMP", "NODE_OPTIONS",
  "OPENAI_API_KEY", "CURSOR_API_KEY", "PATH_CURSOR_API_KEY",
  "GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_APPLICATION_CREDENTIALS",
  "GOOGLE_CLOUD_PROJECT", "CLOUDSDK_CORE_PROJECT", "GOOGLE_GENAI_USE_VERTEXAI",
  "GOOGLE_CLOUD_MODEL", "AG1_MODEL", "CURSOR_MODEL", "COPILOT_CLI_PATH", "COPILOT_HOME",
  "GH_TOKEN", "GITHUB_TOKEN", "COPILOT_GITHUB_TOKEN", "VERCEL_TOKEN",
  "GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR", "GIT_DISCOVERY_ACROSS_FILESYSTEM",
  "GIT_CONFIG_GLOBAL", "GIT_CONFIG_SYSTEM", "GIT_CONFIG_NOSYSTEM", "GIT_CONFIG_COUNT",
  "GIT_CEILING_DIRECTORIES", "GIT_ASKPASS", "GIT_TERMINAL_PROMPT",
  "GIT_OPTIONAL_LOCKS", "GIT_NO_REPLACE_OBJECTS",
  "GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL", "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL",
]);
const SECRET_KEYS = new Set(["variableName", "backend", "replace"]);
const CONFIG_KEYS = new Set(["variableName", "value", "replace"]);
const ACTIONS = new Set([
  "create_environment", "rename_environment", "delete_environment",
  "set_config", "remove_config", "bind_secret", "unbind_secret", "set_vercel_locator",
]);

const fail = (code) => ({ ok: false, code });
const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const plain = (obj) => obj !== null && typeof obj === "object" && !Array.isArray(obj) &&
  (Object.getPrototypeOf(obj) === Object.prototype || Object.getPrototypeOf(obj) === null);
const keysOnly = (obj, allowed) => plain(obj) && Object.keys(obj).every((key) => allowed.has(key));
const current = (record) => record.environments ?? { schema: ENVIRONMENTS_SCHEMA, revision: 0, items: [] };

function validAuthority(section) {
  if (!keysOnly(section, new Set(["schema", "revision", "items"])) ||
      section.schema !== ENVIRONMENTS_SCHEMA ||
      !Number.isSafeInteger(section.revision) || section.revision < 0 ||
      !Array.isArray(section.items)) return false;
  const ids = new Set();
  const names = new Set();
  const refs = new Set();
  return section.items.every((item) => {
    if (!keysOnly(item, new Set(["environmentId", "name", "createdAt", "updatedAt", "variables"])) ||
        typeof item.environmentId !== "string" || !validName(item.name) ||
        typeof item.createdAt !== "string" || typeof item.updatedAt !== "string" ||
        !Array.isArray(item.variables) || ids.has(item.environmentId) ||
        names.has(item.name.toLowerCase())) return false;
    ids.add(item.environmentId);
    names.add(item.name.toLowerCase());
    const variables = new Set();
    return item.variables.every((entry) => {
      if (!plain(entry) || typeof entry.variableName !== "string" ||
          variables.has(entry.variableName) ||
          typeof entry.createdAt !== "string" || typeof entry.updatedAt !== "string") return false;
      variables.add(entry.variableName);
      if (entry.kind === "config") return keysOnly(entry,
        new Set(["kind", "variableName", "value", "createdAt", "updatedAt"])) &&
        validVariableName(entry.variableName, "config") === null &&
        typeof entry.value === "string";
      if (entry.kind !== "secret" || !keysOnly(entry,
        new Set(["kind", "variableName", "secretRef", "backend", "descriptor",
          "bindingState", "presenceState", "safetyState", "verifiedAt", "createdAt", "updatedAt"])) ||
          validVariableName(entry.variableName, "secret") !== null ||
          typeof entry.secretRef !== "string" || refs.has(entry.secretRef) ||
          entry.bindingState !== "configured" ||
          !["unknown", "verified_present", "verified_missing"].includes(entry.presenceState) ||
          (entry.verifiedAt !== undefined && typeof entry.verifiedAt !== "string")) return false;
      refs.add(entry.secretRef);
      if (entry.backend === "local_env_file") return ["unknown", "verified_safe", "verified_unsafe"].includes(entry.safetyState) &&
        keysOnly(entry.descriptor, new Set(["source"])) &&
        entry.descriptor.source === ".env.local";
      return entry.backend === "vercel_env" && entry.presenceState === "unknown" && !own(entry, "safetyState") &&
        keysOnly(entry.descriptor, new Set(["provider", "teamRef", "projectRef", "targetRef", "bindingRef"])) &&
        entry.descriptor.provider === "vercel" &&
        ["teamRef", "projectRef", "targetRef", "bindingRef"].every((key) =>
          entry.descriptor[key] === null ||
          (typeof entry.descriptor[key] === "string" && /^[A-Za-z0-9._-]{1,160}$/.test(entry.descriptor[key])));
    });
  });
}

function boundRecord(runtimeRoot, buildId) {
  if (typeof buildId !== "string" || !buildId) return fail("BUILD_NOT_FOUND");
  const record = readBuildRecord(runtimeRoot, buildId);
  if (!record || record.buildId !== buildId) return fail("BUILD_NOT_FOUND");
  const binding = record.projectBindings?.[0];
  if (typeof binding?.bindingId !== "string" || !binding.bindingId ||
      typeof binding.projectRoot !== "string" || !binding.projectRoot) {
    return fail("BUILD_NOT_BOUND");
  }
  const section = current(record);
  if (!validAuthority(section)) return fail("ENVIRONMENTS_INVALID");
  return { ok: true, record, binding, section };
}

function validName(name) {
  return typeof name === "string" && name.trim() === name &&
    name.length > 0 && name.length <= 80 && !/[\u0000-\u001f\u007f]/.test(name);
}

function validVariableName(name, kind) {
  if (typeof name !== "string" || name.length > 128 || !VARIABLE_NAME.test(name)) {
    return "VARIABLE_NAME_INVALID";
  }
  const upper = name.toUpperCase();
  if (upper.startsWith("PATHCODE_") ||
      upper.startsWith("GIT_CONFIG_KEY_") || upper.startsWith("GIT_CONFIG_VALUE_") ||
      RESERVED_EXACT.has(upper)) return "VARIABLE_NAME_RESERVED";
  if (kind === "config" && (SECRET_NAME.test(upper) || upper === "DATABASE_URL")) {
    return "CONFIG_SECRET_NAME_REJECTED";
  }
  if (kind === "secret" && /^(?:NEXT_PUBLIC_|VITE_|PUBLIC_)/i.test(name)) {
    return "SECRET_PUBLIC_NAME_REJECTED";
  }
  return null;
}

function projectEnvironment(item) {
  return {
    environmentId: item.environmentId, name: item.name,
    createdAt: item.createdAt, updatedAt: item.updatedAt,
    variables: item.variables.map((entry) => entry.kind === "config"
      ? { kind: "config", variableName: entry.variableName, value: entry.value,
          createdAt: entry.createdAt, updatedAt: entry.updatedAt }
      : { kind: "secret", variableName: entry.variableName, secretRef: entry.secretRef,
          backend: entry.backend, descriptor: { ...entry.descriptor },
          bindingState: entry.bindingState, presenceState: entry.presenceState,
          ...(entry.backend === "local_env_file" ? { safetyState: entry.safetyState } : {}),
          ...(entry.verifiedAt ? { verifiedAt: entry.verifiedAt } : {}),
          createdAt: entry.createdAt, updatedAt: entry.updatedAt }),
  };
}

/** Read/list is observational and returns an allowlisted projection. */
export function listBuildEnvironments(runtimeRoot, buildId) {
  const found = boundRecord(runtimeRoot, buildId);
  if (!found.ok) return found;
  return { ok: true, buildId, bindingId: found.binding.bindingId,
    schema: ENVIRONMENTS_SCHEMA, revision: found.section.revision,
    items: found.section.items.map(projectEnvironment) };
}

export function readBuildEnvironment(runtimeRoot, buildId, environmentId) {
  const listed = listBuildEnvironments(runtimeRoot, buildId);
  if (!listed.ok) return listed;
  const environment = listed.items.find((item) => item.environmentId === environmentId);
  return environment ? { ok: true, buildId, bindingId: listed.bindingId,
    revision: listed.revision, environment } : fail("ENVIRONMENT_NOT_FOUND");
}

export function readBuildSecretBinding(runtimeRoot, buildId, environmentId, secretRef) {
  const read = readBuildEnvironment(runtimeRoot, buildId, environmentId);
  if (!read.ok) return read;
  const binding = read.environment.variables.find((item) =>
    item.kind === "secret" && item.secretRef === secretRef);
  return binding ? { ok: true, buildId, environmentId, binding } : fail("SECRET_BINDING_NOT_FOUND");
}

/** Pure mutation. The coordinator owns serialization and the one record write. */
export function prepareBuildEnvironmentMutation(runtimeRoot, buildId, request) {
  const found = boundRecord(runtimeRoot, buildId);
  if (!found.ok) return found;
  if (found.record.pendingRestore) return fail("RESTORE_PENDING");
  if (!keysOnly(request, new Set(["action", "expectedEnvironmentRevision", "input"])) ||
      !ACTIONS.has(request.action) ||
      !Number.isSafeInteger(request.expectedEnvironmentRevision) ||
      !plain(request.input)) return fail("ENVIRONMENT_MUTATION_INVALID");
  if (request.expectedEnvironmentRevision !== found.section.revision) return fail("ENVIRONMENT_REVISION_STALE");
  const { action, input } = request;
  const section = structuredClone(found.section);
  const at = new Date().toISOString();
  const entryAt = (env, name) => env.variables.findIndex((entry) => entry.variableName === name);
  let environment = section.items.find((item) => item.environmentId === input.environmentId);
  if (action !== "create_environment" && !environment) return fail("ENVIRONMENT_NOT_FOUND");
  let result = {};
  if (action === "create_environment") {
    if (!keysOnly(input, new Set(["name"])) || !validName(input.name)) return fail("ENVIRONMENT_NAME_INVALID");
    if (section.items.some((item) => item.name.toLowerCase() === input.name.toLowerCase())) return fail("ENVIRONMENT_NAME_CONFLICT");
    environment = { environmentId: randomUUID(), name: input.name, createdAt: at, updatedAt: at, variables: [] };
    section.items.push(environment);
    result = { environmentId: environment.environmentId };
  } else if (action === "rename_environment") {
    if (!keysOnly(input, new Set(["environmentId", "name"])) || !validName(input.name)) return fail("ENVIRONMENT_NAME_INVALID");
    if (section.items.some((item) => item.environmentId !== environment.environmentId &&
      item.name.toLowerCase() === input.name.toLowerCase())) return fail("ENVIRONMENT_NAME_CONFLICT");
    if (environment.name === input.name) return fail("ENVIRONMENT_UNCHANGED");
    environment.name = input.name;
    environment.updatedAt = at;
  } else if (action === "delete_environment") {
    if (!keysOnly(input, new Set(["environmentId"])) || environment.variables.length) return fail("ENVIRONMENT_NOT_EMPTY");
    section.items = section.items.filter((item) => item.environmentId !== environment.environmentId);
  } else if (action === "set_vercel_locator") {
    if (!keysOnly(input, new Set(["environmentId", "variableName", "secretRef", "teamRef", "projectRef", "targetRef", "bindingRef"]))) {
      return fail("PROVIDER_LOCATOR_INVALID");
    }
    const entry = environment.variables.find((item) => item.variableName === input.variableName);
    if (!entry || entry.kind !== "secret" || entry.backend !== "vercel_env" || entry.secretRef !== input.secretRef) {
      return fail("SECRET_BINDING_NOT_FOUND");
    }
    const locator = {};
    for (const key of ["teamRef", "projectRef", "targetRef", "bindingRef"]) {
      const value = input[key] ?? null;
      if (value !== null && (typeof value !== "string" || !/^[A-Za-z0-9._-]{1,160}$/.test(value))) {
        return fail("PROVIDER_LOCATOR_INVALID");
      }
      locator[key] = value;
    }
    entry.descriptor = { provider: "vercel", ...locator };
    entry.presenceState = "unknown";
    delete entry.verifiedAt;
    entry.updatedAt = at;
    environment.updatedAt = at;
  } else {
    const allowed = action === "set_config" ? new Set(["environmentId", ...CONFIG_KEYS])
      : action === "bind_secret" ? new Set(["environmentId", ...SECRET_KEYS])
      : new Set(["environmentId", "variableName"]);
    if (!keysOnly(input, allowed) || typeof input.environmentId !== "string") return fail("VARIABLE_MUTATION_INVALID");
    const kind = action === "set_config" || action === "remove_config" ? "config" : "secret";
    const nameError = validVariableName(input.variableName, kind);
    if (nameError) return fail(nameError);
    const index = entryAt(environment, input.variableName);
    const previous = index < 0 ? null : environment.variables[index];
    if (action === "remove_config" || action === "unbind_secret") {
      if (!previous || previous.kind !== kind) return fail("VARIABLE_NOT_FOUND");
      environment.variables.splice(index, 1);
      result = action === "unbind_secret" ? { backendMaterialChanged: false } : {};
    } else if (action === "set_config") {
      if (typeof input.value !== "string" || input.value.length > 8192 ||
          input.value.includes("\0") || OBVIOUS_SECRET_VALUE.test(input.value)) return fail("CONFIG_VALUE_INVALID");
      if (previous?.kind === "secret" && input.replace !== true) return fail("VARIABLE_KIND_CONFLICT");
      if (previous?.kind === "config" && previous.value === input.value) return fail("VARIABLE_UNCHANGED");
      const next = { kind: "config", variableName: input.variableName, value: input.value,
        createdAt: previous?.kind === "config" ? previous.createdAt : at, updatedAt: at };
      if (index < 0) environment.variables.push(next); else environment.variables[index] = next;
    } else {
      if (input.backend !== "vercel_env" && input.backend !== "local_env_file") return fail("SECRET_BACKEND_INVALID");
      if (previous && input.replace !== true) return fail("VARIABLE_KIND_CONFLICT");
      const next = {
        kind: "secret", variableName: input.variableName,
        secretRef: randomUUID(), backend: input.backend,
        descriptor: input.backend === "vercel_env"
          ? { provider: "vercel", teamRef: null, projectRef: null, targetRef: null, bindingRef: null }
          : { source: ".env.local" },
        bindingState: "configured", presenceState: "unknown",
        ...(input.backend === "local_env_file" ? { safetyState: "unknown" } : {}),
        createdAt: at, updatedAt: at,
      };
      if (index < 0) environment.variables.push(next); else environment.variables[index] = next;
      result = { secretRef: next.secretRef };
    }
    environment.updatedAt = at;
  }
  section.revision += 1;
  found.record.environments = section;
  return { ok: true, record: found.record, revision: section.revision, ...result };
}

/** Apply only an allowlisted verification fact to the exact still-current binding. */
export function prepareBuildEnvironmentVerification(runtimeRoot, buildId, request) {
  const found = boundRecord(runtimeRoot, buildId);
  if (!found.ok) return found;
  if (!keysOnly(request, new Set(["environmentId", "variableName", "secretRef", "expectedEnvironmentRevision", "presenceState", "safetyState"])) ||
      request.expectedEnvironmentRevision !== found.section.revision) return fail("STALE_ENVIRONMENT_AUTHORITY");
  const section = structuredClone(found.section);
  const environment = section.items.find((item) => item.environmentId === request.environmentId);
  const entry = environment?.variables.find((item) => item.variableName === request.variableName);
  if (!entry || entry.kind !== "secret" || entry.secretRef !== request.secretRef) return fail("SECRET_BINDING_NOT_FOUND");
  if (entry.backend === "vercel_env") return fail("PROVIDER_VERIFICATION_UNAVAILABLE");
  if (!["unknown", "verified_present", "verified_missing"].includes(request.presenceState) ||
      (entry.backend === "local_env_file"
        ? !["unknown", "verified_safe", "verified_unsafe"].includes(request.safetyState)
        : request.safetyState !== undefined)) return fail("VERIFICATION_INVALID");
  entry.presenceState = request.presenceState;
  if (entry.backend === "local_env_file") entry.safetyState = request.safetyState;
  entry.verifiedAt = new Date().toISOString();
  entry.updatedAt = entry.verifiedAt;
  environment.updatedAt = entry.verifiedAt;
  section.revision += 1;
  found.record.environments = section;
  return { ok: true, record: found.record, revision: section.revision };
}
