/** P10.2A provider contracts for installed Vercel CLI 59.10.0. No call site performs live work here. */
import { spawn } from "node:child_process";
import { parseVercelConfigMetadata } from "./vercel-deploy-contract.mjs";

const fail = (code) => ({ ok: false, code });
const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const shape = (v, allowed) => object(v) && Object.keys(v).every((k) => allowed.includes(k));
const locator = (v) => typeof v === "string" && /^[A-Za-z0-9._-]{1,160}$/.test(v);
const opId = (v) => typeof v === "string" && /^[a-f0-9-]{36}$/i.test(v);
const deploymentId = (v) => typeof v === "string" && /^dpl_[A-Za-z0-9]{8,100}$/.test(v);
const providerUrl = (v) => typeof v === "string" && /^https:\/\/[A-Za-z0-9.-]+\.vercel\.app\/?$/.test(v);
const states = new Set(["QUEUED", "INITIALIZING", "BUILDING", "DEPLOYING", "ANALYZING", "READY", "ERROR", "CANCELED"]);
const command = (argv, display) => ({ ok: true, executable: "vercel", argv, display, shell: false });
const scopeArgs = (teamRef) => teamRef === null ? [] : ["--scope", teamRef];

/** One vocabulary for legacy and bounded reconciliation. */
export const PREVIEW_RECONCILIATION_CODES = Object.freeze({
  INVALID: "PROVIDER_RECONCILE_INVALID",
  UNSAFE: "PROVIDER_RECONCILE_UNSAFE",
  AMBIGUOUS: "PROVIDER_RECONCILE_AMBIGUOUS",
  INCOMPLETE: "PROVIDER_RECONCILE_INCOMPLETE",
  CONFLICT: "PROVIDER_RECONCILE_CONFLICT",
});
// Twenty 100-row pages cover 2,000 deployments; exhaustion, never this bound,
// is the authority for a zero result. The acceptance project previously had 0.
export const MAX_RECONCILIATION_PAGES = 20;
// Installed 59.10.0 list JSON exposes meta; inspect JSON omits it. No inspect
// fallback is authorized on this CLI. Keep the candidate budget explicit.
export const MAX_RECONCILIATION_INSPECTIONS = 20;
/** The sole maximum duration of a Preview deploy CLI invocation. */
export const PREVIEW_DEPLOY_EXECUTION_TIMEOUT_MS = 30_000;
const canonicalTime = (v) => typeof v === "string" &&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) &&
  Number.isFinite(Date.parse(v)) && new Date(Date.parse(v)).toISOString() === v;
const windowValid = (start, end) => canonicalTime(start) && canonicalTime(end) && Date.parse(start) < Date.parse(end);
const cursorValid = (v) => v === null || Number.isSafeInteger(v) && v > 0;

/** CLI child receives only execution/session coordinates; token and PATH credentials are excluded. */
export function createVercelChildEnv(parent = process.env) {
  const allowed = ["PATH", "HOME", "TMPDIR", "TMP", "TEMP", "USER", "LOGNAME", "LANG", "LC_ALL", "LC_CTYPE", "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_DATA_HOME", "NO_COLOR", "TERM", "SYSTEMROOT"];
  const env = Object.create(null);
  for (const name of allowed) if (typeof parent[name] === "string") env[name] = parent[name];
  env.NO_COLOR = "1";
  return env;
}

export function makePreviewReadCommands({ projectRef, teamRef = null }) {
  if (!locator(projectRef) || (teamRef !== null && !locator(teamRef))) return fail("PROVIDER_MAPPING_INVALID");
  const scope = scopeArgs(teamRef);
  return { ok: true,
    auth: command(["whoami", "--json", ...scope], "vercel whoami --json"),
    projects: command(["project", "list", "--json", "--filter", projectRef, "--limit", "100", ...scope], "vercel project list --json --filter <project> --limit 100"),
    config: command(["env", "ls", "preview", "--json", "--project", projectRef, ...scope], "vercel env ls preview --json --project <project>"),
  };
}

export function makePreviewDeployCommand({ projectRef, teamRef = null, operationId }) {
  if (!locator(projectRef) || (teamRef !== null && !locator(teamRef)) || !opId(operationId)) return fail("PREVIEW_COMMAND_INVALID");
  const argv = ["deploy", "--target", "preview", "--project", projectRef,
    "--meta", `pathOperationId=${operationId}`, "--json", "--no-wait", "--yes", ...scopeArgs(teamRef)];
  return command(argv, "vercel deploy --target preview --project <project> --meta pathOperationId=<operation> --json --no-wait --yes");
}

export function makePreviewInspectCommand({ providerDeploymentId, teamRef = null }) {
  if (!deploymentId(providerDeploymentId) || (teamRef !== null && !locator(teamRef))) return fail("PROVIDER_INSPECT_INVALID");
  return command(["inspect", providerDeploymentId, "--json", ...scopeArgs(teamRef)], "vercel inspect <deployment> --json");
}

export function makePreviewReconcileCommand({ projectRef, teamRef = null, operationId }) {
  if (!locator(projectRef) || (teamRef !== null && !locator(teamRef)) || !opId(operationId)) return fail(PREVIEW_RECONCILIATION_CODES.INVALID);
  return command(["list", projectRef, "--environment", "preview", "--meta", `pathOperationId=${operationId}`,
    "--json", "--limit", "100", ...scopeArgs(teamRef)],
  "vercel list <project> --environment preview --meta pathOperationId=<operation> --json --limit 100");
}

/** Bounded list traversal uses the installed --next Unix-millisecond cursor. */
export function makePreviewReconciliationPageCommand({ mode, projectRef, teamRef = null, operationId,
  windowStart, windowEnd, nextCursor = null }) {
  if (!["METADATA_FILTERED_OPERATION", "PROJECT_WINDOW"].includes(mode) || !locator(projectRef) ||
      (teamRef !== null && !locator(teamRef)) || !opId(operationId) || !windowValid(windowStart, windowEnd) ||
      !cursorValid(nextCursor)) return fail(PREVIEW_RECONCILIATION_CODES.INVALID);
  const argv = ["list", projectRef, "--environment", "preview"];
  if (mode === "METADATA_FILTERED_OPERATION") argv.push("--meta", `pathOperationId=${operationId}`);
  argv.push("--json", "--limit", "100");
  if (nextCursor !== null) argv.push("--next", String(nextCursor));
  argv.push(...scopeArgs(teamRef));
  return command(argv, "vercel list <project> --environment preview [--meta pathOperationId=<operation>] --json --limit 100 [--next <cursor>]");
}

export function parsePreviewAuth(raw, teamRef = null) {
  if (!shape(raw, ["team", "username", "email", "name", "app", "localOverride", "globalTeam", "loggedIn"]) ||
      raw.loggedIn === false || !locator(raw.username) || raw.localOverride === true ||
      (teamRef !== null && (!object(raw.team) ||
        (raw.team.id !== teamRef && raw.team.slug !== teamRef)))) return fail("PROVIDER_AUTH_REQUIRED");
  return { ok: true, authenticated: true, teamRef: raw.team?.id ?? null };
}

export function parsePreviewProjectList(raw, { projectRef }) {
  if (!shape(raw, ["projects", "pagination", "contextName", "elapsed"]) || !Array.isArray(raw.projects) ||
      !object(raw.pagination) || raw.pagination.next) return fail("PROVIDER_PROJECT_UNVERIFIED");
  if (raw.projects.some((p) => !shape(p, ["name", "id", "latestProductionUrl", "updatedAt", "nodeVersion", "deprecated"])))
    return fail("PROVIDER_PROJECT_UNVERIFIED");
  const matches = raw.projects.filter((p) => p?.id === projectRef || p?.name === projectRef);
  if (matches.length !== 1 || !locator(matches[0].id) || !locator(matches[0].name)) return fail("PROVIDER_PROJECT_UNVERIFIED");
  return { ok: true, projectId: matches[0].id, projectName: matches[0].name };
}

/** Installed deploy --json may return a direct deployment or noninteractive wrapper. */
export function parsePreviewDeploymentReceipt(raw) {
  if (object(raw) && ["error", "action_required"].includes(raw.status)) {
    if (!shape(raw, ["status", "reason", "message", "next", "deployment"]) ||
        typeof raw.reason !== "string" || typeof raw.message !== "string" ||
        !Array.isArray(raw.next) || raw.deployment !== undefined) return fail("PROVIDER_RECEIPT_UNSAFE");
    // These installed CLI preflight reasons precede deployment creation. Other
    // errors may follow an accepted submission and remain uncertain.
    if (["project_not_found", "not_linked", "login_required", "missing_scope",
      "scope_not_accessible", "confirmation_required", "project_settings_required"].includes(raw.reason)) {
      return fail("PROVIDER_SUBMISSION_REJECTED");
    }
    return fail("PROVIDER_SUBMISSION_OUTCOME_UNKNOWN");
  }
  if (object(raw) && Object.hasOwn(raw, "deployment") &&
      !shape(raw, ["status", "deployment", "message", "hint", "next"])) return fail("PROVIDER_RECEIPT_UNSAFE");
  const wrapper = object(raw) && raw.status === "ok" && object(raw.deployment) ? raw.deployment : raw;
  if (!shape(wrapper, ["id", "url", "inspectorUrl", "readyState", "target", "deploymentApiUrl"]) ||
      !deploymentId(wrapper.id) || !providerUrl(wrapper.url) ||
      !["preview", null].includes(wrapper.target) ||
      (wrapper.readyState != null && !states.has(wrapper.readyState))) return fail("PROVIDER_RECEIPT_UNSAFE");
  return { ok: true, providerDeploymentId: wrapper.id, url: wrapper.url,
    target: wrapper.target, providerState: wrapper.readyState ?? null };
}

/** Inspect JSON can include routes/builds/aliases; reject those rather than forwarding. */
export function parsePreviewDeploymentStatus(raw, expectedId) {
  if (!shape(raw, ["id", "name", "url", "target", "readyState", "createdAt", "contextName"]) ||
      !deploymentId(raw.id) || raw.id !== expectedId || raw.target !== "preview" ||
      !states.has(raw.readyState) || !locator(raw.name) || !providerUrl(`https://${raw.url}`) ||
      !Number.isSafeInteger(raw.createdAt)) return fail("PROVIDER_STATUS_UNSAFE");
  return { ok: true, providerDeploymentId: raw.id, providerState: raw.readyState,
    url: `https://${raw.url}`, target: "preview", createdAt: raw.createdAt };
}

export function parsePreviewReconciliation(raw, { projectRef, projectName = projectRef, operationId }) {
  if (!shape(raw, ["contextName", "deployments", "pagination"]) || !Array.isArray(raw.deployments) ||
      !object(raw.pagination) || raw.pagination.next || !locator(projectRef) || !locator(projectName) || !opId(operationId)) return fail(PREVIEW_RECONCILIATION_CODES.UNSAFE);
  const matches = [];
  for (const dep of raw.deployments) {
    if (!shape(dep, ["id", "url", "name", "state", "target", "customEnvironment", "createdAt", "buildingAt", "ready", "creator", "meta"]) ||
        !shape(dep.meta, ["pathOperationId"]) || dep.meta.pathOperationId !== operationId || dep.name !== projectName ||
        dep.target !== "preview" || !deploymentId(dep.id) || !states.has(dep.state) ||
        !providerUrl(`https://${dep.url}`)) return fail(PREVIEW_RECONCILIATION_CODES.UNSAFE);
    matches.push({ providerDeploymentId: dep.id, url: `https://${dep.url}`,
      providerState: dep.state, target: "preview" });
  }
  if (matches.length > 1) return fail(PREVIEW_RECONCILIATION_CODES.AMBIGUOUS);
  return { ok: true, match: matches[0] ?? null, retry: false };
}

/** Strictly reduce one CLI list page. Other metadata keys are ignored, never forwarded. */
export function parsePreviewReconciliationPage(raw, { mode, projectRef, projectName = projectRef,
  operationId, windowStart, windowEnd }) {
  if (!["METADATA_FILTERED_OPERATION", "PROJECT_WINDOW"].includes(mode) || !locator(projectRef) ||
      !locator(projectName) || !opId(operationId) || !windowValid(windowStart, windowEnd) ||
      !shape(raw, ["contextName", "deployments", "pagination"]) || typeof raw.contextName !== "string" ||
      !Array.isArray(raw.deployments) ||
      raw.deployments.length > 100 || !shape(raw.pagination, ["count", "next", "prev"]) ||
      !Object.hasOwn(raw.pagination, "next") || !cursorValid(raw.pagination.next) ||
      !Number.isSafeInteger(raw.pagination.count) || raw.pagination.count < 0 ||
      (raw.pagination.prev !== undefined && !cursorValid(raw.pagination.prev)))
    return fail(PREVIEW_RECONCILIATION_CODES.UNSAFE);
  const start = Date.parse(windowStart), end = Date.parse(windowEnd);
  const matches = [];
  let inWindowCount = 0;
  for (const dep of raw.deployments) {
    if (!shape(dep, ["id", "url", "name", "state", "target", "customEnvironment", "createdAt",
      "buildingAt", "ready", "creator", "meta"]) || !deploymentId(dep.id) || dep.name !== projectName ||
      !["preview", null].includes(dep.target) || dep.customEnvironment != null || !states.has(dep.state) || !Number.isSafeInteger(dep.createdAt) ||
      dep.createdAt < 0 || (dep.url !== null && !providerUrl(`https://${dep.url}`)) ||
      (dep.meta !== undefined && dep.meta !== null && !object(dep.meta)))
      return fail(PREVIEW_RECONCILIATION_CODES.UNSAFE);
    if (dep.createdAt < start || dep.createdAt > end) continue;
    inWindowCount += 1;
    // An unknown operation identity cannot establish a factual non-match.
    if (!object(dep.meta) || !opId(dep.meta.pathOperationId))
      return fail(PREVIEW_RECONCILIATION_CODES.INCOMPLETE);
    const factualOperationId = dep.meta.pathOperationId;
    if (mode === "METADATA_FILTERED_OPERATION" && factualOperationId !== operationId)
      return fail(PREVIEW_RECONCILIATION_CODES.UNSAFE);
    if (factualOperationId !== operationId) {
      continue;
    }
    if (dep.url === null) return fail(PREVIEW_RECONCILIATION_CODES.INCOMPLETE);
    matches.push({ providerDeploymentId: dep.id, url: `https://${dep.url}`,
      providerState: dep.state, target: "preview", createdAt: dep.createdAt });
  }
  return { ok: true, mode, windowStart, windowEnd, completed: true,
    exhausted: raw.pagination.next === null, nextCursor: raw.pagination.next,
    exactMatchCount: matches.length, totalDeploymentsObserved: inWindowCount, matches };
}

/** Pure consistency check. An incomplete source always prevents authority. */
export function combinePreviewReconciliation(filtered, projectWindow) {
  if (![filtered, projectWindow].every((r) => r?.ok && r.completed === true && r.exhausted === true &&
      r.nextCursor === null && Array.isArray(r.matches) && r.exactMatchCount === r.matches.length &&
      r.matches.every((m) => shape(m, ["providerDeploymentId", "url", "providerState", "target", "createdAt"]) &&
        deploymentId(m.providerDeploymentId) && providerUrl(m.url) && states.has(m.providerState) &&
        m.target === "preview" && Number.isSafeInteger(m.createdAt))) ||
      filtered.windowStart !== projectWindow.windowStart || filtered.windowEnd !== projectWindow.windowEnd ||
      filtered.mode !== "METADATA_FILTERED_OPERATION" || projectWindow.mode !== "PROJECT_WINDOW")
    return fail(PREVIEW_RECONCILIATION_CODES.INCOMPLETE);
  if (filtered.matches.length > 1 || projectWindow.matches.length > 1)
    return fail(PREVIEW_RECONCILIATION_CODES.AMBIGUOUS);
  if (filtered.matches.length !== projectWindow.matches.length ||
      (filtered.matches.length === 1 && filtered.matches[0].providerDeploymentId !== projectWindow.matches[0].providerDeploymentId))
    return fail(PREVIEW_RECONCILIATION_CODES.CONFLICT);
  if (filtered.matches.length === 0) return { ok: true, outcome: "VALID_ZERO_ZERO_EVIDENCE_CANDIDATE", retry: false };
  const match = filtered.matches[0];
  return { ok: true, outcome: "UNIQUE_FACTUAL_MATCH",
    match: { providerDeploymentId: match.providerDeploymentId, url: match.url,
      providerState: match.providerState, target: "preview", createdAt: match.createdAt }, retry: false };
}

/** Explicitly map report facts into the frozen asymmetric B5R evidence schema. */
export function makeNoDeploymentObservedEvidence(identity, filtered, projectWindow, completedAt) {
  const consistency = combinePreviewReconciliation(filtered, projectWindow);
  if (!consistency.ok || consistency.outcome !== "VALID_ZERO_ZERO_EVIDENCE_CANDIDATE" ||
      !canonicalTime(completedAt) || !object(identity)) return fail(PREVIEW_RECONCILIATION_CODES.INCOMPLETE);
  const keys = ["buildId", "operationId", "deploymentId", "mappingId", "teamRef", "projectRef", "target"];
  if (!shape(identity, keys) || !keys.every((key) => Object.hasOwn(identity, key)) ||
      ![identity.buildId, identity.operationId, identity.deploymentId, identity.mappingId].every(opId) ||
      (identity.teamRef !== null && !locator(identity.teamRef)) || !locator(identity.projectRef) ||
      identity.target !== "preview") return fail(PREVIEW_RECONCILIATION_CODES.INVALID);
  return { ok: true, evidence: {
    buildId: identity.buildId, operationId: identity.operationId, deploymentId: identity.deploymentId,
    mappingId: identity.mappingId, teamRef: identity.teamRef, projectRef: identity.projectRef,
    target: "preview", pathOperationId: identity.operationId,
    windowStart: filtered.windowStart, windowEnd: filtered.windowEnd,
    metadataFilteredLookup: { completed: true, exhausted: true, nextCursor: null, exactMatchCount: 0 },
    projectWindowLookup: { completed: true, exhausted: true, nextCursor: null, exactOperationMatchCount: 0 },
    completedAt,
  } };
}

/** Read-only dual-source traversal; every raw page is reduced before aggregation. */
export async function reconcilePreviewWindow(input, execution = {}) {
  const { projectRef, projectName = projectRef, teamRef = null, operationId, windowStart, windowEnd } = input ?? {};
  if (!locator(projectRef) || !locator(projectName) || (teamRef !== null && !locator(teamRef)) ||
      !opId(operationId) || !windowValid(windowStart, windowEnd)) return fail(PREVIEW_RECONCILIATION_CODES.INVALID);
  const results = [];
  for (const mode of ["METADATA_FILTERED_OPERATION", "PROJECT_WINDOW"]) {
    const matches = [];
    const seenIds = new Set();
    let cursor = null, pages = 0, totalDeploymentsObserved = 0;
    do {
      const spec = makePreviewReconciliationPageCommand({ mode, projectRef, teamRef, operationId,
        windowStart, windowEnd, nextCursor: cursor });
      const page = await executeVercelAdapterCommand(spec, { ...execution, mode: "reconcile_page",
        context: { mode, projectRef, projectName, teamRef, operationId, windowStart, windowEnd,
          nextCursor: cursor } });
      if (!page.ok) return fail(PREVIEW_RECONCILIATION_CODES.INCOMPLETE);
      pages += 1;
      totalDeploymentsObserved += page.totalDeploymentsObserved;
      for (const match of page.matches) {
        if (seenIds.has(match.providerDeploymentId)) return fail(PREVIEW_RECONCILIATION_CODES.INCOMPLETE);
        seenIds.add(match.providerDeploymentId);
        matches.push(match);
      }
      cursor = page.nextCursor;
      if (cursor !== null && pages >= MAX_RECONCILIATION_PAGES) return fail(PREVIEW_RECONCILIATION_CODES.INCOMPLETE);
    } while (cursor !== null);
    results.push({ ok: true, mode, windowStart, windowEnd, completed: true, exhausted: true,
      nextCursor: null, exactMatchCount: matches.length, totalDeploymentsObserved,
      pageCount: pages, inspectionCount: 0, matches });
  }
  const consistency = combinePreviewReconciliation(results[0], results[1]);
  return consistency.ok ? { ok: true, outcome: consistency.outcome, retry: false,
    windowStart, windowEnd, metadataFilteredLookup: results[0], projectWindowLookup: results[1],
    match: consistency.match ?? null } : consistency;
}

/** Executor never exposes stdout/stderr. Parsing is selected from fixed allowlisted modes. */
export async function executeVercelAdapterCommand(spec, { cwd, parentEnv = process.env, mode,
  context = {}, spawnImpl = spawn, timeoutMs = PREVIEW_DEPLOY_EXECUTION_TIMEOUT_MS }) {
  if (!spec?.ok || spec.executable !== "vercel" || spec.shell !== false || !Array.isArray(spec.argv) ||
      typeof cwd !== "string" || !["config_write", "config_metadata", "auth", "project", "deploy_receipt", "status", "reconcile", "reconcile_page"].includes(mode) ||
      timeoutMs < 1 || timeoutMs > 120000 ||
      (mode === "deploy_receipt" && timeoutMs !== PREVIEW_DEPLOY_EXECUTION_TIMEOUT_MS)) return fail("PROVIDER_COMMAND_INVALID");
  if (spec.argv.some((arg) => typeof arg !== "string" ||
      ["--token", "--value", "--env", "--build-env", "--prod", "--logs", "--debug"].includes(arg) ||
      /^(?:--token|--value|--env|--build-env)=/.test(arg))) return fail("PROVIDER_COMMAND_INVALID");
  if (mode !== "config_write" && Object.hasOwn(spec, "stdinPayload")) return fail("PROVIDER_COMMAND_INVALID");
  const expected = { config_write: ["env", "add"], config_metadata: ["env", "ls"], auth: ["whoami", "--json"],
    project: ["project", "list"], deploy_receipt: ["deploy", "--target"], status: ["inspect", context.providerDeploymentId],
    reconcile: ["list", context.projectRef], reconcile_page: ["list", context.projectRef] }[mode];
  if (spec.argv[0] !== expected[0] || spec.argv[1] !== expected[1] &&
      !(mode === "config_write" && spec.argv[1] === "update")) return fail("PROVIDER_COMMAND_INVALID");
  if (mode === "reconcile_page") {
    const proven = makePreviewReconciliationPageCommand(context);
    if (!proven.ok || JSON.stringify(spec.argv) !== JSON.stringify(proven.argv)) return fail("PROVIDER_COMMAND_INVALID");
  }
  if (mode === "config_write" && (typeof spec.stdinPayload !== "string" ||
      spec.argv[4] !== "--type" || spec.argv[5] !== "config")) return fail("PROVIDER_COMMAND_INVALID");
  const reduce = (raw) => {
    switch (mode) {
      case "config_metadata": return parseVercelConfigMetadata(raw);
      case "auth": return parsePreviewAuth(raw, context.teamRef ?? null);
      case "project": return parsePreviewProjectList(raw, context);
      case "deploy_receipt": return parsePreviewDeploymentReceipt(raw);
      case "status": return parsePreviewDeploymentStatus(raw, context.providerDeploymentId);
      case "reconcile": return parsePreviewReconciliation(raw, context);
      case "reconcile_page": return parsePreviewReconciliationPage(raw, context);
      default: return fail("PROVIDER_COMMAND_INVALID");
    }
  };
  return new Promise((resolve) => {
    let done = false;
    let output = "";
    let size = 0;
    const finish = (result) => { if (!done) { done = true; resolve(result); } };
    let child;
    try { child = spawnImpl(spec.executable, spec.argv, { cwd, env: createVercelChildEnv(parentEnv),
      shell: false, stdio: ["pipe", "pipe", "pipe"] }); }
    catch { return finish(fail("PROVIDER_EXECUTION_FAILED")); }
    const timer = setTimeout(() => { child.kill(mode === "deploy_receipt" ? "SIGKILL" : undefined);
      finish(fail("PROVIDER_TIMEOUT")); }, timeoutMs);
    const receive = (chunk, stdout) => { size += chunk.length; if (size > 1024 * 1024) { child.kill(); return finish(fail("PROVIDER_OUTPUT_LIMIT")); }
      if (stdout) output += chunk.toString("utf8"); };
    child.stdout.on("data", (chunk) => receive(chunk, true));
    child.stderr.on("data", (chunk) => receive(chunk, false));
    child.on("error", () => { clearTimeout(timer); finish(fail("PROVIDER_EXECUTION_FAILED")); });
    child.on("close", (code) => { clearTimeout(timer); if (done) return;
      if (code !== 0) {
        if (mode === "deploy_receipt") {
          try {
            const classified = parsePreviewDeploymentReceipt(JSON.parse(output));
            return finish(classified.ok ? fail("PROVIDER_SUBMISSION_OUTCOME_UNKNOWN") : classified);
          } catch { return finish(fail("PROVIDER_SUBMISSION_OUTCOME_UNKNOWN")); }
        }
        return finish(fail("PROVIDER_COMMAND_FAILED"));
      }
      if (mode === "config_write") return finish({ ok: true, acknowledged: true });
      try { finish(reduce(JSON.parse(output))); } catch { finish(fail("PROVIDER_OUTPUT_UNSAFE")); }
    });
    if (typeof spec.stdinPayload === "string") child.stdin.end(spec.stdinPayload);
    else child.stdin.end();
  });
}
