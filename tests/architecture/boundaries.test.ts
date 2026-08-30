import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const workspaceDir = fileURLToPath(new URL("../../src/workspace", import.meta.url));
const domainDir = fileURLToPath(new URL("../../src/domain", import.meta.url));

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
});
