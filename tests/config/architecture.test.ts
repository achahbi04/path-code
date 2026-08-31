import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import * as configPublic from "../../src/config/index.js";

const configDir = fileURLToPath(new URL("../../src/config", import.meta.url));

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

function listTsFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => join(dir, name));
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
});
