/**
 * H2-F2 — THE GENERATED MATRIX (Phase 3-R2-H2 §1.9).
 *
 * Every cell required by the contract's CELL SELECTION is generated from the
 * committed reviewed dimension table and analyzed by the canonical analyzer.
 * Cell identity appears in every assertion message, so a failure names the cell.
 *
 * Added BESIDE 2-F1…2-F7 and H1-F1…H1-F7 — no prior probe is deleted or weakened.
 */

import { describe, expect, it } from "vitest";

import {
  PUBLIC_AUTHORITY_SURFACE_DIMENSIONS,
  dimensionValueIds,
} from "./public-authority-surface-dimensions.js";
import {
  analyzeCell,
  cellIdentity,
  expectedNeedles,
  groupACells,
  groupBCells,
  groupCCells,
  groupDCells,
  groupECells,
  runMatrix,
  uncoveredPairsAfter,
  type Cell,
  type CellGroup,
} from "./public-authority-surface-matrix.js";

/** The reviewed table shape the contract's cell arithmetic depends on. */
const REVIEWED_VALUE_COUNTS: Record<string, number> = {
  "DIM-1": 5,
  "DIM-2": 6,
  "DIM-3": 10,
  "DIM-4": 16,
  "DIM-5": 2,
  "DIM-6": 3,
  "DIM-7": 3,
};

/**
 * The ONE reason any cell in this matrix is inexpressible. Recorded, counted and
 * justified — never silently omitted (contract CELL SELECTION, final paragraph).
 */
const METHOD_NULLISH_REASON =
  "a method signature declares its own type and cannot be unioned with null/undefined at the declaration site (DIM-1 explicit-nullish x DIM-3 method)";

function assertSeededCallableRejected(
  group: CellGroup,
  cells: readonly Cell[],
  expectedTotal: number,
  expectedInexpressible: number,
): void {
  expect(cells.length, `group ${group} cell count`).toBe(expectedTotal);
  const run = runMatrix(cells);

  // Every inexpressible cell carries an explicit reason.
  for (const outcome of run.inexpressible) {
    expect(outcome.reason, `${outcome.identity} inexpressible reason`).toBeTruthy();
    expect(outcome.reason, `${outcome.identity} unexpected inexpressible reason`).toBe(
      METHOD_NULLISH_REASON,
    );
  }
  expect(
    run.inexpressible.length,
    `group ${group} INEXPRESSIBLE count`,
  ).toBe(expectedInexpressible);
  expect(run.expressible.length + run.inexpressible.length).toBe(expectedTotal);

  for (const built of run.expressible) {
    const identity = cellIdentity(built.cell);
    const analysis = analyzeCell(built, run.program);
    const needles = expectedNeedles(built);

    const manifested = analysis.manifest.some((row) =>
      row.memberPath.includes(built.keyNeedle),
    );
    expect(manifested, `${identity} seeded member MUST be manifested`).toBe(true);

    const rejected = analysis.dispositions.filter(
      (d) => d.disposition === "CALLABLE_REJECTED",
    );
    const atExpectedPath = rejected.some((d) =>
      needles.every((needle) => d.memberPath.includes(needle)),
    );
    expect(
      atExpectedPath,
      `${identity} MUST emit CALLABLE_REJECTED at a path carrying ${JSON.stringify(needles)}; got ${JSON.stringify(rejected.map((d) => d.memberPath))}`,
    ).toBe(true);

    expect(
      analysis.findings.length,
      `${identity} MUST produce at least one finding`,
    ).toBeGreaterThan(0);

    // Per-node completeness holds for every generated node too.
    const mismatched = analysis.nodeCompleteness.filter(
      (n) => n.checkerMemberCount !== n.manifestedMemberCount,
    );
    expect(
      mismatched,
      `${identity} per-node completeness MUST hold`,
    ).toEqual([]);
  }
}

describe(
  "public authority surface — R2-H2 generated falsification matrix (H2-F2)",
  { timeout: 300_000 },
  () => {
    it("the committed dimension table is the reviewed table — no dimension or value removed", () => {
      expect(PUBLIC_AUTHORITY_SURFACE_DIMENSIONS).toHaveLength(7);
      for (const dimension of PUBLIC_AUTHORITY_SURFACE_DIMENSIONS) {
        const expected = REVIEWED_VALUE_COUNTS[dimension.id];
        expect(expected, `unknown dimension ${dimension.id}`).toBeDefined();
        expect(
          dimension.values.length,
          `${dimension.id} value count MUST match the reviewed table (D5: values may be added, never removed)`,
        ).toBe(expected);
        expect(dimension.title.length).toBeGreaterThan(0);
        for (const value of dimension.values) {
          expect(value.id.length).toBeGreaterThan(0);
          expect(value.reviewedText.length).toBeGreaterThan(0);
        }
      }
      // The contract's cell arithmetic, derived rather than transcribed.
      expect(
        dimensionValueIds("DIM-1").length *
          dimensionValueIds("DIM-2").length *
          dimensionValueIds("DIM-3").length,
      ).toBe(300);
      expect(
        dimensionValueIds("DIM-4").length * 2 * 2 * 2,
      ).toBe(128);
      expect(dimensionValueIds("DIM-7").length * 2 * 2).toBe(12);
    });

    it("H2-F2 group A — full DIM-1 x DIM-2 x DIM-3 cross-product (300 cells)", () => {
      assertSeededCallableRejected("A", groupACells(), 300, 18);
    });

    it("H2-F2 group B — every DIM-4 placement (128 cells)", () => {
      assertSeededCallableRejected("B", groupBCells(), 128, 0);
    });

    it("H2-F2 group C — every DIM-7 root kind (12 cells)", () => {
      assertSeededCallableRejected("C", groupCCells(), 12, 0);
    });

    it("H2-F2 group D — pairwise covering array over ALL seven dimensions", () => {
      const cells = groupDCells();
      // The covering property itself is asserted, not assumed.
      expect(
        uncoveredPairsAfter(cells),
        "every pair of values from any two dimensions MUST appear in at least one cell",
      ).toEqual([]);
      assertSeededCallableRejected("D", cells, cells.length, 14);
    });

    it("H2-F2 group E — non-callable controls MUST NOT be rejected (300 cells)", () => {
      const cells = groupECells();
      expect(cells).toHaveLength(300);
      const run = runMatrix(cells);
      expect(run.inexpressible, "group E controls are all expressible").toEqual([]);

      for (const built of run.expressible) {
        const identity = cellIdentity(built.cell);
        const analysis = analyzeCell(built, run.program);

        expect(
          analysis.findings,
          `${identity} control MUST produce zero findings`,
        ).toEqual([]);

        const manifested = analysis.manifest.some((row) =>
          row.memberPath.includes(built.keyNeedle),
        );
        expect(
          manifested,
          `${identity} control member MUST still be manifested`,
        ).toBe(true);

        const wronglyRejected = analysis.dispositions.some(
          (d) =>
            d.disposition === "CALLABLE_REJECTED" &&
            d.memberPath.includes(built.keyNeedle),
        );
        expect(
          wronglyRejected,
          `${identity} control member MUST NOT be CALLABLE_REJECTED`,
        ).toBe(false);

        const mismatched = analysis.nodeCompleteness.filter(
          (n) => n.checkerMemberCount !== n.manifestedMemberCount,
        );
        expect(mismatched, `${identity} per-node completeness`).toEqual([]);
      }
    });
  },
);
