/**
 * Phase GC1-c — remote credential boundary proof + local surface canary checks.
 *
 * Host-authored only. Never prints credential values — only key presence /
 * named violation codes.
 */

/** Env keys that must never appear on the remote workstation. */
export const FORBIDDEN_REMOTE_CREDENTIAL_ENV_KEYS = Object.freeze([
  "OPENAI_API_KEY",
  "PATHCODE_OPENAI_API_KEY",
  "PATHCODE_LIVE_OPENAI",
  "PATHCODE_GC1C_SECRET_CANARY",
]);

/**
 * Host-authored shell: checks presence of forbidden keys only; never echoes values.
 * On clean remote: prints exactly `CREDENTIAL_BOUNDARY_PASS`.
 * On violation: prints exactly `CREDENTIAL_BOUNDARY_VIOLATION:<name>` and exits 1.
 */
export function buildRemoteCredentialBoundaryCommand() {
  const checks = FORBIDDEN_REMOTE_CREDENTIAL_ENV_KEYS.map(
    (k) =>
      `if [ -n "\${${k}+x}" ]; then printf 'CREDENTIAL_BOUNDARY_VIOLATION:%s\\n' '${k}'; exit 1; fi`,
  ).join("; ");
  return `${checks}; printf 'CREDENTIAL_BOUNDARY_PASS\\n'`;
}

/**
 * Fail if canary value or forbidden credential keys leak into serialized surfaces.
 * @param {{
 *   canaryValue: string,
 *   surfaces: {
 *     hydrationPayload?: unknown,
 *     workerRequests?: unknown,
 *     journalText?: string,
 *     eventsText?: string,
 *     artifactsText?: string,
 *     childEnv?: unknown,
 *   },
 * }} opts
 */
export function assertLocalSurfacesFreeOfCanary(opts) {
  const canaryValue = String(opts.canaryValue ?? "");
  if (!canaryValue) {
    const err = new Error("assertLocalSurfacesFreeOfCanary requires canaryValue");
    err.code = "CANARY_VALUE_REQUIRED";
    throw err;
  }
  const surfaces = opts.surfaces ?? {};
  /** @type {Array<[string, unknown]>} */
  const entries = Object.entries(surfaces);
  for (const [name, surface] of entries) {
    if (surface == null) continue;

    // Prefer key-presence refusal on env-like surfaces before value scan.
    if (name === "childEnv" || name === "workerRequests" || name === "hydrationPayload") {
      if (typeof surface === "object" && surface !== null && !Array.isArray(surface)) {
        for (const key of FORBIDDEN_REMOTE_CREDENTIAL_ENV_KEYS) {
          if (Object.prototype.hasOwnProperty.call(surface, key)) {
            const err = new Error(
              `forbidden credential key present in ${name}: ${key}`,
            );
            err.code = "CREDENTIAL_BOUNDARY_VIOLATION";
            throw err;
          }
        }
      }
    }

    const text =
      typeof surface === "string" ? surface : JSON.stringify(surface);
    if (text.includes(canaryValue)) {
      const err = new Error(`canary value leaked into local surface: ${name}`);
      err.code = "CREDENTIAL_CANARY";
      throw err;
    }
    // Serialized blobs must not carry canary env assignments with values.
    for (const key of FORBIDDEN_REMOTE_CREDENTIAL_ENV_KEYS) {
      const assignment = new RegExp(
        `${key}\\s*[:=]\\s*["']?${escapeRegExp(canaryValue)}`,
      );
      if (assignment.test(text)) {
        const err = new Error(
          `forbidden credential assignment leaked into ${name}: ${key}`,
        );
        err.code = "CREDENTIAL_BOUNDARY_VIOLATION";
        throw err;
      }
    }
  }
  return { ok: true };
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Run the remote credential-boundary proof via transport tunnel/worker.
 * Returns pass/fail without echoing secret values.
 *
 * @param {object} transport
 * @param {{ workstationName: string }} opts
 * @returns {Promise<{ ok: true } | { ok: false, code: string, message: string, violatedKey?: string }>}
 */
export async function runRemoteCredentialBoundaryProof(transport, opts) {
  const workstationName = opts?.workstationName;
  if (!transport || typeof transport.executeCommand !== "function") {
    return {
      ok: false,
      code: "CREDENTIAL_BOUNDARY_VIOLATION",
      message: "transport.executeCommand unavailable for credential boundary proof",
    };
  }
  if (!workstationName) {
    return {
      ok: false,
      code: "CREDENTIAL_BOUNDARY_VIOLATION",
      message: "workstationName required for credential boundary proof",
    };
  }

  const command = buildRemoteCredentialBoundaryCommand();
  let result;
  try {
    result = await transport.executeCommand({ workstationName, command });
  } catch (e) {
    return {
      ok: false,
      code: "CREDENTIAL_BOUNDARY_VIOLATION",
      message: e?.message || "credential boundary executeCommand failed",
    };
  }

  const stdout = String(result?.stdout ?? "").trim();
  const lines = stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const violation = lines.find((l) =>
    l.startsWith("CREDENTIAL_BOUNDARY_VIOLATION:"),
  );
  if (violation) {
    const violatedKey = violation.slice("CREDENTIAL_BOUNDARY_VIOLATION:".length);
    // Refuse if the line somehow contains more than the key name (no values).
    if (violatedKey.includes("=") || violatedKey.includes(" ")) {
      return {
        ok: false,
        code: "CREDENTIAL_BOUNDARY_VIOLATION",
        message: "credential boundary output malformed (possible value leak)",
        violatedKey: violatedKey.split(/[=\s]/)[0] || violatedKey,
      };
    }
    return {
      ok: false,
      code: "CREDENTIAL_BOUNDARY_VIOLATION",
      message: `remote env contains forbidden credential key: ${violatedKey}`,
      violatedKey,
    };
  }

  if (!lines.includes("CREDENTIAL_BOUNDARY_PASS") || (result?.exitCode ?? 0) !== 0) {
    return {
      ok: false,
      code: "CREDENTIAL_BOUNDARY_VIOLATION",
      message: "credential boundary proof did not return CREDENTIAL_BOUNDARY_PASS",
    };
  }

  // Defense: stdout must not contain any of the forbidden key values from mock seed
  // (we never know live values; check that output is only the pass token / violation names).
  for (const line of lines) {
    if (
      line !== "CREDENTIAL_BOUNDARY_PASS" &&
      !line.startsWith("CREDENTIAL_BOUNDARY_VIOLATION:")
    ) {
      return {
        ok: false,
        code: "CREDENTIAL_BOUNDARY_VIOLATION",
        message: "credential boundary proof produced unexpected output",
      };
    }
  }

  return { ok: true };
}
