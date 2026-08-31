import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const workspaceDir = fileURLToPath(new URL("../../src/workspace", import.meta.url));
const domainDir = fileURLToPath(new URL("../../src/domain", import.meta.url));
const gitDir = fileURLToPath(new URL("../../src/git", import.meta.url));
const configDir = fileURLToPath(new URL("../../src/config", import.meta.url));
const platformDir = fileURLToPath(new URL("../../src/platform", import.meta.url));
const cliDir = fileURLToPath(new URL("../../src/cli", import.meta.url));
const inventoryDir = fileURLToPath(new URL("../../src/inventory", import.meta.url));
const readerDir = fileURLToPath(new URL("../../src/reader", import.meta.url));

const READER_FORBIDDEN = [
  /import\s+.*loadProjectConfig|from\s+["'].*config\/loader/,
  /from\s+["'].*workspace\/canonical-path/,
  /brandCanonicalPath/,
  /from\s+["'](?:\.\.\/)+git\//,
  /from\s+["'](?:\.\.\/)+cli\//,
  /\bwriteFile\b/,
  /\bappendFile\b/,
  /\bcreateWriteStream\b/,
  /ModelProvider/,
];

const INVENTORY_FORBIDDEN = [
  /from\s+["'](?:\.\.\/)+config\/loader/,
  /loadProjectConfig/,
  /from\s+["'].*workspace\/canonical-path/,
  /brandCanonicalPath/,
  /from\s+["'](?:\.\.\/)+git\//,
  /from\s+["']node:child_process["']/,
  /readFile\s*\(/,
  /createReadStream/,
  /createHash/,
];

const DOMAIN_FORBIDDEN = [
  /from\s+["'](?:\.\.\/)+core\//,
  /from\s+["']node:fs["']/,
  /from\s+["']node:path["']/,
  /from\s+["']node:child_process["']/,
  /from\s+["']node:net["']/,
  /from\s+["']node:http["']/,
  /from\s+["']fs["']/,
  /from\s+["']path["']/,
  /from\s+["']child_process["']/,
];

const WORKSPACE_FORBIDDEN = [
  /from\s+["'](?:\.\.\/)+core\//,
  /from\s+["']node:child_process["']/,
  /from\s+["']node:net["']/,
  /from\s+["']node:http["']/,
  /from\s+["']node:https["']/,
  /from\s+["']child_process["']/,
];

const GIT_FORBIDDEN = [
  /from\s+["'].*workspace\/canonical-path/,
  /brandCanonicalPath/,
  /shell:\s*true/,
  /CommandRunner|ProcessService|ShellExecutor|ExecutionEngine/,
  /from\s+["']node:net["']/,
  /from\s+["']node:http["']/,
  /from\s+["']node:https["']/,
];

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

const PLATFORM_FORBIDDEN = [
  /from\s+["'](?:\.\.\/)+workspace\//,
  /from\s+["'](?:\.\.\/)+git\//,
  /from\s+["'](?:\.\.\/)+config\//,
  /from\s+["'](?:\.\.\/)+cli\//,
  /from\s+["']node:child_process["']/,
  /from\s+["']node:fs["']/,
  /from\s+["']node:net["']/,
];

const CLI_FORBIDDEN = [
  /from\s+["'](?:\.\.\/)+workspace\//,
  /from\s+["'](?:\.\.\/)+git\//,
  /from\s+["'](?:\.\.\/)+config\//,
  /createWorkspaceBoundary|discoverGitRepository|loadProjectConfig/,
  /from\s+["']node:child_process["']/,
  /from\s+["']node:net["']/,
  /CommandRunner|ProcessService|ShellExecutor|ExecutionEngine/,
];

function listTsFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => join(dir, name));
}

describe("architecture boundaries", () => {
  it("keeps src/domain free of forbidden implementation-layer imports", () => {
    const files = listTsFiles(domainDir);
    const violations: string[] = [];
    for (const filePath of files) {
      const source = readFileSync(filePath, "utf8");
      for (const pattern of DOMAIN_FORBIDDEN) {
        if (pattern.test(source)) {
          violations.push(`${filePath} matched ${pattern}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("keeps src/workspace free of forbidden capability-layer imports", () => {
    expect(statSync(workspaceDir).isDirectory()).toBe(true);
    const files = listTsFiles(workspaceDir);
    expect(files.length).toBeGreaterThan(0);

    const violations: string[] = [];
    for (const filePath of files) {
      const source = readFileSync(filePath, "utf8");
      for (const pattern of WORKSPACE_FORBIDDEN) {
        if (pattern.test(source)) {
          violations.push(`${filePath} matched ${pattern}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("keeps src/git free of brand bypass and forbidden capability imports", () => {
    expect(statSync(gitDir).isDirectory()).toBe(true);
    const files = listTsFiles(gitDir);
    expect(files.length).toBeGreaterThan(0);

    const violations: string[] = [];
    for (const filePath of files) {
      const source = readFileSync(filePath, "utf8");
      for (const pattern of GIT_FORBIDDEN) {
        if (pattern.test(source)) {
          violations.push(`${filePath} matched ${pattern}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("keeps src/config free of brand bypass and forbidden capability imports", () => {
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

  it("keeps src/platform free of capability and CLI imports", () => {
    expect(statSync(platformDir).isDirectory()).toBe(true);
    const files = listTsFiles(platformDir);
    expect(files.length).toBeGreaterThan(0);

    const violations: string[] = [];
    for (const filePath of files) {
      const source = readFileSync(filePath, "utf8");
      for (const pattern of PLATFORM_FORBIDDEN) {
        if (pattern.test(source)) {
          violations.push(`${filePath} matched ${pattern}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("keeps src/cli free of workspace/Git/config and generic process imports", () => {
    expect(statSync(cliDir).isDirectory()).toBe(true);
    const files = listTsFiles(cliDir);
    expect(files.length).toBeGreaterThan(0);

    const violations: string[] = [];
    for (const filePath of files) {
      const source = readFileSync(filePath, "utf8");
      for (const pattern of CLI_FORBIDDEN) {
        if (pattern.test(source)) {
          violations.push(`${filePath} matched ${pattern}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("keeps src/inventory free of forbidden capability imports and content reads", () => {
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

  it("keeps src/reader free of forbidden capability imports and write APIs", () => {
    expect(statSync(readerDir).isDirectory()).toBe(true);
    const files = listTsFiles(readerDir);
    expect(files.length).toBeGreaterThan(0);

    const violations: string[] = [];
    for (const filePath of files) {
      const source = readFileSync(filePath, "utf8");
      for (const pattern of READER_FORBIDDEN) {
        if (pattern.test(source)) {
          violations.push(`${filePath} matched ${pattern}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("keeps src/metadata free of direct fs content reads and forbidden imports", () => {
    const metadataDir = fileURLToPath(new URL("../../src/metadata", import.meta.url));
    expect(statSync(metadataDir).isDirectory()).toBe(true);
    const METADATA_FORBIDDEN = [
      /from\s+["'].*config\/loader/,
      /loadProjectConfig/,
      /from\s+["'].*workspace\/canonical-path/,
      /brandCanonicalPath/,
      /from\s+["']node:fs["']/,
      /from\s+["']node:fs\/promises["']/,
      /\breadFile\b/,
      /\breaddir\b/,
      /from\s+["']node:child_process["']/,
    ];
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
});
