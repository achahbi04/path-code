import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import * as configPublic from "../../src/config/index.js";
import * as inventoryPublic from "../../src/inventory/index.js";
import { DEFAULT_SYSTEM_PRUNED_DIRECTORIES } from "../../src/inventory/index.js";

const inventoryDir = fileURLToPath(new URL("../../src/inventory", import.meta.url));
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

const INVENTORY_FORBIDDEN = [
  /from\s+["'].*config\/loader/,
  /loadProjectConfig/,
  /from\s+["'].*workspace\/canonical-path/,
  /brandCanonicalPath/,
  /\breadFile\b/,
];

const REPOSITORY_CONSTRUCTOR_NAMES = [
  "brandRepositoryEntry",
  "unsafeRepositoryEntry",
  "asRepositoryEntry",
  "castRepositoryEntry",
  "brandRepositoryInventory",
  "unsafeRepositoryInventory",
  "asRepositoryInventory",
  "castRepositoryInventory",
  "repositoryEntry",
  "repositoryInventory",
] as const;

const RESOLVED_CONSTRUCTOR_NAMES = [
  "brandResolvedProjectConfig",
  "unsafeResolvedProjectConfig",
  "asResolvedProjectConfig",
  "castResolvedProjectConfig",
  "fromProjectConfig",
  "resolveProjectConfigUnsafe",
  "markConfigResolved",
  "resolvedAfterSuccessfulLoad",
] as const;

function listTsFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => join(dir, name));
}

function assertNoRepositoryConstructors(mod: object, label: string): void {
  for (const name of REPOSITORY_CONSTRUCTOR_NAMES) {
    expect(
      Object.prototype.hasOwnProperty.call(mod, name),
      `${label} must not export ${name}`,
    ).toBe(false);
  }
}

function assertNoResolvedConstructors(mod: object, label: string): void {
  for (const name of RESOLVED_CONSTRUCTOR_NAMES) {
    expect(
      Object.prototype.hasOwnProperty.call(mod, name),
      `${label} must not export ${name}`,
    ).toBe(false);
  }
}

describe("inventory architecture", () => {
  it("keeps src/inventory free of config loading, deep brand imports, and readFile", () => {
    expect(statSync(inventoryDir).isDirectory()).toBe(true);
    const files = listTsFiles(inventoryDir);
    expect(files.length).toBeGreaterThan(0);

    const violations: string[] = [];
    for (const filePath of files) {
      const source = readFileSync(filePath, "utf8");
      for (const pattern of INVENTORY_FORBIDDEN) {
        if (pattern.test(source)) {
          violations.push(`${filePath} matched ${pattern}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("does not export repository brand constructor helpers from the public inventory barrel", () => {
    assertNoRepositoryConstructors(inventoryPublic, "inventory public barrel");
    expect(typeof inventoryPublic.inventory).toBe("function");
  });

  it("does not export resolved-config brand helpers from the public config barrel", () => {
    assertNoResolvedConstructors(configPublic, "config public barrel");
  });

  it("applies RepositoryEntry and RepositoryInventory branding only inside traverse.ts", () => {
    const files = listTsFiles(inventoryDir);
    const brandingSites: string[] = [];

    for (const filePath of files) {
      const source = readFileSync(filePath, "utf8");
      if (/as RepositoryEntry/.test(source) || /as RepositoryInventory/.test(source)) {
        brandingSites.push(filePath);
      }
    }

    expect(brandingSites).toEqual([join(inventoryDir, "traverse.ts")]);
  });

  it("defines DEFAULT_SYSTEM_PRUNED_DIRECTORIES as exactly [\".git\"]", () => {
    expect(DEFAULT_SYSTEM_PRUNED_DIRECTORIES).toEqual([".git"]);
    expect([...DEFAULT_SYSTEM_PRUNED_DIRECTORIES]).toEqual([".git"]);
  });

  it("does not export repository brand constructor helpers from compiled dist modules", async () => {
    const inventory = await import(join(repoRoot, "dist/inventory/index.js"));
    const traverse = await import(join(repoRoot, "dist/inventory/traverse.js"));
    const types = await import(join(repoRoot, "dist/inventory/types.js"));
    const config = await import(join(repoRoot, "dist/config/index.js"));

    assertNoRepositoryConstructors(inventory, "dist inventory barrel");
    assertNoRepositoryConstructors(traverse, "dist inventory traverse");
    assertNoRepositoryConstructors(types, "dist inventory types");
    assertNoResolvedConstructors(config, "dist config barrel");
  });
});
