/**
 * Phase 5B Reasoning Ledger architecture assertions.
 * Contract/type files remain types-only; runtime modules have an explicit allowlist.
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

/** Contract files that must remain types-only (A01). */
const TYPES_ONLY_FILES = new Set([
  "src/reasoning/types.ts",
]);

/** Runtime modules explicitly authorized by Phase 5B + Phase 5C Gate 2. */
const RUNTIME_MODULE_FILES = new Set([
  "src/reasoning/index.ts",
  "src/reasoning/bounds.ts",
  "src/reasoning/failures.ts",
  "src/reasoning/catalog.ts",
  "src/reasoning/parse.ts",
  "src/reasoning/bind.ts",
  "src/reasoning/applicability.ts",
  "src/reasoning/association.ts",
  "src/reasoning/internal/registry.ts",
  "src/reasoning/gate2/index.ts",
  "src/reasoning/gate2/bounds.ts",
  "src/reasoning/gate2/failures.ts",
  "src/reasoning/gate2/types.ts",
  "src/reasoning/gate2/registry.ts",
  "src/reasoning/gate2/association.ts",
  "src/reasoning/gate2/prepare.ts",
  "src/reasoning/gate2/evaluate.ts",
  "src/reasoning/gate2/applicability.ts",
]);

const ALLOWED_RUNTIME_VALUE_EXPORTS = new Set([
  "createReferenceCatalog",
  "describeReferenceCatalog",
  "disposeReferenceCatalog",
  "inspectLiveReferenceCatalogAssociation",
  "bindReasoningProposalJson",
  "checkReferenceBoundReasoningApplicability",
]);

const ALLOWED_GATE2_VALUE_EXPORTS = new Set([
  "prepareExecutionEvidencePlan",
  "evaluateExecutionEvidence",
  "checkExecutionEvidenceAssessmentApplicability",
]);

const ALLOWED_RUNTIME_IMPORT_PREFIXES = [
  "../config/",
  "../../config/",
  "../domain/",
  "../../domain/",
  "../inventory/",
  "../../inventory/",
  "../metadata/",
  "../../metadata/",
  "../reader/",
  "../../reader/",
  "../snapshot/",
  "../../snapshot/",
  "../validation/",
  "../../validation/",
  "../engineering-run/",
  "../../engineering-run/",
  "../run-evidence/",
  "../../run-evidence/",
  "../execution/",
  "../../execution/",
  "./",
  "node:crypto",
];

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

function inspectRuntimeModule(source: string, rel: string): string[] {
  const violations: string[] = [];
  const sf = ts.createSourceFile(
    rel,
    source,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TS,
  );

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      const spec = (node.moduleSpecifier as ts.StringLiteral).text;
      const clause = node.importClause;
      const isTypeOnly = clause?.isTypeOnly === true;
      if (!isTypeOnly) {
        const allowed = ALLOWED_RUNTIME_IMPORT_PREFIXES.some(
          (prefix) =>
            spec === prefix ||
            spec.startsWith(prefix) ||
            (prefix.endsWith("/") && spec.startsWith(prefix)),
        );
        // Also allow same-package relative imports under reasoning
        const reasoningLocal =
          spec.startsWith("./") ||
          spec.startsWith("../catalog") ||
          spec.startsWith("../bind") ||
          spec.startsWith("../parse") ||
          spec.startsWith("../failures") ||
          spec.startsWith("../bounds") ||
          spec.startsWith("../types") ||
          spec.startsWith("../applicability") ||
          spec.startsWith("../association") ||
          spec.startsWith("./internal/") ||
          spec.startsWith("../internal/");
        if (!allowed && !reasoningLocal) {
          violations.push(`disallowed-import:${spec}`);
        }
        if (
          /node:fs|node:child_process|node:net|node:http|child_process/.test(
            spec,
          )
        ) {
          violations.push(`forbidden-io-import:${spec}`);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  if (/\bwriteFile\b|\bspawn\b|\bexecFile\b/.test(source)) {
    violations.push("forbidden-io-primitive");
  }
  if (
    rel.startsWith("src/reasoning/gate2/") &&
    (/executeEngineeringRun\s*\(/.test(source) ||
      /executeValidationPlan\s*\(/.test(source) ||
      /explicitLocalProcessApproval\s*\(/.test(source) ||
      /prepareLocalProcess\s*\(/.test(source) ||
      /authorizeValidationPlan\s*\(/.test(source))
  ) {
    violations.push("gate2-forbidden-execution-or-approval-call");
  }
  return [...new Set(violations)];
}

describe("reasoning architecture", () => {
  it("A01: contract type files remain types-only; runtime modules are explicitly allowlisted", () => {
    const files = listTsFiles(reasoningDir);
    expect(files.length).toBeGreaterThan(0);
    const allViolations: string[] = [];
    const seenRel = new Set<string>();

    for (const filePath of files) {
      const source = readFileSync(filePath, "utf8");
      const rel = relative(repoRoot, filePath).split("\\").join("/");
      seenRel.add(rel);

      if (TYPES_ONLY_FILES.has(rel)) {
        const violations = isTypeOnlyProductionSource(source, rel);
        for (const v of violations) {
          allViolations.push(`${rel}: ${v}`);
        }
        if (/from\s+["']node:/.test(source)) {
          allViolations.push(`${rel}: node-runtime-import`);
        }
        if (/\bWeakMap\b|\bwriteFile\b|\bspawn\b/.test(source)) {
          allViolations.push(`${rel}: runtime-primitive`);
        }
        continue;
      }

      if (!RUNTIME_MODULE_FILES.has(rel)) {
        allViolations.push(`${rel}: unexpected-reasoning-module`);
        continue;
      }

      for (const v of inspectRuntimeModule(source, rel)) {
        allViolations.push(`${rel}: ${v}`);
      }
    }

    for (const expected of [...TYPES_ONLY_FILES, ...RUNTIME_MODULE_FILES]) {
      if (!seenRel.has(expected)) {
        allViolations.push(`${expected}: missing-expected-module`);
      }
    }

    expect(allViolations).toEqual([]);
  });

  it("A02: internal runtime exports are finite and explicit; package surface unchanged; types emit no values", async () => {
    const pkg = JSON.parse(
      readFileSync(join(repoRoot, "package.json"), "utf8"),
    ) as { exports?: Record<string, unknown> };
    expect(Object.keys(pkg.exports ?? {})).toEqual(["."]);

    const distIndex = join(repoRoot, "dist/reasoning/index.js");
    const distTypes = join(repoRoot, "dist/reasoning/types.js");
    const indexMod = await import(`${distIndex}?t=${Date.now()}`);
    const typesMod = await import(`${distTypes}?t=${Date.now()}`);
    expect(Object.keys(typesMod)).toEqual([]);

    const runtimeKeys = Object.keys(indexMod).sort();
    expect(runtimeKeys).toEqual([...ALLOWED_RUNTIME_VALUE_EXPORTS].sort());
    for (const key of runtimeKeys) {
      expect(typeof (indexMod as Record<string, unknown>)[key]).toBe("function");
    }

    const distGate2 = join(repoRoot, "dist/reasoning/gate2/index.js");
    const gate2Mod = await import(`${distGate2}?t=${Date.now()}`);
    const gate2Keys = Object.keys(gate2Mod).sort();
    expect(gate2Keys).toEqual([...ALLOWED_GATE2_VALUE_EXPORTS].sort());
    for (const key of gate2Keys) {
      expect(typeof (gate2Mod as Record<string, unknown>)[key]).toBe("function");
    }

    const typesSource = readFileSync(distTypes, "utf8");
    expect(typesSource).not.toMatch(/exports\.\w+\s*=/);
    expect(typesSource).not.toMatch(/\bfunction\b|\bclass\b|\benum\b/);

    // Package root must not re-export reasoning
    const rootSource = readFileSync(join(repoRoot, "src/index.ts"), "utf8");
    expect(rootSource).not.toMatch(/reasoning/);
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

  it("imports without mutating host process state", async () => {
    const envSnapshot = { ...process.env };
    const cwdSnapshot = process.cwd();
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      const mod = await import("../../src/reasoning/index.js");
      expect(Object.keys(mod).sort()).toEqual(
        [...ALLOWED_RUNTIME_VALUE_EXPORTS].sort(),
      );
      expect(process.cwd()).toBe(cwdSnapshot);
      expect(process.env).toEqual(envSnapshot);
      expect(consoleLog).not.toHaveBeenCalled();
    } finally {
      consoleLog.mockRestore();
    }
  });

  it("TypeScript package is available for syntax inspection", () => {
    expect(typeof require("typescript").createSourceFile).toBe("function");
  });
});
