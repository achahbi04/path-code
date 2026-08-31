import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import * as metadataPublic from "../../src/metadata/index.js";

const metadataDir = fileURLToPath(new URL("../../src/metadata", import.meta.url));
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

const METADATA_FORBIDDEN = [
  /from\s+["'].*config\/loader/,
  /loadProjectConfig/,
  /from\s+["'].*workspace\/canonical-path/,
  /brandCanonicalPath/,
  /from\s+["']node:fs["']/,
  /from\s+["']node:fs\/promises["']/,
  /\breadFile\b/,
  /\breaddir\b/,
  /\bstat\s*\(/,
  /\blstat\s*\(/,
  /from\s+["']node:child_process["']/,
  /ModelProvider/,
  /from\s+["'](?:\.\.\/)+cli\//,
];

const MAP_CONSTRUCTOR_NAMES = [
  "brandRepositoryMap",
  "unsafeRepositoryMap",
  "asRepositoryMap",
  "castRepositoryMap",
  "brandManifestEvidence",
  "unsafeManifestEvidence",
] as const;

function listTsFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => join(dir, name));
}

describe("metadata architecture", () => {
  it("keeps src/metadata free of direct fs reads and forbidden imports", () => {
    expect(statSync(metadataDir).isDirectory()).toBe(true);
    const violations: string[] = [];
    for (const filePath of listTsFiles(metadataDir)) {
      const source = readFileSync(filePath, "utf8");
      for (const pattern of METADATA_FORBIDDEN) {
        if (pattern.test(source)) {
          violations.push(`${filePath} matched ${pattern}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("does not export map or evidence branding helpers", () => {
    for (const name of MAP_CONSTRUCTOR_NAMES) {
      expect(Object.prototype.hasOwnProperty.call(metadataPublic, name)).toBe(false);
    }
  });

  it("routes manifest observation through readRepositoryContent", () => {
    const observeSource = readFileSync(join(metadataDir, "observe.ts"), "utf8");
    expect(observeSource).toContain("readRepositoryContent");
    expect(observeSource).not.toMatch(/\breadFile\b/);
  });

  it("does not export branding helpers from compiled dist metadata barrel", async () => {
    const distMetadata = await import(join(repoRoot, "dist/metadata/index.js"));
    for (const name of MAP_CONSTRUCTOR_NAMES) {
      expect(Object.prototype.hasOwnProperty.call(distMetadata, name)).toBe(false);
    }
  });
});

describe("metadata import side effects", () => {
  it("imports metadata modules without filesystem or process side effects", async () => {
    const envSnapshot = { ...process.env };
    const cwdSnapshot = process.cwd();
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      const metadata = await import("../../src/metadata/index.js");
      expect(typeof metadata.buildRepositoryMap).toBe("function");
      expect(process.cwd()).toBe(cwdSnapshot);
      expect(process.env).toEqual(envSnapshot);
      expect(consoleLog).not.toHaveBeenCalled();
    } finally {
      consoleLog.mockRestore();
    }
  });
});
