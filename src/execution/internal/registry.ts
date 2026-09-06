/**
 * In-memory one-shot local-process authorization registry.
 */

import type { LocalProcessAuthorization, PreparedLocalProcess } from "../types.js";

type RegistryEntry = {
  readonly preparedRef: PreparedLocalProcess;
  consumed: boolean;
};

const registry = new WeakMap<LocalProcessAuthorization, RegistryEntry>();

let preparedCounter = 0;
let authorizationCounter = 0;
let resultCounter = 0;

export function nextPreparedId(): string {
  preparedCounter += 1;
  return `local-process-prepared-${preparedCounter}`;
}

export function nextAuthorizationId(): string {
  authorizationCounter += 1;
  return `local-process-auth-${authorizationCounter}`;
}

export function nextResultId(): string {
  resultCounter += 1;
  return `local-process-result-${resultCounter}`;
}

export function registerAuthorization(
  authorization: LocalProcessAuthorization,
  preparedRef: PreparedLocalProcess,
): void {
  registry.set(authorization, { preparedRef, consumed: false });
}

export function markAuthorizationConsumed(
  authorization: LocalProcessAuthorization,
): void {
  const entry = registry.get(authorization);
  if (entry !== undefined) {
    entry.consumed = true;
  }
}

export function lookupAuthorizationEntry(
  authorization: LocalProcessAuthorization,
): RegistryEntry | undefined {
  return registry.get(authorization);
}

/** Test-only counter reset — not exported from execution barrel. */
export function resetLocalProcessRegistryForTests(): void {
  preparedCounter = 0;
  authorizationCounter = 0;
  resultCounter = 0;
}
