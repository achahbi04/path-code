/**
 * THE REVIEWED DIMENSION TABLE — Phase 3-R2-H2, operator decision D5.
 *
 * This file is the committed DATA form of the dimension table reproduced
 * verbatim in the governing contract
 * (docs/passes/PHASE_3_R2_H2_MEMBER_SHAPE_COMPLETENESS_CONTRACT.md) and in
 * docs/reports/PHASE_3_R2_H2_MEMBER_SHAPE_REPORT.md §0.10.
 *
 * D5 is binding: a dimension or a value may be ADDED (by adding a row), never
 * REMOVED. The fixtures are generated from this table — hand-written probes are
 * supplementary and are never the proof of coverage (GAP-065).
 *
 * Sub-variants exist where the reviewed table names several concrete shapes
 * inside one value — e.g. DIM-2 "string-literal key (quoted, including keys
 * with spaces and `__@` prefix as a plain string)". The value count is what the
 * contract's cell arithmetic depends on (5 x 6 x 10 = 300), so sub-variants are
 * carried INSIDE a value and never split it into several values.
 */

export type DimensionId =
  | "DIM-1"
  | "DIM-2"
  | "DIM-3"
  | "DIM-4"
  | "DIM-5"
  | "DIM-6"
  | "DIM-7";

export type DimensionValue = Readonly<{
  /** Stable machine id used in cell identity. */
  readonly id: string;
  /** The value exactly as the operator reviewed it. */
  readonly reviewedText: string;
  /** Concrete shapes carried inside this single reviewed value. */
  readonly subVariants?: readonly string[];
}>;

export type Dimension = Readonly<{
  readonly id: DimensionId;
  readonly title: string;
  readonly values: readonly DimensionValue[];
}>;

export const PUBLIC_AUTHORITY_SURFACE_DIMENSIONS: readonly Dimension[] = [
  {
    id: "DIM-1",
    title: "OPTIONALITY",
    values: [
      { id: "required", reviewedText: "required" },
      { id: "optional", reviewedText: "optional (`?`)" },
      { id: "explicit-undefined", reviewedText: "explicit `| undefined`" },
      { id: "explicit-null", reviewedText: "explicit `| null`" },
      {
        id: "explicit-null-undefined",
        reviewedText: "explicit `| null | undefined`",
      },
    ],
  },
  {
    id: "DIM-2",
    title: "KEY KIND",
    values: [
      { id: "identifier", reviewedText: "identifier key" },
      {
        id: "string-literal",
        reviewedText:
          "string-literal key (quoted, including keys with spaces and `__@` prefix as a plain string)",
        subVariants: ["quoted-plain", "quoted-with-spaces", "quoted-at-prefix"],
      },
      { id: "numeric-literal", reviewedText: "numeric-literal key" },
      {
        id: "well-known-symbol",
        reviewedText:
          "well-known symbol key (Symbol.iterator, Symbol.asyncIterator, Symbol.toPrimitive)",
        subVariants: [
          "Symbol.iterator",
          "Symbol.asyncIterator",
          "Symbol.toPrimitive",
        ],
      },
      {
        id: "unique-symbol",
        reviewedText: "unique symbol key (`declare const k: unique symbol`)",
      },
      {
        id: "computed-const-string",
        reviewedText: "computed key from a const string",
      },
    ],
  },
  {
    id: "DIM-3",
    title: "CALLABLE FORM",
    values: [
      { id: "property-fn", reviewedText: "property with function type" },
      { id: "method", reviewedText: "method signature" },
      {
        id: "construct-property",
        reviewedText: "property with construct signature (`new (...) => X`)",
      },
      {
        id: "call-signature-on-type",
        reviewedText: "call signature on the containing type itself",
      },
      {
        id: "construct-signature-on-type",
        reviewedText: "construct signature on the containing type itself",
      },
      {
        id: "callable-index-signature",
        reviewedText: "index signature whose value type is callable",
      },
      { id: "callable-getter", reviewedText: "getter whose type is callable" },
      {
        id: "overloaded-fn",
        reviewedText: "overloaded function type (two or more call signatures)",
      },
      { id: "generic-fn", reviewedText: "generic function type" },
      {
        id: "nested-fn-in-object",
        reviewedText:
          "function type nested inside a non-callable object member (one level)",
      },
    ],
  },
  {
    id: "DIM-4",
    title: "PLACEMENT",
    values: [
      { id: "top-level", reviewedText: "top-level member of the parameter type" },
      { id: "nested-depth-1", reviewedText: "nested object, depth 1" },
      { id: "nested-depth-3", reviewedText: "nested object, depth 3" },
      { id: "union-constituent", reviewedText: "union constituent" },
      { id: "intersection-constituent", reviewedText: "intersection constituent" },
      { id: "array-element", reviewedText: "array element" },
      { id: "readonly-array-element", reviewedText: "readonly array element" },
      { id: "tuple-element", reviewedText: "tuple element" },
      {
        id: "project-generic-argument",
        reviewedText: "type argument of a project-defined generic",
      },
      {
        id: "external-generic-argument",
        reviewedText:
          "type argument of an external generic (Promise, ReadonlyArray, Map value, Record value, Partial, Readonly, Pick)",
        subVariants: [
          "Promise",
          "ReadonlyArray",
          "Map-value",
          "Record-value",
          "Partial",
          "Readonly",
          "Pick",
        ],
      },
      {
        id: "interface-extends",
        reviewedText: "inherited via interface extends",
      },
      {
        id: "alias-chain",
        reviewedText: "through a type-alias chain (three aliases)",
      },
      {
        id: "mapped-type",
        reviewedText: "through a mapped type over a project type",
      },
      {
        id: "conditional-type",
        reviewedText:
          "through a conditional type that resolves to an object type",
      },
      { id: "rest-parameter", reviewedText: "rest-parameter element type" },
      {
        id: "second-overload",
        reviewedText: "overload signature (second overload only)",
      },
    ],
  },
  {
    id: "DIM-5",
    title: "MUTABILITY",
    values: [
      { id: "readonly", reviewedText: "readonly" },
      { id: "mutable", reviewedText: "mutable" },
    ],
  },
  {
    id: "DIM-6",
    title: "NAMING",
    values: [
      {
        id: "mechanism-keyword",
        reviewedText: "mechanism keyword (ops, executor, loader, …)",
        subVariants: ["authorityOps", "executor", "loader"],
      },
      {
        id: "neutral",
        reviewedText: "neutral (quill, tide, marble, …)",
        subVariants: ["quill", "tide", "marble"],
      },
      { id: "single-letter", reviewedText: "single letter" },
    ],
  },
  {
    id: "DIM-7",
    title: "ROOT KIND",
    values: [
      { id: "function-parameter", reviewedText: "function parameter" },
      {
        id: "object-export-member-parameter",
        reviewedText: "object-valued export member's parameter",
      },
      {
        id: "object-export-callable-member",
        reviewedText:
          "object-valued export member that is itself callable (the member IS the root; its parameters are traversed)",
      },
    ],
  },
];

/** Non-callable control types for group E (contract CELL SELECTION E). */
export const CONTROL_NON_CALLABLE_TYPES: readonly string[] = [
  "string",
  "number",
  "ProjectDataObject",
];

export function dimension(id: DimensionId): Dimension {
  const found = PUBLIC_AUTHORITY_SURFACE_DIMENSIONS.find((d) => d.id === id);
  if (found === undefined) {
    throw new Error(`unknown dimension ${id}`);
  }
  return found;
}

export function dimensionValueIds(id: DimensionId): readonly string[] {
  return dimension(id).values.map((v) => v.id);
}
