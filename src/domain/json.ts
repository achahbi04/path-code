/**
 * Provider-neutral JSON-compatible domain values.
 *
 * Intentionally excludes undefined, functions, Date, Map, Set, and class instances.
 * Runtime trust-boundary validation is deferred to a later phase.
 */

export type JsonPrimitive = string | number | boolean | null;

export type JsonArray = JsonValue[];

export type JsonObject = {
  readonly [key: string]: JsonValue;
};

export type JsonValue = JsonPrimitive | JsonArray | JsonObject;

/**
 * Pure structural guard for JSON-safe values.
 * Does not deep-validate exotic host objects beyond Date/function/undefined rejection.
 */
export function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) {
    return true;
  }

  const valueType = typeof value;
  if (valueType === "string" || valueType === "boolean") {
    return true;
  }

  if (valueType === "number") {
    return Number.isFinite(value);
  }

  if (valueType !== "object") {
    return false;
  }

  if (value instanceof Date) {
    return false;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      if (!isJsonValue(item)) {
        return false;
      }
    }
    return true;
  }

  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    return false;
  }

  for (const key of Reflect.ownKeys(value as object)) {
    if (typeof key === "symbol") {
      return false;
    }
    const property = (value as Record<string, unknown>)[key];
    if (property === undefined || !isJsonValue(property)) {
      return false;
    }
  }

  return true;
}
