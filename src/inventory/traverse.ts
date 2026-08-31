/**
 * Bounded breadth-first repository inventory traversal.
 *
 * Read-only: enumerates workspace entries and records metadata without opening
 * file content. Every child earns independent WorkspaceBoundary admission.
 */

import type { Dirent } from "node:fs";
import { lstat, readdir } from "node:fs/promises";
import path from "node:path";

import type { ResolvedProjectConfig } from "../config/types.js";
import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import type { CanonicalPath, WorkspaceBoundary } from "../domain/workspace.js";
import {
  DEFAULT_SYSTEM_PRUNED_DIRECTORIES,
  LOCALE_INDEPENDENT_NAME_COMPARE,
  MAX_INVENTORY_OBSERVATIONS,
  MAX_TRAVERSAL_DEPTH,
} from "./constants.js";
import {
  isLexicallyDenied,
  isPhysicallyDenied,
  normalizeRelativePath,
  prepareDenyPathPlan,
  type DenyPathPlan,
} from "./denial.js";
import type {
  InventoryObservation,
  InventoryPartialReason,
  TraversalCompletion,
} from "./disposition.js";
import { inventoryFailure, type InventoryFailure } from "./failure.js";
import type {
  EffectiveInventoryLimits,
  InventoryOptions,
  LexicalEntryKind,
  PhysicalTargetKind,
  RepositoryEntry,
  RepositoryEntryData,
  RepositoryInventory,
  RepositoryInventoryData,
} from "./types.js";

type QueueItem = {
  readonly relativePath: string;
  readonly depth: number;
  readonly dirent: Dirent;
};

function repositoryEntry(data: RepositoryEntryData): RepositoryEntry {
  return data as RepositoryEntry;
}

function repositoryInventory(data: RepositoryInventoryData): RepositoryInventory {
  return data as RepositoryInventory;
}

function validateInventoryOptions(
  options: InventoryOptions | undefined,
): Result<EffectiveInventoryLimits, InventoryFailure> {
  const requestedDepth = options?.maxDepth ?? MAX_TRAVERSAL_DEPTH;
  const requestedEntries = options?.maxEntries ?? MAX_INVENTORY_OBSERVATIONS;

  if (
    !Number.isFinite(requestedDepth) ||
    !Number.isInteger(requestedDepth) ||
    requestedDepth < 0
  ) {
    return failure(
      inventoryFailure(
        "INVALID_INVENTORY_OPTIONS",
        "maxDepth must be a finite non-negative integer",
      ),
    );
  }

  if (
    !Number.isFinite(requestedEntries) ||
    !Number.isInteger(requestedEntries) ||
    requestedEntries <= 0
  ) {
    return failure(
      inventoryFailure(
        "INVALID_INVENTORY_OPTIONS",
        "maxEntries must be a finite positive integer",
      ),
    );
  }

  if (requestedDepth > MAX_TRAVERSAL_DEPTH) {
    return failure(
      inventoryFailure(
        "INVALID_INVENTORY_OPTIONS",
        "maxDepth cannot exceed the hard production ceiling",
        { hardCeiling: MAX_TRAVERSAL_DEPTH },
      ),
    );
  }

  if (requestedEntries > MAX_INVENTORY_OBSERVATIONS) {
    return failure(
      inventoryFailure(
        "INVALID_INVENTORY_OPTIONS",
        "maxEntries cannot exceed the hard production ceiling",
        { hardCeiling: MAX_INVENTORY_OBSERVATIONS },
      ),
    );
  }

  return success({
    maxDepth: requestedDepth,
    maxEntries: requestedEntries,
  });
}

function direntLexicalKind(dirent: Dirent): LexicalEntryKind {
  if (dirent.isSymbolicLink()) {
    return "SYMLINK";
  }
  if (dirent.isDirectory()) {
    return "DIRECTORY";
  }
  return "FILE";
}

function physicalTargetKind(stats: Awaited<ReturnType<typeof lstat>>): PhysicalTargetKind {
  if (stats.isFile()) {
    return "FILE";
  }
  if (stats.isDirectory()) {
    return "DIRECTORY";
  }
  return "OTHER";
}

function childRelativePath(parentRelativePath: string, name: string): string {
  if (parentRelativePath === ".") {
    return normalizeRelativePath(name);
  }
  return normalizeRelativePath(path.posix.join(parentRelativePath, name));
}

function isSystemPrunedDirectory(dirent: Dirent): boolean {
  return (
    dirent.isDirectory() &&
    DEFAULT_SYSTEM_PRUNED_DIRECTORIES.includes(
      dirent.name as (typeof DEFAULT_SYSTEM_PRUNED_DIRECTORIES)[number],
    )
  );
}

function pushPartialReason(
  reasons: InventoryPartialReason[],
  reason: InventoryPartialReason,
): void {
  reasons.push(reason);
}

function buildCompletion(
  partialReasons: InventoryPartialReason[],
): TraversalCompletion {
  if (partialReasons.length === 0) {
    return { kind: "COMPLETE" };
  }
  const [first, ...rest] = partialReasons;
  if (first === undefined) {
    return { kind: "COMPLETE" };
  }
  return {
    kind: "PARTIAL",
    reasons: [first, ...rest],
  };
}

async function enumerateDirectory(
  directoryPath: CanonicalPath,
): Promise<readonly Dirent[] | null> {
  try {
    const entries = await readdir(directoryPath, { withFileTypes: true });
    entries.sort((left, right) =>
      LOCALE_INDEPENDENT_NAME_COMPARE(left.name, right.name),
    );
    return entries;
  } catch {
    return null;
  }
}

async function processQueueItem(
  workspace: WorkspaceBoundary,
  plan: DenyPathPlan,
  limits: EffectiveInventoryLimits,
  item: QueueItem,
  observations: InventoryObservation[],
  partialReasons: InventoryPartialReason[],
  visitedPhysicalDirectories: Set<CanonicalPath>,
  queue: QueueItem[],
): Promise<"continue" | "stop"> {
  const { relativePath, depth, dirent } = item;

  if (isLexicallyDenied(relativePath, plan)) {
    observations.push({
      disposition: "DENIED_BY_PROJECT_RESTRICTION",
      relativePath,
    });
    return "continue";
  }

  if (isSystemPrunedDirectory(dirent)) {
    observations.push({
      disposition: "SYSTEM_PRUNED",
      relativePath,
      reason: "system directory pruned by budget policy",
    });
    return "continue";
  }

  const admission = await workspace.canonicalize(relativePath);
  if (!admission.ok) {
    if (admission.error.code === "PATH_OUTSIDE_WORKSPACE") {
      observations.push({
        disposition: "OUTSIDE_WORKSPACE",
        relativePath,
      });
      return "continue";
    }

    observations.push({
      disposition: "UNREADABLE",
      relativePath,
    });
    pushPartialReason(partialReasons, {
      kind: "UNREADABLE_SUBTREE",
      relativePath,
    });
    return "continue";
  }

  let stats: Awaited<ReturnType<typeof lstat>>;
  try {
    stats = await lstat(admission.value);
  } catch {
    observations.push({
      disposition: "UNREADABLE",
      relativePath,
    });
    pushPartialReason(partialReasons, {
      kind: "UNREADABLE_SUBTREE",
      relativePath,
    });
    return "continue";
  }

  const entry = repositoryEntry({
    canonicalPath: admission.value,
    relativePath,
    lexicalKind: direntLexicalKind(dirent),
    physicalKind: physicalTargetKind(stats),
    size: stats.isFile() || stats.isSymbolicLink() ? stats.size : null,
    mtimeMs: stats.mtimeMs,
  });

  if (isPhysicallyDenied(admission.value, plan)) {
    observations.push({
      disposition: "DENIED_BY_PROJECT_RESTRICTION",
      relativePath,
    });
    return "continue";
  }

  if (entry.physicalKind !== "DIRECTORY") {
    observations.push({
      disposition: "ADMITTED",
      relativePath,
      entry,
    });
    return "continue";
  }

  if (visitedPhysicalDirectories.has(admission.value)) {
    observations.push({
      disposition: "CYCLE_DETECTED",
      relativePath,
    });
    return "continue";
  }

  if (depth + 1 > limits.maxDepth) {
    observations.push({
      disposition: "DEPTH_LIMIT_REACHED",
      relativePath,
      entry,
    });
    pushPartialReason(partialReasons, {
      kind: "DEPTH_LIMIT_REACHED",
      relativePath,
    });
    return "continue";
  }

  visitedPhysicalDirectories.add(admission.value);
  observations.push({
    disposition: "DESCENDED",
    relativePath,
    entry,
  });

  const children = await enumerateDirectory(admission.value);
  if (children === null) {
    pushPartialReason(partialReasons, {
      kind: "UNREADABLE_SUBTREE",
      relativePath,
    });
    return "continue";
  }

  for (const child of children) {
    queue.push({
      relativePath: childRelativePath(relativePath, child.name),
      depth: depth + 1,
      dirent: child,
    });
  }

  return "continue";
}

/**
 * Traverse an authorized workspace and record bounded repository observations.
 */
export async function inventory(
  workspace: WorkspaceBoundary,
  config: ResolvedProjectConfig,
  options?: InventoryOptions,
): Promise<Result<RepositoryInventory, InventoryFailure>> {
  const limitsResult = validateInventoryOptions(options);
  if (!limitsResult.ok) {
    return limitsResult;
  }
  const limits = limitsResult.value;

  const planResult = await prepareDenyPathPlan(
    workspace,
    config.restrictions.deniedPaths,
  );
  if (!planResult.ok) {
    return planResult;
  }
  const plan = planResult.value;

  const rootResult = await workspace.canonicalize(".");
  if (!rootResult.ok) {
    return failure(
      inventoryFailure(
        "WORKSPACE_ROOT_UNREADABLE",
        "Failed to obtain authorized workspace root for inventory",
        { workspaceCode: rootResult.error.code },
      ),
    );
  }

  const rootEntries = await enumerateDirectory(rootResult.value);
  if (rootEntries === null) {
    return failure(
      inventoryFailure(
        "WORKSPACE_ROOT_UNREADABLE",
        "Failed to enumerate authorized workspace root",
      ),
    );
  }

  const observations: InventoryObservation[] = [];
  const partialReasons: InventoryPartialReason[] = [];
  const visitedPhysicalDirectories = new Set<CanonicalPath>();
  const queue: QueueItem[] = rootEntries.map((dirent) => ({
    relativePath: normalizeRelativePath(dirent.name),
    depth: 1,
    dirent,
  }));

  while (queue.length > 0) {
    if (observations.length >= limits.maxEntries) {
      const next = queue[0];
      const entryLimitReason: InventoryPartialReason = next
        ? {
            kind: "ENTRY_LIMIT_REACHED",
            boundaryRelativePath: next.relativePath,
            boundaryDepth: next.depth,
          }
        : { kind: "ENTRY_LIMIT_REACHED" };
      pushPartialReason(partialReasons, entryLimitReason);
      break;
    }

    const item = queue.shift();
    if (item === undefined) {
      break;
    }

    const outcome = await processQueueItem(
      workspace,
      plan,
      limits,
      item,
      observations,
      partialReasons,
      visitedPhysicalDirectories,
      queue,
    );
    if (outcome === "stop") {
      break;
    }
  }

  return success(
    repositoryInventory({
      observations,
      traversalCompletion: buildCompletion(partialReasons),
      denyPathRules: plan.rules,
    }),
  );
}
