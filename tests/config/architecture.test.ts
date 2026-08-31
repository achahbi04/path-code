import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import * as configPublic from "../../src/config/index.js";

const configDir = fileURLToPath(new URL("../../src/config", import.meta.url));
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

const CONFIG_FORBIDDEN = [
  /from\s+["'].*workspace\/canonical-path/,
  /brandCanonicalPath/,
  /from\s+["'](?:\.\.\/)+git\//,
  /from\s+["']node:child_process["']/,
  /from\s+["']node:net["']/,
  /from\s+["']node:http["']/,
  /from\s+["']node:https["']/,
  /shell:\s*true/,
];

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

function assertNoResolvedConstructors(mod: object, label: string): void {
  for (const name of RESOLVED_CONSTRUCTOR_NAMES) {
    expect(
      Object.prototype.hasOwnProperty.call(mod, name),
      `${label} must not export ${name}`,
    ).toBe(false);
  }
}

describe("config architecture", () => {
  it("keeps src/config free of forbidden capability imports and brand bypass", () => {
    expect(statSync(configDir).isDirectory()).toBe(true);
    const files = listTsFiles(configDir);
    expect(files.length).toBeGreaterThan(0);

    const violations: string[] = [];
    for (const filePath of files) {
      const source = readFileSync(filePath, "utf8");
      for (const pattern of CONFIG_FORBIDDEN) {
        if (pattern.test(source)) {
          violations.push(`${filePath} matched ${pattern}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("does not export a general file-read helper or parser", () => {
    expect(Object.prototype.hasOwnProperty.call(configPublic, "readBoundedConfigFile")).toBe(
      false,
    );
    expect(Object.prototype.hasOwnProperty.call(configPublic, "parseProjectConfigContent")).toBe(
      false,
    );
    expect(Object.prototype.hasOwnProperty.call(configPublic, "configEntryExists")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(configPublic, "PATHCODE_FILENAME")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(configPublic, "MAX_CONFIG_BYTES")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(configPublic, "configFailure")).toBe(false);
  });

  it("does not expose loadProjectConfig with a caller-supplied filename/path parameter", () => {
    expect(configPublic.loadProjectConfig.length).toBe(1);
  });

  it("does not export defaultProjectConfig from the public config barrel", () => {
    expect(Object.prototype.hasOwnProperty.call(configPublic, "defaultProjectConfig")).toBe(
      false,
    );
  });

  it("does not export resolved-config constructor helpers from the public config barrel", () => {
    assertNoResolvedConstructors(configPublic, "config public barrel");
  });

  it("applies ResolvedProjectConfig branding only inside loader.ts", () => {
    const files = listTsFiles(configDir);
    const brandingSites: string[] = [];

    for (const filePath of files) {
      const source = readFileSync(filePath, "utf8");
      if (/as ResolvedProjectConfig/.test(source)) {
        brandingSites.push(filePath);
      }
    }

    expect(brandingSites).toEqual([join(configDir, "loader.ts")]);
  });

  it("does not export resolved-config constructors from compiled dist modules", async () => {
    const root = await import(join(repoRoot, "dist/index.js"));
    const config = await import(join(repoRoot, "dist/config/index.js"));
    const loader = await import(join(repoRoot, "dist/config/loader.js"));
    const types = await import(join(repoRoot, "dist/config/types.js"));

    assertNoResolvedConstructors(root, "dist package root");
    assertNoResolvedConstructors(config, "dist config barrel");
    assertNoResolvedConstructors(loader, "dist config loader");
    expect(Object.prototype.hasOwnProperty.call(root, "defaultProjectConfig")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(config, "defaultProjectConfig")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(types, "defaultProjectConfig")).toBe(true);
  });
});
