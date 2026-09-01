import { readFileSync, statSync } from "node:fs";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const snapshotDir = fileURLToPath(new URL("../../src/snapshot", import.meta.url));

const SNAPSHOT_FORBIDDEN = [
  /from\s+["'].*config\/loader/,
  /loadProjectConfig/,
  /from\s+["']node:child_process["']/,
  /from\s+["']node:fs["']/,
  /\bwriteFile\b/,
  /\bappendFile\b/,
  /\bcreateWriteStream\b/,
  /\breaddir\b/,
  /runGit/,
  /collectGitStateBaseline/,
  /from\s+["'].*inventory\/traverse/,
  /createHash/,
];

const SNAPSHOT_INDEX_FORBIDDEN = [
  /brandRepositorySnapshot/,
  /unsafeRepositorySnapshot/,
  /asRepositorySnapshot/,
  /brandVerifiedCurrent/,
  /makeCurrentIdentity/,
  /unsafeFreshnessAssessment/,
];

function listTsFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => join(dir, name));
}

describe("snapshot architecture", () => {
  it("imports no forbidden write, traversal, git execution, or second hash paths", () => {
    expect(statSync(snapshotDir).isDirectory()).toBe(true);
    const violations: string[] = [];
    for (const filePath of listTsFiles(snapshotDir)) {
      const source = readFileSync(filePath, "utf8");
      for (const pattern of SNAPSHOT_FORBIDDEN) {
        if (pattern.test(source)) {
          violations.push(`${filePath} matched ${pattern}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("does not export snapshot or verification branding bypass helpers", () => {
    const source = readFileSync(join(snapshotDir, "index.ts"), "utf8");
    const violations: string[] = [];
    for (const pattern of SNAPSHOT_INDEX_FORBIDDEN) {
      if (pattern.test(source)) {
        violations.push(`index.ts matched ${pattern}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("allows only stat/lstat from node:fs/promises for entry verification", () => {
    const allowed = new Set(["entry-verify.ts", "content-verify.ts"]);
    for (const filePath of listTsFiles(snapshotDir)) {
      const base = filePath.split("/").pop()!;
      const source = readFileSync(filePath, "utf8");
      if (source.includes('from "node:fs/promises"') || source.includes("from 'node:fs/promises'")) {
        expect(allowed.has(base)).toBe(true);
      }
    }
  });
});
