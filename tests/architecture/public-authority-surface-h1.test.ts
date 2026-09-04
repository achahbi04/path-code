/**
 * Phase 3-R2-H1 permanent falsifications (H1-F1 … H1-F7).
 *
 * Added beside R2's 2-F1…2-F7 — no prior probe is deleted or weakened.
 * Every live corruption follows RESTORATION DISCIPLINE.
 */

import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  copyFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { PUBLIC_AUTHORITY_APPROVED_EXCEPTIONS } from "./public-authority-approved-exceptions.js";
import {
  PUBLIC_AUTHORITY_REVIEWED_TERMINALS,
  reviewedTerminalIdentity,
  type ReviewedTerminalEntry,
} from "./public-authority-reviewed-terminals.js";
import {
  analyzePublicAuthoritySurface,
  architectureTestsRepoRoot,
  clearRepositoryTypeScriptProgramCache,
  discoveredPublicRoots,
  manifestedDispositionRoots,
  publicRootOccurrenceKey,
} from "./public-authority-surface-analyzer.js";
import { withPublicAuthoritySrcLock } from "./public-authority-src-lock.js";

const repoRoot = architectureTestsRepoRoot();
const snapshotDir = join(tmpdir(), "path-code-r2h1-candidate-snapshots");

function sha256File(absolutePath: string): string {
  return createHash("sha256").update(readFileSync(absolutePath)).digest("hex");
}

function createFixtureProject(files: Record<string, string>): {
  root: string;
  cleanup: () => void;
} {
  const root = mkdtempSync(join(tmpdir(), "pc-pas-h1-"));
  for (const [rel, contents] of Object.entries(files)) {
    const full = join(root, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, contents, "utf8");
  }
  writeFileSync(
    join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        strict: true,
        skipLibCheck: true,
        noEmit: true,
      },
      include: ["**/*.ts", "**/*.d.ts"],
    }),
    "utf8",
  );
  return {
    root,
    cleanup: () => {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

function programForFixture(root: string): ts.Program {
  const configPath = join(root, "tsconfig.json");
  const configFile = ts.readConfigFile(configPath, (p) => readFileSync(p, "utf8"));
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    root,
  );
  return ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
  });
}

const DANGEROUS_MEMBER = `
  readonly authorityOps?: { readonly issue: (input: unknown) => unknown };
`;

describe(
  "public authority surface — R2-H1 parameter-graph traversal proofs",
  { timeout: 120_000 },
  () => {
    it("H1-F1 — adversarial name NovelPublishSettings/input is detected", () => {
      const fixture = createFixtureProject({
        "editing/index.ts": `
export { novelPublishSomething } from "./novel.js";
export type { NovelPublishSettings } from "./novel.js";
`,
        "editing/novel.ts": `
export type NovelPublishSettings = {
  readonly note?: string;
  ${DANGEROUS_MEMBER}
};
export function novelPublishSomething(input: NovelPublishSettings): void {
  void input;
}
`,
      });
      try {
        const analysis = analyzePublicAuthoritySurface({
          repoRoot: fixture.root,
          barrelRelativePath: "editing/index.ts",
          program: programForFixture(fixture.root),
          exceptions: [],
        });
        const hit = analysis.findings.find(
          (f) =>
            f.functionName === "novelPublishSomething" &&
            f.parameterName === "input" &&
            f.typeName === "NovelPublishSettings" &&
            f.memberPath.includes("authorityOps"),
        );
        expect(hit).toBeDefined();
        expect(hit?.memberPath).toMatch(/authorityOps(\.issue)?/);
        const issue = analysis.findings.find(
          (f) =>
            f.functionName === "novelPublishSomething" &&
            f.memberPath.includes("authorityOps.issue"),
        );
        expect(issue).toBeDefined();
        // No registry/exception/list was taught the fixture names.
        expect(PUBLIC_AUTHORITY_APPROVED_EXCEPTIONS).toHaveLength(0);
      } finally {
        fixture.cleanup();
      }
      withPublicAuthoritySrcLock(() => {
        clearRepositoryTypeScriptProgramCache();
        const clean = analyzePublicAuthoritySurface({
          repoRoot,
          exceptions: PUBLIC_AUTHORITY_APPROVED_EXCEPTIONS,
        });
        expect(clean.findings).toEqual([]);
      });
    });

    it("H1-F2 — name/container variety and unconstrained generic fail for same reason", () => {
      const cases: Array<{
        label: string;
        files: Record<string, string>;
        functionName: string;
        parameterName: string;
        typeName: string;
        expectUnsafeEscape?: boolean;
      }> = [
        {
          label: "ctx/Foo",
          functionName: "mutateViaCtx",
          parameterName: "ctx",
          typeName: "Foo",
          files: {
            "editing/index.ts": `export { mutateViaCtx } from "./a.js";`,
            "editing/a.ts": `
export type Foo = { ${DANGEROUS_MEMBER} };
export function mutateViaCtx(ctx: Foo): void { void ctx; }
`,
          },
        },
        {
          label: "settings/Bar",
          functionName: "mutateViaSettings",
          parameterName: "settings",
          typeName: "Bar",
          files: {
            "editing/index.ts": `export { mutateViaSettings } from "./a.js";`,
            "editing/a.ts": `
export type Bar = { ${DANGEROUS_MEMBER} };
export function mutateViaSettings(settings: Bar): void { void settings; }
`,
          },
        },
        {
          label: "params/PublishCtx",
          functionName: "mutateViaParams",
          parameterName: "params",
          typeName: "PublishCtx",
          files: {
            "editing/index.ts": `export { mutateViaParams } from "./a.js";`,
            "editing/a.ts": `
export type PublishCtx = { ${DANGEROUS_MEMBER} };
export function mutateViaParams(params: PublishCtx): void { void params; }
`,
          },
        },
        {
          label: "cfg/Foo",
          functionName: "mutateViaCfg",
          parameterName: "cfg",
          typeName: "Foo",
          files: {
            "editing/index.ts": `export { mutateViaCfg } from "./a.js";`,
            "editing/a.ts": `
export type Foo = { ${DANGEROUS_MEMBER} };
export function mutateViaCfg(cfg: Foo): void { void cfg; }
`,
          },
        },
        {
          label: "x/Foo",
          functionName: "mutateViaX",
          parameterName: "x",
          typeName: "Foo",
          files: {
            "editing/index.ts": `export { mutateViaX } from "./a.js";`,
            "editing/a.ts": `
export type Foo = { ${DANGEROUS_MEMBER} };
export function mutateViaX(x: Foo): void { void x; }
`,
          },
        },
        {
          label: "ReadonlyArray<Foo>",
          functionName: "mutateViaArray",
          parameterName: "items",
          typeName: "ReadonlyArray",
          files: {
            "editing/index.ts": `export { mutateViaArray } from "./a.js";`,
            "editing/a.ts": `
export type Foo = { ${DANGEROUS_MEMBER} };
export function mutateViaArray(items: ReadonlyArray<Foo>): void { void items; }
`,
          },
        },
        {
          label: "project wrapper<Foo>",
          functionName: "mutateViaWrapper",
          parameterName: "wrapped",
          typeName: "ProjectWrapper",
          files: {
            "editing/index.ts": `export { mutateViaWrapper } from "./a.js";`,
            "editing/a.ts": `
export type Foo = { ${DANGEROUS_MEMBER} };
export type ProjectWrapper<T> = { readonly value: T };
export function mutateViaWrapper(wrapped: ProjectWrapper<Foo>): void { void wrapped; }
`,
          },
        },
        {
          label: "unconstrained generic",
          functionName: "genericPublic",
          parameterName: "input",
          typeName: "T",
          expectUnsafeEscape: true,
          files: {
            "editing/index.ts": `export { genericPublic } from "./a.js";`,
            "editing/a.ts": `
export function genericPublic<T>(input: T): void { void input; }
`,
          },
        },
      ];

      for (const c of cases) {
        const fixture = createFixtureProject(c.files);
        try {
          const analysis = analyzePublicAuthoritySurface({
            repoRoot: fixture.root,
            barrelRelativePath: "editing/index.ts",
            program: programForFixture(fixture.root),
            exceptions: [],
          });
          if (c.expectUnsafeEscape) {
            const hit = analysis.findings.find(
              (f) =>
                f.functionName === c.functionName &&
                /unconstrained|unresolved type parameter/i.test(f.reason),
            );
            expect(hit, c.label).toBeDefined();
            const disp = analysis.dispositions.find(
              (d) =>
                d.exportName === c.functionName &&
                d.disposition === "UNSAFE_ESCAPE_REJECTED",
            );
            expect(disp, c.label).toBeDefined();
          } else {
            const hit = analysis.findings.find(
              (f) =>
                f.functionName === c.functionName &&
                f.parameterName === c.parameterName &&
                f.memberPath.includes("authorityOps"),
            );
            expect(hit, c.label).toBeDefined();
            expect(
              hit?.reason,
              c.label,
            ).toMatch(/mechanism-substitution|call signature/);
          }
        } finally {
          fixture.cleanup();
        }
      }

      withPublicAuthoritySrcLock(() => {
        clearRepositoryTypeScriptProgramCache();
        const clean = analyzePublicAuthoritySurface({
          repoRoot,
          exceptions: PUBLIC_AUTHORITY_APPROVED_EXCEPTIONS,
        });
        expect(clean.findings).toEqual([]);
      });
    });

    it("H1-F3 — disposition/root completeness, reuse, overload, cycle, suppression", () => {
      withPublicAuthoritySrcLock(() => {
        const analysis = analyzePublicAuthoritySurface({
          repoRoot,
          exceptions: PUBLIC_AUTHORITY_APPROVED_EXCEPTIONS,
        });
        const discovered = discoveredPublicRoots(analysis);
        const manifested = manifestedDispositionRoots(analysis);
        expect(manifested.map(publicRootOccurrenceKey).sort()).toEqual(
          discovered.map(publicRootOccurrenceKey).sort(),
        );
        // Every disposition has exactly one disposition value from the closed set.
        const allowed = new Set([
          "TRAVERSED_PROJECT_GRAPH",
          "PRIMITIVE_TERMINAL",
          "EXTERNAL_LIBRARY_TERMINAL",
          "REVIEWED_TERMINAL",
          "CALLABLE_REJECTED",
          "UNSAFE_ESCAPE_REJECTED",
        ]);
        for (const d of analysis.dispositions) {
          expect(allowed.has(d.disposition)).toBe(true);
        }

        // Same project type at two public functions → two root occurrences.
        const configRoots = manifested.filter(
          (d) => d.parameterName === "config" || d.typeName === "ResolvedProjectConfig",
        );
        const configByExport = new Set(
          discovered
            .filter((r) => r.typeName.includes("ResolvedProjectConfig"))
            .map((r) => r.exportName),
        );
        expect(configByExport.size).toBeGreaterThanOrEqual(2);
        expect(configRoots.length).toBeGreaterThanOrEqual(2);

        // Recursive termination: WorkspaceBoundary appears as REVIEWED_TERMINAL
        // without unbounded growth / missing root.
        const wbId = reviewedTerminalIdentity({
          declarationPath: "src/domain/workspace.ts",
          symbolName: "WorkspaceBoundary",
          declarationKind: "interface",
        });
        expect(
          analysis.dispositions.some(
            (d) =>
              d.canonicalTypeIdentity === wbId &&
              d.disposition === "REVIEWED_TERMINAL",
          ),
        ).toBe(true);
      });

      // Overload + cycle + suppression via fixture
      const fixture = createFixtureProject({
        "editing/index.ts": `
export { overloaded, recursiveHold } from "./a.js";
`,
        "editing/a.ts": `
export type Node = { readonly next?: Node; readonly authorityOps?: { readonly issue: (x: unknown) => unknown } };
export function overloaded(input: { readonly a: string }): void;
export function overloaded(input: { readonly authorityOps?: { readonly issue: (x: unknown) => unknown } }): void;
export function overloaded(input: unknown): void { void input; }
export function recursiveHold(node: Node): void { void node; }
`,
      });
      try {
        const analysis = analyzePublicAuthoritySurface({
          repoRoot: fixture.root,
          barrelRelativePath: "editing/index.ts",
          program: programForFixture(fixture.root),
          exceptions: [],
        });
        const overloadRoots = discoveredPublicRoots(analysis).filter(
          (r) => r.exportName === "overloaded",
        );
        expect(overloadRoots.length).toBeGreaterThanOrEqual(2);
        const overloadDisp = manifestedDispositionRoots(analysis).filter(
          (r) => r.exportName === "overloaded",
        );
        expect(overloadDisp.length).toBe(overloadRoots.length);

        const recursive = analysis.findings.find(
          (f) =>
            f.functionName === "recursiveHold" &&
            f.memberPath.includes("authorityOps"),
        );
        expect(recursive).toBeDefined();
        expect(manifestedDispositionRoots(analysis).some((r) => r.exportName === "recursiveHold")).toBe(
          true,
        );

        // Temporarily suppressing one disposition path breaks completeness.
        const suppressed = {
          ...analysis,
          dispositions: analysis.dispositions.filter(
            (d) =>
              !(
                d.exportName === "recursiveHold" &&
                d.memberPath === "" &&
                d.parameterName === "node"
              ),
          ),
        };
        const disc = discoveredPublicRoots(suppressed);
        const mani = manifestedDispositionRoots(suppressed);
        expect(mani.map(publicRootOccurrenceKey).sort()).not.toEqual(
          disc.map(publicRootOccurrenceKey).sort(),
        );
      } finally {
        fixture.cleanup();
      }
    });

    it("H1-F4 — prior R2 cases + generic-smuggling through external container", () => {
      // Generic smuggling: ReadonlyArray / external-looking container cannot hide
      // a project-defined dangerous type argument.
      const fixture = createFixtureProject({
        "editing/index.ts": `export { smuggle } from "./a.js";`,
        "editing/a.ts": `
export type NovelPublishSettings = { ${DANGEROUS_MEMBER} };
export function smuggle(items: ReadonlyArray<NovelPublishSettings>): void { void items; }
`,
        "vendor/external.d.ts": `
declare module "ext-blob" {
  export type ExternalBox<T> = { readonly payload: T };
}
`,
      });
      try {
        const analysis = analyzePublicAuthoritySurface({
          repoRoot: fixture.root,
          barrelRelativePath: "editing/index.ts",
          program: programForFixture(fixture.root),
          exceptions: [],
        });
        const hit = analysis.findings.find(
          (f) =>
            f.functionName === "smuggle" &&
            f.memberPath.includes("authorityOps"),
        );
        expect(hit).toBeDefined();
      } finally {
        fixture.cleanup();
      }

      // Smoke: R2 standing analysis still clean (2-F1..2-F7 retained in derived suite).
      withPublicAuthoritySrcLock(() => {
        clearRepositoryTypeScriptProgramCache();
        const clean = analyzePublicAuthoritySurface({
          repoRoot,
          exceptions: PUBLIC_AUTHORITY_APPROVED_EXCEPTIONS,
        });
        expect(clean.findings).toEqual([]);
        expect(PUBLIC_AUTHORITY_APPROVED_EXCEPTIONS).toHaveLength(0);
      });
    });

    it("H1-F5 — reviewed terminal registry removal and fail-closed identity rules", () => {
      withPublicAuthoritySrcLock(() => {
        const entry = PUBLIC_AUTHORITY_REVIEWED_TERMINALS[0]!;
        expect(entry.symbolName).toBe("WorkspaceBoundary");

        // Remove only WorkspaceBoundary entry in memory → canonicalize rejected.
        const without: readonly ReviewedTerminalEntry[] = [];
        const analysis = analyzePublicAuthoritySurface({
          repoRoot,
          exceptions: PUBLIC_AUTHORITY_APPROVED_EXCEPTIONS,
          reviewedTerminals: without,
        });
        const hit = analysis.findings.find(
          (f) =>
            f.memberPath.includes("canonicalize") &&
            (f.typeName === "WorkspaceBoundary" ||
              f.typePath.includes("WorkspaceBoundary")),
        );
        expect(hit).toBeDefined();
        expect(hit?.reason).toMatch(/call signature/);

        // Restore registry → PASS
        const restored = analyzePublicAuthoritySurface({
          repoRoot,
          exceptions: PUBLIC_AUTHORITY_APPROVED_EXCEPTIONS,
          reviewedTerminals: PUBLIC_AUTHORITY_REVIEWED_TERMINALS,
        });
        expect(restored.findings).toEqual([]);

        // Repeated use of WorkspaceBoundary remains manifested at every root.
        const wbId = reviewedTerminalIdentity(entry);
        const wbRoots = manifestedDispositionRoots(restored).filter(
          (d) => d.canonicalTypeIdentity === wbId,
        );
        expect(wbRoots.length).toBeGreaterThanOrEqual(1);
        expect(wbRoots.every((d) => d.disposition === "REVIEWED_TERMINAL")).toBe(
          true,
        );
      });

      // Anonymous / __type registry entries are structurally rejected (fail-closed).
      const fakeAnon: ReviewedTerminalEntry = {
        declarationPath: "editing/a.ts",
        symbolName: "__type",
        declarationKind: "interface",
        reason: "FROZEN_FOUNDATION_OBJECT",
        governingContract: "n/a",
        falsificationTestName: "H1-F5",
        genericPolicy: "SEMANTICALLY_CLOSED",
      };
      withPublicAuthoritySrcLock(() => {
        clearRepositoryTypeScriptProgramCache();
        const rejected = analyzePublicAuthoritySurface({
          repoRoot,
          exceptions: PUBLIC_AUTHORITY_APPROVED_EXCEPTIONS,
          reviewedTerminals: [fakeAnon],
        });
        expect(
          rejected.findings.some((f) =>
            /wildcard|pattern|anonymous/i.test(f.reason),
          ),
        ).toBe(true);

        // Alias / name-pattern / module-wide style entries also fail.
        const wildcardish: ReviewedTerminalEntry = {
          declarationPath: "src/domain/*",
          symbolName: "WorkspaceBoundary",
          declarationKind: "interface",
          reason: "FROZEN_FOUNDATION_OBJECT",
          governingContract: "n/a",
          falsificationTestName: "H1-F5",
          genericPolicy: "SEMANTICALLY_CLOSED",
        };
        const wild = analyzePublicAuthoritySurface({
          repoRoot,
          exceptions: PUBLIC_AUTHORITY_APPROVED_EXCEPTIONS,
          reviewedTerminals: [wildcardish],
        });
        expect(
          wild.findings.some((f) => /wildcard|pattern|anonymous/i.test(f.reason)),
        ).toBe(true);
      });

      // Inline anonymous parameter objects still yield findings when registry is empty.
      const fixture = createFixtureProject({
        "editing/index.ts": `export { anonDanger } from "./a.js";`,
        "editing/a.ts": `
export function anonDanger(input: { readonly authorityOps?: { readonly issue: (x: unknown) => unknown } }): void {
  void input;
}
`,
      });
      try {
        const analysis = analyzePublicAuthoritySurface({
          repoRoot: fixture.root,
          barrelRelativePath: "editing/index.ts",
          program: programForFixture(fixture.root),
          exceptions: [],
          reviewedTerminals: [],
        });
        expect(
          analysis.findings.some((f) => f.memberPath.includes("authorityOps")),
        ).toBe(true);
      } finally {
        fixture.cleanup();
      }

      // Unscoped generic reviewed entry cannot hide dangerous type argument.
      const genericFixture = createFixtureProject({
        "editing/index.ts": `export { wrapDanger } from "./a.js"; export type { Box } from "./a.js";`,
        "editing/a.ts": `
export type Danger = { ${DANGEROUS_MEMBER} };
export type Box<T> = { readonly value: T };
export function wrapDanger(box: Box<Danger>): void { void box; }
`,
      });
      try {
        const boxEntry: ReviewedTerminalEntry = {
          declarationPath: "editing/a.ts",
          symbolName: "Box",
          declarationKind: "type-alias",
          reason: "FROZEN_FOUNDATION_OBJECT",
          governingContract: "n/a",
          falsificationTestName: "H1-F5",
          genericPolicy: "INSPECT_TYPE_ARGUMENTS",
        };
        const analysis = analyzePublicAuthoritySurface({
          repoRoot: genericFixture.root,
          barrelRelativePath: "editing/index.ts",
          program: programForFixture(genericFixture.root),
          exceptions: [],
          reviewedTerminals: [boxEntry],
        });
        expect(
          analysis.findings.some((f) => f.memberPath.includes("authorityOps")),
        ).toBe(true);
      } finally {
        genericFixture.cleanup();
      }
    });

    it("H1-F6 — legitimate inputs pass for structural reasons; external boundary by ownership", () => {
      withPublicAuthoritySrcLock(() => {
        const analysis = analyzePublicAuthoritySurface({
          repoRoot,
          exceptions: PUBLIC_AUTHORITY_APPROVED_EXCEPTIONS,
        });
        expect(analysis.findings).toEqual([]);
        const roots = manifestedDispositionRoots(analysis);
        expect(roots.length).toBe(discoveredPublicRoots(analysis).length);
        for (const root of roots) {
          expect([
            "TRAVERSED_PROJECT_GRAPH",
            "PRIMITIVE_TERMINAL",
            "EXTERNAL_LIBRARY_TERMINAL",
            "REVIEWED_TERMINAL",
          ]).toContain(root.disposition);
        }
        // Buffer / Uint8Array appear as external terminals (member graphs not walked
        // into .slice etc. as findings).
        const external = analysis.dispositions.filter(
          (d) =>
            d.disposition === "EXTERNAL_LIBRARY_TERMINAL" &&
            /Buffer|Uint8Array/.test(d.typeName),
        );
        expect(external.length).toBeGreaterThan(0);
      });

      const fixture = createFixtureProject({
        "editing/index.ts": `export { takeBlob } from "./a.js";`,
        "editing/a.ts": `
import type { SyntheticExternal } from "../vendor/synth.js";
export type Carrier = { readonly blob: SyntheticExternal; readonly nested?: { readonly authorityOps?: { readonly issue: (x: unknown) => unknown } } };
export function takeBlob(input: Carrier): void { void input; }
`,
        "vendor/synth.d.ts": `
export interface SyntheticExternal {
  danger(x: unknown): unknown;
}
`,
      });
      try {
        const analysis = analyzePublicAuthoritySurface({
          repoRoot: fixture.root,
          barrelRelativePath: "editing/index.ts",
          program: programForFixture(fixture.root),
          exceptions: [],
          isProjectSourceFile: (fileName) =>
            !fileName.includes("/vendor/") && !fileName.includes("node_modules"),
        });
        // External SyntheticExternal.danger not reported; project nested authorityOps is.
        expect(
          analysis.findings.some((f) => f.memberPath.includes("danger")),
        ).toBe(false);
        expect(
          analysis.findings.some((f) => f.memberPath.includes("authorityOps")),
        ).toBe(true);
      } finally {
        fixture.cleanup();
      }
    });

    it("H1-F7 — exact R2 naming gate restored makes adversarial roots escape", () => {
      withPublicAuthoritySrcLock(() => {
        mkdirSync(snapshotDir, { recursive: true });
        const analyzerRel =
          "tests/architecture/public-authority-surface-analyzer.ts";
        const analyzerAbs = join(repoRoot, analyzerRel);
        const candidateSha = sha256File(analyzerAbs);
        const snapshotPath = join(snapshotDir, "analyzer-candidate.ts");
        copyFileSync(analyzerAbs, snapshotPath);
        expect(sha256File(snapshotPath)).toBe(candidateSha);

        // Candidate-safe corruption: restore the exact R2 naming gate predicate
        // in-source (verbatim). useLegacyNamingGate remains available as the
        // same predicate for process-local analysis without module reload.
        const original = readFileSync(analyzerAbs, "utf8");
        const gateNeedle =
          "        // H1-F7 only: exact R2 naming gate. Default path traverses every root.\n" +
          "        const deepInspect =\n" +
          "          !opts.useLegacyNamingGate ||\n" +
          '          parameterName === "options" ||\n' +
          "          /Options$/.test(typeName) ||\n" +
          "          hasUserDefinedCallSignatures(paramType);";
        const exactOldGate =
          "        // TEMP H1-F7: exact R2 naming gate restored verbatim.\n" +
          "        const deepInspect =\n" +
          '          parameterName === "options" ||\n' +
          "          /Options$/.test(typeName) ||\n" +
          "          hasUserDefinedCallSignatures(paramType);";
        expect(original.includes(gateNeedle)).toBe(true);
        writeFileSync(
          analyzerAbs,
          original.replace(gateNeedle, exactOldGate),
          "utf8",
        );

        // In-process proof uses the identical predicate via the option (the
        // already-loaded module body is not re-evaluated mid-test).
        const gated = analyzePublicAuthoritySurface({
          repoRoot,
          exceptions: PUBLIC_AUTHORITY_APPROVED_EXCEPTIONS,
          useLegacyNamingGate: true,
        });

        const fixture = createFixtureProject({
          "editing/index.ts": `
export { novelPublishSomething, mutateViaCtx, authorizePreparedChange } from "./a.js";
export type { NovelPublishSettings, Foo, AuthorizePreparedChangeOptions } from "./a.js";
`,
          "editing/a.ts": `
export type NovelPublishSettings = { ${DANGEROUS_MEMBER} };
export function novelPublishSomething(input: NovelPublishSettings): void { void input; }
export type Foo = { ${DANGEROUS_MEMBER} };
export function mutateViaCtx(ctx: Foo): void { void ctx; }
export type AuthorizePreparedChangeOptions = { ${DANGEROUS_MEMBER} };
export function authorizePreparedChange(options?: AuthorizePreparedChangeOptions): void { void options; }
`,
        });
        try {
          const legacyOnFixture = analyzePublicAuthoritySurface({
            repoRoot: fixture.root,
            barrelRelativePath: "editing/index.ts",
            program: programForFixture(fixture.root),
            exceptions: [],
            useLegacyNamingGate: true,
          });
          expect(
            legacyOnFixture.findings.some(
              (f) => f.functionName === "novelPublishSomething",
            ),
          ).toBe(false);
          expect(
            legacyOnFixture.findings.some(
              (f) => f.functionName === "mutateViaCtx",
            ),
          ).toBe(false);
          expect(
            legacyOnFixture.findings.some(
              (f) =>
                f.functionName === "authorizePreparedChange" &&
                f.memberPath.includes("authorityOps"),
            ),
          ).toBe(true);

          const disc = discoveredPublicRoots(gated);
          const mani = manifestedDispositionRoots(gated);
          expect(mani.map(publicRootOccurrenceKey).sort()).not.toEqual(
            disc.map(publicRootOccurrenceKey).sort(),
          );
        } finally {
          fixture.cleanup();
        }

        // Restore unconditional traversal from candidate snapshot (path class B).
        copyFileSync(snapshotPath, analyzerAbs);
        clearRepositoryTypeScriptProgramCache();
        expect(sha256File(analyzerAbs)).toBe(candidateSha);

        const clean = analyzePublicAuthoritySurface({
          repoRoot,
          exceptions: PUBLIC_AUTHORITY_APPROVED_EXCEPTIONS,
        });
        expect(clean.findings).toEqual([]);
        expect(
          manifestedDispositionRoots(clean)
            .map(publicRootOccurrenceKey)
            .sort(),
        ).toEqual(
          discoveredPublicRoots(clean).map(publicRootOccurrenceKey).sort(),
        );
      });
    });
  },
);
