import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const VERSION = /^(\d{14})_([A-Za-z0-9][A-Za-z0-9_-]{0,119})\.sql$/;
export function inventoryCommittedDatabaseMigrations(projectRoot, authoritativeSha, { spawn = spawnSync } = {}) {
  if (typeof authoritativeSha !== "string" || !/^[0-9a-f]{40}$/i.test(authoritativeSha))
    return { ok: false, code: "DATABASE_MIGRATION_SOURCE_INVALID" };
  let result;
  try { result = spawn("git", ["-C", projectRoot, "ls-tree", "-r", "-z", authoritativeSha, "--", "supabase/migrations/"],
    { encoding: "buffer", maxBuffer: 8 * 1024 * 1024, timeout: 10_000 }); } catch { return { ok: false, code: "DATABASE_MIGRATION_SOURCE_UNAVAILABLE" }; }
  if (result.error || result.status !== 0 || !Buffer.isBuffer(result.stdout)) return { ok: false, code: "DATABASE_MIGRATION_SOURCE_UNAVAILABLE" };
  const entries = [];
  for (const raw of result.stdout.toString("utf8").split("\0")) {
    if (!raw) continue;
    const tab = raw.indexOf("\t"); if (tab < 0) return { ok: false, code: "DATABASE_MIGRATION_SOURCE_INVALID" };
    const metadata = raw.slice(0, tab).split(" "); const path = raw.slice(tab + 1);
    if (!path.startsWith("supabase/migrations/") || path.length > 256 || metadata.length !== 3) return { ok: false, code: "DATABASE_MIGRATION_SOURCE_INVALID" };
    if (!path.toLowerCase().endsWith(".sql")) continue;
    const name = path.slice("supabase/migrations/".length);
    const match = VERSION.exec(name);
    if (!match || metadata[1] !== "blob" || !/^[0-9a-f]{40}$/i.test(metadata[2])) return { ok: false, code: "DATABASE_MIGRATION_SOURCE_INVALID" };
    entries.push({ version: match[1], blob: metadata[2].toLowerCase() });
    if (entries.length > 5000) return { ok: false, code: "DATABASE_MIGRATION_SOURCE_INVALID" };
  }
  entries.sort((a, b) => a.version.localeCompare(b.version));
  for (let i = 1; i < entries.length; i++) if (entries[i - 1].version === entries[i].version)
    return { ok: false, code: "DATABASE_MIGRATION_SOURCE_INVALID" };
  const representation = entries.map((item) => `${item.version}:${item.blob}`).join("\n");
  return { ok: true, sourceSha: authoritativeSha, localDigest: createHash("sha256").update(representation).digest("hex"),
    localCount: entries.length, localHeadVersion: entries.at(-1)?.version ?? null, versions: entries.map((item) => item.version) };
}

export function compareDatabaseMigrationVersions(local, remote) {
  if (!Array.isArray(local) || !Array.isArray(remote)) return "unavailable";
  if (!local.length && !remote.length) return "none";
  if (local.length === remote.length && local.every((version, index) => version === remote[index])) return "in_sync";
  if (remote.length < local.length && remote.every((version, index) => version === local[index])) return "pending";
  return "diverged";
}
