/**
 * P6.2 — canonical engineering model execution provenance (checkpoint fields).
 */

import { CATALOG_SOURCE } from "./identity.mjs";
import { SELECTION_SOURCE } from "./resolver.mjs";

export const MODEL_EXECUTION_SCHEMA = "path.model.execution.v1";

const SELECTION_SOURCES = new Set([
  SELECTION_SOURCE.EXPLICIT_TURN,
  SELECTION_SOURCE.LEGACY_ENV,
  SELECTION_SOURCE.PROVIDER_DEFAULT,
  "task_pin",
  "project_default",
  "user_default",
  "auto",
  "unknown",
]);

/**
 * @param {unknown} value
 */
function trimString(value, max) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, max)
    : null;
}

/**
 * @param {{
 *   resolution: { ok: true, providerModelId: string, identity: object, selectionSource: string },
 *   engine: string,
 *   engineMode?: string | null,
 *   provider?: string | null,
 *   actualModel?: string | null,
 *   actualModelKnown?: boolean,
 *   fallbackOccurred?: boolean,
 *   autoPolicyVersion?: string | null,
 * }} input
 * @returns {object | null}
 */
export function buildModelExecutionFromResolution(input) {
  const resolution = input?.resolution;
  if (!resolution?.ok) return null;
  const actualModelKnown = input.actualModelKnown === true;
  return {
    executionSchema: MODEL_EXECUTION_SCHEMA,
    engine: String(input.engine || "").toLowerCase(),
    engineMode: trimString(input.engineMode, 40),
    provider: trimString(input.provider, 80),
    requestedModel: trimString(resolution.providerModelId, 80),
    actualModel:
      actualModelKnown && trimString(input.actualModel, 80)
        ? trimString(input.actualModel, 80)
        : null,
    actualModelKnown,
    pathKey: trimString(resolution.identity?.pathKey, 120),
    selectionSource: SELECTION_SOURCES.has(resolution.selectionSource)
      ? resolution.selectionSource
      : "unknown",
    fallbackOccurred: input.fallbackOccurred === true,
    catalogSource:
      resolution.identity?.catalogSource === CATALOG_SOURCE.LEGACY_ENV
        ? CATALOG_SOURCE.LEGACY_ENV
        : resolution.identity?.catalogSource === CATALOG_SOURCE.DISCOVERED
          ? CATALOG_SOURCE.DISCOVERED
          : resolution.identity?.catalogSource === CATALOG_SOURCE.STATIC
            ? CATALOG_SOURCE.STATIC
            : null,
    autoPolicyVersion: trimString(input.autoPolicyVersion, 40),
  };
}

/**
 * Seal execution fields for persistence inside engineTurns[].
 *
 * @param {unknown} turn
 */
export function sealEngineTurnExecutionFields(turn) {
  if (!turn || typeof turn !== "object") return {};
  const record = /** @type {Record<string, unknown>} */ (turn);
  if (record.executionSchema !== MODEL_EXECUTION_SCHEMA) {
    return {};
  }
  const actualModelKnown = record.actualModelKnown === true;
  const selectionSource = String(record.selectionSource || "");
  return {
    executionSchema: MODEL_EXECUTION_SCHEMA,
    engine: trimString(record.engine, 20),
    engineMode: trimString(record.engineMode, 40),
    provider: trimString(record.provider, 80),
    requestedModel: trimString(record.requestedModel, 80),
    actualModel:
      actualModelKnown ? trimString(record.actualModel, 80) : null,
    actualModelKnown,
    pathKey: trimString(record.pathKey, 120),
    selectionSource: SELECTION_SOURCES.has(selectionSource)
      ? selectionSource
      : "unknown",
    fallbackOccurred: record.fallbackOccurred === true,
    catalogSource:
      record.catalogSource === CATALOG_SOURCE.STATIC ||
      record.catalogSource === CATALOG_SOURCE.DISCOVERED ||
      record.catalogSource === CATALOG_SOURCE.LEGACY_ENV
        ? record.catalogSource
        : null,
    autoPolicyVersion: trimString(record.autoPolicyVersion, 40),
  };
}

/**
 * @param {unknown} turn
 */
export function readModelExecutionFromTurn(turn) {
  if (!turn || typeof turn !== "object") {
    return {
      executionSchema: null,
      requestedModel: null,
      actualModel: null,
      actualModelKnown: false,
      pathKey: null,
      selectionSource: null,
      fallbackOccurred: false,
      catalogSource: null,
      autoPolicyVersion: null,
    };
  }
  const record = /** @type {Record<string, unknown>} */ (turn);
  if (record.executionSchema === MODEL_EXECUTION_SCHEMA) {
    const actualModelKnown = record.actualModelKnown === true;
    return {
      executionSchema: MODEL_EXECUTION_SCHEMA,
      requestedModel: trimString(record.requestedModel, 80),
      actualModel: actualModelKnown ? trimString(record.actualModel, 80) : null,
      actualModelKnown,
      pathKey: trimString(record.pathKey, 120),
      selectionSource: trimString(record.selectionSource, 40),
      fallbackOccurred: record.fallbackOccurred === true,
      catalogSource:
        typeof record.catalogSource === "string" ? record.catalogSource : null,
      autoPolicyVersion: trimString(record.autoPolicyVersion, 40),
    };
  }
  const legacyModel = trimString(record.model, 80);
  return {
    executionSchema: null,
    requestedModel: legacyModel,
    actualModel: null,
    actualModelKnown: false,
    pathKey: null,
    selectionSource: null,
    fallbackOccurred: false,
    catalogSource: null,
    autoPolicyVersion: null,
  };
}

/**
 * Legacy `model` projection for reconcile — never promote requested to actual.
 *
 * @param {unknown} turn
 */
export function projectLegacyModelField(turn) {
  const exec = readModelExecutionFromTurn(turn);
  if (exec.executionSchema === MODEL_EXECUTION_SCHEMA) {
    return exec.actualModelKnown ? exec.actualModel : null;
  }
  return exec.requestedModel;
}
