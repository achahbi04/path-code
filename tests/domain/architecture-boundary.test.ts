import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const domainDir = fileURLToPath(new URL("../../src/domain", import.meta.url));

const FORBIDDEN_IMPORT_PATTERNS = [
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

function listDomainSourceFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => join(dir, name));
}

describe("domain architecture boundary", () => {
  it("keeps src/domain free of forbidden implementation-layer imports", () => {
    const files = listDomainSourceFiles(domainDir);
    expect(files.length).toBeGreaterThan(0);

    const violations: string[] = [];

    for (const filePath of files) {
      const source = readFileSync(filePath, "utf8");
      for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
        if (pattern.test(source)) {
          violations.push(`${filePath} matched ${pattern}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
