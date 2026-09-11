/**
 * AG1 — detect whether an officially supported Antigravity auth path is present.
 * Never reads or returns secret values — presence only.
 */

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{
 *   ok: boolean,
 *   mode: "gemini_api_key" | "vertex_adc" | "none",
 *   message: string,
 * }}
 */
export function detectAg1Auth(env = process.env) {
  const vertexFlag =
    String(env.GOOGLE_GENAI_USE_VERTEXAI || "").toLowerCase() === "true" ||
    String(env.GOOGLE_GENAI_USE_VERTEXAI || "") === "1" ||
    String(env.GOOGLE_GENAI_USE_ENTERPRISE || "").toLowerCase() === "true" ||
    String(env.GOOGLE_GENAI_USE_ENTERPRISE || "") === "1";
  const project =
    (typeof env.GOOGLE_CLOUD_PROJECT === "string" &&
      env.GOOGLE_CLOUD_PROJECT.trim() !== "") ||
    (typeof env.CLOUDSDK_CORE_PROJECT === "string" &&
      env.CLOUDSDK_CORE_PROJECT.trim() !== "");
  const adcFile =
    typeof env.GOOGLE_APPLICATION_CREDENTIALS === "string" &&
    env.GOOGLE_APPLICATION_CREDENTIALS.trim() !== "";

  // Prefer Vertex when a cloud project is configured (ADC via gcloud).
  // API keys alone may be present-but-invalid and must not hide Vertex.
  if (project) {
    return {
      ok: true,
      mode: "vertex_adc",
      message: vertexFlag
        ? "Vertex/Enterprise env configured (ADC expected)."
        : "Google Cloud project configured (Vertex/ADC expected).",
    };
  }
  if (adcFile) {
    return {
      ok: true,
      mode: "vertex_adc",
      message: "ADC credential file present.",
    };
  }

  const gemini =
    (typeof env.GEMINI_API_KEY === "string" && env.GEMINI_API_KEY.trim() !== "") ||
    (typeof env.GOOGLE_API_KEY === "string" && env.GOOGLE_API_KEY.trim() !== "");
  if (gemini) {
    return {
      ok: true,
      mode: "gemini_api_key",
      message: "Gemini API key present in environment.",
    };
  }

  return {
    ok: false,
    mode: "none",
    message:
      "No Antigravity auth found. Set GEMINI_API_KEY (or GOOGLE_API_KEY), " +
      "or configure Vertex via GOOGLE_CLOUD_PROJECT (+ ADC via " +
      "`gcloud auth application-default login`).",
  };
}
