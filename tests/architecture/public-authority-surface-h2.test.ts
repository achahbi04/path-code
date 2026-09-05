/**
 * Phase 3-R2-H2 permanent falsifications (H2-F1, H2-F3 … H2-F9).
 * H2-F2 is the generated matrix in public-authority-surface-matrix.test.ts.
 *
 * Added BESIDE R2's 2-F1…2-F7 and R2-H1's H1-F1…H1-F7 — no prior probe is
 * deleted or weakened (operator decision D6).
 *
 * RESTORATION DISCIPLINE: every corruption of a committed baseline file is
 * restored from a byte copy taken before the corruption and verified by Git
 * blob-hash equality in a `finally`.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { PUBLIC_AUTHORITY_APPROVED_EXCEPTIONS } from "./public-authority-approved-exceptions.js";
import { PUBLIC_AUTHORITY_REVIEWED_TERMINALS } from "./public-authority-reviewed-terminals.js";
import {
  analyzePublicAuthoritySurface,
  architectureTestsRepoRoot,
  clearRepositoryTypeScriptProgramCache,
  discoveredPublicRoots,
  loadRepositoryTypeScriptProgram,
  type PublicAuthorityAnalysis,
} from "./public-authority-surface-analyzer.js";
import { withPublicAuthoritySrcLock } from "./public-authority-src-lock.js";

const repoRoot = architectureTestsRepoRoot();

const TYPES_REL = "src/editing/types.ts";
const BARREL_REL = "src/editing/index.ts";

const OPTIONS_NEEDLE =
  "export type AuthorizePreparedChangeOptions = {\n  readonly gitContext?: GitStateBaseline;\n};";

/** A deliberately NEUTRAL name, so the mechanism-name rule cannot mask the call-signature rule. */
const OPTIONAL_CALLABLE =
  "export type AuthorizePreparedChangeOptions = {\n  readonly gitContext?: GitStateBaseline;\n  readonly quill?: (message: string) => string;\n};";

const SYMBOL_KEYED_CALLABLE =
  "export declare const tideKey: unique symbol;\n\nexport type AuthorizePreparedChangeOptions = {\n  readonly gitContext?: GitStateBaseline;\n  readonly [tideKey]: (message: string) => string;\n};";

const OBJECT_VALUED_EXPORT =
  "\nexport const marbleSurface = {\n  invoke: (message: string): string => message,\n};\n";

function gitHashObject(relativePath: string): string {
  return execFileSync("git", ["hash-object", relativePath], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
}

/** Corrupt a committed baseline file, run `body`, then restore and prove blob equality. */
function withCorruptedBaseline<T>(
  relativePath: string,
  corrupt: (original: string) => string,
  body: (context: { readonly originalBlob: string }) => T,
): T {
  return withPublicAuthoritySrcLock(() => {
    const absolute = join(repoRoot, relativePath);
    const originalBlob = gitHashObject(relativePath);
    const originalBytes = readFileSync(absolute);
    const originalText = originalBytes.toString("utf8");
    try {
      writeFileSync(absolute, corrupt(originalText), "utf8");
      clearRepositoryTypeScriptProgramCache();
      return body({ originalBlob });
    } finally {
      writeFileSync(absolute, originalBytes);
      clearRepositoryTypeScriptProgramCache();
      // Restoration is PROVEN, not assumed.
      expect(gitHashObject(relativePath)).toBe(originalBlob);
    }
  });
}

/** A clean-tree assertion MUST hold the src mutex — another suite may be corrupting. */
function expectRepositoryClean(): void {
  withPublicAuthoritySrcLock(() => {
    expect(analyzeRepository().findings).toEqual([]);
  });
}

function analyzeRepository(
  overrides: Partial<Parameters<typeof analyzePublicAuthoritySurface>[0]> = {},
): PublicAuthorityAnalysis {
  return analyzePublicAuthoritySurface({
    repoRoot,
    exceptions: PUBLIC_AUTHORITY_APPROVED_EXCEPTIONS,
    ...overrides,
  });
}

function manifestDigest(analysis: PublicAuthorityAnalysis): string {
  return createHash("sha256").update(JSON.stringify(analysis.manifest)).digest("hex");
}

function completenessFailures(
  analysis: PublicAuthorityAnalysis,
): readonly string[] {
  return analysis.nodeCompleteness
    .filter((n) => n.checkerMemberCount !== n.manifestedMemberCount)
    .map(
      (n) =>
        `${n.exportName}#${n.parameterName}#${n.typePath}#${n.memberPath}: checker=${n.checkerMemberCount} manifested=${n.manifestedMemberCount}`,
    );
}

/** Value exports of the barrel, derived independently of the analyzer. */
function barrelValueExportNames(): readonly string[] {
  const program = loadRepositoryTypeScriptProgram(repoRoot);
  const checker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(join(repoRoot, BARREL_REL));
  if (sourceFile === undefined) {
    throw new Error("barrel not in program");
  }
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  if (moduleSymbol === undefined) {
    throw new Error("no module symbol for barrel");
  }
  return checker
    .getExportsOfModule(moduleSymbol)
    .filter((symbol) => {
      const resolved =
        symbol.flags & ts.SymbolFlags.Alias
          ? checker.getAliasedSymbol(symbol)
          : symbol;
      return (resolved.flags & ts.SymbolFlags.Value) !== 0;
    })
    .map((symbol) => symbol.getName())
    .sort();
}

describe(
  "public authority surface — R2-H2 member-shape completeness proofs",
  { timeout: 300_000 },
  () => {
    // -----------------------------------------------------------------
    // H2-F1 — THE THREE FINDINGS ON THE REAL PUBLIC SURFACE
    // -----------------------------------------------------------------

    it("H2-F1(a) — optional callable on the real AuthorizePreparedChangeOptions MUST fail", () => {
      withCorruptedBaseline(
        TYPES_REL,
        (original) => {
          expect(original.includes(OPTIONS_NEEDLE)).toBe(true);
          return original.replace(OPTIONS_NEEDLE, OPTIONAL_CALLABLE);
        },
        () => {
          const analysis = analyzeRepository();
          const hit = analysis.findings.find(
            (f) =>
              f.functionName === "authorizePreparedChange" &&
              f.parameterName === "options" &&
              f.typeName === "AuthorizePreparedChangeOptions" &&
              f.memberPath.includes("quill"),
          );
          // MUST FAIL, naming function, parameter, type and member path.
          expect(hit).toBeDefined();
          expect(hit?.reason).toMatch(/user-defined call signature/);
          expect(
            analysis.dispositions.some(
              (d) =>
                d.disposition === "CALLABLE_REJECTED" &&
                d.memberPath.includes("quill"),
            ),
          ).toBe(true);
          expect(
            analysis.manifest.some((m) => m.memberPath.includes("quill")),
          ).toBe(true);
        },
      );
      // And the clean tree is clean again.
      expectRepositoryClean();
    });

    it("H2-F1(b) — unique-symbol-keyed callable on the real options type MUST fail", () => {
      const cleanDigest = withPublicAuthoritySrcLock(() =>
        manifestDigest(analyzeRepository()),
      );
      withCorruptedBaseline(
        TYPES_REL,
        (original) => original.replace(OPTIONS_NEEDLE, SYMBOL_KEYED_CALLABLE),
        () => {
          const analysis = analyzeRepository();
          const hit = analysis.findings.find(
            (f) =>
              f.functionName === "authorizePreparedChange" &&
              f.parameterName === "options" &&
              f.typeName === "AuthorizePreparedChangeOptions" &&
              f.memberPath.includes("#tideKey]"),
          );
          // Symbol members are named by DECLARATION IDENTITY, not escapedName.
          expect(hit).toBeDefined();
          expect(hit?.memberPath).toMatch(/@@\[src\/editing\/types\.ts#tideKey\]/);
          expect(
            analysis.manifest.some((m) => m.memberPath.includes("#tideKey]")),
          ).toBe(true);
          // The decisive property F-R1-005 had: the corrupted manifest is NO
          // LONGER byte-identical to the clean one.
          expect(manifestDigest(analysis)).not.toBe(cleanDigest);
        },
      );
      withPublicAuthoritySrcLock(() => {
        expect(manifestDigest(analyzeRepository())).toBe(cleanDigest);
      });
    });

    it("H2-F1(c) — object-valued export with a callable member MUST fail", () => {
      withCorruptedBaseline(
        BARREL_REL,
        (original) => original + OBJECT_VALUED_EXPORT,
        () => {
          const analysis = analyzeRepository();
          expect(
            analysis.exportDispositions.find(
              (d) => d.exportName === "marbleSurface",
            )?.disposition,
          ).toBe("OBJECT_SURFACE");
          expect(
            analysis.exportDispositions.find(
              (d) => d.exportName === "marbleSurface.invoke",
            )?.disposition,
          ).toBe("CALLABLE_ROOT");
          expect(analysis.exportedCallables).toContain("marbleSurface.invoke");
          const hit = analysis.findings.find(
            (f) =>
              f.functionName === "marbleSurface" &&
              f.memberPath.includes("invoke"),
          );
          expect(hit).toBeDefined();
          expect(hit?.reason).toMatch(/user-defined call signature/);
        },
      );
      expectRepositoryClean();
    });

    // -----------------------------------------------------------------
    // H2-F3 — PER-NODE COMPLETENESS
    // -----------------------------------------------------------------

    it("H2-F3 — restored `__@` skip and a dropped member both break per-node completeness", () => {
      // Baseline: the clean surface satisfies the identity for EVERY node.
      const clean = analyzeRepository();
      expect(completenessFailures(clean)).toEqual([]);
      expect(clean.nodeCompleteness.length).toBeGreaterThan(0);

      // (a) Restore the exact F-R1-005 name-pattern skip. The real public
      // surface carries a unique-symbol member (`editAuthorizationBrand` on
      // EditAuthorization), so the skip MUST break completeness with no
      // corruption of the tree at all.
      const skipped = analyzeRepository({ useLegacySymbolKeyedMemberSkip: true });
      const skipFailures = completenessFailures(skipped);
      expect(
        skipFailures.length,
        "restoring the __@ skip MUST fail per-node completeness",
      ).toBeGreaterThan(0);

      // (b) Withhold one censused member from the manifest.
      const victim = clean.manifest.find((m) => m.memberPath.length > 0);
      expect(victim).toBeDefined();
      const dropped = analyzeRepository({
        dropManifestedMemberPath: victim!.memberPath,
      });
      expect(
        completenessFailures(dropped).length,
        `withholding ${victim!.memberPath} MUST fail per-node completeness`,
      ).toBeGreaterThan(0);

      // Restored: the identity holds again.
      expect(completenessFailures(analyzeRepository())).toEqual([]);
    });

    // -----------------------------------------------------------------
    // H2-F4 — EXPORT COMPLETENESS
    // -----------------------------------------------------------------

    it("H2-F4 — restored export exclusion makes an object-valued export escape and fails export completeness", () => {
      withCorruptedBaseline(
        BARREL_REL,
        (original) => original + OBJECT_VALUED_EXPORT,
        () => {
          const valueExports = barrelValueExportNames();
          expect(valueExports).toContain("marbleSurface");

          // Default path: every value export is dispositioned.
          const corrected = analyzeRepository();
          const correctedNames = new Set(
            corrected.exportDispositions.map((d) => d.exportName),
          );
          for (const name of valueExports) {
            expect(
              correctedNames.has(name),
              `value export ${name} MUST be dispositioned`,
            ).toBe(true);
          }

          // Legacy path: the exact F-R1-006 exclusion, restored.
          const legacy = analyzeRepository({
            useLegacyCallableOnlyExportDiscovery: true,
          });
          const legacyNames = new Set(
            legacy.exportDispositions.map((d) => d.exportName),
          );
          expect(
            legacyNames.has("marbleSurface"),
            "under the restored exclusion the object export MUST escape",
          ).toBe(false);
          expect(legacy.exportedCallables).not.toContain("marbleSurface.invoke");
          expect(
            legacy.findings.some((f) => f.functionName.startsWith("marbleSurface")),
          ).toBe(false);

          // The export-completeness assertion itself MUST FAIL under legacy.
          const undispositioned = valueExports.filter(
            (name) => !legacyNames.has(name),
          );
          expect(
            undispositioned,
            "export completeness MUST fail under the restored exclusion",
          ).not.toEqual([]);
        },
      );
      expectRepositoryClean();
    });

    // -----------------------------------------------------------------
    // H2-F5 — CACHE FRESHNESS, SAME PROCESS, BOTH DIRECTIONS
    // -----------------------------------------------------------------

    it("H2-F5 — content-hash cache is fresh in both directions with size+mtime preserved and NO clear call", () => {
      withPublicAuthoritySrcLock(() => {
        const absolute = join(repoRoot, TYPES_REL);
        const originalBlob = gitHashObject(TYPES_REL);
        const originalBytes = readFileSync(absolute);
        const originalText = originalBytes.toString("utf8");

        // Same LENGTH replacement so the file size cannot change. The needle
        // is the UNIQUE AuthorizePreparedChangeOptions block — the bare
        // `gitContext` line also occurs on result types that are not on any
        // public parameter graph, where a change would be invisible by design.
        const fromLine = "  readonly gitContext?: GitStateBaseline;";
        const toCore = "  readonly q?: (m: string) => string;";
        const toLine = toCore + " ".repeat(fromLine.length - toCore.length);
        expect(toLine.length).toBe(fromLine.length);
        const from = OPTIONS_NEEDLE;
        const to = OPTIONS_NEEDLE.replace(fromLine, toLine);
        expect(to.length).toBe(from.length);
        expect(originalText.split(from).length - 1).toBe(1);

        try {
          // Warm the cache on the clean tree.
          clearRepositoryTypeScriptProgramCache();
          const warm = analyzeRepository();
          expect(warm.findings).toEqual([]);

          const before = statSync(absolute);

          // ---- direction 1: corruption MUST be observed, no clear call ----
          writeFileSync(absolute, originalText.replace(from, to), "utf8");
          utimesSync(absolute, before.atime, before.mtime);
          const corruptedStat = statSync(absolute);
          expect(corruptedStat.size, "size MUST be preserved").toBe(before.size);
          // utimesSync round-trips millisecond precision; compare the
          // ms-truncated Date, which is the granularity any mtime-based cache
          // would observe.
          expect(
            corruptedStat.mtime.getTime(),
            "mtime MUST be preserved",
          ).toBe(before.mtime.getTime());

          const detected = analyzeRepository();
          expect(
            detected.findings.some((f) => f.memberPath.includes("q")),
            "a content change MUST invalidate the cache with no explicit clear",
          ).toBe(true);

          // ---- direction 2: restoration MUST be observed, no clear call ----
          writeFileSync(absolute, originalBytes);
          utimesSync(absolute, before.atime, before.mtime);
          const restoredStat = statSync(absolute);
          expect(restoredStat.size).toBe(before.size);
          expect(restoredStat.mtime.getTime()).toBe(before.mtime.getTime());

          const cleanAgain = analyzeRepository();
          expect(
            cleanAgain.findings,
            "restoration MUST be observed with no explicit clear",
          ).toEqual([]);
        } finally {
          writeFileSync(absolute, originalBytes);
          clearRepositoryTypeScriptProgramCache();
          expect(gitHashObject(TYPES_REL)).toBe(originalBlob);
        }
      });
    });

    // -----------------------------------------------------------------
    // H2-F6 — CWD INDEPENDENCE
    // -----------------------------------------------------------------

    it("H2-F6 — full manifest SHA-256 is identical from the repository root and from a temporary directory", () => {
      const entryCwd = process.cwd();
      try {
        process.chdir(repoRoot);
        clearRepositoryTypeScriptProgramCache();
        const fromRoot = analyzeRepository();

        process.chdir(tmpdir());
        // Force a NEW Program to be constructed while cwd is elsewhere —
        // otherwise the cached Program would make this vacuous.
        clearRepositoryTypeScriptProgramCache();
        const fromElsewhere = analyzeRepository();

        expect(manifestDigest(fromElsewhere)).toBe(manifestDigest(fromRoot));
        expect(fromElsewhere.findings).toEqual(fromRoot.findings);
        expect(fromElsewhere.dispositions.length).toBe(fromRoot.dispositions.length);
        expect(fromElsewhere.exportedCallables).toEqual(fromRoot.exportedCallables);
        expect(fromElsewhere.findings).toEqual([]);
      } finally {
        process.chdir(entryCwd);
        clearRepositoryTypeScriptProgramCache();
      }
    });

    // -----------------------------------------------------------------
    // H2-F7 — THE BAD IMPLEMENTATIONS, RESTORED (THE DECISIVE PROOF)
    // -----------------------------------------------------------------

    it("H2-F7(a) — restoring the un-unwrapped member check makes the optional callable escape", () => {
      withCorruptedBaseline(
        TYPES_REL,
        (original) => original.replace(OPTIONS_NEEDLE, OPTIONAL_CALLABLE),
        () => {
          // Corrected: detected.
          expect(
            analyzeRepository().findings.some((f) =>
              f.memberPath.includes("quill"),
            ),
          ).toBe(true);
          // The 328f6fc member-handling shape, reconstructed faithfully:
          // the un-unwrapped classification AND no node-level own-signature
          // census (which did not exist before R2-H2). MUST escape.
          const legacy = analyzeRepository({
            useLegacyUnUnwrappedMemberCallableCheck: true,
            useLegacyNoOwnSignatureCensus: true,
          });
          expect(
            legacy.findings.some((f) => f.memberPath.includes("quill")),
            "under the restored 328f6fc shape the optional callable MUST escape",
          ).toBe(false);
          expect(
            legacy.dispositions.some(
              (d) =>
                d.disposition === "CALLABLE_REJECTED" &&
                d.memberPath.includes("quill"),
            ),
          ).toBe(false);
          // The member is still manifested — F-R1-004 was ONLY a classification
          // defect, exactly as the 1.1(a) reproduction showed.
          expect(
            legacy.manifest.some((m) => m.memberPath.includes("quill")),
          ).toBe(true);

          // DEFENCE IN DEPTH, recorded rather than assumed: restoring ONLY the
          // un-unwrapped classification is NOT sufficient to make the callable
          // escape, because the node-level own-signature census added by R2-H2
          // independently rejects it at `quill#call(0)`. Two mechanisms now
          // have to fail together for this shape to get through.
          const classificationOnly = analyzeRepository({
            useLegacyUnUnwrappedMemberCallableCheck: true,
          });
          expect(
            classificationOnly.dispositions.some(
              (d) =>
                d.disposition === "CALLABLE_REJECTED" &&
                d.memberPath === "quill",
            ),
            "member-level classification MUST escape under the restored check",
          ).toBe(false);
          expect(
            classificationOnly.dispositions.some(
              (d) =>
                d.disposition === "CALLABLE_REJECTED" &&
                d.memberPath === "quill#call(0)",
            ),
            "the node-level own-signature census MUST still catch it",
          ).toBe(true);
        },
      );
      expectRepositoryClean();
    });

    it("H2-F7(b) — restoring the `__@` skip makes the symbol-keyed callable escape and breaks completeness", () => {
      withCorruptedBaseline(
        TYPES_REL,
        (original) => original.replace(OPTIONS_NEEDLE, SYMBOL_KEYED_CALLABLE),
        () => {
          expect(
            analyzeRepository().findings.some((f) =>
              f.memberPath.includes("#tideKey]"),
            ),
          ).toBe(true);
          const legacy = analyzeRepository({
            useLegacySymbolKeyedMemberSkip: true,
          });
          expect(
            legacy.findings.some((f) => f.memberPath.includes("#tideKey]")),
            "under the restored __@ skip the symbol-keyed callable MUST escape",
          ).toBe(false);
          expect(
            legacy.manifest.some((m) => m.memberPath.includes("#tideKey]")),
            "and it MUST be absent from the manifest — the F-R1-005 blindness",
          ).toBe(false);
          expect(
            completenessFailures(legacy).length,
            "H2-F3 completeness MUST fail under the restored skip",
          ).toBeGreaterThan(0);
        },
      );
      expectRepositoryClean();
    });

    it("H2-F7(c) — restoring the export exclusion makes the object-valued export escape", () => {
      withCorruptedBaseline(
        BARREL_REL,
        (original) => original + OBJECT_VALUED_EXPORT,
        () => {
          expect(analyzeRepository().exportedCallables).toContain(
            "marbleSurface.invoke",
          );
          const legacy = analyzeRepository({
            useLegacyCallableOnlyExportDiscovery: true,
          });
          expect(
            legacy.exportedCallables,
            "under the restored exclusion the object export MUST escape",
          ).not.toContain("marbleSurface.invoke");
          expect(
            legacy.exportDispositions.some(
              (d) => d.exportName === "marbleSurface",
            ),
          ).toBe(false);
        },
      );
      expectRepositoryClean();
    });

    // -----------------------------------------------------------------
    // H2-F8 — FALSE-POSITIVE CONTROL
    // -----------------------------------------------------------------

    it("H2-F8 — clean surface: 0 findings, one reviewed terminal, legitimate members preserved", () => {
      const analysis = analyzeRepository();

      expect(analysis.findings, "clean public surface MUST produce no findings").toEqual(
        [],
      );
      expect(
        analysis.dispositions.some((d) => d.disposition === "CALLABLE_REJECTED"),
      ).toBe(false);
      expect(
        analysis.dispositions.some(
          (d) => d.disposition === "UNSAFE_ESCAPE_REJECTED",
        ),
      ).toBe(false);

      // WorkspaceBoundary is still the only reviewed terminal.
      expect(PUBLIC_AUTHORITY_REVIEWED_TERMINALS).toHaveLength(1);
      expect(PUBLIC_AUTHORITY_REVIEWED_TERMINALS[0]?.symbolName).toBe(
        "WorkspaceBoundary",
      );

      // Every existing optional non-callable member is manifested and NOT rejected.
      const gitContextRows = analysis.manifest.filter((m) =>
        m.memberPath.includes("gitContext"),
      );
      expect(gitContextRows.length).toBeGreaterThan(0);
      expect(
        analysis.dispositions.some(
          (d) =>
            d.disposition === "CALLABLE_REJECTED" &&
            d.memberPath.includes("gitContext"),
        ),
      ).toBe(false);

      // The real unique-symbol brand member is now VISIBLE — it was invisible
      // before F-R1-005 was corrected — and is correctly non-rejected.
      const brandRows = analysis.manifest.filter((m) =>
        m.memberPath.includes("#editAuthorizationBrand]"),
      );
      expect(
        brandRows.length,
        "the real symbol-keyed brand member MUST be manifested",
      ).toBeGreaterThan(0);
      expect(
        analysis.dispositions.some(
          (d) =>
            d.disposition === "CALLABLE_REJECTED" &&
            d.memberPath.includes("#editAuthorizationBrand]"),
        ),
      ).toBe(false);

      // External library graphs terminate rather than being walked as project types.
      expect(
        analysis.dispositions.some(
          (d) => d.disposition === "EXTERNAL_LIBRARY_TERMINAL",
        ),
      ).toBe(true);

      // Root discovery is unchanged by this pass.
      expect(discoveredPublicRoots(analysis)).toHaveLength(28);

      // Per-node completeness holds everywhere on the clean surface.
      expect(completenessFailures(analysis)).toEqual([]);
    });

    // -----------------------------------------------------------------
    // H2-F9 — PREVIOUS PROOFS PRESERVED
    // -----------------------------------------------------------------

    it("H2-F9 — every prior probe is preserved and the historical escapes still reproduce", () => {
      // No prior probe deleted or weakened: each identifier is still present in
      // its committed suite.
      const derived = readFileSync(
        join(repoRoot, "tests/architecture/public-authority-surface-derived.test.ts"),
        "utf8",
      );
      for (const probe of ["2-F1", "2-F2", "2-F3", "2-F4", "2-F5", "2-F6", "2-F7"]) {
        expect(derived, `${probe} MUST still exist`).toContain(probe);
      }
      const h1 = readFileSync(
        join(repoRoot, "tests/architecture/public-authority-surface-h1.test.ts"),
        "utf8",
      );
      for (const probe of [
        "H1-F1",
        "H1-F2",
        "H1-F3",
        "H1-F4",
        "H1-F5",
        "H1-F6",
        "H1-F7",
      ]) {
        expect(h1, `${probe} MUST still exist`).toContain(probe);
      }

      // The historical falsification switches still reproduce their escapes.
      const legacyEnumerated = analyzeRepository({
        useLegacyEnumeratedDiscovery: true,
      });
      expect(
        legacyEnumerated.exportedCallables.includes("authorizePreparedChange"),
        "2-F7: legacy enumerated discovery still misses the options type",
      ).toBe(false);

      const legacyNamingGate = analyzeRepository({ useLegacyNamingGate: true });
      expect(
        legacyNamingGate.dispositions.filter((d) => d.memberPath === "").length,
        "H1-F7: the restored R2 naming gate still leaves roots uninspected",
      ).toBeLessThan(
        analyzeRepository().dispositions.filter((d) => d.memberPath === "").length,
      );

      // A-F19(b), the first auditor's exact corruption, still fails.
      withCorruptedBaseline(
        TYPES_REL,
        (original) =>
          original.replace(
            OPTIONS_NEEDLE,
            "export type AuthorizePreparedChangeOptions = {\n  readonly gitContext?: GitStateBaseline;\n  readonly authorityOps?: { readonly issue: (input: unknown) => unknown };\n};",
          ),
        () => {
          const analysis = analyzeRepository();
          expect(
            analysis.findings.some(
              (f) =>
                f.functionName === "authorizePreparedChange" &&
                f.typeName === "AuthorizePreparedChangeOptions" &&
                f.memberPath.includes("authorityOps"),
            ),
          ).toBe(true);
        },
      );
      expectRepositoryClean();
    });
  },
);
