import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const editingDir = fileURLToPath(new URL("../../src/editing", import.meta.url));
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

const WRITE_FORBIDDEN = [
  /\bwriteFile\b/,
  /\bwriteFileSync\b/,
  /\bappendFile\b/,
  /\bappendFileSync\b/,
  /\brename\b/,
  /\brenameSync\b/,
  /\bunlink\b/,
  /\bunlinkSync\b/,
  /\brm\b/,
  /\brmSync\b/,
  /\bmkdir\b/,
  /\bmkdirSync\b/,
  /\bcreateWriteStream\b/,
  /\btruncate\b/,
  /\btruncateSync\b/,
  /\bcopyFile\b/,
  /\bcopyFileSync\b/,
  /\blink\b/,
  /\blinkSync\b/,
  /\bsymlink\b/,
  /\bsymlinkSync\b/,
];

const OTHER_FORBIDDEN = [
  /from\s+["']node:child_process["']/,
  /from\s+["']node:net["']/,
  /from\s+["']node:http["']/,
  /from\s+["']node:https["']/,
  /ModelProvider/,
  /collectGitStateBaseline/,
  /from\s+["'].*\/git\/runner/,
];

function listTsFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const name of entries) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      files.push(...listTsFiles(full));
    } else if (name.endsWith(".ts")) {
      files.push(full);
    }
  }
  return files;
}

describe("editing architecture", () => {
  it("contains no project-write primitives under src/editing/**", () => {
    const violations: string[] = [];
    for (const filePath of listTsFiles(editingDir)) {
      const source = readFileSync(filePath, "utf8");
      for (const pattern of WRITE_FORBIDDEN) {
        if (pattern.test(source)) {
          violations.push(`${filePath} matched ${pattern}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("contains no child_process, network, model, or Git mutation imports", () => {
    const violations: string[] = [];
    for (const filePath of listTsFiles(editingDir)) {
      const source = readFileSync(filePath, "utf8");
      for (const pattern of OTHER_FORBIDDEN) {
        if (pattern.test(source)) {
          violations.push(`${filePath} matched ${pattern}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("does not export internal consumption registry from the public barrel", () => {
    const barrel = readFileSync(join(editingDir, "index.ts"), "utf8");
    expect(barrel).not.toMatch(/consumeEditAuthorization/);
    expect(barrel).not.toMatch(/registerAuthorization/);
    expect(barrel).not.toMatch(/resetAuthorizationRegistryForTests/);
  });

  it("keeps lower Phase 1/2 modules free of editing imports", () => {
    const lowerDirs = [
      "src/domain",
      "src/workspace",
      "src/config",
      "src/inventory",
      "src/reader",
      "src/git",
      "src/snapshot",
      "src/metadata",
      "src/search",
    ];
    const violations: string[] = [];
    for (const relative of lowerDirs) {
      const dir = join(repoRoot, relative);
      for (const filePath of listTsFiles(dir)) {
        const source = readFileSync(filePath, "utf8");
        if (/from\s+["'].*\/editing\//.test(source)) {
          violations.push(filePath);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("keeps selfobs runtime free of editing imports", () => {
    const selfobsDir = join(repoRoot, "src/selfobs");
    const violations: string[] = [];
    for (const filePath of listTsFiles(selfobsDir)) {
      const source = readFileSync(filePath, "utf8");
      if (/from\s+["'].*\/editing\//.test(source)) {
        violations.push(filePath);
      }
    }
    expect(violations).toEqual([]);
  });
});
