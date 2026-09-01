import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ResolvedProjectConfig } from "../../src/config/types.js";
import type { WorkspaceBoundary } from "../../src/domain/workspace.js";
import { inventory } from "../../src/inventory/index.js";
import type { RepositoryEntry } from "../../src/inventory/types.js";
import {
  boundaryFor,
  resolvedConfigAt,
  writeRelative,
} from "../inventory/fixture-helpers.js";

export function sha256Hex(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function earnAdmittedFile(
  root: string,
  relativePath: string,
  content: string | Buffer = "hello\n",
): Promise<{
  readonly entry: RepositoryEntry;
  readonly workspace: WorkspaceBoundary;
  readonly config: ResolvedProjectConfig;
}> {
  if (typeof content === "string") {
    await writeRelative(root, relativePath, content);
  } else {
    const absolute = path.join(root, relativePath);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, content);
  }
  const workspace = await boundaryFor(root);
  const config = await resolvedConfigAt(root);
  const inv = await inventory(workspace, config);
  if (!inv.ok) {
    throw new Error(`inventory failed: ${inv.error.code}`);
  }
  const observation = inv.value.observations.find(
    (item) =>
      item.relativePath === relativePath && item.disposition === "ADMITTED",
  );
  if (observation?.disposition !== "ADMITTED") {
    throw new Error(`missing admitted entry ${relativePath}`);
  }
  return { entry: observation.entry, workspace, config };
}

export async function earnAdmittedDirectory(
  root: string,
  relativePath: string,
): Promise<{
  readonly entry: RepositoryEntry;
  readonly workspace: WorkspaceBoundary;
  readonly config: ResolvedProjectConfig;
}> {
  const absolute = path.join(root, relativePath);
  await mkdir(absolute, { recursive: true });
  const workspace = await boundaryFor(root);
  const config = await resolvedConfigAt(root);
  const inv = await inventory(workspace, config);
  if (!inv.ok) {
    throw new Error(`inventory failed: ${inv.error.code}`);
  }
  const observation = inv.value.observations.find((item) => {
    if (item.disposition !== "ADMITTED" && item.disposition !== "DESCENDED") {
      return false;
    }
    return (
      item.relativePath === relativePath && item.entry.physicalKind === "DIRECTORY"
    );
  });
  if (
    observation?.disposition !== "ADMITTED" &&
    observation?.disposition !== "DESCENDED"
  ) {
    throw new Error(`missing admitted directory ${relativePath}`);
  }
  return { entry: observation.entry, workspace, config };
}
