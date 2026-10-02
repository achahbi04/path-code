export function inspectVercelEnvironmentMetadata(response: unknown,
  expected: { variableName: string; targetRef: string }):
  | { ok: true; variableName: string; targetRef: string; presenceState: "verified_present" | "verified_missing" }
  | { ok: false; code: string };
export function verifyVercelEnvironmentPresence(): { ok: false; code: "PROVIDER_VERIFICATION_UNAVAILABLE" };
