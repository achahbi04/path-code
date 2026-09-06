/**
 * Phase 2G — mechanical architecture audit for Repository Intelligence modules.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

const PHASE2_DIRS = [
  "src/inventory",
  "src/reader",
  "src/git",
  "src/metadata",
  "src/search",
  "src/snapshot",
] as const;

const MODEL_FORBIDDEN = [
  /ModelProvider/,
  /ModelRequest/,
  /ModelResponse/,
  /OpenAI/,
  /Anthropic/,
  /Gemini/,
  /embedding/,
  /rerank/i,
  /prompt/i,
];

const WRITE_FORBIDDEN = [
  /\bwriteFile\b/,
  /\bappendFile\b/,
  /\bcreateWriteStream\b/,
  /\bunlink\b/,
  /\brm\b/,
  /\bmkdir\b/,
];

const PROCESS_FORBIDDEN = [
  /\bspawn\b/,
  /\bspawnSync\b/,
  /\bexec\b/,
  /\bfork\b/,
  /shell:\s*true/,
  /CommandRunner/,
  /ProcessService/,
  /ShellExecutor/,
  /ExecutionEngine/,
];

const GENERIC_FRAMEWORK_FORBIDDEN = [
  /DependencyGraph/,
  /Subscriber/,
  /ObserverRuntime/,
  /invalidate\(/,
  /reactive/i,
];

function listTsFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => join(dir, name));
}

function listJsFiles(dir: string): string[] {
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) {
    return [];
  }
  return readdirSync(dir)
    .filter((name) => name.endsWith(".js"))
    .map((name) => join(dir, name));
}

function scanForPatterns(
  files: string[],
  patterns: RegExp[],
): string[] {
  const violations: string[] = [];
  for (const filePath of files) {
    const source = readFileSync(filePath, "utf8");
    for (const pattern of patterns) {
      if (pattern.test(source)) {
        violations.push(`${filePath} matched ${pattern}`);
      }
    }
  }
  return violations;
}

describe("Phase 2G architecture audit — source", () => {
  for (const relativeDir of PHASE2_DIRS) {
    const absDir = join(repoRoot, relativeDir);
    it(`${relativeDir} has no model/provider execution dependency`, () => {
      expect(scanForPatterns(listTsFiles(absDir), MODEL_FORBIDDEN)).toEqual([]);
    });

    it(`${relativeDir} has no repository write/create APIs`, () => {
      const violations = scanForPatterns(listTsFiles(absDir), WRITE_FORBIDDEN);
      expect(violations).toEqual([]);
    });
  }

  it("git runner remains execFile-only without spawn/shell", () => {
    const gitDir = join(repoRoot, "src/git");
    const runner = readFileSync(join(gitDir, "runner.ts"), "utf8");
    expect(runner).toMatch(/execFile/);
    expect(scanForPatterns([join(gitDir, "runner.ts")], PROCESS_FORBIDDEN)).toEqual([]);
    expect(runner).not.toMatch(/\bspawn\b/);
  });

  it("snapshot module has no generic dependency graph or subscriber runtime", () => {
    const snapshotDir = join(repoRoot, "src/snapshot");
    expect(scanForPatterns(listTsFiles(snapshotDir), GENERIC_FRAMEWORK_FORBIDDEN)).toEqual([]);
  });

  it("search module performs no reader or filesystem access", () => {
    const actualSearchDir = join(repoRoot, "src/search");
    const source = listTsFiles(actualSearchDir)
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    expect(source).not.toMatch(/readRepositoryContent/);
    expect(source).not.toMatch(/from\s+["']node:fs/);
  });
});

describe("Phase 2G architecture audit — dist", () => {
  for (const relativeDir of PHASE2_DIRS) {
    const distDir = join(repoRoot, "dist", relativeDir.replace("src/", ""));
    it(`dist/${relativeDir.replace("src/", "")} has no model/provider dependency`, () => {
      expect(scanForPatterns(listJsFiles(distDir), MODEL_FORBIDDEN)).toEqual([]);
    });
  }

  it("dist git runner remains execFile-only", async () => {
    const runnerPath = join(repoRoot, "dist/git/runner.js");
    const source = readFileSync(runnerPath, "utf8");
    expect(source).toMatch(/execFile/);
    expect(source).not.toMatch(/\bspawn\b/);
    expect(source).not.toMatch(/shell:\s*true/);
  });
});

describe("Phase 2G architecture audit — package surface", () => {
  it("package root does not export Phase 2 execution capabilities", () => {
    const rootSource = readFileSync(join(repoRoot, "src/index.ts"), "utf8");
    expect(rootSource).not.toMatch(/inventory\(/);
    expect(rootSource).not.toMatch(/readRepositoryContent/);
    expect(rootSource).not.toMatch(/collectGitStateBaseline/);
    expect(rootSource).not.toMatch(/buildRepositoryMap/);
    expect(rootSource).not.toMatch(/searchRepository/);
    expect(rootSource).not.toMatch(/verifyRepositorySnapshot/);
  });

  it("Phase 4 execution/validation may exist; model modules remain absent; editing contracts exist", () => {
    expect(statSync(join(repoRoot, "src/editing"), { throwIfNoEntry: false })).toBeDefined();
    expect(statSync(join(repoRoot, "src/execution"), { throwIfNoEntry: false })).toBeDefined();
    expect(statSync(join(repoRoot, "src/validation"), { throwIfNoEntry: false })).toBeDefined();
    expect(statSync(join(repoRoot, "src/run-evidence"), { throwIfNoEntry: false })).toBeDefined();
    expect(statSync(join(repoRoot, "src/engineering-run"), { throwIfNoEntry: false })).toBeDefined();
    expect(statSync(join(repoRoot, "src/model"), { throwIfNoEntry: false })).toBeUndefined();
    const rootSource = readFileSync(join(repoRoot, "src/index.ts"), "utf8");
    expect(rootSource).not.toMatch(/prepareLocalProcess/);
    expect(rootSource).not.toMatch(/explicitLocalProcessApproval/);
    expect(rootSource).not.toMatch(/executeAuthorizedLocalProcess/);
    expect(rootSource).not.toMatch(/prepareValidationPlan/);
    expect(rootSource).not.toMatch(/executeValidationPlan/);
    expect(rootSource).not.toMatch(/buildRunEvidence/);
    expect(rootSource).not.toMatch(/executeEngineeringRun/);
  });
});
