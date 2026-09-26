export function sleep(ms: number): Promise<void>;
export function isAlivePid(pid: number | null | undefined): boolean;
export function waitPidExit(
  pid: number | null | undefined,
  ms: number,
): Promise<boolean>;
export function terminateOwnedPid(
  pid: number | null | undefined,
  opts?: { termMs?: number; killMs?: number },
): Promise<{ ok: boolean; killed: boolean }>;
export function closeHttpServerBounded(
  server: import("node:http").Server,
  timeoutMs?: number,
): Promise<void>;
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  fallback?: T,
): Promise<T | undefined>;
