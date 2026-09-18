/**
 * S5 — evidence references + freshness / invalidation.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { captureTaskReality } from "../ag10/task-reality.mjs";

/**
 * @param {string} projectRoot
 * @returns {string}
 */
export function configFingerprint(projectRoot) {
  const root = String(projectRoot || "");
  const names = [
    "package.json",
    "package-lock.json",
    "pnpm-lock.yaml",
    "Cargo.toml",
    "Cargo.lock",
    "go.mod",
    "go.sum",
    "pyproject.toml",
    "requirements.txt",
    "compose.yaml",
    "compose.yml",
    "docker-compose.yml",
    "Dockerfile",
    "mise.toml",
    ".tool-versions",
  ];
  const h = createHash("sha256");
  for (const name of names) {
    const p = join(root, name);
    if (!existsSync(p)) continue;
    try {
      h.update(name);
      h.update("\0");
      h.update(readFileSync(p));
      h.update("\0");
    } catch {
      // skip unreadable
    }
  }
  return h.digest("hex").slice(0, 24);
}

/**
 * Git status alone misses untracked file content; hash changed paths for Build evidence.
 * @param {string} projectRoot
 * @param {string[]} changedFiles
 */
function changedFilesContentDigest(projectRoot, changedFiles) {
  const h = createHash("sha256");
  for (const rel of (changedFiles || []).slice().sort().slice(0, 80)) {
    const p = join(projectRoot, rel);
    if (!existsSync(p)) {
      h.update(`${rel}\0missing\0`);
      continue;
    }
    try {
      h.update(rel);
      h.update("\0");
      h.update(readFileSync(p));
      h.update("\0");
    } catch {
      h.update(`${rel}\0unreadable\0`);
    }
  }
  return h.digest("hex").slice(0, 16);
}

/**
 * @param {string} projectRoot
 */
export function captureBindingReality(projectRoot) {
  const reality = captureTaskReality(projectRoot);
  const dirtyFingerprint = createHash("sha256")
    .update(String(reality.diffFingerprint || ""))
    .update("\n")
    .update(changedFilesContentDigest(projectRoot, reality.changedFiles))
    .digest("hex")
    .slice(0, 24);
  return {
    projectRoot,
    headSha: reality.headSha,
    dirtyFingerprint,
    changedFiles: reality.changedFiles,
    statusPorcelain: reality.statusPorcelain,
    branch: reality.branch || null,
    configFingerprint: configFingerprint(projectRoot),
    exists: reality.exists,
  };
}

/**
 * @param {Partial<import('./types.mjs').EvidenceRef> & {
 *   kind: import('./types.mjs').EvidenceRef['kind'],
 *   ref: string,
 *   bindingId: string,
 * }} partial
 * @param {ReturnType<typeof captureBindingReality>} [reality]
 * @returns {import('./types.mjs').EvidenceRef}
 */
export function makeEvidenceRef(partial, reality) {
  return {
    kind: partial.kind,
    ref: String(partial.ref).slice(0, 500),
    bindingId: String(partial.bindingId),
    taskId: typeof partial.taskId === "string" ? partial.taskId : undefined,
    headSha:
      partial.headSha !== undefined
        ? partial.headSha
        : reality?.headSha ?? null,
    dirtyFingerprint:
      typeof partial.dirtyFingerprint === "string"
        ? partial.dirtyFingerprint
        : reality?.dirtyFingerprint,
    configFingerprint:
      typeof partial.configFingerprint === "string"
        ? partial.configFingerprint
        : reality?.configFingerprint,
    toolchainHint: partial.toolchainHint,
    runtimeObservationAt: partial.runtimeObservationAt,
    scope: Array.isArray(partial.scope) ? partial.scope.map(String).slice(0, 32) : [],
    observedAt: partial.observedAt || new Date().toISOString(),
  };
}

/**
 * @param {import('./types.mjs').EvidenceRef} ref
 * @param {ReturnType<typeof captureBindingReality>} current
 */
export function classifyEvidenceFreshness(ref, current) {
  if (!ref || !current) {
    return { fresh: false, status: "unknown", reason: "missing_anchor" };
  }
  if (!current.exists) {
    return { fresh: false, status: "stale", reason: "binding_missing" };
  }
  const refDirty = String(ref.dirtyFingerprint || "");
  const curDirty = String(current.dirtyFingerprint || "");
  if (refDirty && curDirty && refDirty !== curDirty) {
    return { fresh: false, status: "stale", reason: "dirty_fingerprint_mismatch" };
  }
  const refSha = ref.headSha ? String(ref.headSha) : "";
  const curSha = current.headSha ? String(current.headSha) : "";
  if (refSha && curSha && refSha !== curSha) {
    // SHA changed — stale unless dirty fingerprints still match (unlikely)
    return { fresh: false, status: "stale", reason: "head_mismatch" };
  }
  const refCfg = String(ref.configFingerprint || "");
  const curCfg = String(current.configFingerprint || "");
  if (refCfg && curCfg && refCfg !== curCfg) {
    return { fresh: false, status: "stale", reason: "config_fingerprint_mismatch" };
  }
  if (!refDirty && !refSha) {
    return { fresh: false, status: "unknown", reason: "no_anchors" };
  }
  return { fresh: true, status: "current", reason: "match" };
}

/**
 * Path-prefix independence: true when none of changedFiles intersect scope prefixes.
 * @param {string[]} changedFiles
 * @param {string[]} scopePathPrefixes
 */
export function changesIndependentOfScope(changedFiles, scopePathPrefixes) {
  const changed = (changedFiles || []).map((f) => f.replace(/\\/g, "/"));
  const scopes = (scopePathPrefixes || [])
    .map((s) => s.replace(/\\/g, "/").replace(/^\.\//, ""))
    .filter(Boolean);
  if (scopes.length === 0) return false; // unknown impact
  for (const file of changed) {
    for (const scope of scopes) {
      if (file === scope || file.startsWith(scope.replace(/\*$/, ""))) {
        return false;
      }
      // bare dir scope
      if (scope.endsWith("/") && file.startsWith(scope)) return false;
      if (!scope.includes("/") && file.split("/")[0] === scope) return false;
    }
  }
  return true;
}

/**
 * Demote stale PROVEN/SATISFIED based on reality delta.
 * @param {import('./types.mjs').BuildRecord} record
 * @param {{
 *   bindingId: string,
 *   changedFiles: string[],
 *   reality: ReturnType<typeof captureBindingReality>,
 * }} delta
 */
export function applyStaleInvalidation(record, delta) {
  const now = new Date().toISOString();
  /** @type {string[]} */
  const demoted = [];

  for (const c of record.outcomeCriteria || []) {
    if (c.status !== "PROVEN") continue;
    const refs = Array.isArray(c.evidence) ? c.evidence : [];
    let stale = false;
    let independent = false;
    if (refs.length === 0) {
      stale = true;
    } else {
      for (const ref of refs) {
        if (ref.bindingId && ref.bindingId !== delta.bindingId) continue;
        const fresh = classifyEvidenceFreshness(ref, delta.reality);
        if (!fresh.fresh) {
          const scopes = (ref.scope || []).filter((s) => s.includes("/") || s.includes("."));
          if (
            scopes.length > 0 &&
            changesIndependentOfScope(delta.changedFiles, scopes)
          ) {
            independent = true;
            continue;
          }
          // No path scope or impact unknown / intersecting → demote
          if (scopes.length === 0 || !changesIndependentOfScope(delta.changedFiles, scopes)) {
            stale = true;
            break;
          }
        }
      }
    }
    if (stale && !independent) {
      c.status = "UNKNOWN";
      c.updatedAt = now;
      demoted.push(c.id);
    }
  }

  for (const r of record.intent.explicitRequirements || []) {
    if (r.status !== "SATISFIED") continue;
    const refs = Array.isArray(r.evidence) ? r.evidence : [];
    let stale = false;
    for (const ref of refs) {
      if (ref.bindingId && ref.bindingId !== delta.bindingId) continue;
      const fresh = classifyEvidenceFreshness(ref, delta.reality);
      if (!fresh.fresh) {
        const scopes = ref.scope || [];
        if (
          scopes.length > 0 &&
          changesIndependentOfScope(delta.changedFiles, scopes)
        ) {
          continue;
        }
        stale = true;
        break;
      }
    }
    if (stale || refs.length === 0) {
      r.status = "UNKNOWN";
      demoted.push(r.id);
    }
  }

  return { demoted };
}
