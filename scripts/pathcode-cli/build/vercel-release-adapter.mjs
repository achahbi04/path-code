/** Strict Production serving/release boundary. All provider outputs are reduced before return. */
import { spawn } from "node:child_process";
import { createVercelChildEnv } from "./vercel-preview-adapter.mjs";
import { parseProductionDeploymentStatus } from "./vercel-production-adapter.mjs";

const fail = (code) => ({ ok: false, code });
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const locator = (value) => typeof value === "string" && /^[A-Za-z0-9._-]{1,160}$/.test(value);
const deploymentId = (value) => typeof value === "string" && /^dpl_[A-Za-z0-9]{8,100}$/.test(value);
const scopeArgs = (teamRef) => teamRef === null ? [] : ["--scope", teamRef];
const command = (argv, display) => ({ ok: true, executable: "vercel", argv, shell: false, display });

export function makeProductionAliasesCommand({ teamRef = null, nextCursor = null } = {}) {
  if ((teamRef !== null && !locator(teamRef)) ||
      (nextCursor !== null && (!Number.isSafeInteger(nextCursor) || nextCursor <= 0))) return fail("RELEASE_COMMAND_INVALID");
  const argv = ["alias", "ls", "--json", "--limit", "100"];
  if (nextCursor !== null) argv.push("--next", String(nextCursor));
  argv.push(...scopeArgs(teamRef));
  return command(argv, "vercel alias ls --json --limit 100 --scope <team>");
}

export function makeProductionReleaseInspectCommand({ providerDeploymentId, teamRef = null } = {}) {
  if (!deploymentId(providerDeploymentId) || (teamRef !== null && !locator(teamRef))) return fail("RELEASE_COMMAND_INVALID");
  return command(["inspect", providerDeploymentId, "--json", ...scopeArgs(teamRef)],
    "vercel inspect <Production deployment> --json --scope <team>");
}

export function makeProductionServingEffectCommand({ action, providerDeploymentId, teamRef = null } = {}) {
  if (!["publish", "rollback", "reestablish"].includes(action) || !deploymentId(providerDeploymentId) ||
      (teamRef !== null && !locator(teamRef))) return fail("RELEASE_COMMAND_INVALID");
  const verb = action === "rollback" ? "rollback" : "promote";
  return command([verb, providerDeploymentId, "--yes", "--timeout", "0", ...scopeArgs(teamRef)],
    `vercel ${verb} <Production deployment> --yes --timeout 0 --scope <team>`);
}

export function parseProductionAliasPage(raw) {
  if (!object(raw) || Object.keys(raw).some((key) => !["aliases", "pagination"].includes(key)) ||
      !Array.isArray(raw.aliases) || !object(raw.pagination) ||
      Object.keys(raw.pagination).some((key) => !["count", "next", "prev"].includes(key)) ||
      !Number.isSafeInteger(raw.pagination.count) || raw.pagination.count < 0 ||
      (raw.pagination.next !== null && (!Number.isSafeInteger(raw.pagination.next) || raw.pagination.next <= 0))) return fail("PROVIDER_SERVING_UNKNOWN");
  const aliases = [];
  for (const row of raw.aliases) {
    if (!object(row) || Object.keys(row).some((key) => !["alias", "deploymentId", "url", "createdAt"].includes(key)) ||
        typeof row.alias !== "string" || row.alias.length < 1 || row.alias.length > 253 ||
        !deploymentId(row.deploymentId) || (row.url !== null && typeof row.url !== "string") ||
        !Number.isSafeInteger(row.createdAt) || row.createdAt < 0) return fail("PROVIDER_SERVING_UNKNOWN");
    aliases.push({ alias: row.alias, providerDeploymentId: row.deploymentId });
  }
  return { ok: true, aliases, nextCursor: raw.pagination.next, completed: raw.pagination.next === null };
}

export async function observeProductionServing({ teamRef, projectRef, projectName, observedAt = new Date().toISOString(),
  executeAliases, executeInspect, maxPages = 20, maxDeploymentInspections = 20 }) {
  if (!locator(projectRef) || !locator(projectName) || (teamRef !== null && !locator(teamRef)) ||
      typeof observedAt !== "string" || !Number.isFinite(Date.parse(observedAt)) ||
      !Number.isSafeInteger(maxPages) || maxPages < 1 || !Number.isSafeInteger(maxDeploymentInspections) || maxDeploymentInspections < 1)
    return fail("PROVIDER_SERVING_UNKNOWN");
  const ids = new Set();
  const expectedAlias = `${projectName}.vercel.app`.toLowerCase();
  let cursor = null;
  for (let pageCount = 0; pageCount < maxPages; pageCount++) {
    const spec = makeProductionAliasesCommand({ teamRef, nextCursor: cursor });
    if (!spec.ok) return fail("PROVIDER_SERVING_UNKNOWN");
    const page = await executeAliases(spec, { teamRef, nextCursor: cursor });
    if (!page?.ok || !Array.isArray(page.aliases) ||
        !(page.nextCursor === null || (Number.isSafeInteger(page.nextCursor) && page.nextCursor > 0)))
      return fail("PROVIDER_SERVING_UNKNOWN");
    for (const alias of page.aliases) {
      if (!deploymentId(alias.providerDeploymentId)) return fail("PROVIDER_SERVING_UNKNOWN");
      // This pass owns Vercel's default project alias only; custom-domain
      // ownership/orchestration remains outside P10.3 and P11.
      if (alias.alias.toLowerCase() !== expectedAlias) continue;
      ids.add(alias.providerDeploymentId);
      if (ids.size > maxDeploymentInspections) return fail("PROVIDER_SERVING_UNKNOWN");
    }
    cursor = page.nextCursor;
    if (cursor === null) break;
    if (pageCount === maxPages - 1) return fail("PROVIDER_SERVING_UNKNOWN");
  }
  if (!ids.size) return { ok: true, projectRef, teamRef, target: "production",
    providerDeploymentId: null, url: null, observedAt, state: "unknown" };
  const matches = [];
  for (const id of ids) {
    const spec = makeProductionReleaseInspectCommand({ providerDeploymentId: id, teamRef });
    if (!spec.ok) return fail("PROVIDER_SERVING_UNKNOWN");
    const fact = await executeInspect(spec, { providerDeploymentId: id, projectName, teamRef });
    if (!fact.ok) return fail("PROVIDER_SERVING_UNKNOWN");
    if (fact.providerDeploymentId !== id) return fail("PROVIDER_SERVING_UNKNOWN");
    if (fact.target === "production" && fact.projectRef === projectRef) matches.push(fact);
  }
  if (matches.length !== 1) return fail("PROVIDER_SERVING_UNKNOWN");
  return { ok: true, projectRef, teamRef, target: "production",
    providerDeploymentId: matches[0].providerDeploymentId, url: matches[0].url, observedAt, state: "observed" };
}

export async function executeProductionReleaseCommand(spec, { cwd, parentEnv = process.env, mode,
  context = {}, spawnImpl = spawn, timeoutMs = 30_000 } = {}) {
  const modes = ["release_aliases", "release_inspect", "release_effect"];
  if (!spec?.ok || spec.executable !== "vercel" || spec.shell !== false || !Array.isArray(spec.argv) ||
      typeof cwd !== "string" || !modes.includes(mode) || timeoutMs < 1 || timeoutMs > 120_000) return fail("PROVIDER_COMMAND_INVALID");
  const expected = mode === "release_aliases" ? makeProductionAliasesCommand(context) :
    mode === "release_inspect" ? makeProductionReleaseInspectCommand(context) : makeProductionServingEffectCommand(context);
  if (!expected.ok || JSON.stringify(spec.argv) !== JSON.stringify(expected.argv) ||
      spec.argv.some((arg) => ["--prod", "--logs", "--debug", "--wait", "--token"].includes(arg)) ||
      (mode !== "release_effect" && !spec.argv.includes("--json"))) return fail("PROVIDER_COMMAND_INVALID");
  return new Promise((resolve) => {
    let output = "", size = 0, done = false;
    const finish = (value) => { if (!done) { done = true; resolve(value); } };
    let child;
    try { child = spawnImpl(spec.executable, spec.argv, { cwd, env: createVercelChildEnv(parentEnv), shell: false,
      stdio: ["ignore", "pipe", "pipe"] }); }
    catch { return finish(fail("PROVIDER_EXECUTION_FAILED")); }
    const timer = setTimeout(() => { child.kill("SIGKILL"); finish(mode === "release_effect" ?
      fail("RELEASE_EFFECT_UNCERTAIN") : fail("PROVIDER_TIMEOUT")); }, timeoutMs);
    child.stdout.on("data", (chunk) => { size += chunk.length; if (size > 1024 * 1024) { child.kill(); finish(fail(mode === "release_effect" ? "RELEASE_EFFECT_UNCERTAIN" : "PROVIDER_OUTPUT_LIMIT")); } else output += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => { size += chunk.length; if (size > 1024 * 1024) { child.kill(); finish(fail(mode === "release_effect" ? "RELEASE_EFFECT_UNCERTAIN" : "PROVIDER_OUTPUT_LIMIT")); } });
    child.on("error", () => { clearTimeout(timer); finish(fail(mode === "release_effect" ? "RELEASE_EFFECT_UNCERTAIN" : "PROVIDER_EXECUTION_FAILED")); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (done) return;
      if (mode === "release_effect") return finish(code === 0 ? { ok: true, accepted: true } : fail("RELEASE_EFFECT_UNCERTAIN"));
      let raw;
      try { raw = JSON.parse(output); } catch { return finish(fail("PROVIDER_SERVING_UNKNOWN")); }
      if (code !== 0) return finish(fail("PROVIDER_SERVING_UNKNOWN"));
      if (mode === "release_aliases") return finish(parseProductionAliasPage(raw));
      const parsed = parseProductionDeploymentStatus(raw, context);
      finish(parsed.ok ? { ...parsed, projectRef: context.projectRef ?? null, teamRef: context.teamRef ?? null } : fail("PROVIDER_SERVING_UNKNOWN"));
    });
  });
}
