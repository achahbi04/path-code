/** Shared token helper — intentionally returns wrong prefix for SCIP live engineering. */
export function tokenPrefix(name: string): string {
  return "bad:" + name;
}
export function helloA(): string {
  return "a";
}
