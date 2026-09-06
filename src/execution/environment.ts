/**
 * Child environment snapshot for local process execution.
 * Does NOT mutate process.env.
 */

import {
  LOCAL_PROCESS_ENV_POLICY_ID,
  MAX_LOCAL_PROCESS_ENV_TOTAL_BYTES,
} from "./bounds.js";

const DEFAULT_INHERIT_KEYS = [
  "PATH",
  "HOME",
  "TMPDIR",
  "TMP",
  "TEMP",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TZ",
  "USER",
  "LOGNAME",
] as const;

function isDeniedSecretKey(key: string): boolean {
  const upper = key.toUpperCase();
  if (
    upper === "SSH_AUTH_SOCK" ||
    upper === "GITHUB_TOKEN" ||
    upper === "NPM_TOKEN"
  ) {
    return true;
  }
  if (
    upper.endsWith("_TOKEN") ||
    upper.endsWith("_SECRET") ||
    upper.endsWith("_PASSWORD") ||
    upper.endsWith("_API_KEY")
  ) {
    return true;
  }
  if (
    upper.startsWith("AWS_") ||
    upper.startsWith("OPENAI_") ||
    upper.startsWith("ANTHROPIC_")
  ) {
    return true;
  }
  return false;
}

function utf8Bytes(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

export type EnvironmentBuildFailure = {
  readonly code: "ENV_BYTES_EXCEEDED" | "ENV_NUL_REJECTED";
  readonly message: string;
};

export type EnvironmentBuildSuccess = {
  readonly snapshot: Readonly<Record<string, string>>;
  readonly envPolicyId: string;
};

/**
 * Build an immutable child environment from an explicit allowlist plus
 * caller extras. Never copies process.env wholesale.
 */
export function buildLocalProcessEnvironment(
  callerEnv: Readonly<Record<string, string>> | undefined,
  hostEnv: NodeJS.ProcessEnv = process.env,
):
  | { readonly ok: true; readonly value: EnvironmentBuildSuccess }
  | { readonly ok: false; readonly error: EnvironmentBuildFailure } {
  const child: Record<string, string> = {};

  for (const key of DEFAULT_INHERIT_KEYS) {
    if (isDeniedSecretKey(key)) {
      continue;
    }
    const value = hostEnv[key];
    if (typeof value === "string" && !value.includes("\0") && !key.includes("\0")) {
      child[key] = value;
    }
  }

  if (callerEnv !== undefined) {
    for (const [key, value] of Object.entries(callerEnv)) {
      if (key.includes("\0") || value.includes("\0")) {
        return {
          ok: false,
          error: {
            code: "ENV_NUL_REJECTED",
            message: "Environment keys and values must not contain NUL",
          },
        };
      }
      if (isDeniedSecretKey(key)) {
        continue;
      }
      child[key] = value;
    }
  }

  let total = 0;
  for (const [key, value] of Object.entries(child)) {
    total += utf8Bytes(key) + utf8Bytes(value) + 2;
    if (total > MAX_LOCAL_PROCESS_ENV_TOTAL_BYTES) {
      return {
        ok: false,
        error: {
          code: "ENV_BYTES_EXCEEDED",
          message: `Environment exceeds ${MAX_LOCAL_PROCESS_ENV_TOTAL_BYTES} bytes`,
        },
      };
    }
  }

  return {
    ok: true,
    value: {
      snapshot: Object.freeze({ ...child }),
      envPolicyId: LOCAL_PROCESS_ENV_POLICY_ID,
    },
  };
}
