/** Strict Vercel Production deployment boundary. No serving/release operations live here. */
import { spawn } from "node:child_process";
import { createVercelChildEnv, parsePreviewAuth, parsePreviewProjectList } from "./vercel-preview-adapter.mjs";
import { PRODUCTION_DEPLOY_EXECUTION_TIMEOUT_MS } from "./deployments.mjs";
import { parseVercelConfigMetadata, planVercelConfigProjection, makeVercelConfigCommand } from "./vercel-deploy-contract.mjs";

const fail = (code) => ({ ok: false, code });
const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const only = (v, keys) => object(v) && Object.keys(v).every((key) => keys.includes(key));
const locator = (v) => typeof v === "string" && /^[A-Za-z0-9._-]{1,160}$/.test(v);
const deploymentId = (v) => typeof v === "string" && /^dpl_[A-Za-z0-9]{8,100}$/.test(v);
const providerUrl = (v) => typeof v === "string" && /^https:\/\/[A-Za-z0-9.-]+\.vercel\.app\/?$/.test(v);
const states = new Set(["QUEUED", "INITIALIZING", "BUILDING", "DEPLOYING", "ANALYZING", "READY", "ERROR", "CANCELED"]);
const inspectOptional = Object.freeze({ aliases: Array.isArray, builds: Array.isArray, routes: Array.isArray });
const scopeArgs = (teamRef) => teamRef === null ? [] : ["--scope", teamRef];
const command = (argv, display) => ({ ok: true, executable: "vercel", argv, shell: false, display });

export const MAX_PRODUCTION_RECONCILIATION_PAGES = 20;
export const MAX_PRODUCTION_IDENTITY_INSPECTIONS = 20;

export function makeProductionConfigMetadataCommand({ projectRef, teamRef = null }) {
  if (!locator(projectRef) || (teamRef !== null && !locator(teamRef))) return fail("PRODUCTION_COMMAND_INVALID");
  return command(["env", "ls", "production", "--json", "--project", projectRef, ...scopeArgs(teamRef)],
    "vercel env ls production --json --project <project>");
}

export function makeProductionAuthCommand({ teamRef = null }) {
  if (teamRef !== null && !locator(teamRef)) return fail("PRODUCTION_COMMAND_INVALID");
  return command(["whoami", "--json", ...scopeArgs(teamRef)], "vercel whoami --json");
}

export function makeProductionProjectCommand({ projectRef, teamRef = null }) {
  if (!locator(projectRef) || (teamRef !== null && !locator(teamRef))) return fail("PRODUCTION_COMMAND_INVALID");
  return command(["project", "list", "--json", "--filter", projectRef, "--limit", "100", ...scopeArgs(teamRef)],
    "vercel project list --json --filter <project> --limit 100");
}

export function makeProductionConfigCommand(input) {
  const spec = makeVercelConfigCommand({ ...input, target: "production" });
  return spec.ok ? { ...spec, display: `vercel env ${input.operation} ${input.variableName} production --type config --yes --project <project>` } : spec;
}

export function makeProductionDeployCommand({ projectRef, teamRef = null, operationId, buildId }) {
  if (!locator(projectRef) || (teamRef !== null && !locator(teamRef)) ||
      !/^[a-f0-9-]{36}$/i.test(String(operationId || "")) ||
      !/^[a-f0-9-]{36}$/i.test(String(buildId || ""))) return fail("PRODUCTION_COMMAND_INVALID");
  const argv = ["deploy", "--target", "production", "--skip-domain", "--project", projectRef,
    "--meta", `pathOperationId=${operationId}`, "--meta", `pathBuildId=${buildId}`,
    "--meta", `pathProjectRef=${projectRef}`, "--json", "--no-wait", "--yes", ...scopeArgs(teamRef)];
  return command(argv, "vercel deploy --target production --skip-domain --project <project> --meta <PATH operation> --json --no-wait --yes");
}

export function makeProductionInspectCommand({ providerDeploymentId, teamRef = null }) {
  if (!deploymentId(providerDeploymentId) || (teamRef !== null && !locator(teamRef))) return fail("PRODUCTION_INSPECT_INVALID");
  return command(["inspect", providerDeploymentId, "--json", ...scopeArgs(teamRef)], "vercel inspect <production deployment> --json");
}

export function makeProductionIdentityInspectCommand({ url, teamRef = null }) {
  if (!providerUrl(url) || (teamRef !== null && !locator(teamRef))) return fail("PRODUCTION_RECONCILE_INVALID");
  return command(["inspect", url, "--json", ...scopeArgs(teamRef)], "vercel inspect <operation-correlated Production URL> --json");
}

export function makeProductionReconciliationPageCommand({ mode, projectRef, teamRef = null,
  operationId, buildId, nextCursor = null }) {
  if (!["METADATA_FILTERED_OPERATION", "PROJECT_WINDOW"].includes(mode) || !locator(projectRef) ||
      (teamRef !== null && !locator(teamRef)) || !/^[a-f0-9-]{36}$/i.test(String(operationId || "")) ||
      !/^[a-f0-9-]{36}$/i.test(String(buildId || "")) ||
      (nextCursor !== null && (!Number.isSafeInteger(nextCursor) || nextCursor <= 0))) return fail("PRODUCTION_RECONCILE_INVALID");
  const argv = ["list", projectRef, "--target", "production", "--json", "--limit", "100"];
  if (mode === "METADATA_FILTERED_OPERATION") argv.push("--meta", `pathOperationId=${operationId}`);
  if (nextCursor !== null) argv.push("--next", String(nextCursor));
  argv.push(...scopeArgs(teamRef));
  return command(argv, "vercel list <project> --target production --meta <PATH operation> --json --limit 100");
}

function validCreatedAt(value) { return Number.isSafeInteger(value) && value >= 0; }
function statusFacts(raw, { providerDeploymentId, url = null, projectName }) {
  const allowed = ["id", "name", "url", "target", "readyState", "createdAt", "contextName", ...Object.keys(inspectOptional)];
  if (!only(raw, allowed) || Object.entries(inspectOptional).some(([key, check]) => Object.hasOwn(raw, key) && !check(raw[key])) ||
      (raw.contextName !== undefined && typeof raw.contextName !== "string") || !deploymentId(raw.id) ||
      (providerDeploymentId && raw.id !== providerDeploymentId) || raw.name !== projectName ||
      typeof raw.url !== "string" || !providerUrl(`https://${raw.url}`) ||
      (url !== null && `https://${raw.url}` !== url) || raw.target !== "production" ||
      !states.has(raw.readyState) || !validCreatedAt(raw.createdAt)) return fail("PRODUCTION_STATUS_UNSAFE");
  return { ok: true, providerDeploymentId: raw.id, url: `https://${raw.url}`,
    providerState: raw.readyState, target: "production", createdAt: raw.createdAt };
}

export function parseProductionDeploymentReceipt(raw, { projectRef }) {
  if (!locator(projectRef)) return fail("PROVIDER_RECEIPT_UNSAFE");
  let wrapper = raw;
  if (object(raw) && raw.status === "ok" && object(raw.deployment)) {
    if (!only(raw, ["status", "deployment", "message", "hint", "next"]) ||
        (raw.message !== undefined && typeof raw.message !== "string") ||
        (raw.hint !== undefined && typeof raw.hint !== "string") ||
        (raw.next !== undefined && !Array.isArray(raw.next))) return fail("PROVIDER_RECEIPT_UNSAFE");
    wrapper = raw.deployment;
  }
  if (!only(wrapper, ["id", "url", "inspectorUrl", "readyState", "target", "deploymentApiUrl"]) ||
      !deploymentId(wrapper.id) || !providerUrl(wrapper.url) || wrapper.target !== "production" ||
      (wrapper.readyState != null && !states.has(wrapper.readyState)) ||
      (wrapper.inspectorUrl != null && typeof wrapper.inspectorUrl !== "string") ||
      (wrapper.deploymentApiUrl != null && typeof wrapper.deploymentApiUrl !== "string")) return fail("PROVIDER_RECEIPT_UNSAFE");
  return { ok: true, providerDeploymentId: wrapper.id, url: wrapper.url,
    target: "production", providerState: wrapper.readyState ?? null };
}

export function parseProductionDeploymentStatus(raw, context) {
  if (!object(context) || !deploymentId(context.providerDeploymentId) || !locator(context.projectName)) return fail("PRODUCTION_STATUS_UNSAFE");
  return statusFacts(raw, context);
}

export function parseProductionReconciliationPage(raw, { mode, projectName, operationId, buildId, projectRef, windowStart, windowEnd }) {
  if (!object(raw) || !only(raw, ["contextName", "deployments", "pagination"]) ||
      typeof raw.contextName !== "string" || !Array.isArray(raw.deployments) || raw.deployments.length > 100 ||
      !object(raw.pagination) || !only(raw.pagination, ["count", "next", "prev"]) ||
      !Number.isSafeInteger(raw.pagination.count) || raw.pagination.count < 0 ||
      (raw.pagination.next !== null && (!Number.isSafeInteger(raw.pagination.next) || raw.pagination.next <= 0)) ||
      !["METADATA_FILTERED_OPERATION", "PROJECT_WINDOW"].includes(mode) || !locator(projectName) ||
      !/^[a-f0-9-]{36}$/i.test(String(operationId || "")) || !/^[a-f0-9-]{36}$/i.test(String(buildId || "")) ||
      !locator(projectRef) || !Number.isFinite(Date.parse(windowStart)) || !Number.isFinite(Date.parse(windowEnd)) ||
      Date.parse(windowStart) >= Date.parse(windowEnd)) return fail("PROVIDER_RECONCILE_UNSAFE");
  if (raw.contextName !== projectName) return fail("PROVIDER_RECONCILE_UNSAFE");
  const matches = [];
  const start = Date.parse(windowStart), end = Date.parse(windowEnd);
  for (const row of raw.deployments) {
    if (!only(row, ["id", "url", "name", "state", "target", "customEnvironment", "createdAt", "buildingAt", "ready", "creator", "meta"]) ||
        (Object.hasOwn(row, "id") && !deploymentId(row.id)) || row.name !== projectName || row.target !== "production" ||
        row.customEnvironment != null || !states.has(row.state) || !validCreatedAt(row.createdAt) ||
        (row.url !== null && !providerUrl(`https://${row.url}`)) || (row.meta != null && !object(row.meta))) return fail("PROVIDER_RECONCILE_UNSAFE");
    if (row.createdAt < start || row.createdAt > end) continue;
    if (!object(row.meta) || !/^[a-f0-9-]{36}$/i.test(String(row.meta.pathOperationId || "")) ||
        row.meta.pathBuildId !== buildId || row.meta.pathProjectRef !== projectRef) return fail("PROVIDER_RECONCILE_INCOMPLETE");
    if (row.meta.pathOperationId !== operationId) continue;
    if (!row.url) return fail("PROVIDER_RECONCILE_INCOMPLETE");
    matches.push({ providerDeploymentId: Object.hasOwn(row, "id") ? row.id : null,
      url: `https://${row.url}`, providerState: row.state, target: "production", createdAt: row.createdAt });
  }
  return { ok: true, mode, matches, nextCursor: raw.pagination.next, completed: true };
}

export function combineProductionReconciliation(filtered, projectWindow) {
  const valid = (source) => source?.ok === true && source.completed === true && source.nextCursor === null &&
    Array.isArray(source.matches) && source.matches.every((m) => object(m) &&
      (m.providerDeploymentId === null || deploymentId(m.providerDeploymentId)) && providerUrl(m.url) &&
      states.has(m.providerState) && m.target === "production" && validCreatedAt(m.createdAt));
  if (!valid(filtered) || !valid(projectWindow) || filtered.mode !== "METADATA_FILTERED_OPERATION" ||
      projectWindow.mode !== "PROJECT_WINDOW") return { ok: false, outcome: "PROVIDER_RECONCILE_INCOMPLETE" };
  if (filtered.matches.length > 1 || projectWindow.matches.length > 1) return { ok: false, outcome: "PROVIDER_RECONCILE_AMBIGUOUS" };
  if (filtered.matches.length !== projectWindow.matches.length) return { ok: false, outcome: "PROVIDER_RECONCILE_CONFLICT" };
  if (!filtered.matches.length) return { ok: true, outcome: "VALID_ZERO_ZERO_EVIDENCE_CANDIDATE", match: null };
  const a = filtered.matches[0], b = projectWindow.matches[0];
  if (a.url !== b.url || a.createdAt !== b.createdAt ||
      (a.providerDeploymentId && b.providerDeploymentId && a.providerDeploymentId !== b.providerDeploymentId))
    return { ok: false, outcome: "PROVIDER_RECONCILE_CONFLICT" };
  return { ok: true, outcome: "UNIQUE_FACTUAL_MATCH", match: { ...a,
    providerDeploymentId: a.providerDeploymentId ?? b.providerDeploymentId } };
}

export async function reconcileProductionDeployment(input, { executePage, executeIdentity,
  maxPages = MAX_PRODUCTION_RECONCILIATION_PAGES, maxIdentityInspections = MAX_PRODUCTION_IDENTITY_INSPECTIONS }) {
  const results = [];
  const identityCache = new Map();
  for (const mode of ["METADATA_FILTERED_OPERATION", "PROJECT_WINDOW"]) {
    let cursor = null, pages = 0, matches = [];
    do {
      const spec = makeProductionReconciliationPageCommand({ ...input, mode, nextCursor: cursor });
      if (!spec.ok) return { ok: false, outcome: "PROVIDER_RECONCILE_INVALID" };
      const page = await executePage(spec, { ...input, mode, nextCursor: cursor });
      if (!page.ok) return { ok: false, outcome: "PROVIDER_RECONCILE_INCOMPLETE" };
      pages++;
      matches.push(...page.matches);
      cursor = page.nextCursor;
      if (cursor !== null && pages >= maxPages) return { ok: false, outcome: "PROVIDER_RECONCILE_INCOMPLETE" };
    } while (cursor !== null);
    for (const candidate of matches) {
      if (candidate.providerDeploymentId !== null) continue;
      let identity = identityCache.get(candidate.url);
      if (!identity) {
        if (identityCache.size >= maxIdentityInspections) return { ok: false, outcome: "PROVIDER_RECONCILE_INCOMPLETE" };
        identity = await executeIdentity(makeProductionIdentityInspectCommand({ url: candidate.url, teamRef: input.teamRef }),
          { providerDeploymentId: null, url: candidate.url, projectName: input.projectName });
        if (!identity.ok || identity.url !== candidate.url || identity.target !== "production")
          return { ok: false, outcome: "PROVIDER_RECONCILE_INCOMPLETE" };
        identityCache.set(candidate.url, identity);
      }
      candidate.providerDeploymentId = identity.providerDeploymentId;
    }
    results.push({ ok: true, mode, matches, completed: true, nextCursor: null });
  }
  const result = combineProductionReconciliation(results[0], results[1]);
  if (!result.ok || result.outcome !== "UNIQUE_FACTUAL_MATCH" || !deploymentId(result.match.providerDeploymentId)) return result;
  return result;
}

/** Executor accepts only exact Production deployment read/write shapes and never returns raw output. */
export async function executeProductionVercelCommand(spec, { cwd, parentEnv = process.env, mode,
  context = {}, spawnImpl = spawn, timeoutMs = PRODUCTION_DEPLOY_EXECUTION_TIMEOUT_MS }) {
  if (!spec?.ok || spec.executable !== "vercel" || spec.shell !== false || !Array.isArray(spec.argv) || typeof cwd !== "string" ||
      !["production_auth", "production_project", "production_config_metadata", "production_config_write", "production_deploy_receipt", "production_status", "production_identity_inspect", "production_reconcile_page"].includes(mode) ||
      timeoutMs < 1 || timeoutMs > 120_000) return fail("PROVIDER_COMMAND_INVALID");
  const expected = { production_auth: ["whoami", "--json"], production_project: ["project", "list"],
    production_config_metadata: ["env", "ls"], production_config_write: ["env", context.operation],
    production_deploy_receipt: ["deploy", "--target", "production"],
    production_status: ["inspect", context.providerDeploymentId],
    production_identity_inspect: ["inspect", context.url],
    production_reconcile_page: ["list", context.projectRef] }[mode];
  if (!expected || spec.argv[0] !== expected[0] || spec.argv[1] !== expected[1] ||
      (mode === "production_deploy_receipt" && (spec.argv[2] !== "production" || !spec.argv.includes("--skip-domain"))) ||
      spec.argv.some((arg) => ["--prod", "--env", "--build-env", "--logs", "--debug", "--wait", "--token"].includes(arg)) ||
      (!['production_deploy_receipt', 'production_config_write'].includes(mode) && !spec.argv.includes("--json")) ||
      (mode === "production_auth" && JSON.stringify(spec.argv) !== JSON.stringify(makeProductionAuthCommand(context).argv)) ||
      (mode === "production_project" && JSON.stringify(spec.argv) !== JSON.stringify(makeProductionProjectCommand(context).argv)) ||
      (mode === "production_config_metadata" && JSON.stringify(spec.argv) !== JSON.stringify(makeProductionConfigMetadataCommand(context).argv)) ||
      (mode === "production_config_write" && (spec.argv[2] !== context.variableName || spec.argv[3] !== "production" ||
        spec.argv[4] !== "--type" || spec.argv[5] !== "config" || typeof spec.stdinPayload !== "string"))) return fail("PROVIDER_COMMAND_INVALID");
  const exact = mode === "production_auth" ? makeProductionAuthCommand(context) :
    mode === "production_project" ? makeProductionProjectCommand(context) :
    mode === "production_deploy_receipt" ? makeProductionDeployCommand(context) :
    mode === "production_status" ? makeProductionInspectCommand({ providerDeploymentId: context.providerDeploymentId, teamRef: context.teamRef ?? null }) :
    mode === "production_identity_inspect" ? makeProductionIdentityInspectCommand({ url: context.url, teamRef: context.teamRef ?? null }) :
    mode === "production_reconcile_page" ? makeProductionReconciliationPageCommand(context) :
    mode === "production_config_metadata" ? makeProductionConfigMetadataCommand(context) :
    mode === "production_config_write" ? makeProductionConfigCommand({ operation: context.operation,
      variableName: context.variableName, target: "production", value: spec.stdinPayload,
      projectRef: context.projectRef, teamRef: context.teamRef ?? null }) : null;
  if (!exact?.ok || JSON.stringify(spec.argv) !== JSON.stringify(exact.argv) ||
      (mode === "production_config_write" && exact.stdinPayload !== spec.stdinPayload)) return fail("PROVIDER_COMMAND_INVALID");
  return new Promise((resolve) => {
    let output = "", size = 0, done = false;
    const finish = (value) => { if (!done) { done = true; resolve(value); } };
    let child;
    try { child = spawnImpl(spec.executable, spec.argv, { cwd, env: createVercelChildEnv(parentEnv), shell: false, stdio: ["pipe", "pipe", "pipe"] }); }
    catch { return finish(fail("PROVIDER_EXECUTION_FAILED")); }
    const timer = setTimeout(() => { child.kill("SIGKILL"); finish(mode === "production_deploy_receipt" ? fail("PROVIDER_SUBMISSION_OUTCOME_UNKNOWN") : fail("PROVIDER_TIMEOUT")); }, timeoutMs);
    child.stdout.on("data", (chunk) => { size += chunk.length; if (size > 1024 * 1024) { child.kill(); finish(mode === "production_deploy_receipt" ? fail("PROVIDER_SUBMISSION_OUTCOME_UNKNOWN") : fail("PROVIDER_OUTPUT_LIMIT")); } else output += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => { size += chunk.length; if (size > 1024 * 1024) { child.kill(); finish(mode === "production_deploy_receipt" ? fail("PROVIDER_SUBMISSION_OUTCOME_UNKNOWN") : fail("PROVIDER_OUTPUT_LIMIT")); } });
    child.on("error", () => { clearTimeout(timer); finish(fail("PROVIDER_EXECUTION_FAILED")); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (done) return;
      if (mode === "production_config_write") return finish(code === 0
        ? { ok: true, acknowledged: true } : fail("PROVIDER_COMMAND_FAILED"));
      let raw;
      try { raw = JSON.parse(output); } catch { return finish(mode === "production_deploy_receipt" ? fail("PROVIDER_SUBMISSION_OUTCOME_UNKNOWN") : fail("PROVIDER_OUTPUT_UNSAFE")); }
      if (code !== 0) return finish(mode === "production_deploy_receipt" ? fail("PROVIDER_SUBMISSION_OUTCOME_UNKNOWN") : fail("PROVIDER_COMMAND_FAILED"));
      const reduced = mode === "production_auth" ? parsePreviewAuth(raw, context.teamRef ?? null) :
        mode === "production_project" ? parsePreviewProjectList(raw, context) :
        mode === "production_config_metadata" ? parseVercelConfigMetadata(raw) :
        mode === "production_deploy_receipt" ? parseProductionDeploymentReceipt(raw, context) :
        mode === "production_status" ? parseProductionDeploymentStatus(raw, context) :
        mode === "production_identity_inspect" ? statusFacts(raw, context) :
        parseProductionReconciliationPage(raw, context);
      finish(reduced);
    });
    child.stdin.end(mode === "production_config_write" ? spec.stdinPayload : undefined);
  });
}
