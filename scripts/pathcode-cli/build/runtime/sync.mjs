/**
 * Runtime synchronization owned by the Build coordinator.
 *
 * This is deliberately independent of the HTTP surface: autonomous Build
 * loops must be able to refresh product runtimes and browser evidence while
 * every browser window is closed.
 */

import { existsSync } from "node:fs";
import { detectBuildArtifact } from "./artifact.mjs";
import { captureBrowserEvidence } from "./browser-evidence.mjs";
import { readBuildRecord } from "../record.mjs";

/**
 * @param {{
 *   runtimeRoot: string,
 *   controller: ReturnType<import('../controller.mjs').createBuildController>,
 *   runtimeManager: ReturnType<import('./manager.mjs').createBuildRuntimeManager>,
 * }} options
 */
export function createBuildRuntimeSync(options) {
  const { runtimeRoot, controller, runtimeManager } = options;

  /**
   * @param {string} buildId
   */
  function requireBinding(buildId) {
    const build = readBuildRecord(runtimeRoot, buildId);
    if (!build) return { ok: false, code: "BUILD_NOT_FOUND" };
    const binding = build.projectBindings?.[0];
    if (!binding?.projectRoot || !existsSync(binding.projectRoot)) {
      return { ok: false, code: "NO_PROJECT_ROOT", build };
    }
    return {
      ok: true,
      build,
      binding,
      projectRoot: binding.projectRoot,
    };
  }

  /**
   * @param {string} buildId
   */
  async function sync(buildId) {
    const gate = requireBinding(buildId);
    if (!gate.ok) return gate;
    const { build, binding, projectRoot } = gate;
    const artifact = detectBuildArtifact(projectRoot, {
      outcomeHint: build.intent?.outcome,
    });
    if (artifact.preview.capability !== "web") {
      controller.patchRuntimeState(buildId, {
        previewUrl: null,
        runtimeHealth: "n/a",
        clearRuntimeRefresh: true,
      });
      return { ok: true, skipped: true, reason: "non_web", artifact };
    }
    if ((artifact.signals || []).includes("empty_tree")) {
      controller.patchRuntimeState(buildId, {
        previewUrl: null,
        runtimeHealth: "awaiting_product",
        clearRuntimeRefresh: true,
      });
      return { ok: true, skipped: true, reason: "empty_tree", artifact };
    }

    const force = Boolean(build.loop?.pendingRuntimeRefresh);
    const runtimeContext = {
      bindingId: binding.bindingId,
      outcomeHint: build.intent?.outcome,
      authoritativeSha: build.authoritativeSha || null,
      descriptor: {
        buildId,
        bindingId: binding.bindingId,
        projectRoot,
        artifactKind: artifact.kind,
        preview: artifact.preview,
      },
      restartAllowed: true,
    };
    const started = force
      ? await runtimeManager.refresh(buildId, projectRoot, runtimeContext)
      : await runtimeManager.start(buildId, projectRoot, runtimeContext);

    if (!started.ok) {
      controller.patchRuntimeState(buildId, {
        previewUrl: null,
        runtimeHealth: "failed",
        clearRuntimeRefresh: true,
      });
      return started;
    }

    const preview = runtimeManager.getPreviewDescriptor(buildId);
    const previewUrl = started.runtime?.url || preview?.url || null;
    const evidence = await captureBrowserEvidence({
      url: previewUrl,
      buildId,
      runtimeRoot,
      authoritativeSha: build.authoritativeSha || null,
      intentRevision: build.intent?.outcomeRevision ?? null,
      bindingId: binding.bindingId,
      expectText: String(build.intent?.outcome || "")
        .split(/\s+/)
        .filter((word) => word.length > 3)
        .slice(0, 8),
    });
    evidence.authoritativeSha = build.authoritativeSha || null;

    controller.patchRuntimeState(buildId, {
      previewUrl,
      runtimeHealth: started.runtime?.status === "ready" ? "ok" : "down",
      browserEvidence: evidence,
      clearRuntimeRefresh: true,
      authoritativeSha: build.authoritativeSha || null,
    });
    return {
      ok: true,
      runtime: started.runtime,
      evidence,
      preview: runtimeManager.getPreviewDescriptor(buildId),
      artifact,
    };
  }

  return { sync, requireBinding };
}
