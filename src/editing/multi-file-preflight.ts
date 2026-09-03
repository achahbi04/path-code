/**
 * Read-only multi-file plan preflight — non-consuming, no writes.
 */

import path from "node:path";

import { loadProjectConfig } from "../config/loader.js";
import type { ResolvedProjectConfig } from "../config/types.js";
import { productionAtomicReplaceFs } from "./atomic-fs.js";
import {
  isAtomicCreatePlatformSupported,
  isAtomicReplacePlatformSupported,
} from "./atomic-fs.js";
import { refuseIfTargetDenied } from "./denial.js";
import { isTargetUnmergedInGitContext } from "./git-policy.js";
import { inspectAuthorizationReadiness } from "./internal/authorization-readiness.js";
import { isMutationActionDisabledByConfig } from "./policy.js";
import { readRepositoryContent } from "../reader/read.js";
import type { GitStateBaseline } from "../git/types.js";
import type {
  MultiFilePlan,
  MultiFilePlanTargetOutcome,
  MultiFilePreflightReasonCode,
} from "./multi-file-types.js";
import type { PreparedChange, PreparedCreation, PreparedMutation } from "./types.js";

export type PreflightPass = {
  readonly ready: true;
};

export type PreflightRefuse = {
  readonly ready: false;
  readonly targetOutcomes: readonly MultiFilePlanTargetOutcome[];
};

export type PreflightResult = PreflightPass | PreflightRefuse;

type TargetIdentityKey = string;

function identityKeyForPrepared(prepared: PreparedChange): TargetIdentityKey {
  if (prepared.action === "MODIFY_EXISTING_FILE") {
    return `modify:${prepared.target.canonicalPath}`;
  }
  return `create:${prepared.parent.canonicalPath}\0${prepared.leafName}`;
}

/**
 * Cross-kind / alias collision: publication path of a create vs modify canonical.
 */
function publicationPathKey(prepared: PreparedCreation): TargetIdentityKey {
  return `modify:${path.join(prepared.parent.canonicalPath, prepared.leafName)}`;
}

function findCollisionIndices(plan: MultiFilePlan): ReadonlySet<number> {
  const byKey = new Map<TargetIdentityKey, number[]>();

  const add = (key: TargetIdentityKey, index: number): void => {
    const list = byKey.get(key);
    if (list === undefined) {
      byKey.set(key, [index]);
    } else {
      list.push(index);
    }
  };

  for (let i = 0; i < plan.entries.length; i += 1) {
    const prepared = plan.entries[i]!.prepared;
    add(identityKeyForPrepared(prepared), i);
    if (prepared.action === "CREATE_FILE") {
      // Cross-kind: create of path X collides with modify of same canonical path.
      add(publicationPathKey(prepared), i);
    }
  }

  const colliding = new Set<number>();
  for (const indices of byKey.values()) {
    if (indices.length > 1) {
      for (const index of indices) {
        colliding.add(index);
      }
    }
  }
  return colliding;
}

async function inspectModification(
  prepared: PreparedMutation,
  config: ResolvedProjectConfig,
  gitContext: GitStateBaseline | undefined,
  reasons: MultiFilePreflightReasonCode[],
): Promise<void> {
  if (!isAtomicReplacePlatformSupported()) {
    reasons.push("UNSUPPORTED_ATOMIC_REPLACE_PLATFORM");
    return;
  }

  if (isMutationActionDisabledByConfig(prepared.action, config)) {
    reasons.push("ACTION_DISABLED");
    return;
  }

  const denied = await refuseIfTargetDenied(
    prepared.target.relativePath,
    prepared.workspace,
    config,
  );
  if (!denied.ok) {
    reasons.push("TARGET_DENIED");
    return;
  }

  const canonical = await prepared.workspace.canonicalize(
    prepared.target.relativePath,
  );
  if (!canonical.ok) {
    reasons.push("CANONICALIZATION_FAILED");
    return;
  }
  if (canonical.value !== prepared.target.canonicalPath) {
    reasons.push("CANONICALIZATION_FAILED");
    return;
  }

  if (gitContext !== undefined) {
    if (
      isTargetUnmergedInGitContext(
        prepared.target,
        prepared.target.relativePath,
        gitContext,
      )
    ) {
      reasons.push("GIT_UNMERGED");
      return;
    }
  }

  const readOutcome = await readRepositoryContent(
    prepared.target,
    prepared.workspace,
    config,
  );
  if (!readOutcome.ok || readOutcome.value.status !== "READ") {
    reasons.push("TARGET_STALE");
    return;
  }
  const observed = readOutcome.value.observation;
  if (
    observed.fingerprint.hex !== prepared.beforeFingerprint.hex ||
    observed.fingerprint.byteLength !== prepared.beforeFingerprint.byteLength ||
    observed.byteLength !== prepared.beforeByteLength
  ) {
    reasons.push("TARGET_STALE");
    return;
  }

  let metadata;
  try {
    metadata = await productionAtomicReplaceFs.lstatTarget(canonical.value);
  } catch {
    reasons.push("NOT_REGULAR_FILE");
    return;
  }
  if (metadata.isSymbolicLink) {
    reasons.push("SYMLINK_REFUSED");
    return;
  }
  if (!metadata.isFile) {
    reasons.push("NOT_REGULAR_FILE");
    return;
  }
  if (metadata.nlink > 1) {
    reasons.push("HARD_LINK_REFUSED");
  }
}

async function inspectCreation(
  prepared: PreparedCreation,
  config: ResolvedProjectConfig,
  gitContext: GitStateBaseline | undefined,
  reasons: MultiFilePreflightReasonCode[],
): Promise<void> {
  if (!isAtomicCreatePlatformSupported()) {
    reasons.push("UNSUPPORTED_ATOMIC_CREATE_PLATFORM");
    return;
  }

  if (isMutationActionDisabledByConfig(prepared.action, config)) {
    reasons.push("ACTION_DISABLED");
    return;
  }

  const parentDenied = await refuseIfTargetDenied(
    prepared.parent.relativePath,
    prepared.workspace,
    config,
  );
  if (!parentDenied.ok) {
    reasons.push("TARGET_DENIED");
    return;
  }

  const targetDenied = await refuseIfTargetDenied(
    prepared.targetRelativePath,
    prepared.workspace,
    config,
  );
  if (!targetDenied.ok) {
    reasons.push("TARGET_DENIED");
    return;
  }

  if (gitContext !== undefined) {
    if (
      isTargetUnmergedInGitContext(
        prepared.parent,
        prepared.targetRelativePath,
        gitContext,
      )
    ) {
      reasons.push("GIT_UNMERGED");
      return;
    }
  }

  const absence = await prepared.workspace.canonicalize(
    prepared.targetRelativePath,
  );
  if (absence.ok) {
    reasons.push("TARGET_ALREADY_EXISTS");
    return;
  }
  if (absence.error.code !== "PATH_NOT_FOUND") {
    reasons.push("ABSENCE_UNVERIFIABLE");
    return;
  }

  const parentCanonical = await prepared.workspace.canonicalize(
    prepared.parent.relativePath,
  );
  if (!parentCanonical.ok) {
    reasons.push("PARENT_NOT_ADMITTED");
    return;
  }
  if (parentCanonical.value !== prepared.parent.canonicalPath) {
    reasons.push("PARENT_NOT_ADMITTED");
    return;
  }

  let metadata;
  try {
    metadata = await productionAtomicReplaceFs.lstatTarget(parentCanonical.value);
  } catch {
    reasons.push("PARENT_NOT_ADMITTED");
    return;
  }
  if (metadata.isSymbolicLink || !metadata.isDirectory) {
    reasons.push("PARENT_NOT_ADMITTED");
  }
}

/**
 * Fresh read-only preflight for one plan invocation.
 * Never consumes authorization or writes.
 */
export async function runMultiFilePreflight(
  plan: MultiFilePlan,
  gitContext?: GitStateBaseline,
): Promise<PreflightResult> {
  const configResult = await loadProjectConfig(plan.workspace);
  if (!configResult.ok) {
    const outcomes: MultiFilePlanTargetOutcome[] = plan.entries.map(() => ({
      kind: "PREFLIGHT_FAILED",
      reasons: ["CONFIG_RELOAD_FAILED"] as const,
    }));
    return { ready: false, targetOutcomes: outcomes };
  }
  const config = configResult.value;

  const colliding = findCollisionIndices(plan);
  const perTargetReasons: MultiFilePreflightReasonCode[][] = plan.entries.map(
    () => [],
  );

  for (let i = 0; i < plan.entries.length; i += 1) {
    const entry = plan.entries[i]!;
    const reasons = perTargetReasons[i]!;

    if (colliding.has(i)) {
      reasons.push("TARGET_COLLISION");
    }

    const readiness = inspectAuthorizationReadiness(
      entry.authorization,
      entry.prepared,
    );
    if (!readiness.ok) {
      reasons.push(readiness.reason);
    }

    // Deeper inspection only when trust allows (denial stops further reads).
    if (reasons.includes("TARGET_COLLISION")) {
      // Still check auth/config eligibility where safe; denial/content after collision OK.
    }

    if (entry.prepared.action === "MODIFY_EXISTING_FILE") {
      await inspectModification(entry.prepared, config, gitContext, reasons);
    } else {
      await inspectCreation(entry.prepared, config, gitContext, reasons);
    }
  }

  const anyFailed = perTargetReasons.some((r) => r.length > 0);
  if (!anyFailed) {
    return { ready: true };
  }

  const targetOutcomes: MultiFilePlanTargetOutcome[] = perTargetReasons.map(
    (reasons) => {
      if (reasons.length === 0) {
        return { kind: "PREFLIGHT_READY_BUT_PLAN_REFUSED" };
      }
      return {
        kind: "PREFLIGHT_FAILED",
        reasons: Object.freeze([...reasons]),
      };
    },
  );

  return { ready: false, targetOutcomes: Object.freeze(targetOutcomes) };
}
