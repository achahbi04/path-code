/** Exact Build/environment product-runtime projection. Never returns via IPC. */
import { existsSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { readBuildEnvironment } from "../environments.mjs";
import { readBuildRecord } from "../record.mjs";
import { resolveExactLocalEnvValues } from "./local-env-resolve.mjs";

const PROTECTED = new Set([
  "PATH", "HOME", "USER", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL", "LC_CTYPE",
  "PORT", "HOST", "HOSTNAME", "CI", "BROWSER", "FORCE_COLOR",
]);
const fail = (code) => ({ ok: false, code });

/**
 * @param {{ runtimeRoot: string, buildId: string, environmentId: string, projectRoot: string, planKind: string }} input
 */
export function resolveSelectedProductEnvironment(input) {
  const build = readBuildRecord(input.runtimeRoot, input.buildId);
  if (!build || build.buildId !== input.buildId) return fail("BUILD_NOT_FOUND");
  if (build.pendingRestore) return fail("RESTORE_PENDING");
  const binding = build.projectBindings?.[0];
  try {
    if (!binding?.projectRoot || realpathSync(binding.projectRoot) !== realpathSync(input.projectRoot)) {
      return fail("BUILD_BINDING_MISMATCH");
    }
  } catch { return fail("BUILD_BINDING_MISMATCH"); }
  const selected = readBuildEnvironment(input.runtimeRoot, input.buildId, input.environmentId);
  if (!selected.ok) return selected;
  const config = Object.create(null);
  const local = [];
  for (const entry of selected.environment.variables) {
    if (PROTECTED.has(entry.variableName.toUpperCase())) return fail("CONFIG_RUNTIME_COLLISION");
    if (entry.kind === "config") config[entry.variableName] = entry.value;
    else if (entry.backend === "local_env_file") local.push(entry.variableName);
    else return fail("SECRET_BACKEND_UNAVAILABLE");
  }
  if (input.planKind !== "spawn") {
    if (selected.environment.variables.length) return fail("SECRET_CONSUMER_FORBIDDEN");
    return { ok: true, config, secrets: Object.create(null) };
  }
  // A framework may natively load .env.local. When a selected environment is
  // in force, every assignment name in that file must be a canonical local
  // binding; config, Vercel and unbound names cannot bypass PATH authority.
  if (!local.length && !existsSync(join(binding.projectRoot, ".env.local"))) {
    return { ok: true, config, secrets: Object.create(null) };
  }
  const materialized = resolveExactLocalEnvValues({
    projectRoot: binding.projectRoot,
    exactNames: local,
    allowedNativeNames: local,
  });
  if (!materialized.ok) return materialized;
  return { ok: true, config, secrets: materialized.values };
}
