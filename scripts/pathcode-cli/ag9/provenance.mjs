/**
 * G9 — append-only provenance JSONL for acquired tools.
 * Records facts only — never secrets.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * @typedef {object} ProvenanceRecord
 * @property {string} tool
 * @property {string} [version]
 * @property {string} [requestedBy]
 * @property {string} [source]
 * @property {string} [executable]
 * @property {string} [installedAt]
 * @property {string} [integrity]
 * @property {string} [health]
 */

/**
 * Append one provenance record as a JSONL line.
 * @param {string} metadataPath Absolute path to capabilities.jsonl (or similar).
 * @param {ProvenanceRecord} record
 */
export function appendProvenance(metadataPath, record) {
  if (typeof metadataPath !== "string" || !metadataPath.trim()) {
    throw new Error("appendProvenance: metadataPath required");
  }
  const tool = typeof record?.tool === "string" ? record.tool.trim() : "";
  if (!tool) throw new Error("appendProvenance: record.tool required");

  /** @type {ProvenanceRecord} */
  const line = {
    tool,
    version: typeof record.version === "string" ? record.version : "",
    requestedBy: typeof record.requestedBy === "string" ? record.requestedBy : "",
    source: typeof record.source === "string" ? record.source : "",
    executable: typeof record.executable === "string" ? record.executable : "",
    installedAt:
      typeof record.installedAt === "string" && record.installedAt
        ? record.installedAt
        : new Date().toISOString(),
    integrity: typeof record.integrity === "string" ? record.integrity : "",
    health: typeof record.health === "string" ? record.health : "",
  };

  mkdirSync(dirname(metadataPath), { recursive: true });
  appendFileSync(metadataPath, `${JSON.stringify(line)}\n`, { encoding: "utf8" });
}
