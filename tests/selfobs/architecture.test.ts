import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const selfobsDir = fileURLToPath(new URL("../../src/selfobs", import.meta.url));
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

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

describe("selfobs architecture", () => {
  it("keeps src/selfobs free of fs, child_process, and capability imports", () => {
    const forbidden = [
      /from\s+["']node:fs["']/,
      /from\s+["']node:child_process["']/,
      /from\s+["']\.\.\/inventory\//,
      /from\s+["']\.\.\/reader\//,
      /from\s+["']\.\.\/git\//,
      /from\s+["']\.\.\/metadata\//,
      /from\s+["']\.\.\/search\//,
      /from\s+["']\.\.\/snapshot\//,
    ];
    const violations: string[] = [];
    for (const filePath of listTsFiles(selfobsDir)) {
      if (filePath.includes("/internal/")) {
        continue;
      }
      const source = readFileSync(filePath, "utf8");
      for (const pattern of forbidden) {
        if (pattern.test(source)) {
          violations.push(`${filePath} matched ${pattern}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("does not export the verification issuer from the public barrel", () => {
    const barrel = readFileSync(join(selfobsDir, "index.ts"), "utf8");
    expect(barrel).not.toMatch(/issueLedgerVerification/);
    expect(barrel).not.toMatch(/export\s*\{[^}]*issueLedgerVerification/);
    expect(barrel).toMatch(/export type \{ LedgerVerification \}/);
  });

  it("allows only verifier tooling to import the internal issuer", () => {
    const scriptsDir = join(repoRoot, "scripts");
    const scriptFiles = listTsFiles(scriptsDir);
    const issuerImports = scriptFiles.filter((filePath) =>
      readFileSync(filePath, "utf8").includes("internal/issue-verification"),
    );
    expect(issuerImports.length).toBeGreaterThan(0);
    for (const filePath of listTsFiles(selfobsDir)) {
      if (filePath.includes("/internal/issue-verification.ts")) {
        continue;
      }
      expect(readFileSync(filePath, "utf8")).not.toMatch(
        /internal\/issue-verification/,
      );
    }
  });
});
