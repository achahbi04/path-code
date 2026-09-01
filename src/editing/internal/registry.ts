/**
 * In-memory one-shot authorization registry — non-persistent, non-serializable.
 */

import type { EditAuthorization } from "../types.js";

type RegistryEntry = {
  readonly preparedRef: EditAuthorization["preparedRef"];
  consumed: boolean;
};

const registry = new WeakMap<EditAuthorization, RegistryEntry>();

let preparedCounter = 0;

export function nextPreparedId(): string {
  preparedCounter += 1;
  return `prepared-${preparedCounter}`;
}

let authorizationCounter = 0;

export function nextAuthorizationId(): string {
  authorizationCounter += 1;
  return `auth-${authorizationCounter}`;
}

export function registerAuthorization(
  authorization: EditAuthorization,
  preparedRef: EditAuthorization["preparedRef"],
): void {
  registry.set(authorization, { preparedRef, consumed: false });
}

export function markAuthorizationConsumed(
  authorization: EditAuthorization,
): void {
  const entry = registry.get(authorization);
  if (entry !== undefined) {
    entry.consumed = true;
  }
}

export function lookupAuthorizationEntry(
  authorization: EditAuthorization,
): RegistryEntry | undefined {
  return registry.get(authorization);
}

/** Test-only counter reset — not exported from public barrel. */
export function resetAuthorizationRegistryForTests(): void {
  preparedCounter = 0;
  authorizationCounter = 0;
}
