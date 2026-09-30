/**
 * AG1 — hydrate Vertex/ADC env from local gcloud config when unset.
 * Presence only; never prints credentials.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { resolveProductionEngineModel } from "../model-plane/production-context.mjs";

/**
 * Model and provider the Antigravity bridge will actually use.
 * Null provider when no project and no API key are configured.
 * The model is the configured AG1_MODEL / GOOGLE_CLOUD_MODEL value.
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

/** Resolve once from the original env, then configure the bridge child from that result. */
export function resolveAg1BridgeConfiguration(input = {}) {
  const sourceEnv = { ...(input.env || process.env) };
  const resolution = input.modelResolution || resolveProductionEngineModel({
    engineId: "antigravity",
    env: sourceEnv,
    providerModelId: input.providerModelId,
    modelIdentity: input.modelIdentity,
    pathKey: input.pathKey,
    projectRoot: input.projectRoot,
    checkpoint: input.checkpoint,
    preferencesEnv: input.preferencesEnv,
  });
  if (!resolution.ok) return { ok: false, resolution };
  const env = hydrateAg1CloudEnv(sourceEnv);
  env.AG1_MODEL = resolution.providerModelId;
  return { ok: true, resolution, env };
}
