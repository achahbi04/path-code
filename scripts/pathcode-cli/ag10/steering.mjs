/**
 * G10 — operator steering queue (safe mutation-boundary application).
 */

import { randomUUID } from "node:crypto";

/**
 * @typedef {'PENDING'|'APPLIED'|'DISCARDED'} SteeringStatus
 * @typedef {{
 *   id: string,
 *   text: string,
 *   status: SteeringStatus,
 *   acceptedAt: string,
 *   appliedAt?: string,
 * }} SteeringItem
 */

export class SteeringQueue {
  constructor() {
    /** @type {SteeringItem[]} */
    this.items = [];
    this.mutationActive = false;
  }

  setMutationActive(active) {
    this.mutationActive = active === true;
  }

  /**
   * Accept steering immediately (UI). Queue if mutation active.
   * @param {string} text
   * @returns {SteeringItem}
   */
  accept(text) {
    const trimmed = String(text || "").trim();
    const item = {
      id: randomUUID(),
      text: trimmed.slice(0, 4_000),
      status: /** @type {SteeringStatus} */ ("PENDING"),
      acceptedAt: new Date().toISOString(),
    };
    if (!trimmed) {
      item.status = "DISCARDED";
      return item;
    }
    this.items.push(item);
    if (this.items.length > 32) {
      this.items = this.items.slice(-32);
    }
    return item;
  }

  /** @returns {SteeringItem[]} */
  pending() {
    return this.items.filter((i) => i.status === "PENDING");
  }

  /**
   * Apply all pending at a safe turn boundary (not mid-write).
   * @returns {{ applied: SteeringItem[], deferred: boolean, combinedText: string }}
   */
  applyAtBoundary() {
    if (this.mutationActive) {
      return {
        applied: [],
        deferred: true,
        combinedText: "",
      };
    }
    const pending = this.pending();
    const now = new Date().toISOString();
    for (const item of pending) {
      item.status = "APPLIED";
      item.appliedAt = now;
    }
    return {
      applied: pending,
      deferred: false,
      combinedText: pending.map((p) => p.text).join("\n").slice(0, 8_000),
    };
  }

  /** Snapshot for checkpoint. */
  toCheckpoint() {
    return this.items
      .filter((i) => i.status === "PENDING")
      .map((i) => ({
        id: i.id,
        text: i.text,
        status: i.status,
        acceptedAt: i.acceptedAt,
      }));
  }

  /**
   * Restore pending items from checkpoint.
   * @param {unknown[]} rows
   */
  restoreFromCheckpoint(rows) {
    if (!Array.isArray(rows)) return;
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const text = typeof /** @type {any} */ (row).text === "string"
        ? /** @type {any} */ (row).text
        : "";
      if (!text.trim()) continue;
      this.items.push({
        id:
          typeof /** @type {any} */ (row).id === "string"
            ? /** @type {any} */ (row).id
            : randomUUID(),
        text: text.slice(0, 4_000),
        status: "PENDING",
        acceptedAt:
          typeof /** @type {any} */ (row).acceptedAt === "string"
            ? /** @type {any} */ (row).acceptedAt
            : new Date().toISOString(),
      });
    }
  }
}
