/**
 * Constitution Amendment 1 standing guard — public authority surfaces.
 *
 * Practical implementation with existing typescript/vitest tooling (no new runtime deps):
 * package exports map, public editing barrel source, public option types,
 * public wrapper hidden-input patterns, and approved-exception allowlist.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { PUBLIC_AUTHORITY_APPROVED_EXCEPTIONS } from "./public-authority-approved-exceptions.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function readRepo(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

function parsePackageExports(): Record<string, unknown> {
  const pkg = JSON.parse(readRepo("package.json")) as {
    exports?: Record<string, unknown>;
  };
  return pkg.exports ?? {};
}

function extractExportedNames(barrelSource: string): string[] {
  const source = ts.createSourceFile(
    "index.ts",
    barrelSource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const names: string[] = [];
  for (const statement of source.statements) {
    if (!ts.isExportDeclaration(statement) || statement.exportClause === undefined) {
      continue;
    }
    if (!ts.isNamedExports(statement.exportClause)) {
      continue;
    }
    for (const element of statement.exportClause.elements) {
      names.push(element.name.text);
    }
  }
  return names;
}

function optionTypePropertyNames(
  sourceText: string,
  typeName: string,
): string[] {
  const source = ts.createSourceFile(
    "module.ts",
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const props: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isTypeAliasDeclaration(node) &&
      node.name.text === typeName &&
      ts.isTypeLiteralNode(node.type)
    ) {
      for (const member of node.type.members) {
        if (ts.isPropertySignature(member) && member.name !== undefined) {
          if (ts.isIdentifier(member.name)) {
            props.push(member.name.text);
          } else if (ts.isStringLiteral(member.name)) {
            props.push(member.name.text);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return props;
}

function publicWrapperReadsForbiddenInput(
  sourceText: string,
  publicFunctionName: string,
  forbiddenPatterns: readonly RegExp[],
): string[] {
  const source = ts.createSourceFile(
    "module.ts",
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  let publicFnBody: ts.ConciseBody | undefined;
  const visit = (node: ts.Node): void => {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name?.text === publicFunctionName &&
      node.body !== undefined
    ) {
      // Prefer the last matching declaration (wrapper after WithDependencies).
      publicFnBody = node.body;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (publicFnBody === undefined) {
    return [`missing public function ${publicFunctionName}`];
  }
  const bodyText = publicFnBody.getText(source);
  return forbiddenPatterns
    .filter((pattern) => pattern.test(bodyText))
    .map((pattern) => pattern.source);
}

describe("public authority surface — Amendment 1 standing guard", () => {
  it("package exports map exposes only the root specifier", () => {
    const exportsMap = parsePackageExports();
    expect(Object.keys(exportsMap)).toEqual(["."]);
  });

  it("public editing barrel does not export fsOps/targetOps/WithDependencies seams", () => {
    const barrel = readRepo("src/editing/index.ts");
    const exported = extractExportedNames(barrel);
    const forbidden = exported.filter(
      (name) =>
        /fsOps|targetOps|WithDependencies|AtomicReplaceFsOps|AtomicCreateFsOps|MultiFileTargetOperations|productionAtomicReplaceFs|productionAtomicCreateFs/i.test(
          name,
        ),
    );
    expect(forbidden).toEqual([]);
    expect(barrel).not.toMatch(/\bfsOps\b/);
    expect(barrel).not.toMatch(/\btargetOps\b/);
    expect(barrel).not.toMatch(/WithDependencies/);
  });

  it("public option types lack fsOps and targetOps", () => {
    const replaceSource = readRepo("src/editing/replace-existing-file.ts");
    const createSource = readRepo("src/editing/create-file.ts");
    const multiTypes = readRepo("src/editing/multi-file-types.ts");

    expect(optionTypePropertyNames(replaceSource, "ReplaceExistingFileOptions")).toEqual([
      "gitContext",
    ]);
    expect(optionTypePropertyNames(createSource, "CreateFileOptions")).toEqual([
      "gitContext",
    ]);
    expect(
      optionTypePropertyNames(multiTypes, "ExecuteMultiFilePlanOptions"),
    ).toEqual(["gitContext"]);
  });

  it("public wrappers do not read options.fsOps, options.targetOps, or arguments[", () => {
    const replaceHits = publicWrapperReadsForbiddenInput(
      readRepo("src/editing/replace-existing-file.ts"),
      "replaceExistingFile",
      [
        /\boptions\.fsOps\b/,
        /\barguments\s*\[/,
      ],
    );
    const createHits = publicWrapperReadsForbiddenInput(
      readRepo("src/editing/create-file.ts"),
      "createFile",
      [
        /\boptions\.fsOps\b/,
        /\barguments\s*\[/,
      ],
    );
    const executeHits = publicWrapperReadsForbiddenInput(
      readRepo("src/editing/multi-file-execute.ts"),
      "executeMultiFilePlan",
      [
        /\boptions\?\.targetOps\b/,
        /\boptions\.targetOps\b/,
        /\barguments\s*\[/,
      ],
    );
    expect(replaceHits).toEqual([]);
    expect(createHits).toEqual([]);
    expect(executeHits).toEqual([]);
  });

  it("approved-exception allowlist exists and has no unjustified entries", () => {
    expect(Array.isArray(PUBLIC_AUTHORITY_APPROVED_EXCEPTIONS)).toBe(true);
    expect(PUBLIC_AUTHORITY_APPROVED_EXCEPTIONS).toHaveLength(0);
    for (const entry of PUBLIC_AUTHORITY_APPROVED_EXCEPTIONS) {
      expect(entry.functionName.length).toBeGreaterThan(0);
      expect(entry.parameterName.length).toBeGreaterThan(0);
      expect(entry.governingContract.length).toBeGreaterThan(0);
      expect(entry.reason.length).toBeGreaterThan(0);
      expect(entry.targetedTest.length).toBeGreaterThan(0);
    }
  });
});
