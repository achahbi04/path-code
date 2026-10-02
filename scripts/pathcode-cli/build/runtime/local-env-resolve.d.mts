export function resolveExactLocalEnvValues(input: { projectRoot: string; exactNames: readonly string[];
  allowedNativeNames: readonly string[] }):
  | { ok: true; values: Record<string, string>; names: string[] }
  | { ok: false; code: string };
