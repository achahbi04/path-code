/**
 * Phase 3-R2 permanent proofs for the derived public authority-surface walker.
 *
 * Every live corruption: clean hash → corrupt → focused fail → restore → PASS.
 * Uses the same canonical analyzer as the standing guard.
 */

import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import type { PublicAuthorityApprovedException } from "./public-authority-approved-exceptions.js";
import { PUBLIC_AUTHORITY_APPROVED_EXCEPTIONS } from "./public-authority-approved-exceptions.js";
import {
  analyzePublicAuthoritySurface,
  architectureTestsRepoRoot,
  clearRepositoryTypeScriptProgramCache,
} from "./public-authority-surface-analyzer.js";
import { withPublicAuthoritySrcLock } from "./public-authority-src-lock.js";

const repoRoot = architectureTestsRepoRoot();

function gitHashObject(relativePath: string): string {
  return execFileSync("git", ["hash-object", relativePath], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
}

function createFixtureProject(files: Record<string, string>): {
  root: string;
  cleanup: () => void;
} {
  const root = mkdtempSync(join(tmpdir(), "pc-pas-"));
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

describe(
  "public authority surface — derived walker permanent proofs",
  { timeout: 60_000 },
  () => {
  it(
    "2-F1 — authorityOps on real AuthorizePreparedChangeOptions fails naming function/type/member",
    () => {
    withPublicAuthoritySrcLock(() => {
    const typesPath = "src/editing/types.ts";
    const pre = gitHashObject(typesPath);
    const original = readFileSync(join(repoRoot, typesPath), "utf8");
    const needle =
      "export type AuthorizePreparedChangeOptions = {\n  readonly gitContext?: GitStateBaseline;\n};";
    const corruption =
      "export type AuthorizePreparedChangeOptions = {\n  readonly gitContext?: GitStateBaseline;\n  readonly authorityOps?: { readonly issue: (input: unknown) => unknown };\n};";
    expect(original.includes(needle)).toBe(true);
    writeFileSync(join(repoRoot, typesPath), original.replace(needle, corruption), "utf8");
    clearRepositoryTypeScriptProgramCache();

    let failedAsIntended = false;
    let failureMessage = "";
    try {
      const analysis = analyzePublicAuthoritySurface({
        repoRoot,
        exceptions: PUBLIC_AUTHORITY_APPROVED_EXCEPTIONS,
      });
      const hit = analysis.findings.find(
        (f) =>
          f.functionName === "authorizePreparedChange" &&
          f.typeName === "AuthorizePreparedChangeOptions" &&
          f.memberPath.includes("authorityOps"),
      );
      expect(hit).toBeDefined();
      expect(hit?.functionName).toBe("authorizePreparedChange");
      expect(hit?.typeName).toBe("AuthorizePreparedChangeOptions");
      expect(hit?.memberPath).toMatch(/authorityOps/);
      expect(hit?.parameterName).toBe("options");
      // Standing-guard assertion shape: findings must be empty — MUST FAIL here.
      try {
        expect(analysis.findings).toEqual([]);
      } catch (error) {
        failureMessage = String(error);
        failedAsIntended = true;
      }
      expect(failedAsIntended).toBe(true);
      expect(failureMessage.length).toBeGreaterThan(0);
    } finally {
      execFileSync("git", ["restore", "--source=HEAD", "--", typesPath], {
        cwd: repoRoot,
      });
      clearRepositoryTypeScriptProgramCache();
    }

    const post = gitHashObject(typesPath);
    expect(post).toBe(pre);

    // Focused PASS after restore.
    const clean = analyzePublicAuthoritySurface({
      repoRoot,
      exceptions: PUBLIC_AUTHORITY_APPROVED_EXCEPTIONS,
    });
    expect(clean.findings).toEqual([]);
    });
  },
    60_000,
  );

  it("2-F2 — future public function with unlisted options type is auto-discovered", () => {
    const fixture = createFixtureProject({
      "editing/index.ts": `
export { futurePublicMutate } from "./future.js";
export type { FutureMutateOptions } from "./future.js";
`,
      "editing/future.ts": `
export type FutureMutateOptions = {
  readonly gitContext?: { readonly head: string };
  readonly fsOps?: { readonly write: (path: string) => void };
};
export function futurePublicMutate(options?: FutureMutateOptions): void {
  void options;
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
          f.functionName === "futurePublicMutate" &&
          f.typeName === "FutureMutateOptions" &&
          f.memberPath.includes("fsOps"),
      );
      expect(hit).toBeDefined();
      expect(hit?.functionName).toBe("futurePublicMutate");
      expect(hit?.typeName).toBe("FutureMutateOptions");
      expect(hit?.memberPath).toMatch(/fsOps/);
    } finally {
      fixture.cleanup();
    }

    // Repository standing analysis still PASS (fixture removed).
    const clean = analyzePublicAuthoritySurface({
      repoRoot,
      exceptions: PUBLIC_AUTHORITY_APPROVED_EXCEPTIONS,
    });
    expect(clean.findings).toEqual([]);
  });

  it("2-F3 — named re-export of options type is followed across modules", () => {
    const fixture = createFixtureProject({
      "editing/index.ts": `
export type { ReexportedOptions } from "./other.js";
export { useReexported } from "./api.js";
`,
      "editing/other.ts": `
export type ReexportedOptions = {
  readonly adaptor?: { readonly run: () => void };
};
`,
      "editing/api.ts": `
import type { ReexportedOptions } from "./other.js";
export function useReexported(options?: ReexportedOptions): void {
  void options;
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
          f.functionName === "useReexported" &&
          f.typeName === "ReexportedOptions" &&
          f.memberPath.includes("adaptor"),
      );
      expect(hit).toBeDefined();
      expect(hit?.typeName).toBe("ReexportedOptions");
      expect(hit?.memberPath).toMatch(/adaptor/);
    } finally {
      fixture.cleanup();
    }
  });

  it("2-F4 — recursive project type graph reaches nested/alias/extends/union/intersection/generic", () => {
    const fixture = createFixtureProject({
      "editing/index.ts": `
export { walkShapes } from "./shapes.js";
export type { WalkOptions } from "./shapes.js";
`,
      "editing/shapes.ts": `
export type NestedBag = {
  readonly nested: { readonly executor?: { readonly run: () => void } };
};
export type AliasBag = NestedBag;
export interface BaseBag {
  readonly baseFlag: boolean;
}
export interface ExtendedBag extends BaseBag {
  readonly loader?: { readonly load: () => string };
}
export type UnionBag = { readonly a: 1 } | { readonly writer?: { readonly write: () => void } };
export type IntersectionBag = { readonly b: 2 } & { readonly verifier?: { readonly verify: () => boolean } };
export type GenericWrap<T> = { readonly inner: T };
export type WalkOptions = {
  readonly viaAlias?: AliasBag;
  readonly viaExtends?: ExtendedBag;
  readonly viaUnion?: UnionBag;
  readonly viaIntersection?: IntersectionBag;
  readonly viaGeneric?: GenericWrap<{ readonly bindings?: { readonly bind: () => void } }>;
};
export function walkShapes(options?: WalkOptions): void {
  void options;
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
      const members = analysis.findings.map((f) => f.memberPath).join("\n");
      expect(members).toMatch(/executor/);
      expect(members).toMatch(/loader/);
      expect(members).toMatch(/writer/);
      expect(members).toMatch(/verifier/);
      expect(members).toMatch(/bindings/);
      expect(analysis.findings.every((f) => f.functionName === "walkShapes")).toBe(
        true,
      );
    } finally {
      fixture.cleanup();
    }
  });

  it("2-F5 — false-positive boundary: legitimate data/context PASS; external callable noise fails when ownership corrupted", () => {
    withPublicAuthoritySrcLock(() => {
    const clean = analyzePublicAuthoritySurface({
      repoRoot,
      exceptions: PUBLIC_AUTHORITY_APPROVED_EXCEPTIONS,
    });
    expect(clean.findings).toEqual([]);
    const git = clean.manifest.filter((m) => m.memberPath === "gitContext");
    expect(git).toHaveLength(4);
    // PreparedChange / EditAuthorization / MultiFilePlan / ResolvedProjectConfig
    // appear as parameter roots without findings.
    const paramTypes = new Set(
      clean.manifest.filter((m) => m.memberPath === "").map((m) => m.typeName),
    );
    expect(paramTypes.has("PreparedChange") || paramTypes.has("PreparedMutation")).toBe(
      true,
    );
    expect(paramTypes.has("EditAuthorization")).toBe(true);
    expect(paramTypes.has("MultiFilePlan")).toBe(true);
    expect(paramTypes.has("ResolvedProjectConfig")).toBe(true);
    // Buffer / Uint8Array-bearing parameters remain green (no findings).
    expect(
      clean.manifest.some((m) => /Uint8Array|Buffer/.test(m.typeName)),
    ).toBe(true);

    // Bounded synthetic external package with callable methods.
    const fixture = createFixtureProject({
      "editing/index.ts": `
import type { ExternalBlob } from "synthetic-external";
export type BlobOptions = { readonly blob?: ExternalBlob };
export function useBlob(options?: BlobOptions): void { void options; }
`,
      "node_modules/synthetic-external/index.d.ts": `
export interface ExternalBlob {
  readonly danger: () => void;
}
`,
      "node_modules/synthetic-external/package.json": `{"name":"synthetic-external","types":"index.d.ts"}`,
    });

    const analyzerPath = join(
      repoRoot,
      "tests/architecture/public-authority-surface-analyzer.ts",
    );
    const preAnalyzerHash = gitHashObject(
      "tests/architecture/public-authority-surface-analyzer.ts",
    );
    // Save exact candidate bytes (Stage 1 candidate file) before ownership corruption.
    const analyzerBytes = readFileSync(analyzerPath);
    const backup = join(tmpdir(), `pc-pas-analyzer-${Date.now()}.ts.bak`);
    writeFileSync(backup, analyzerBytes);

    try {
      // External boundary: ExternalBlob.danger must NOT be reported.
      const boundary = analyzePublicAuthoritySurface({
        repoRoot: fixture.root,
        barrelRelativePath: "editing/index.ts",
        program: programForFixture(fixture.root),
        exceptions: [],
      });
      expect(boundary.findings).toEqual([]);

      // Corrupt only the external/project ownership decision for this fixture.
      const polluted = analyzePublicAuthoritySurface({
        repoRoot: fixture.root,
        barrelRelativePath: "editing/index.ts",
        program: programForFixture(fixture.root),
        exceptions: [],
        isProjectSourceFile: () => true,
      });
      const noise = polluted.findings.find((f) => f.memberPath.includes("danger"));
      expect(noise).toBeDefined();
      expect(noise?.memberPath).toMatch(/danger/);
    } finally {
      // Restore exact candidate analyzer bytes under §1.5 B.
      writeFileSync(analyzerPath, readFileSync(backup));
      rmSync(backup, { force: true });
      fixture.cleanup();
    }

    const postAnalyzerHash = gitHashObject(
      "tests/architecture/public-authority-surface-analyzer.ts",
    );
    expect(postAnalyzerHash).toBe(preAnalyzerHash);

    const after = analyzePublicAuthoritySurface({
      repoRoot,
      exceptions: PUBLIC_AUTHORITY_APPROVED_EXCEPTIONS,
    });
    expect(after.findings).toEqual([]);
    });
  }, 60_000);

  it("2-F6 — approved exception model: exact member permits; wildcard/broad/missing fields rejected", () => {
    const fixture = createFixtureProject({
      "editing/index.ts": `
export type AllowedOptions = {
  readonly okData?: string;
  readonly executor?: { readonly run: () => void };
  readonly sibling?: { readonly run: () => void };
};
export function allowMe(options?: AllowedOptions): void { void options; }
`,
    });
    try {
      const exact: PublicAuthorityApprovedException = {
        functionName: "allowMe",
        parameterName: "options",
        memberPath: "executor",
        governingContract: "docs/passes/PHASE_3_R2_PUBLIC_SURFACE_GUARD_CORRECTION_CONTRACT.md",
        reason: "synthetic exact-member exception for 2-F6",
        targetedTest: "2-F6",
      };
      const withExact = analyzePublicAuthoritySurface({
        repoRoot: fixture.root,
        barrelRelativePath: "editing/index.ts",
        program: programForFixture(fixture.root),
        exceptions: [exact],
      });
      expect(
        withExact.findings.find((f) => f.memberPath === "executor"),
      ).toBeUndefined();
      // Sibling member remains rejected.
      expect(
        withExact.findings.find((f) => f.memberPath.includes("sibling")),
      ).toBeDefined();

      const wildcard: PublicAuthorityApprovedException = {
        functionName: "allowMe",
        parameterName: "*",
        memberPath: "executor",
        governingContract: "docs/passes/PHASE_3_R2_PUBLIC_SURFACE_GUARD_CORRECTION_CONTRACT.md",
        reason: "wildcard must fail",
        targetedTest: "2-F6",
      };
      const withWild = analyzePublicAuthoritySurface({
        repoRoot: fixture.root,
        barrelRelativePath: "editing/index.ts",
        program: programForFixture(fixture.root),
        exceptions: [wildcard],
      });
      expect(withWild.findings.some((f) => f.reason.includes("wildcard"))).toBe(
        true,
      );

      const missingReason: PublicAuthorityApprovedException = {
        functionName: "allowMe",
        parameterName: "options",
        memberPath: "executor",
        governingContract: "docs/passes/PHASE_3_R2_PUBLIC_SURFACE_GUARD_CORRECTION_CONTRACT.md",
        reason: "",
        targetedTest: "2-F6",
      };
      const withMissing = analyzePublicAuthoritySurface({
        repoRoot: fixture.root,
        barrelRelativePath: "editing/index.ts",
        program: programForFixture(fixture.root),
        exceptions: [missingReason],
      });
      expect(
        withMissing.findings.some((f) => f.reason.includes("missing")),
      ).toBe(true);

      const broaderParam: PublicAuthorityApprovedException = {
        functionName: "allowMe",
        parameterName: "notOptions",
        memberPath: "executor",
        governingContract: "docs/passes/PHASE_3_R2_PUBLIC_SURFACE_GUARD_CORRECTION_CONTRACT.md",
        reason: "wrong parameter",
        targetedTest: "2-F6",
      };
      const withBroader = analyzePublicAuthoritySurface({
        repoRoot: fixture.root,
        barrelRelativePath: "editing/index.ts",
        program: programForFixture(fixture.root),
        exceptions: [broaderParam],
      });
      expect(
        withBroader.findings.find((f) => f.memberPath === "executor"),
      ).toBeDefined();
    } finally {
      fixture.cleanup();
    }

    // Canonical list remains empty.
    expect(PUBLIC_AUTHORITY_APPROVED_EXCEPTIONS).toHaveLength(0);
  });

  it(
    "2-F7 — legacy enumerated discovery fails 2-F1, 2-F2, and completeness",
    () => {
    withPublicAuthoritySrcLock(() => {
    const analyzerRel = "tests/architecture/public-authority-surface-analyzer.ts";
    const preHash = gitHashObject(analyzerRel);
    const analyzerPath = join(repoRoot, analyzerRel);
    const candidateBytes = readFileSync(analyzerPath);
    const backup = join(tmpdir(), `pc-pas-legacy-${Date.now()}.ts.bak`);
    writeFileSync(backup, candidateBytes);

    // 2-F1 under legacy: authorityOps on AuthorizePreparedChangeOptions must be missed.
    const typesPath = "src/editing/types.ts";
    const typesPre = gitHashObject(typesPath);
    const typesOriginal = readFileSync(join(repoRoot, typesPath), "utf8");
    const needle =
      "export type AuthorizePreparedChangeOptions = {\n  readonly gitContext?: GitStateBaseline;\n};";
    const corruption =
      "export type AuthorizePreparedChangeOptions = {\n  readonly gitContext?: GitStateBaseline;\n  readonly authorityOps?: { readonly issue: (input: unknown) => unknown };\n};";
    writeFileSync(
      join(repoRoot, typesPath),
      typesOriginal.replace(needle, corruption),
      "utf8",
    );
    clearRepositoryTypeScriptProgramCache();

    try {
      const legacyOnReal = analyzePublicAuthoritySurface({
        repoRoot,
        useLegacyEnumeratedDiscovery: true,
        exceptions: PUBLIC_AUTHORITY_APPROVED_EXCEPTIONS,
      });
      const missed = legacyOnReal.findings.find(
        (f) =>
          f.typeName === "AuthorizePreparedChangeOptions" &&
          f.memberPath.includes("authorityOps"),
      );
      // Intended: no finding for authorityOps (legacy misses it).
      expect(missed).toBeUndefined();
      expect(
        legacyOnReal.exportedCallables.includes("authorizePreparedChange"),
      ).toBe(false);
    } finally {
      execFileSync("git", ["restore", "--source=HEAD", "--", typesPath], {
        cwd: repoRoot,
      });
      clearRepositoryTypeScriptProgramCache();
    }
    expect(gitHashObject(typesPath)).toBe(typesPre);

    // 2-F2 under legacy: unlisted future type absent from the enumerated set.
    // Legacy discovery only knows the three hardcoded repo paths — a future
    // fixture function is never present in that enumerated callable set.
    const fixture = createFixtureProject({
      "editing/index.ts": `
export type FutureOptions = { readonly fsOps?: { readonly write: () => void } };
export function futureFn(options?: FutureOptions): void { void options; }
`,
    });
    const legacyFuture = analyzePublicAuthoritySurface({
      repoRoot: fixture.root,
      useLegacyEnumeratedDiscovery: true,
      exceptions: [],
    });
    // Missing hardcoded files → empty legacy surface; futureFn absent.
    expect(legacyFuture.exportedCallables).not.toContain("futureFn");
    expect(
      legacyFuture.findings.find((f) => f.functionName === "futureFn"),
    ).toBeUndefined();
    expect(legacyFuture.exportedCallables.length).toBe(0);
    fixture.cleanup();

    // Structural completeness: legacy coverage is incomplete vs derived census.
    const derived = analyzePublicAuthoritySurface({
      repoRoot,
      exceptions: PUBLIC_AUTHORITY_APPROVED_EXCEPTIONS,
    });
    const legacy = analyzePublicAuthoritySurface({
      repoRoot,
      useLegacyEnumeratedDiscovery: true,
      exceptions: PUBLIC_AUTHORITY_APPROVED_EXCEPTIONS,
    });
    expect(legacy.exportedCallables.length).toBeLessThan(
      derived.exportedCallables.length,
    );
    expect(legacy.exportedCallables).not.toContain("authorizePreparedChange");
    expect(derived.exportedCallables).toContain("authorizePreparedChange");
    // Completeness assertion that public callable coverage is incomplete under legacy.
    const completenessGap =
      derived.exportedCallables.filter(
        (name) => !legacy.exportedCallables.includes(name),
      ).length > 0;
    expect(completenessGap).toBe(true);

    // Restore exact pre-corruption derived-analyzer candidate bytes (§1.5 B).
    writeFileSync(analyzerPath, readFileSync(backup));
    rmSync(backup, { force: true });
    expect(gitHashObject(analyzerRel)).toBe(preHash);

    const clean = analyzePublicAuthoritySurface({
      repoRoot,
      exceptions: PUBLIC_AUTHORITY_APPROVED_EXCEPTIONS,
    });
    expect(clean.findings).toEqual([]);
    expect(clean.exportedCallables).toContain("authorizePreparedChange");
    });
  },
    60_000,
  );
});
