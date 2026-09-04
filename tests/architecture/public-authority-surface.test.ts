/**
 * Constitution Amendment 1 standing guard — public authority surfaces.
 *
 * Phase 3-R2: discovery is derived from the editing barrel via the canonical
 * TypeScript Program/TypeChecker analyzer. Legacy enumerated three-type
 * discovery is retired as the coverage mechanism. Cheap barrel-source regex
 * bans (fsOps / targetOps / WithDependencies) are retained as additional
 * checks only.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { PUBLIC_AUTHORITY_APPROVED_EXCEPTIONS } from "./public-authority-approved-exceptions.js";
import {
  analyzePublicAuthoritySurface,
  architectureTestsRepoRoot,
  clearRepositoryTypeScriptProgramCache,
  discoveredPublicRoots,
  manifestedDispositionRoots,
  publicRootOccurrenceKey,
} from "./public-authority-surface-analyzer.js";
import { reviewedTerminalIdentity } from "./public-authority-reviewed-terminals.js";
import { withPublicAuthoritySrcLock } from "./public-authority-src-lock.js";

const repoRoot = architectureTestsRepoRoot();

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

describe(
  "public authority surface — Amendment 1 standing guard",
  { timeout: 60_000 },
  () => {
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

  it("derived walker covers complete public editing parameter/options surfaces", () => {
    withPublicAuthoritySrcLock(() => {
    clearRepositoryTypeScriptProgramCache();
    const analysis = analyzePublicAuthoritySurface({
      repoRoot,
      exceptions: PUBLIC_AUTHORITY_APPROVED_EXCEPTIONS,
    });

    // Structural completeness: export-driven callable census (not a name list).
    expect(analysis.exportedCallables).toEqual(
      expect.arrayContaining([
        "authorizePreparedChange",
        "replaceExistingFile",
        "createFile",
        "executeMultiFilePlan",
        "prepareModifyExistingFile",
        "prepareCreateFile",
        "createMultiFilePlan",
        "explicitEditApproval",
      ]),
    );
    expect(analysis.exportedCallables.length).toBeGreaterThanOrEqual(8);

    // Original three option types plus the authority-issuing fourth are covered
    // by the derived walker (names retained so P2/P3 still observe them).
    const typeNames = new Set(analysis.manifest.map((m) => m.typeName));
    expect(typeNames.has("ReplaceExistingFileOptions")).toBe(true);
    expect(typeNames.has("CreateFileOptions")).toBe(true);
    expect(typeNames.has("ExecuteMultiFilePlanOptions")).toBe(true);
    expect(typeNames.has("AuthorizePreparedChangeOptions")).toBe(true);

    const gitContextMembers = analysis.manifest.filter(
      (m) => m.memberPath === "gitContext",
    );
    expect(gitContextMembers.map((m) => m.typeName).sort()).toEqual([
      "AuthorizePreparedChangeOptions",
      "CreateFileOptions",
      "ExecuteMultiFilePlanOptions",
      "ReplaceExistingFileOptions",
    ]);

    expect(analysis.findings).toEqual([]);
    expect(PUBLIC_AUTHORITY_APPROVED_EXCEPTIONS).toHaveLength(0);

    // Disposition completeness: every discovered public root has exactly one
    // root disposition (no naming-gate skips). Counts are derived, not hardcoded.
    const discovered = discoveredPublicRoots(analysis);
    const manifested = manifestedDispositionRoots(analysis);
    expect(manifested.map(publicRootOccurrenceKey).sort()).toEqual(
      discovered.map(publicRootOccurrenceKey).sort(),
    );
    expect(analysis.programConstructionCount).toBeLessThanOrEqual(1);

    const workspaceIdentity = reviewedTerminalIdentity({
      declarationPath: "src/domain/workspace.ts",
      symbolName: "WorkspaceBoundary",
      declarationKind: "interface",
    });
    const workspaceRoots = manifested.filter(
      (d) => d.canonicalTypeIdentity === workspaceIdentity,
    );
    expect(workspaceRoots.length).toBeGreaterThanOrEqual(1);
    expect(
      workspaceRoots.every((d) => d.disposition === "REVIEWED_TERMINAL"),
    ).toBe(true);
    });
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
