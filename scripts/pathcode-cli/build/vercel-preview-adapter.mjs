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

/** Installed CLI's --dry branch returns before createDeploy. This spec cannot submit. */
export function makePreviewDryRunCommand({ projectRef, teamRef = null }) {
  if (!locator(projectRef) || (teamRef !== null && !locator(teamRef))) return fail("PROVIDER_MAPPING_INVALID");
  return command(["deploy", "--dry", "--format=json", "--target", "preview", "--project", projectRef,
    "--yes", ...scopeArgs(teamRef)], "vercel deploy --dry --format=json --target preview --project <project> --yes");
}

export function parsePreviewDryRun(raw) {
  if (!shape(raw, ["framework", "basePath", "fileCount", "totalSize", "ignoredCount", "ignored",
    "directories", "largestFiles", "files"]) || !object(raw.framework) ||
    typeof raw.framework.name !== "string" ||
    !Number.isSafeInteger(raw.fileCount) || raw.fileCount < 0 ||
    !Number.isSafeInteger(raw.totalSize) || raw.totalSize < 0 ||
    !Number.isSafeInteger(raw.ignoredCount) || raw.ignoredCount < 0 ||
    !Array.isArray(raw.files)) return fail("PROVIDER_DRY_RUN_UNSAFE");
  return { ok: true, framework: raw.framework.name, fileCount: raw.fileCount,
    totalSize: raw.totalSize, ignoredCount: raw.ignoredCount };
}

export function makePreviewInspectCommand({ providerDeploymentId, teamRef = null }) {
  if (!deploymentId(providerDeploymentId) || (teamRef !== null && !locator(teamRef))) return fail("PROVIDER_INSPECT_INVALID");
  return command(["inspect", providerDeploymentId, "--json", ...scopeArgs(teamRef)], "vercel inspect <deployment> --json");
}

export function makePreviewReconcileCommand({ projectRef, teamRef = null, operationId }) {
  if (!locator(projectRef) || (teamRef !== null && !locator(teamRef)) || !opId(operationId)) return fail("PROVIDER_RECONCILE_INVALID");
  return command(["list", projectRef, "--environment", "preview", "--meta", `pathOperationId=${operationId}`,
    "--json", "--limit", "100", ...scopeArgs(teamRef)],
  "vercel list <project> --environment preview --meta pathOperationId=<operation> --json --limit 100");
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
      !object(raw.pagination) || raw.pagination.next || !locator(projectRef) || !locator(projectName) || !opId(operationId)) return fail("PROVIDER_RECONCILE_UNSAFE");
  const matches = [];
  for (const dep of raw.deployments) {
    if (!shape(dep, ["id", "url", "name", "state", "target", "customEnvironment", "createdAt", "buildingAt", "ready", "creator", "meta"]) ||
        !shape(dep.meta, ["pathOperationId"]) || dep.meta.pathOperationId !== operationId || dep.name !== projectName ||
        dep.target !== "preview" || !deploymentId(dep.id) || !states.has(dep.state) ||
        !providerUrl(`https://${dep.url}`)) return fail("PROVIDER_RECONCILE_UNSAFE");
    matches.push({ providerDeploymentId: dep.id, url: `https://${dep.url}`,
      providerState: dep.state, target: "preview" });
  }
  if (matches.length > 1) return fail("PROVIDER_RECONCILE_AMBIGUOUS");
  return { ok: true, match: matches[0] ?? null, retry: false };
}

/** Executor never exposes stdout/stderr. Parsing is selected from fixed allowlisted modes. */
export async function executeVercelAdapterCommand(spec, { cwd, parentEnv = process.env, mode,
  context = {}, spawnImpl = spawn, timeoutMs = 30000 }) {
  if (!spec?.ok || spec.executable !== "vercel" || spec.shell !== false || !Array.isArray(spec.argv) ||
      typeof cwd !== "string" || !["config_write", "config_metadata", "auth", "project", "dry_run", "deploy_receipt", "status", "reconcile"].includes(mode) ||
      timeoutMs < 1 || timeoutMs > 120000) return fail("PROVIDER_COMMAND_INVALID");
  if (spec.argv.some((arg) => typeof arg !== "string" ||
      ["--token", "--value", "--env", "--build-env", "--prod", "--logs", "--debug"].includes(arg) ||
      /^(?:--token|--value|--env|--build-env)=/.test(arg))) return fail("PROVIDER_COMMAND_INVALID");
  if (mode !== "config_write" && Object.hasOwn(spec, "stdinPayload")) return fail("PROVIDER_COMMAND_INVALID");
  const expected = { config_write: ["env", "add"], config_metadata: ["env", "ls"], auth: ["whoami", "--json"],
    project: ["project", "list"], dry_run: ["deploy", "--dry"], deploy_receipt: ["deploy", "--target"], status: ["inspect", context.providerDeploymentId],
    reconcile: ["list", context.projectRef] }[mode];
  if (spec.argv[0] !== expected[0] || spec.argv[1] !== expected[1] &&
      !(mode === "config_write" && spec.argv[1] === "update")) return fail("PROVIDER_COMMAND_INVALID");
  if (mode === "config_write" && (typeof spec.stdinPayload !== "string" ||
      spec.argv[4] !== "--type" || spec.argv[5] !== "config")) return fail("PROVIDER_COMMAND_INVALID");
  if (mode === "dry_run" && (spec.argv[2] !== "--format=json" ||
      spec.argv[3] !== "--target" || spec.argv[4] !== "preview" ||
      spec.argv.includes("--prod") || !spec.argv.includes("--dry"))) return fail("PROVIDER_COMMAND_INVALID");
  const reduce = (raw) => {
    switch (mode) {
      case "config_metadata": return parseVercelConfigMetadata(raw);
      case "auth": return parsePreviewAuth(raw, context.teamRef ?? null);
      case "project": return parsePreviewProjectList(raw, context);
      case "dry_run": return parsePreviewDryRun(raw);
      case "deploy_receipt": return parsePreviewDeploymentReceipt(raw);
      case "status": return parsePreviewDeploymentStatus(raw, context.providerDeploymentId);
      case "reconcile": return parsePreviewReconciliation(raw, context);
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
    const timer = setTimeout(() => { child.kill(); finish(fail("PROVIDER_TIMEOUT")); }, timeoutMs);
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
