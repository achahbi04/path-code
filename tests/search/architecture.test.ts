import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import * as searchPublic from "../../src/search/index.js";

const searchDir = fileURLToPath(new URL("../../src/search", import.meta.url));
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

const SEARCH_FORBIDDEN = [
  /readRepositoryContent/,
  /from\s+["'].*reader\/read/,
  /from\s+["']node:fs["']/,
  /from\s+["']node:fs\/promises["']/,
  /\breadFile\b/,
  /\breaddir\b/,
  /\bstat\s*\(/,
  /\blstat\s*\(/,
  /from\s+["']node:child_process["']/,
  /runGit/,
  /collectGitStateBaseline/,
  /ModelProvider/,
  /from\s+["'].*config\/loader/,
  /loadProjectConfig/,
  /brandRepositoryEntry/,
  /brandRepositoryInventory/,
  /new RegExp\s*\(/,
];

const UNSAFE_EXPORT_NAMES = [
  "brandRepositorySearchCorpus",
  "unsafeRepositorySearchCorpus",
  "brandRepositoryCandidate",
  "unsafeRepositoryCandidate",
  "brandRepositorySearchResult",
  "unsafeRepositorySearchResult",
] as const;

function listTsFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => join(dir, name));
}

describe("search architecture", () => {
  it("keeps src/search free of reader, fs, Git, and model imports", () => {
    expect(statSync(searchDir).isDirectory()).toBe(true);
    const violations: string[] = [];
    for (const filePath of listTsFiles(searchDir)) {
      const source = readFileSync(filePath, "utf8");
      for (const pattern of SEARCH_FORBIDDEN) {
        if (pattern.test(source)) {
          violations.push(`${filePath} matched ${pattern}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("does not export unsafe corpus/candidate/result branding helpers", () => {
    for (const name of UNSAFE_EXPORT_NAMES) {
      expect(Object.prototype.hasOwnProperty.call(searchPublic, name)).toBe(false);
    }
  });

  it("does not rank using ContentObservation text inspection APIs", () => {
    const engineSource = readFileSync(join(searchDir, "engine.ts"), "utf8");
    const scoreSource = readFileSync(join(searchDir, "score.ts"), "utf8");
    expect(engineSource).not.toContain("ContentObservation");
    expect(scoreSource).not.toContain("ContentObservation");
    expect(engineSource).not.toContain(".text");
  });

  it("does not export unsafe helpers from compiled dist search barrel", async () => {
    const distSearch = await import(join(repoRoot, "dist/search/index.js"));
    for (const name of UNSAFE_EXPORT_NAMES) {
      expect(Object.prototype.hasOwnProperty.call(distSearch, name)).toBe(false);
    }
  });
});

describe("search import side effects", () => {
  it("imports search modules without filesystem or process side effects", async () => {
    const envSnapshot = { ...process.env };
    const cwdSnapshot = process.cwd();
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      const search = await import("../../src/search/index.js");
      expect(typeof search.searchRepository).toBe("function");
      expect(process.cwd()).toBe(cwdSnapshot);
      expect(process.env).toEqual(envSnapshot);
      expect(consoleLog).not.toHaveBeenCalled();
    } finally {
      consoleLog.mockRestore();
    }
  });
});
