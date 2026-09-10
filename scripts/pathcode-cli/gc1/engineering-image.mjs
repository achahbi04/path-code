/**
 * Phase GC1-b — PATH Code Engineering Image identity + Artifact Registry defaults.
 * Workstation configs must pin by digest, never floating "latest".
 */

import { GC1_COST_FENCES, GC1_MACHINE_TYPE, GC1_RUNTIME_SA } from "./constants.mjs";
import {
  WORKSTATIONS_BASE,
  workstationsBasePinnedReference,
} from "./image-contract.mjs";

/** Artifact Registry defaults (operator-aligned GC1 project). */
export const ARTIFACT_REGISTRY = Object.freeze({
  projectId: "path-code-gc1-260910",
  region: "europe-west4",
  repository: "pathcode-gc1-images",
  image: "pathcode-engineering",
});

export const IMAGE_NAME = ARTIFACT_REGISTRY.image;

/** Default mutable tag used only as a human label — never as reproducibility authority. */
export const DEFAULT_IMAGE_TAG = "gc1b-v4";

/** Historical digests (evidence chain; do not reuse as live pin). */
export const IMAGE_DIGEST_HISTORY = Object.freeze({
  /** code-oss base + USER user → CONTAINER_START_FAILED "no users found" */
  "gc1b-v2":
    "sha256:7cdbbce2a60a77728b21fc2c55da4f24af18e5fd2d8aa48bdccc9dcdc9a9015a",
  /**
   * Workstations predefined/base@sha256:50086f15… + system toolchains.
   * Booted successfully; Go/Rust unresolved for non-login workstation user PATH.
   */
  "gc1b-v3":
    "sha256:077bd0639241bbc649b110cb0a910a5e1d46337b2f88ec978536a4649a694868",
  /**
   * v3 + /usr/local/bin Go shims + rustup wrappers/profile.d for workstation user.
   * Live pin after user-env toolchain repair.
   */
  "gc1b-v4":
    "sha256:7551be3df526788324a942b793ad6b4c294ab1511f273851602b5357640be2f6",
});

/** Upstream Workstations base pin used by Engineering Image builds. */
export { WORKSTATIONS_BASE, workstationsBasePinnedReference };

/**
 * Fully-qualified Artifact Registry repository path (no digest/tag).
 * europe-west4-docker.pkg.dev/<project>/<repo>/<image>
 */
export function engineeringImageRepositoryPath(
  registry = ARTIFACT_REGISTRY,
) {
  return `${registry.region}-docker.pkg.dev/${registry.projectId}/${registry.repository}/${registry.image}`;
}

/**
 * Build a digest-pinned image reference.
 * @param {{ digest: string, tag?: string }} opts
 * @returns {string} e.g. .../pathcode-engineering@sha256:...
 */
export function pinnedImageReference({ digest, tag: _tag } = {}) {
  if (!digest || typeof digest !== "string") {
    throw new Error("buildConfigContainerPin requires a non-empty digest");
  }
  const d = digest.startsWith("sha256:") ? digest : `sha256:${digest}`;
  // Digest reference — intentionally omits floating tags like "latest".
  return `${engineeringImageRepositoryPath()}@${d}`;
}

/**
 * Workstation config create body with container image pinned by digest.
 * Extends GC1-a cost fences; never places Control SA on the workstation.
 * Does NOT set runAsUser / command / workingDir (Workstations entrypoint owns lifecycle).
 *
 * @param {{ digest: string, tag?: string }} opts
 */
export function buildConfigContainerPin({ digest, tag } = {}) {
  if (!digest || typeof digest !== "string" || !digest.trim()) {
    throw new Error("buildConfigContainerPin({ digest }) requires a digest");
  }
  if (/:latest$/i.test(digest) || digest === "latest") {
    throw new Error(
      "buildConfigContainerPin refuses floating 'latest' as image identity",
    );
  }

  const imageRef = pinnedImageReference({ digest, tag });
  if (imageRef.includes(":latest") || /\/latest@/.test(imageRef)) {
    throw new Error("pinned image reference must not use floating latest");
  }
  if (!imageRef.includes("@sha256:")) {
    throw new Error("pinned image reference must use @sha256: digest form");
  }

  return {
    idleTimeout: GC1_COST_FENCES.idleTimeout,
    runningTimeout: GC1_COST_FENCES.runningTimeout,
    host: {
      gceInstance: {
        machineType: GC1_MACHINE_TYPE,
        poolSize: GC1_COST_FENCES.poolSize,
        serviceAccount: GC1_RUNTIME_SA,
      },
    },
    container: {
      image: imageRef,
      // Explicitly omit runAsUser / command / args / workingDir — Workstations
      // entrypoint + 010_add-user.sh own the runtime user model.
    },
  };
}

/** Alias matching the dispatch wording. */
export { buildConfigContainerPin as buildConfigCreateBodyWithImagePin };
