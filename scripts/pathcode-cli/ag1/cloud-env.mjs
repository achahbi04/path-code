/**
 * AG1 — hydrate Vertex/ADC env from local gcloud config when unset.
 * Presence only; never prints credentials.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Model and provider the Antigravity bridge will actually use.
 * Null provider when no project and no API key are configured.
 * The model is the resolved AG1_MODEL / GOOGLE_CLOUD_MODEL value, which
 * hydrateAg1CloudEnv sets before the bridge starts. It is not inferred
 * from a catalog.
 *
 * @param {NodeJS.ProcessEnv} [env]
 */
export function resolveAg1ExecutionIdentity(env = process.env) {
  const model =
    (typeof env.AG1_MODEL === "string" && env.AG1_MODEL.trim()) ||
    (typeof env.GOOGLE_CLOUD_MODEL === "string" && env.GOOGLE_CLOUD_MODEL.trim()) ||
    null;
  const project =
    (typeof env.GOOGLE_CLOUD_PROJECT === "string" && env.GOOGLE_CLOUD_PROJECT.trim()) ||
    (typeof env.CLOUDSDK_CORE_PROJECT === "string" &&
      env.CLOUDSDK_CORE_PROJECT.trim()) ||
    "";
  const hasKey = Boolean(
    (typeof env.GEMINI_API_KEY === "string" && env.GEMINI_API_KEY.trim()) ||
      (typeof env.GOOGLE_API_KEY === "string" && env.GOOGLE_API_KEY.trim()),
  );
  return {
    model,
    provider: project ? "Vertex AI" : hasKey ? "Google AI" : null,
    mode: "bridge",
  };
}

export function hydrateAg1CloudEnv(env = process.env) {
  const out = env;
  if (
    !(typeof out.GOOGLE_CLOUD_PROJECT === "string" && out.GOOGLE_CLOUD_PROJECT.trim()) &&
    !(typeof out.CLOUDSDK_CORE_PROJECT === "string" && out.CLOUDSDK_CORE_PROJECT.trim())
  ) {
    try {
      const project = execFileSync("gcloud", ["config", "get-value", "project"], {
        encoding: "utf8",
        timeout: 5_000,
        stdio: ["ignore", "pipe", "ignore"],
      })
        .trim()
        .replace(/^\(unset\)$/i, "");
      if (project) out.GOOGLE_CLOUD_PROJECT = project;
    } catch {
      // gcloud optional
    }
  }
  if (!(typeof out.GOOGLE_CLOUD_LOCATION === "string" && out.GOOGLE_CLOUD_LOCATION.trim())) {
    out.GOOGLE_CLOUD_LOCATION = "us-central1";
  }
  if (!(typeof out.AG1_MODEL === "string" && out.AG1_MODEL.trim())) {
    out.AG1_MODEL = "gemini-2.5-flash";
  }
  // Prefer Vertex when a project is available and ADC exists (or flag already set).
  const project =
    (typeof out.GOOGLE_CLOUD_PROJECT === "string" && out.GOOGLE_CLOUD_PROJECT.trim()) ||
    (typeof out.CLOUDSDK_CORE_PROJECT === "string" && out.CLOUDSDK_CORE_PROJECT.trim());
  const adcDefault = join(homedir(), ".config", "gcloud", "application_default_credentials.json");
  const adcPresent =
    (typeof out.GOOGLE_APPLICATION_CREDENTIALS === "string" &&
      out.GOOGLE_APPLICATION_CREDENTIALS.trim() !== "") ||
    existsSync(adcDefault);
  if (project && adcPresent) {
    const flag = String(out.GOOGLE_GENAI_USE_VERTEXAI || "").toLowerCase();
    if (flag !== "true" && flag !== "1") {
      out.GOOGLE_GENAI_USE_VERTEXAI = "true";
    }
  }
  return out;
}
