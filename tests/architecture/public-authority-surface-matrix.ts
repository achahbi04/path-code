/**
 * GENERATED FALSIFICATION MATRIX — Phase 3-R2-H2 §1.8 / GAP-065.
 *
 * Fixtures are GENERATED from the committed reviewed dimension table
 * (public-authority-surface-dimensions.ts), never hand-written. Every cell is
 * built as an IN-MEMORY virtual source overlay added to a TypeScript Program —
 * no disk writes — and analyzed by THE CANONICAL ANALYZER
 * (analyzePublicAuthoritySurface). There is no second rule set.
 *
 * Cell identity (every dimension value) is carried into every assertion message,
 * so a failure names the cell that produced it.
 *
 * Expressibility is decided by the TypeScript COMPILER, not by the author's
 * judgement: a cell whose generated source produces a diagnostic, or whose shape
 * TypeScript cannot express at all, is recorded INEXPRESSIBLE with the exact
 * reason and is never silently omitted.
 */

import ts from "typescript";

import {
  analyzePublicAuthoritySurface,
  type PublicAuthorityAnalysis,
} from "./public-authority-surface-analyzer.js";
import {
  CONTROL_NON_CALLABLE_TYPES,
  dimensionValueIds,
} from "./public-authority-surface-dimensions.js";

export const VIRTUAL_ROOT = "/pathcode-matrix";

export type CellGroup = "A" | "B" | "C" | "D" | "E";

export type Cell = Readonly<{
  readonly group: CellGroup;
  readonly index: number;
  readonly dim1: string;
  readonly dim2: string;
  readonly dim3: string;
  readonly dim4: string;
  readonly dim5: string;
  readonly dim6: string;
  readonly dim7: string;
  /** Group E only: the non-callable type standing in for DIM-3. */
  readonly controlType?: string;
}>;

export type BuiltCell = Readonly<{
  readonly cell: Cell;
  readonly fileName: string;
  readonly source: string;
  /** Manifest/disposition needle identifying the seeded member key. */
  readonly keyNeedle: string;
  /** Additional needle for containment forms (getter / nested object). */
  readonly innerNeedle: string | undefined;
  /** True when DIM-5 could be applied to this member form. */
  readonly dim5Applied: boolean;
  /** Set when TypeScript cannot express this cell at all. */
  readonly structurallyInexpressible: string | undefined;
}>;

export type CellOutcome = Readonly<{
  readonly cell: Cell;
  readonly identity: string;
  readonly status: "PASS" | "INEXPRESSIBLE";
  readonly reason?: string;
}>;

export function cellIdentity(cell: Cell): string {
  return (
    `[${cell.group}#${cell.index} ` +
    `DIM-1=${cell.dim1} DIM-2=${cell.dim2} DIM-3=${cell.dim3} ` +
    `DIM-4=${cell.dim4} DIM-5=${cell.dim5} DIM-6=${cell.dim6} DIM-7=${cell.dim7}` +
    (cell.controlType !== undefined ? ` CONTROL=${cell.controlType}` : "") +
    `]`
  );
}

// ---------------------------------------------------------------------------
// SOURCE CONSTRUCTION
// ---------------------------------------------------------------------------

const NAME_BY_DIM6: Record<string, string> = {
  "mechanism-keyword": "authorityOps",
  neutral: "quill",
  "single-letter": "q",
};

type KeyShape = {
  readonly preamble: string;
  readonly keyText: string;
  readonly needle: string;
};

function keyShape(dim2: string, name: string): KeyShape {
  switch (dim2) {
    case "identifier":
      return { preamble: "", keyText: name, needle: name };
    case "string-literal":
      // One key carrying all three reviewed sub-variants at once: quoted, a
      // space in the key, and the adversarial `__@` prefix as a PLAIN STRING.
      return {
        preamble: "",
        keyText: `"__@${name} tide"`,
        needle: `__@${name} tide`,
      };
    case "numeric-literal":
      return { preamble: "", keyText: "42", needle: "42" };
    case "well-known-symbol":
      return {
        preamble: "",
        keyText: "[Symbol.iterator]",
        needle: "#iterator]",
      };
    case "unique-symbol":
      return {
        preamble: `declare const ${name}Key: unique symbol;\n`,
        keyText: `[${name}Key]`,
        needle: `#${name}Key]`,
      };
    case "computed-const-string":
      return {
        preamble: `declare const ${name}Const: "${name}-computed";\n`,
        keyText: `[${name}Const]`,
        needle: `${name}-computed`,
      };
    default:
      throw new Error(`unknown DIM-2 value ${dim2}`);
  }
}

/** Wrap a member TYPE according to DIM-1. Function types are parenthesized. */
function wrapNullish(dim1: string, typeText: string): string {
  switch (dim1) {
    case "required":
    case "optional":
      return typeText;
    case "explicit-undefined":
      return `(${typeText}) | undefined`;
    case "explicit-null":
      return `(${typeText}) | null`;
    case "explicit-null-undefined":
      return `(${typeText}) | null | undefined`;
    default:
      throw new Error(`unknown DIM-1 value ${dim1}`);
  }
}

const INNER_TYPE_NAME = "CellInner";
const INNER_MEMBER_NAME = "inner";

type MemberShape = {
  readonly preamble: string;
  readonly memberText: string;
  readonly innerNeedle: string | undefined;
  readonly dim5Applied: boolean;
  readonly structurallyInexpressible: string | undefined;
};

function memberShape(cell: Cell, key: KeyShape): MemberShape {
  const optional = cell.dim1 === "optional" ? "?" : "";
  const wantReadonly = cell.dim5 === "readonly";
  const ro = wantReadonly ? "readonly " : "";

  // Group E: the seeded member type is deliberately NON-callable.
  if (cell.group === "E") {
    const control = cell.controlType ?? "string";
    return {
      preamble: "",
      memberText: `  ${ro}${key.keyText}${optional}: ${wrapNullish(cell.dim1, control)};`,
      innerNeedle: undefined,
      dim5Applied: true,
      structurallyInexpressible: undefined,
    };
  }

  const property = (typeText: string): MemberShape => ({
    preamble: "",
    memberText: `  ${ro}${key.keyText}${optional}: ${wrapNullish(cell.dim1, typeText)};`,
    innerNeedle: undefined,
    dim5Applied: true,
    structurallyInexpressible: undefined,
  });

  // Containment forms: the carrier member is an ordinary property whose TYPE
  // carries the callable shape. Every DIM-1 / DIM-2 / DIM-5 value therefore
  // remains expressible for these forms.
  const contained = (
    innerDeclaration: string,
    innerNeedle: string | undefined,
  ): MemberShape => ({
    preamble: innerDeclaration,
    memberText: `  ${ro}${key.keyText}${optional}: ${wrapNullish(cell.dim1, INNER_TYPE_NAME)};`,
    innerNeedle,
    dim5Applied: true,
    structurallyInexpressible: undefined,
  });

  switch (cell.dim3) {
    case "property-fn":
      return property("(m: string) => string");
    case "method": {
      // A method signature declares its own type; TypeScript provides no way to
      // union it with null/undefined at the declaration site, and `readonly` is
      // not permitted on a method. Both facts are recorded, never hidden.
      if (cell.dim1 !== "required" && cell.dim1 !== "optional") {
        return {
          preamble: "",
          memberText: "",
          innerNeedle: undefined,
          dim5Applied: false,
          structurallyInexpressible:
            "a method signature declares its own type and cannot be unioned with null/undefined at the declaration site (DIM-1 explicit-nullish x DIM-3 method)",
        };
      }
      return {
        preamble: "",
        memberText: `  ${key.keyText}${optional}(m: string): string;`,
        innerNeedle: undefined,
        // `readonly` is not permitted on a method signature (TS1024).
        dim5Applied: !wantReadonly,
        structurallyInexpressible: undefined,
      };
    }
    case "construct-property":
      return property("new (m: string) => ProjectDataObject");
    case "call-signature-on-type":
      return contained(
        `interface ${INNER_TYPE_NAME} {\n  (m: string): string;\n}\n`,
        undefined,
      );
    case "construct-signature-on-type":
      return contained(
        `interface ${INNER_TYPE_NAME} {\n  new (m: string): ProjectDataObject;\n}\n`,
        undefined,
      );
    case "callable-index-signature":
      return contained(
        `interface ${INNER_TYPE_NAME} {\n  [k: string]: (m: string) => string;\n}\n`,
        undefined,
      );
    case "callable-getter":
      return contained(
        `interface ${INNER_TYPE_NAME} {\n  get ${INNER_MEMBER_NAME}(): (m: string) => string;\n}\n`,
        INNER_MEMBER_NAME,
      );
    case "overloaded-fn":
      return property("{ (m: string): string; (m: number): string }");
    case "generic-fn":
      return property("<T>(m: T) => T");
    case "nested-fn-in-object":
      return contained(
        `interface ${INNER_TYPE_NAME} {\n  readonly ${INNER_MEMBER_NAME}: (m: string) => string;\n}\n`,
        INNER_MEMBER_NAME,
      );
    default:
      throw new Error(`unknown DIM-3 value ${cell.dim3}`);
  }
}

const CARRIER = "CellCarrier";

/** DIM-4: how the carrier is reached from the public parameter. */
function placement(dim4: string): {
  readonly declarations: string;
  readonly parameterType: string;
  readonly restParameter: boolean;
  readonly secondOverload: boolean;
} {
  const plain = (declarations: string, parameterType: string) => ({
    declarations,
    parameterType,
    restParameter: false,
    secondOverload: false,
  });
  switch (dim4) {
    case "top-level":
      return plain("", CARRIER);
    case "nested-depth-1":
      return plain(
        `interface CellParam {\n  readonly nest1: ${CARRIER};\n}\n`,
        "CellParam",
      );
    case "nested-depth-3":
      return plain(
        `interface CellParam {\n  readonly n1: { readonly n2: { readonly n3: ${CARRIER} } };\n}\n`,
        "CellParam",
      );
    case "union-constituent":
      return plain(`type CellParam = ProjectDataObject | ${CARRIER};\n`, "CellParam");
    case "intersection-constituent":
      return plain(`type CellParam = ProjectDataObject & ${CARRIER};\n`, "CellParam");
    case "array-element":
      return plain(
        `interface CellParam {\n  readonly items: ${CARRIER}[];\n}\n`,
        "CellParam",
      );
    case "readonly-array-element":
      return plain(
        `interface CellParam {\n  readonly items: readonly ${CARRIER}[];\n}\n`,
        "CellParam",
      );
    case "tuple-element":
      return plain(
        `interface CellParam {\n  readonly items: readonly [string, ${CARRIER}];\n}\n`,
        "CellParam",
      );
    case "project-generic-argument":
      return plain(
        `interface CellBox<T> {\n  readonly value: T;\n}\ninterface CellParam {\n  readonly boxed: CellBox<${CARRIER}>;\n}\n`,
        "CellParam",
      );
    case "external-generic-argument":
      return plain(
        `interface CellParam {\n  readonly promised: Promise<${CARRIER}>;\n  readonly listed: ReadonlyArray<${CARRIER}>;\n  readonly mapped: Map<string, ${CARRIER}>;\n  readonly recorded: Record<string, ${CARRIER}>;\n  readonly partial: Partial<${CARRIER}>;\n  readonly frozen: Readonly<${CARRIER}>;\n}\n`,
        "CellParam",
      );
    case "interface-extends":
      return plain(`interface CellParam extends ${CARRIER} {}\n`, "CellParam");
    case "alias-chain":
      return plain(
        `type CellA1 = ${CARRIER};\ntype CellA2 = CellA1;\ntype CellA3 = CellA2;\n`,
        "CellA3",
      );
    case "mapped-type":
      return plain(
        `type CellParam = { readonly [K in keyof ${CARRIER}]: ${CARRIER}[K] };\n`,
        "CellParam",
      );
    case "conditional-type":
      return plain(
        `type CellCond<T> = T extends string ? never : ${CARRIER};\ntype CellParam = CellCond<number>;\n`,
        "CellParam",
      );
    case "rest-parameter":
      return {
        declarations: "",
        parameterType: CARRIER,
        restParameter: true,
        secondOverload: false,
      };
    case "second-overload":
      return {
        declarations: "",
        parameterType: CARRIER,
        restParameter: false,
        secondOverload: true,
      };
    default:
      throw new Error(`unknown DIM-4 value ${dim4}`);
  }
}

/** DIM-7: the shape of the public root that owns the parameter. */
function rootDeclaration(
  dim7: string,
  parameterType: string,
  restParameter: boolean,
  secondOverload: boolean,
): string {
  const param = restParameter
    ? `...rest: ${parameterType}[]`
    : `input: ${parameterType}`;
  switch (dim7) {
    case "function-parameter":
      if (secondOverload) {
        return (
          `export declare function cellRoot(input: ProjectDataObject): void;\n` +
          `export declare function cellRoot(${param}): void;\n`
        );
      }
      return `export declare function cellRoot(${param}): void;\n`;
    case "object-export-member-parameter":
      if (secondOverload) {
        return (
          `interface CellSurface {\n  run(input: ProjectDataObject): void;\n  run(${param}): void;\n}\n` +
          `export declare const cellSurface: CellSurface;\n`
        );
      }
      return (
        `interface CellSurface {\n  run(${param}): void;\n}\n` +
        `export declare const cellSurface: CellSurface;\n`
      );
    case "object-export-callable-member":
      if (secondOverload) {
        return (
          `interface CellRun {\n  (input: ProjectDataObject): void;\n  (${param}): void;\n}\n` +
          `interface CellSurface {\n  readonly run: CellRun;\n}\n` +
          `export declare const cellSurface: CellSurface;\n`
        );
      }
      return (
        `interface CellSurface {\n  readonly run: (${param}) => void;\n}\n` +
        `export declare const cellSurface: CellSurface;\n`
      );
    default:
      throw new Error(`unknown DIM-7 value ${dim7}`);
  }
}

const PREFACE = `/** GENERATED CELL — do not edit; produced from the reviewed dimension table. */
export interface ProjectDataObject {
  readonly alpha: string;
  readonly beta: number;
}
`;

export function buildCell(cell: Cell): BuiltCell {
  const name = NAME_BY_DIM6[cell.dim6] ?? "quill";
  const key = keyShape(cell.dim2, name);
  const member = memberShape(cell, key);
  const place = placement(cell.dim4);
  const fileName = `${VIRTUAL_ROOT}/cell-${cell.group}-${cell.index}.ts`;

  if (member.structurallyInexpressible !== undefined) {
    return {
      cell,
      fileName,
      source: "",
      keyNeedle: key.needle,
      innerNeedle: member.innerNeedle,
      dim5Applied: member.dim5Applied,
      structurallyInexpressible: member.structurallyInexpressible,
    };
  }

  const source =
    PREFACE +
    key.preamble +
    member.preamble +
    `interface ${CARRIER} {\n${member.memberText}\n}\n` +
    place.declarations +
    rootDeclaration(
      cell.dim7,
      place.parameterType,
      place.restParameter,
      place.secondOverload,
    );

  return {
    cell,
    fileName,
    source,
    keyNeedle: key.needle,
    innerNeedle: member.innerNeedle,
    dim5Applied: member.dim5Applied,
    structurallyInexpressible: undefined,
  };
}

// ---------------------------------------------------------------------------
// CELL SELECTION — contract CELL SELECTION A / B / C / D / E
// ---------------------------------------------------------------------------

const D1 = dimensionValueIds("DIM-1");
const D2 = dimensionValueIds("DIM-2");
const D3 = dimensionValueIds("DIM-3");
const D4 = dimensionValueIds("DIM-4");
const D5 = dimensionValueIds("DIM-5");
const D6 = dimensionValueIds("DIM-6");
const D7 = dimensionValueIds("DIM-7");

/** A. Full cross-product DIM-1 x DIM-2 x DIM-3, top-level, readonly, neutral, function root. */
export function groupACells(): readonly Cell[] {
  const cells: Cell[] = [];
  let index = 0;
  for (const dim1 of D1) {
    for (const dim2 of D2) {
      for (const dim3 of D3) {
        cells.push({
          group: "A",
          index: index++,
          dim1,
          dim2,
          dim3,
          dim4: "top-level",
          dim5: "readonly",
          dim6: "neutral",
          dim7: "function-parameter",
        });
      }
    }
  }
  return cells;
}

/** B. Every DIM-4 placement x {required, optional} x {identifier, unique symbol} x {property-fn, method}. */
export function groupBCells(): readonly Cell[] {
  const cells: Cell[] = [];
  let index = 0;
  for (const dim4 of D4) {
    for (const dim1 of ["required", "optional"]) {
      for (const dim2 of ["identifier", "unique-symbol"]) {
        for (const dim3 of ["property-fn", "method"]) {
          cells.push({
            group: "B",
            index: index++,
            dim1,
            dim2,
            dim3,
            dim4,
            dim5: "readonly",
            dim6: "neutral",
            dim7: "function-parameter",
          });
        }
      }
    }
  }
  return cells;
}

/** C. Every DIM-7 root kind x {required, optional} x {identifier, unique symbol}, top-level. */
export function groupCCells(): readonly Cell[] {
  const cells: Cell[] = [];
  let index = 0;
  for (const dim7 of D7) {
    for (const dim1 of ["required", "optional"]) {
      for (const dim2 of ["identifier", "unique-symbol"]) {
        cells.push({
          group: "C",
          index: index++,
          dim1,
          dim2,
          dim3: "property-fn",
          dim4: "top-level",
          dim5: "readonly",
          dim6: "neutral",
          dim7,
        });
      }
    }
  }
  return cells;
}

/**
 * D. Pairwise covering array over ALL SEVEN dimensions: every pair of values
 * from any two dimensions appears in at least one cell. Greedy construction —
 * deterministic, seeded only by the table order.
 */
export function groupDCells(): readonly Cell[] {
  const axes: readonly (readonly string[])[] = [D1, D2, D3, D4, D5, D6, D7];
  const uncovered = new Set<string>();
  const pairKey = (i: number, vi: string, j: number, vj: string): string =>
    `${i}:${vi}|${j}:${vj}`;
  for (let i = 0; i < axes.length; i += 1) {
    for (let j = i + 1; j < axes.length; j += 1) {
      for (const vi of axes[i]!) {
        for (const vj of axes[j]!) {
          uncovered.add(pairKey(i, vi, j, vj));
        }
      }
    }
  }

  const cells: Cell[] = [];
  let index = 0;
  while (uncovered.size > 0) {
    // Greedy: fix each axis in turn to the value covering the most remaining
    // pairs against already-fixed axes.
    const chosen: string[] = [];
    for (let i = 0; i < axes.length; i += 1) {
      let best = axes[i]![0]!;
      let bestScore = -1;
      for (const candidate of axes[i]!) {
        let score = 0;
        for (let j = 0; j < i; j += 1) {
          if (uncovered.has(pairKey(j, chosen[j]!, i, candidate))) {
            score += 1;
          }
        }
        // Tie-break toward pairs this value could still open with later axes.
        for (let j = i + 1; j < axes.length; j += 1) {
          for (const vj of axes[j]!) {
            if (uncovered.has(pairKey(i, candidate, j, vj))) {
              score += 1;
              break;
            }
          }
        }
        if (score > bestScore) {
          bestScore = score;
          best = candidate;
        }
      }
      chosen.push(best);
    }
    for (let i = 0; i < axes.length; i += 1) {
      for (let j = i + 1; j < axes.length; j += 1) {
        uncovered.delete(pairKey(i, chosen[i]!, j, chosen[j]!));
      }
    }
    cells.push({
      group: "D",
      index: index++,
      dim1: chosen[0]!,
      dim2: chosen[1]!,
      dim3: chosen[2]!,
      dim4: chosen[3]!,
      dim5: chosen[4]!,
      dim6: chosen[5]!,
      dim7: chosen[6]!,
    });
    if (cells.length > 5000) {
      throw new Error("pairwise construction failed to converge");
    }
  }
  return cells;
}

/** E. One NON-callable control for every cell in A, cycling the control types. */
export function groupECells(): readonly Cell[] {
  return groupACells().map((cell, i) => ({
    ...cell,
    group: "E" as const,
    index: i,
    controlType: CONTROL_NON_CALLABLE_TYPES[i % CONTROL_NON_CALLABLE_TYPES.length]!,
  }));
}

/** Every pair covered by group D — used to assert the covering property. */
export function uncoveredPairsAfter(cells: readonly Cell[]): readonly string[] {
  const axes: readonly (readonly string[])[] = [D1, D2, D3, D4, D5, D6, D7];
  const pick = (cell: Cell, i: number): string =>
    [cell.dim1, cell.dim2, cell.dim3, cell.dim4, cell.dim5, cell.dim6, cell.dim7][i]!;
  const remaining = new Set<string>();
  for (let i = 0; i < axes.length; i += 1) {
    for (let j = i + 1; j < axes.length; j += 1) {
      for (const vi of axes[i]!) {
        for (const vj of axes[j]!) {
          remaining.add(`${i}:${vi}|${j}:${vj}`);
        }
      }
    }
  }
  for (const cell of cells) {
    for (let i = 0; i < axes.length; i += 1) {
      for (let j = i + 1; j < axes.length; j += 1) {
        remaining.delete(`${i}:${pick(cell, i)}|${j}:${pick(cell, j)}`);
      }
    }
  }
  return [...remaining].sort();
}

// ---------------------------------------------------------------------------
// IN-MEMORY PROGRAM + CANONICAL ANALYSIS
// ---------------------------------------------------------------------------

const COMPILER_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  strict: true,
  skipLibCheck: true,
  noEmit: true,
};

export function createVirtualProgram(
  files: ReadonlyMap<string, string>,
): ts.Program {
  const host: ts.CompilerHost = {
    getSourceFile: (fileName, languageVersion) => {
      const virtual = files.get(fileName);
      const text = virtual ?? ts.sys.readFile(fileName);
      return text === undefined
        ? undefined
        : ts.createSourceFile(fileName, text, languageVersion, true, ts.ScriptKind.TS);
    },
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    writeFile: () => undefined,
    // Never process.cwd() — the virtual root is explicit (R2-H2 §1.7).
    getCurrentDirectory: () => VIRTUAL_ROOT,
    getCanonicalFileName: (fileName) => fileName,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => "\n",
    fileExists: (fileName) => files.has(fileName) || ts.sys.fileExists(fileName),
    readFile: (fileName) => files.get(fileName) ?? ts.sys.readFile(fileName),
    directoryExists: () => true,
    getDirectories: () => [],
  };
  return ts.createProgram({
    rootNames: [...files.keys()],
    options: COMPILER_OPTIONS,
    host,
  });
}

export type MatrixRun = Readonly<{
  readonly built: readonly BuiltCell[];
  readonly program: ts.Program;
  readonly inexpressible: readonly CellOutcome[];
  readonly expressible: readonly BuiltCell[];
}>;

/** Build every cell, compile them together, and split expressible from not. */
export function runMatrix(cells: readonly Cell[]): MatrixRun {
  const built = cells.map(buildCell);
  const files = new Map<string, string>();
  for (const b of built) {
    if (b.structurallyInexpressible === undefined) {
      files.set(b.fileName, b.source);
    }
  }
  const program = createVirtualProgram(files);

  const inexpressible: CellOutcome[] = [];
  const expressible: BuiltCell[] = [];
  for (const b of built) {
    if (b.structurallyInexpressible !== undefined) {
      inexpressible.push({
        cell: b.cell,
        identity: cellIdentity(b.cell),
        status: "INEXPRESSIBLE",
        reason: b.structurallyInexpressible,
      });
      continue;
    }
    const sourceFile = program.getSourceFile(b.fileName);
    if (sourceFile === undefined) {
      inexpressible.push({
        cell: b.cell,
        identity: cellIdentity(b.cell),
        status: "INEXPRESSIBLE",
        reason: "generated cell did not enter the Program",
      });
      continue;
    }
    const diagnostics = [
      ...program.getSyntacticDiagnostics(sourceFile),
      ...program.getSemanticDiagnostics(sourceFile),
    ];
    if (diagnostics.length > 0) {
      const first = diagnostics[0]!;
      inexpressible.push({
        cell: b.cell,
        identity: cellIdentity(b.cell),
        status: "INEXPRESSIBLE",
        reason: `TS${first.code}: ${ts.flattenDiagnosticMessageText(first.messageText, " ")}`,
      });
      continue;
    }
    expressible.push(b);
  }
  return { built, program, inexpressible, expressible };
}

/** Analyze one built cell with THE CANONICAL ANALYZER. */
export function analyzeCell(
  built: BuiltCell,
  program: ts.Program,
): PublicAuthorityAnalysis {
  return analyzePublicAuthoritySurface({
    repoRoot: VIRTUAL_ROOT,
    barrelRelativePath: built.fileName.slice(VIRTUAL_ROOT.length + 1),
    program,
  });
}

/** The needle that a CALLABLE_REJECTED member path must carry for this cell. */
export function expectedNeedles(built: BuiltCell): readonly string[] {
  return built.innerNeedle === undefined
    ? [built.keyNeedle]
    : [built.keyNeedle, built.innerNeedle];
}
