import { readdirSync, readFileSync, statSync } from "node:fs";
import { chmod, mkdir, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { failure } from "../../src/domain/result.js";
import type { WorkspaceBoundary } from "../../src/domain/workspace.js";
import { inventory } from "../../src/inventory/index.js";
import {
  MAX_REPOSITORY_CONTENT_BYTES,
  readRepositoryContent,
} from "../../src/reader/index.js";
import * as readerPublic from "../../src/reader/index.js";
import { workspacePathFailure } from "../../src/workspace/failure.js";
import {
  boundaryFor,
  cleanupInventoryFixtures,
  createCanonicalTempRoot,
  resolvedConfigAt,
  writeDenyConfig,
  writeRelative,
} from "../inventory/fixture-helpers.js";

afterEach(async () => {
  await cleanupInventoryFixtures();
});

async function earnFileEntry(
  root: string,
  relativePath: string,
  content: string,
) {
  await writeRelative(root, relativePath, content);
  const workspace = await boundaryFor(root);
  const config = await resolvedConfigAt(root);
  const inv = await inventory(workspace, config);
  expect(inv.ok).toBe(true);
  if (!inv.ok) {
    throw new Error("inventory failed");
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

describe("reader adversarial", () => {
  it("rejects raw-path style public helpers on the reader barrel", () => {
    for (const name of [
      "readPath",
      "readCanonicalPath",
      "readFileFromWorkspace",
      "readUnchecked",
      "brandContentObservation",
      "unsafeContentObservation",
      "asContentObservation",
      "fromBytesUnchecked",
      "makeContentObservation",
    ]) {
      expect(Object.prototype.hasOwnProperty.call(readerPublic, name)).toBe(
        false,
      );
    }
  });

  it("returns DENIED for a lexically denied file without ContentObservation or hash", async () => {
    const root = await createCanonicalTempRoot("pc-read-adv-deny-");
    const earned = await earnFileEntry(root, "secrets/key.txt", "SECRET");
    await writeDenyConfig(root, ["secrets"]);
    const denying = await resolvedConfigAt(root);

    const result = await readRepositoryContent(
      earned.entry,
      earned.workspace,
      denying,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("DENIED");
      expect(
        Object.prototype.hasOwnProperty.call(result.value, "observation"),
      ).toBe(false);
    }
  });

  it("returns DENIED for physical alias after visibility config changes", async () => {
    const root = await createCanonicalTempRoot("pc-read-adv-alias-");
    await mkdir(path.join(root, "secrets"));
    await writeRelative(root, "secrets/key.txt", "SECRET");
    await symlink(
      path.join(root, "secrets/key.txt"),
      path.join(root, "public-link"),
    );

    const workspace = await boundaryFor(root);
    const absent = await resolvedConfigAt(root);
    const inv = await inventory(workspace, absent);
    expect(inv.ok).toBe(true);
    if (!inv.ok) {
      return;
    }
    const linkObs = inv.value.observations.find(
      (item) =>
        item.relativePath === "public-link" && item.disposition === "ADMITTED",
    );
    expect(linkObs?.disposition).toBe("ADMITTED");
    if (linkObs?.disposition !== "ADMITTED") {
      return;
    }

    await writeDenyConfig(root, ["secrets"]);
    const denying = await resolvedConfigAt(root);
    const result = await readRepositoryContent(
      linkObs.entry,
      workspace,
      denying,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("DENIED");
    }
  });

  it("fails closed on unexpected denial-root resolution failure", async () => {
    const root = await createCanonicalTempRoot("pc-read-adv-rootfail-");
    const earned = await earnFileEntry(root, "ok.txt", "x");
    await writeDenyConfig(root, ["blocked"]);
    const denying = await resolvedConfigAt(root);

    const hostile: WorkspaceBoundary = {
      async canonicalize(inputPath) {
        if (inputPath === "blocked") {
          return failure(
            workspacePathFailure(
              "CANONICALIZATION_FAILED",
              "Simulated deny-root failure",
            ),
          );
        }
        return earned.workspace.canonicalize(inputPath);
      },
    };

    const result = await readRepositoryContent(earned.entry, hostile, denying);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("DENIAL_ROOT_RESOLUTION_FAILED");
    }
  });

  it("rejects widening maxBytes above the hard ceiling", async () => {
    const root = await createCanonicalTempRoot("pc-read-adv-widen-");
    const earned = await earnFileEntry(root, "f.txt", "x");
    const result = await readRepositoryContent(
      earned.entry,
      earned.workspace,
      earned.config,
      { maxBytes: MAX_REPOSITORY_CONTENT_BYTES + 1 },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_READER_OPTIONS");
    }
  });

  it("returns TOO_LARGE without ContentObservation for oversized content", async () => {
    const root = await createCanonicalTempRoot("pc-read-adv-large-");
    const earned = await earnFileEntry(root, "big.txt", "abcdefghij");
    const result = await readRepositoryContent(
      earned.entry,
      earned.workspace,
      earned.config,
      { maxBytes: 4 },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("TOO_LARGE");
      expect(
        Object.prototype.hasOwnProperty.call(result.value, "observation"),
      ).toBe(false);
    }
  });

  it("returns STALE_ENTRY after symlink target swap and outside swap", async () => {
    const root = await createCanonicalTempRoot("pc-read-adv-swap-");
    const outside = await createCanonicalTempRoot("pc-read-adv-swap-out-");
    await writeRelative(root, "a.txt", "A");
    await writeRelative(root, "b.txt", "B");
    await writeRelative(outside, "loot.txt", "OUT");
    await symlink(path.join(root, "a.txt"), path.join(root, "link"));

    const workspace = await boundaryFor(root);
    const config = await resolvedConfigAt(root);
    const inv = await inventory(workspace, config);
    expect(inv.ok).toBe(true);
    if (!inv.ok) {
      return;
    }
    const linkObs = inv.value.observations.find(
      (item) =>
        item.relativePath === "link" && item.disposition === "ADMITTED",
    );
    if (linkObs?.disposition !== "ADMITTED") {
      throw new Error("expected link");
    }

    await rm(path.join(root, "link"), { force: true });
    await symlink(path.join(root, "b.txt"), path.join(root, "link"));
    const insideSwap = await readRepositoryContent(
      linkObs.entry,
      workspace,
      config,
    );
    expect(insideSwap.ok && insideSwap.value.status === "STALE_ENTRY").toBe(
      true,
    );

    await rm(path.join(root, "link"), { force: true });
    await symlink(path.join(outside, "loot.txt"), path.join(root, "link"));
    const outsideSwap = await readRepositoryContent(
      linkObs.entry,
      workspace,
      config,
    );
    expect(outsideSwap.ok && outsideSwap.value.status === "STALE_ENTRY").toBe(
      true,
    );
  });

  it("returns UNREADABLE for permission-denied open without observation", async () => {
    if (process.getuid?.() === 0) {
      return;
    }
    const root = await createCanonicalTempRoot("pc-read-adv-perm-");
    const earned = await earnFileEntry(root, "locked.txt", "x");
    await chmod(path.join(root, "locked.txt"), 0o000);
    const result = await readRepositoryContent(
      earned.entry,
      earned.workspace,
      earned.config,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("UNREADABLE");
    }
    await chmod(path.join(root, "locked.txt"), 0o644);
  });
});

describe("reader architecture", () => {
  const readerDir = fileURLToPath(new URL("../../src/reader", import.meta.url));
  const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

  const FORBIDDEN = [
    /import\s+.*loadProjectConfig|from\s+["'].*config\/loader/,
    /from\s+["'].*workspace\/canonical-path/,
    /brandCanonicalPath/,
    /from\s+["'](?:\.\.\/)+git\//,
    /from\s+["'](?:\.\.\/)+cli\//,
    /\bwriteFile\b/,
    /\bappendFile\b/,
    /\bcreateWriteStream\b/,
    /ModelProvider/,
    /Gemini|OpenAI|Anthropic/,
  ];

  function listTsFiles(dir: string): string[] {
    return readdirSync(dir)
      .filter((name) => name.endsWith(".ts"))
      .map((name) => join(dir, name));
  }

  it("keeps src/reader free of forbidden capability imports and writes", () => {
    expect(statSync(readerDir).isDirectory()).toBe(true);
    const violations: string[] = [];
    for (const filePath of listTsFiles(readerDir)) {
      const source = readFileSync(filePath, "utf8");
      for (const pattern of FORBIDDEN) {
        if (pattern.test(source)) {
          violations.push(`${filePath} matched ${pattern}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("applies ContentObservation branding only inside read.ts", () => {
    const sites: string[] = [];
    for (const filePath of listTsFiles(readerDir)) {
      const source = readFileSync(filePath, "utf8");
      if (/as ContentObservation/.test(source)) {
        sites.push(filePath);
      }
    }
    expect(sites).toEqual([join(readerDir, "read.ts")]);
  });

  it("does not export ContentObservation constructors from compiled dist", async () => {
    const root = await import(join(repoRoot, "dist/index.js"));
    const reader = await import(join(repoRoot, "dist/reader/index.js"));
    const readMod = await import(join(repoRoot, "dist/reader/read.js"));

    expect(
      Object.prototype.hasOwnProperty.call(root, "readRepositoryContent"),
    ).toBe(false);
    expect(typeof reader.readRepositoryContent).toBe("function");
    for (const name of [
      "brandContentObservation",
      "unsafeContentObservation",
      "asContentObservation",
      "contentObservation",
      "fromBytesUnchecked",
    ]) {
      expect(Object.prototype.hasOwnProperty.call(reader, name)).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(readMod, name)).toBe(false);
    }
  });
});
