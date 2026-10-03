/** P10.1 Vercel contract fixtures and command construction. Never executes CLI. */
const fail = (code) => ({ ok: false, code });
const plain = (v) => v && typeof v === "object" && !Array.isArray(v);
const keys = (v, allowed) => plain(v) && Object.keys(v).every((k) => allowed.includes(k));
const locator = (v) => typeof v === "string" && /^[A-Za-z0-9._-]{1,160}$/.test(v);
const variable = (v) => typeof v === "string" && /^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(v);
const targetName = (v) => v === "preview" || v === "production";
const deploymentId = (v) => typeof v === "string" && /^dpl_[A-Za-z0-9]{8,100}$/.test(v);

/** Reduce installed CLI 59.10.0 env ls JSON. Raw Config values are toxic input. */
export function parseVercelConfigMetadata(raw) {
  const cli = keys(raw, ["envs"]) && Array.isArray(raw.envs);
  const fixture = keys(raw, ["variables"]) && Array.isArray(raw.variables);
  if (!cli && !fixture) return fail("PROVIDER_METADATA_UNSAFE");
  const variables = [];
  for (const row of cli ? raw.envs : raw.variables) {
    if (cli) {
      if (!keys(row, ["key", "value", "type", "visibility", "target", "gitBranch", "configurationId", "createdAt", "updatedAt"])) return fail("PROVIDER_METADATA_UNSAFE");
      const visibility = row.type === "sensitive" ? "secret" :
        ["plain", "encrypted", "system"].includes(row.type) ? "config" : null;
      const targets = Array.isArray(row.target) ? row.target : [row.target];
      if (!variable(row.key) || !visibility ||
          (row.visibility !== undefined && row.visibility !== visibility) ||
          targets.length === 0 || new Set(targets).size !== targets.length ||
          targets.some((t) => !targetName(t)) ||
          (row.gitBranch !== undefined && row.gitBranch !== null) ||
          (visibility === "secret" && Object.hasOwn(row, "value") && row.value != null)) {
        return fail("PROVIDER_METADATA_UNSAFE");
      }
      // A system type is factual origin evidence. configurationId alone is not.
      for (const target of targets) variables.push({ name: row.key, visibility, target,
        origin: row.type === "system" ? "system" : "unknown" });
    } else {
      if (!keys(row, ["name", "visibility", "target", "origin", "value"]) ||
          !variable(row.name) || !["config", "secret"].includes(row.visibility) ||
          !targetName(row.target) || !["user", "provider", "system", "integration", "unknown"].includes(row.origin) ||
          (row.visibility === "secret" && Object.hasOwn(row, "value") && row.value != null)) {
        return fail("PROVIDER_METADATA_UNSAFE");
      }
      variables.push({ name: row.name, visibility: row.visibility,
        target: row.target, origin: row.origin });
    }
  }
  return { ok: true, variables };
}

export function planVercelConfigProjection({ config, metadata, target }) {
  if (!Array.isArray(config) || !metadata?.ok || !targetName(target)) return fail("PROVIDER_METADATA_UNSAFE");
  if (!Array.isArray(metadata.variables) || metadata.variables.some((row) =>
    !keys(row, ["name", "visibility", "target", "origin"]) || !variable(row.name) ||
    !["config", "secret"].includes(row.visibility) || !targetName(row.target) ||
    !["user", "provider", "system", "integration", "unknown"].includes(row.origin))) return fail("PROVIDER_METADATA_UNSAFE");
  if (new Set(config.map((item) => item.variableName)).size !== config.length) return fail("CONFIG_PROJECTION_INVALID");
  const expected = new Set(config.map((item) => item.variableName));
  const actions = [];
  for (const item of [...config].sort((a, b) => a.variableName.localeCompare(b.variableName))) {
    if (item.kind !== "config" || !variable(item.variableName) || typeof item.value !== "string") return fail("CONFIG_PROJECTION_INVALID");
    const matches = metadata.variables.filter((row) => row.name === item.variableName && row.target === target);
    if (matches.length > 1) return fail("PROVIDER_CONFIG_AMBIGUOUS");
    if (matches.length && matches[0].visibility !== "config") return fail("PROVIDER_CONFIG_CONFLICT");
    actions.push({ variableName: item.variableName, operation: matches.length ? "update" : "add" });
  }
  for (const row of metadata.variables) {
    if (row.target !== target) continue;
    if (expected.has(row.name)) continue;
    if (row.visibility === "config" && !["provider", "system", "integration"].includes(row.origin)) {
      return fail("PROVIDER_CONFIG_EXTRA");
    }
  }
  return { ok: true, actions };
}

/** Return value separately as a bounded stdin payload; never place it in argv. */
export function makeVercelConfigCommand({ operation, variableName, target, value, projectRef = null, teamRef = null }) {
  if (!["add", "update"].includes(operation) || !variable(variableName) || !targetName(target) ||
      typeof value !== "string" || value.length === 0 ||
      ((value.endsWith("\n") && !value.slice(0, -1).includes("\n") && !value.slice(0, -1).includes("\r"))) ||
      (projectRef !== null && !locator(projectRef)) ||
      (teamRef !== null && !locator(teamRef))) return fail("CONFIG_COMMAND_INVALID");
  const argv = ["env", operation, variableName, target, "--type", "config", "--yes",
    ...(projectRef === null ? [] : ["--project", projectRef]),
    ...(teamRef === null ? [] : ["--scope", teamRef])];
  return { ok: true, executable: "vercel", argv, shell: false,
    stdinPayload: value, display: `vercel env ${operation} ${variableName} ${target} --type config --yes --project <project>` };
}

export function parseVercelDeploymentReceipt(raw) {
  if (!keys(raw, ["id", "url", "status", "projectRef", "target", "createdAt"]) ||
      !deploymentId(raw.id) || typeof raw.url !== "string" ||
      !/^https:\/\/[A-Za-z0-9.-]+\.vercel\.app\/?$/.test(raw.url) ||
      !["QUEUED", "INITIALIZING", "BUILDING", "READY", "ERROR", "CANCELED"].includes(raw.status) ||
      !locator(raw.projectRef) || !locator(raw.target) || typeof raw.createdAt !== "string") {
    return fail("PROVIDER_RECEIPT_UNSAFE");
  }
  return { ok: true, providerDeploymentId: raw.id, url: raw.url,
    providerState: raw.status, projectRef: raw.projectRef, target: raw.target,
    observedAt: raw.createdAt };
}

/** A serving reader must prove this exact value-free shape before live use. */
export function parseVercelServingObservation(raw) {
  if (!keys(raw, ["projectRef", "target", "deploymentId", "url", "observedAt"]) ||
      !locator(raw.projectRef) || raw.target !== "production" ||
      !deploymentId(raw.deploymentId) || typeof raw.observedAt !== "string" ||
      (raw.url !== null && (typeof raw.url !== "string" ||
        !/^https:\/\/[A-Za-z0-9.-]+\.vercel\.app\/?$/.test(raw.url)))) {
    return fail("PROVIDER_SERVING_UNSAFE");
  }
  return { ok: true, projectRef: raw.projectRef, target: raw.target,
    providerDeploymentId: raw.deploymentId, url: raw.url, observedAt: raw.observedAt };
}

/** Metadata helps reconcile an uncertain submission; it is not idempotency. */
export function operationMetadata({ operationId, buildId, projectRef }) {
  if (!/^[a-f0-9-]{36}$/i.test(String(operationId || "")) ||
      !locator(buildId) || !locator(projectRef)) return fail("OPERATION_METADATA_INVALID");
  return { ok: true, pathOperationId: operationId, pathBuildId: buildId,
    pathProjectRef: projectRef };
}

export const VERCEL_LIVE_PROOF_GATES = Object.freeze([
  "type_config", "env_add_stdin", "env_update_stdin", "value_absent_from_argv",
  "config_metadata_reduction", "secret_plaintext_fail_closed", "safe_deployment_receipt",
  "safe_deployment_status", "operation_metadata_lookup", "creator_auth_readiness",
  "mapped_project_readiness",
]);
