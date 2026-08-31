/**
 * JSON manifest parsing — JSON.parse only. No JSONC/TOML/YAML parsers.
 */

import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";

export type JsonParseFailure =
  | { readonly kind: "PARSE_FAILED" }
  | { readonly kind: "TOP_LEVEL_UNSUPPORTED"; readonly detail: string };

export function parseJsonManifestText(
  text: string,
): Result<unknown, JsonParseFailure> {
  try {
    const value = JSON.parse(text) as unknown;
    if (
      value === null ||
      typeof value !== "object" ||
      Array.isArray(value)
    ) {
      return failure({
        kind: "TOP_LEVEL_UNSUPPORTED",
        detail: "Manifest top-level value must be a JSON object",
      });
    }
    return success(value);
  } catch {
    return failure({ kind: "PARSE_FAILED" });
  }
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function readOwnStringField(
  object: Record<string, unknown>,
  key: string,
): string | undefined {
  if (!Object.prototype.hasOwnProperty.call(object, key)) {
    return undefined;
  }
  const value = object[key];
  return typeof value === "string" ? value : undefined;
}

export function readOwnStringArrayField(
  object: Record<string, unknown>,
  key: string,
): readonly string[] | undefined {
  if (!Object.prototype.hasOwnProperty.call(object, key)) {
    return undefined;
  }
  const value = object[key];
  if (!Array.isArray(value)) {
    return undefined;
  }
  if (!value.every((item) => typeof item === "string")) {
    return undefined;
  }
  return value;
}

export function readOwnDependencyObject(
  object: Record<string, unknown>,
  key: string,
): Record<string, string> | "UNSUPPORTED_SHAPE" | undefined {
  if (!Object.prototype.hasOwnProperty.call(object, key)) {
    return undefined;
  }
  const value = object[key];
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return "UNSUPPORTED_SHAPE";
  }
  const record = value as Record<string, unknown>;
  for (const depValue of Object.values(record)) {
    if (typeof depValue !== "string") {
      return "UNSUPPORTED_SHAPE";
    }
  }
  return record as Record<string, string>;
}

export function readWorkspacePatterns(
  object: Record<string, unknown>,
): readonly string[] | "UNSUPPORTED_SHAPE" | undefined {
  const direct = readOwnStringArrayField(object, "workspaces");
  if (direct !== undefined) {
    return direct;
  }
  if (!Object.prototype.hasOwnProperty.call(object, "workspaces")) {
    return undefined;
  }
  const value = object.workspaces;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return "UNSUPPORTED_SHAPE";
  }
  const packages = readOwnStringArrayField(
    value as Record<string, unknown>,
    "packages",
  );
  if (packages === undefined) {
    return "UNSUPPORTED_SHAPE";
  }
  return packages;
}
