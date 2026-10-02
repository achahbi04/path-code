/**
 * Vercel metadata boundary. No live query is enabled: the currently documented
 * list contract has not established that all responses are value-free.
 * This inspector is deliberately pure so a later verified transport can reuse
 * it without leaking a raw provider response to PATH authority.
 */
const fail = (code) => ({ ok: false, code });
const SECRET_FIELDS = new Set(["value", "secretvalue", "plaintext", "encryptedvalue", "decryptedvalue"]);

/** @param {unknown} response */
export function inspectVercelEnvironmentMetadata(response, expected) {
  const visited = new Set();
  function unsafe(node) {
    if (!node || typeof node !== "object") return false;
    if (visited.has(node)) return false;
    visited.add(node);
    return Object.entries(node).some(([key, child]) =>
      SECRET_FIELDS.has(key.toLowerCase()) || unsafe(child));
  }
  if (unsafe(response)) return fail("PROVIDER_METADATA_UNSAFE");
  if (!response || typeof response !== "object" || !Array.isArray(response.envs) ||
      typeof expected?.variableName !== "string" || typeof expected?.targetRef !== "string") {
    return fail("PROVIDER_METADATA_INVALID");
  }
  if (Object.keys(response).some((key) => key !== "envs")) return fail("PROVIDER_METADATA_UNSAFE");
  for (const item of response.envs) {
    if (!item || typeof item !== "object" || typeof item.key !== "string" ||
        Object.keys(item).some((key) => !["key", "target", "id", "type"].includes(key)) ||
        !Array.isArray(item.target) || item.target.some((target) => typeof target !== "string")) {
      return fail("PROVIDER_METADATA_INVALID");
    }
  }
  const matches = response.envs.filter((item) => item.key === expected.variableName &&
    item.target.includes(expected.targetRef));
  if (matches.length > 1) return fail("PROVIDER_METADATA_AMBIGUOUS");
  return { ok: true, variableName: expected.variableName, targetRef: expected.targetRef,
    presenceState: matches.length ? "verified_present" : "verified_missing" };
}

/** No proven value-free live transport exists in this pass. */
export function verifyVercelEnvironmentPresence() {
  return fail("PROVIDER_VERIFICATION_UNAVAILABLE");
}
