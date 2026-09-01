/**
 * Deep-freeze utility for canonical ledger immutability.
 */

export function deepFreeze<T extends object>(value: T): Readonly<T> {
  for (const key of Reflect.ownKeys(value)) {
    const child = (value as Record<PropertyKey, unknown>)[key];
    if (child !== null && typeof child === "object") {
      deepFreeze(child as object);
    }
  }
  return Object.freeze(value);
}
