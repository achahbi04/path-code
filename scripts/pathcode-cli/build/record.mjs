/**
 * S5 — PATH Build durable record (thin product-level control state).
 * Atomic write via temp + rename. Does not mirror product trees.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { ensureAg9RuntimeDirs } from "../ag9/layout.mjs";

export const BUILD_RECORD_SCHEMA = "pathcode.s5.build-record.v1";

/**
 * @param {string} runtimeRoot
 */
export function resolveBuildsDir(runtimeRoot) {
  const dirs = ensureAg9RuntimeDirs(runtimeRoot);
  return join(dirs.metadata, "builds");
}

/**
 * @param {string} runtimeRoot
 * @param {string} buildId
 */
export function resolveBuildRecordPath(runtimeRoot, buildId) {
  const safe = String(buildId || "build")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 80);
  return join(resolveBuildsDir(runtimeRoot), `${safe}.build.json`);
}

/**
 * @param {string} kind
 * @param {string} keyMaterial
 */
export function makeBuildActionId(kind, keyMaterial) {
  return `${kind}:${createHash("sha256").update(String(keyMaterial)).digest("hex").slice(0, 20)}`;
}

/**
 * @param {{
 *   outcome: string,
 *   explicitRequirements?: Array<{ id?: string, statement: string, required?: boolean }>,
 *   buildId?: string,
 * }} input
 */
export function createBuildRecordSkeleton(input) {
  const buildId =
    typeof input.buildId === "string" && input.buildId.trim()
      ? input.buildId.trim()
      : randomUUID();
  const outcome = String(input.outcome || "").trim().slice(0, 8_000);
  const now = new Date().toISOString();
  /** @type {import('./types.mjs').BuildRecord} */
  const record = {
    schema: BUILD_RECORD_SCHEMA,
    buildId,
    intent: {
      outcome,
      outcomeRevision: 1,
      revisedAt: now,
      explicitRequirements: (input.explicitRequirements || []).map((r, i) => ({
        id: r.id || `req-${i + 1}`,
        statement: String(r.statement || "").slice(0, 2_000),
        required: r.required !== false,
        status: "UNKNOWN",
        evidence: [],
      })),
    },
    outcomeCriteria: [],
    hypotheses: {
      architectureNotes: "",
      gapPlan: [],
      ordering: [],
      topologyAssumptions: "",
      proposedNextAction: "",
      updatedAt: now,
    },
    projectBindings: [],
    children: [],
    loop: {
      status: "running",
      pendingReinspect: false,
      lastRealityDelta: null,
      lastConsumedActionId: null,
      noProgressCount: 0,
      lastFailureFingerprint: null,
      lastEvaluateTaskId: null,
      lastChallengeTaskId: null,
    },
    createdAt: now,
    updatedAt: now,
  };
  return record;
}

/**
 * @param {string} runtimeRoot
 * @param {import('./types.mjs').BuildRecord} record
 */
export function writeBuildRecord(runtimeRoot, record) {
  const path = resolveBuildRecordPath(runtimeRoot, record.buildId);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  const next = {
    ...record,
    schema: BUILD_RECORD_SCHEMA,
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  renameSync(tmp, path);
  try {
    updateBuildIndex(runtimeRoot, next);
  } catch {
    // non-fatal
  }
  return next;
}

/**
 * @param {string} runtimeRoot
 * @param {string} buildId
 * @returns {import('./types.mjs').BuildRecord | null}
 */
export function readBuildRecord(runtimeRoot, buildId) {
  const path = resolveBuildRecordPath(runtimeRoot, buildId);
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    if (!raw || typeof raw !== "object" || !raw.buildId) return null;
    return /** @type {import('./types.mjs').BuildRecord} */ (raw);
  } catch {
    return null;
  }
}

/**
 * @param {string} runtimeRoot
 * @param {import('./types.mjs').BuildRecord} record
 */
function updateBuildIndex(runtimeRoot, record) {
  const dir = resolveBuildsDir(runtimeRoot);
  mkdirSync(dir, { recursive: true });
  const indexPath = join(dir, "index.json");
  /** @type {Record<string, object>} */
  let index = {};
  if (existsSync(indexPath)) {
    try {
      index = JSON.parse(readFileSync(indexPath, "utf8")) || {};
    } catch {
      index = {};
    }
  }
  index[record.buildId] = {
    buildId: record.buildId,
    outcome: String(record.intent?.outcome || "").slice(0, 200),
    status: record.loop?.status || "running",
    outcomeRevision: record.intent?.outcomeRevision || 1,
    bindings: (record.projectBindings || []).map((b) => b.projectRoot),
    updatedAt: record.updatedAt,
  };
  const tmp = `${indexPath}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  renameSync(tmp, indexPath);
}

/**
 * @param {string} runtimeRoot
 * @returns {import('./types.mjs').BuildRecord[]}
 */
export function listBuildRecords(runtimeRoot) {
  const dir = resolveBuildsDir(runtimeRoot);
  if (!existsSync(dir)) return [];
  /** @type {import('./types.mjs').BuildRecord[]} */
  const out = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".build.json")) continue;
    try {
      const raw = JSON.parse(readFileSync(join(dir, name), "utf8"));
      if (raw?.buildId) out.push(raw);
    } catch {
      // skip
    }
  }
  out.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  return out;
}

/**
 * @param {string} runtimeRoot
 * @returns {import('./types.mjs').BuildRecord | null}
 */
export function findLatestActiveBuild(runtimeRoot) {
  return (
    listBuildRecords(runtimeRoot).find(
      (b) => b.loop?.status === "running" || b.loop?.status === "blocked",
    ) || null
  );
}

/**
 * Atomic patch helper.
 * @param {string} runtimeRoot
 * @param {string} buildId
 * @param {(rec: import('./types.mjs').BuildRecord) => import('./types.mjs').BuildRecord | void} mutator
 */
export function updateBuildRecord(runtimeRoot, buildId, mutator) {
  const cur = readBuildRecord(runtimeRoot, buildId);
  if (!cur) {
    throw new Error(`Build record not found: ${buildId}`);
  }
  const next = mutator(cur) || cur;
  return writeBuildRecord(runtimeRoot, next);
}

/**
 * Clean temp files left by interrupted writes.
 * @param {string} runtimeRoot
 */
export function scrubBuildTempFiles(runtimeRoot) {
  const dir = resolveBuildsDir(runtimeRoot);
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (name.endsWith(".tmp")) {
      try {
        unlinkSync(join(dir, name));
      } catch {
        // ignore
      }
    }
  }
}
