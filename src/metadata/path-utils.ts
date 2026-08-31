/**
 * Pure path helpers for metadata scope and ordering.
 */

import path from "node:path";

import { LOCALE_INDEPENDENT_NAME_COMPARE } from "../inventory/constants.js";

export function scopeFromManifestPath(relativePath: string): string {
  const dir = path.posix.dirname(relativePath);
  return dir === "." ? "" : dir;
}

export function lexicalDepth(relativePath: string): number {
  if (relativePath.length === 0) {
    return 0;
  }
  return relativePath.split("/").length - 1;
}

export function parentDirectory(relativePath: string): string {
  const dir = path.posix.dirname(relativePath);
  return dir === "." ? "" : dir;
}

export function compareLexicalPaths(a: string, b: string): number {
  const depthA = lexicalDepth(a);
  const depthB = lexicalDepth(b);
  if (depthA !== depthB) {
    return depthA - depthB;
  }
  return LOCALE_INDEPENDENT_NAME_COMPARE(a, b);
}

export function fileExtension(relativePath: string): string {
  const base = path.posix.basename(relativePath);
  const dot = base.lastIndexOf(".");
  if (dot <= 0) {
    return "";
  }
  return base.slice(dot);
}
