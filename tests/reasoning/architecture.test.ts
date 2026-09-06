/**
 * Phase 5A Reasoning Ledger architecture assertions.
 * Runtime tests for type-only production modules and dependency direction.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

const reasoningDir = fileURLToPath(
  new URL("../../src/reasoning", import.meta.url),
);
const srcDir = fileURLToPath(new URL("../../src", import.meta.url));
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const require = createRequire(import.meta.url);

function listTsFiles(dir: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      files.push(...listTsFiles(full));
    } else if (name.endsWith(".ts")) {
      files.push(full);
    }
  }
  return files;
}

function isTypeOnlyProductionSource(source: string, fileName: string): string[] {
  const violations: string[] = [];
  const sf = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TS,
  );

  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) {
      violations.push("function");
    }
    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
      violations.push("class");
    }
    if (ts.isEnumDeclaration(node)) {
      violations.push("enum");
    }
    if (ts.isVariableStatement(node)) {
      // Allow `declare const ...: unique symbol` opacity brands only.
      const isDeclare = node.modifiers?.some(
        (m) => m.kind === ts.SyntaxKind.DeclareKeyword,
      );
      if (!isDeclare) {
        violations.push("runtime-variable");
      }
    }
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      if (clause && !clause.isTypeOnly) {
        const named = clause.namedBindings;
        if (ts.isNamespaceImport(named as ts.NamespaceImport)) {
          violations.push("value-import-namespace");
        } else if (clause.name) {
          violations.push("value-import-default");
        } else if (named && ts.isNamedImports(named)) {
          const valueImports = named.elements.filter((el) => !el.isTypeOnly);
          if (valueImports.length > 0) {
            violations.push(
              `value-import:${valueImports.map((v) => v.name.text).join(",")}`,
            );
          }
        }
      }
    }
    if (ts.isExportAssignment(node)) {
      violations.push("export-assignment");
    }
    if (ts.isExportDeclaration(node) && !node.isTypeOnly && node.exportClause) {
      if (ts.isNamedExports(node.exportClause)) {
        const valueExports = node.exportClause.elements.filter(
          (el) => !el.isTypeOnly,
        );
        if (valueExports.length > 0) {
          violations.push(
            `value-export:${valueExports.map((v) => v.name.text).join(",")}`,
          );
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sf);
  return [...new Set(violations)];
}

describe("reasoning architecture", () => {
  it("A01: production reasoning modules are type declarations only", () => {
    const files = listTsFiles(reasoningDir);
    expect(files.length).toBeGreaterThan(0);
    const allViolations: string[] = [];
    for (const filePath of files) {
      const source = readFileSync(filePath, "utf8");
      const rel = relative(repoRoot, filePath);
      const violations = isTypeOnlyProductionSource(source, rel);
      for (const v of violations) {
        allViolations.push(`${rel}: ${v}`);
      }
      // No side-effectful Node I/O / process / registry patterns in source text.
      if (/from\s+["']node:/.test(source)) {
        allViolations.push(`${rel}: node-runtime-import`);
      }
      if (/\bWeakMap\b|\bwriteFile\b|\bspawn\b/.test(source)) {
        allViolations.push(`${rel}: runtime-primitive`);
      }
    }
    expect(allViolations).toEqual([]);
  });

  it("A02: emitted reasoning module has no runtime value exports; package surface unchanged", async () => {
    const pkg = JSON.parse(
      readFileSync(join(repoRoot, "package.json"), "utf8"),
    ) as { exports?: Record<string, unknown> };
    expect(Object.keys(pkg.exports ?? {})).toEqual(["."]);

    const distIndex = join(repoRoot, "dist/reasoning/index.js");
    const distTypes = join(repoRoot, "dist/reasoning/types.js");
    const indexMod = await import(distIndex);
    const typesMod = await import(distTypes);
    expect(Object.keys(indexMod)).toEqual([]);
    expect(Object.keys(typesMod)).toEqual([]);

    const indexSource = readFileSync(distIndex, "utf8");
    const typesSource = readFileSync(distTypes, "utf8");
    // Empty-module / compiler boilerplate only — no exported values.
    expect(indexSource).not.toMatch(/exports\.\w+\s*=/);
    expect(typesSource).not.toMatch(/exports\.\w+\s*=/);
    expect(indexSource).not.toMatch(/\bfunction\b|\bclass\b|\benum\b/);
    expect(typesSource).not.toMatch(/\bfunction\b|\bclass\b|\benum\b/);
  });

  it("A03: earlier production layers do not import reasoning", () => {
    const violations: string[] = [];
    for (const filePath of listTsFiles(srcDir)) {
      if (filePath.includes(`${join("src", "reasoning")}`)) {
        continue;
      }
      const source = readFileSync(filePath, "utf8");
      if (
        /from\s+["'][^"']*reasoning(\/|\.js|\.ts)?["']/.test(source) ||
        /from\s+["']\.\/reasoning/.test(source) ||
        /from\s+["']\.\.\/reasoning/.test(source)
      ) {
        violations.push(relative(repoRoot, filePath));
      }
    }
    expect(violations).toEqual([]);
  });

  it("imports without mutating host process state and exposes no runtime values", async () => {
    const envSnapshot = { ...process.env };
    const cwdSnapshot = process.cwd();
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      const mod = await import("../../src/reasoning/index.js");
      expect(Object.keys(mod)).toEqual([]);
      expect(process.cwd()).toBe(cwdSnapshot);
      expect(process.env).toEqual(envSnapshot);
      expect(consoleLog).not.toHaveBeenCalled();
    } finally {
      consoleLog.mockRestore();
    }
  });

  it("TypeScript package is available for syntax inspection", () => {
    // Anchors the installed parser dependency used by A01.
    expect(typeof require("typescript").createSourceFile).toBe("function");
  });
});
