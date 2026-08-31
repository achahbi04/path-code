/**
 * Deny-path preparation and matching.
 *
 * Physical denial-root preparation resolves configured boundaries once at
 * inventory start for alias resistance. That boundary-resolution step is not
 * repository traversal and does not enumerate children or read content.
 */

import path from "node:path";

import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import type { CanonicalPath, WorkspaceBoundary } from "../domain/workspace.js";
import { isInsideRoot } from "../workspace/path-semantics.js";
import { inventoryFailure, type InventoryFailure } from "./failure.js";

export type PhysicalDenyRootStatus =
  | { readonly kind: "RESOLVED"; readonly root: CanonicalPath }
  | { readonly kind: "NOT_FOUND" }
  | { readonly kind: "OUTSIDE_WORKSPACE" };

export type DenyPathRuleRecord = {
  readonly configuredPath: string;
  readonly physicalRootStatus: PhysicalDenyRootStatus;
};

export type DenyPathPlan = {
  readonly rules: readonly DenyPathRuleRecord[];
  readonly boundaryComponents: ReadonlyMap<string, readonly string[]>;
};

function normalizeRelativePath(relativePath: string): string {
  const normalized = path.posix.normalize(relativePath.replace(/\\/g, "/"));
  if (normalized === ".") {
    return ".";
  }
  return normalized.replace(/\/+$/, "");
}

function pathComponents(relativePath: string): readonly string[] {
  const normalized = normalizeRelativePath(relativePath);
  if (normalized === ".") {
    return [];
  }
  return normalized.split("/").filter((segment) => segment.length > 0);
}

function componentsMatchPrefix(
  candidate: readonly string[],
  boundary: readonly string[],
): boolean {
  if (boundary.length === 0 || candidate.length < boundary.length) {
    return false;
  }
  for (let index = 0; index < boundary.length; index += 1) {
    if (candidate[index] !== boundary[index]) {
      return false;
    }
  }
  return true;
}

export function isLexicallyDenied(
  relativePath: string,
  plan: DenyPathPlan,
): boolean {
  const candidate = pathComponents(relativePath);
  for (const boundary of plan.boundaryComponents.values()) {
    if (componentsMatchPrefix(candidate, boundary)) {
      return true;
    }
  }
  return false;
}

export function isPhysicallyDenied(
  canonicalPath: CanonicalPath,
  plan: DenyPathPlan,
): boolean {
  for (const rule of plan.rules) {
    if (rule.physicalRootStatus.kind !== "RESOLVED") {
      continue;
    }
    if (isInsideRoot(rule.physicalRootStatus.root, canonicalPath, path)) {
      return true;
    }
  }
  return false;
}

export async function prepareDenyPathPlan(
  workspace: WorkspaceBoundary,
  deniedPaths: readonly string[],
): Promise<Result<DenyPathPlan, InventoryFailure>> {
  const rules: DenyPathRuleRecord[] = [];
  const boundaryComponents = new Map<string, readonly string[]>();

  for (const configuredPath of deniedPaths) {
    boundaryComponents.set(configuredPath, pathComponents(configuredPath));

    const resolved = await workspace.canonicalize(configuredPath);
    if (resolved.ok) {
      rules.push({
        configuredPath,
        physicalRootStatus: { kind: "RESOLVED", root: resolved.value },
      });
      continue;
    }

    if (resolved.error.code === "PATH_NOT_FOUND") {
      rules.push({
        configuredPath,
        physicalRootStatus: { kind: "NOT_FOUND" },
      });
      continue;
    }

    if (resolved.error.code === "PATH_OUTSIDE_WORKSPACE") {
      rules.push({
        configuredPath,
        physicalRootStatus: { kind: "OUTSIDE_WORKSPACE" },
      });
      continue;
    }

    return failure(
      inventoryFailure(
        "DENIAL_ROOT_RESOLUTION_FAILED",
        "Unexpected failure resolving configured deny-path boundary",
        {
          configuredPath,
          workspaceCode: resolved.error.code,
        },
      ),
    );
  }

  return success({ rules, boundaryComponents });
}

export { normalizeRelativePath, pathComponents };
