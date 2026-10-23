/**
 * Names that may legitimately coexist in .env.local while one operation reads a
 * subset of them: same-environment local secret bindings that are already
 * configured, verified present and verified safe. This only authorizes a name to
 * EXIST; the operation's exactNames remain the only values it may read.
 * @param {readonly any[] | undefined} variables
 */
export function verifiedSafeLocalSecretNames(variables) {
  return (variables ?? [])
    .filter((binding) => binding.kind === "secret" && binding.backend === "local_env_file" &&
      binding.bindingState === "configured" && binding.presenceState === "verified_present" &&
      binding.safetyState === "verified_safe")
    .map((binding) => binding.variableName);
}
