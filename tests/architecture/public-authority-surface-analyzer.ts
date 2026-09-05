/**
 * Canonical public authority-surface analyzer (Phase 3-R2 / R2-H1).
 *
 * Discovery is driven by the TypeScript Program / TypeChecker from the editing
 * barrel export surface. Every public parameter root is traversed or explicitly
 * classified terminal — never skipped by parameter/type naming. Standing guard
 * and permanent proofs MUST call this module — do not duplicate the rule set
 * elsewhere.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

import type { PublicAuthorityApprovedException } from "./public-authority-approved-exceptions.js";
import {
  PUBLIC_AUTHORITY_REVIEWED_TERMINALS,
  reviewedTerminalIdentity,
  type ReviewedTerminalDeclarationKind,
  type ReviewedTerminalEntry,
} from "./public-authority-reviewed-terminals.js";

const DEFAULT_BARREL = "src/editing/index.ts";

export type DerivedMemberRecord = {
  readonly exportName: string;
  readonly signatureIndex: number;
  readonly parameterIndex: number;
  readonly parameterName: string;
  readonly typePath: string;
  readonly memberPath: string;
  readonly typeName: string;
};

export type PublicAuthorityFinding = {
  readonly functionName: string;
  readonly parameterName: string;
  readonly memberPath: string;
  readonly typeName: string;
  readonly typePath: string;
  readonly reason: string;
};

/** Closed disposition vocabulary — no seventh value. */
export type TraversalDisposition =
  | "TRAVERSED_PROJECT_GRAPH"
  | "PRIMITIVE_TERMINAL"
  | "EXTERNAL_LIBRARY_TERMINAL"
  | "REVIEWED_TERMINAL"
  | "CALLABLE_REJECTED"
  | "UNSAFE_ESCAPE_REJECTED";

export type DispositionRecord = {
  readonly exportName: string;
  readonly signatureIndex: number;
  readonly parameterIndex: number;
  readonly parameterName: string;
  /** Canonical resolved type identity (repo path + symbol + kind, or structural). */
  readonly canonicalTypeIdentity: string;
  readonly typePath: string;
  readonly memberPath: string;
  readonly typeName: string;
  readonly disposition: TraversalDisposition;
};

/**
 * Per-node member census (R2-H2 §1.4). For every traversed project-defined
 * node, `checkerMemberCount` is what the TypeChecker reports and
 * `manifestedMemberCount` is what actually reached the manifest. The two MUST
 * be equal: that identity is what makes a silent member skip observable
 * (GAP-061), which the byte-identical F-R1-005 corruption proved impossible
 * under the previous shape.
 */
export type NodeCompletenessRecord = {
  readonly exportName: string;
  readonly signatureIndex: number;
  readonly parameterIndex: number;
  readonly parameterName: string;
  readonly typePath: string;
  readonly memberPath: string;
  readonly canonicalTypeIdentity: string;
  readonly checkerMemberCount: number;
  readonly manifestedMemberCount: number;
};

/**
 * Export-level disposition vocabulary (R2-H2 §1.5). Deliberately a SEPARATE
 * closed axis from TraversalDisposition — the traversal vocabulary stays at
 * exactly six values with no seventh.
 */
export type ExportDisposition =
  | "CALLABLE_ROOT"
  | "OBJECT_SURFACE"
  | "PRIMITIVE_TERMINAL"
  | "EXTERNAL_LIBRARY_TERMINAL";

export type ExportDispositionRecord = {
  readonly exportName: string;
  readonly disposition: ExportDisposition;
  readonly canonicalTypeIdentity: string;
  readonly typeName: string;
};

export type PublicAuthorityAnalysis = {
  readonly exportedCallables: readonly string[];
  readonly manifest: readonly DerivedMemberRecord[];
  readonly findings: readonly PublicAuthorityFinding[];
  readonly dispositions: readonly DispositionRecord[];
  /** Per-node member census — see NodeCompletenessRecord. */
  readonly nodeCompleteness: readonly NodeCompletenessRecord[];
  /** One record for every VALUE export of the barrel. No export is undispositioned. */
  readonly exportDispositions: readonly ExportDispositionRecord[];
  /** Type-only exports, which are reached through parameter graphs instead. */
  readonly typeOnlyExportCount: number;
  /**
   * Number of TypeScript Programs constructed during this invocation.
   * At most one when `program` is not supplied (0 on cache hit, 1 on create).
   * 0 when a prebuilt `program` is supplied.
   */
  readonly programConstructionCount: number;
};

export type AnalyzePublicAuthorityOptions = {
  readonly repoRoot: string;
  /** Public-surface truth for this pass (operator D2). */
  readonly barrelRelativePath?: string;
  readonly exceptions?: readonly PublicAuthorityApprovedException[];
  /**
   * Optional prebuilt program (fixtures). When omitted, loads the repository
   * tsconfig and creates a Program.
   */
  readonly program?: ts.Program;
  /**
   * Override project-vs-external ownership decision (2-F5 falsification only).
   * Default: treat node_modules / typescript lib as external boundaries.
   */
  readonly isProjectSourceFile?: (fileName: string) => boolean;
  /**
   * When true, use the legacy enumerated three-type discovery shape instead of
   * the derived walker (2-F7 structural falsification only).
   */
  readonly useLegacyEnumeratedDiscovery?: boolean;
  /**
   * When true, restore the exact R2 naming gate that skipped non-options roots
   * (H1-F7 falsification only). Default false. Under the legacy gate, only
   * deep-inspected roots receive dispositions; skipped roots remain in
   * discoveredPublicRoots / manifest but lack root dispositions.
   */
  readonly useLegacyNamingGate?: boolean;
  /**
   * Override reviewed-terminal registry (H1-F5 falsification only).
   * Default: PUBLIC_AUTHORITY_REVIEWED_TERMINALS.
   */
  readonly reviewedTerminals?: readonly ReviewedTerminalEntry[];
  /**
   * H2-F7 falsification only. Restores the exact F-R1-004 defect: member
   * callable classification applied to the un-unwrapped type, so that an
   * optional or union-wrapped callable is never rejected. Default false.
   */
  readonly useLegacyUnUnwrappedMemberCallableCheck?: boolean;
  /**
   * H2-F7 falsification only. Restores the exact F-R1-005 defect: the
   * `startsWith("__@")` member skip, executed before the manifest push.
   * Default false. On the default path NO name-based member skip exists.
   */
  readonly useLegacySymbolKeyedMemberSkip?: boolean;
  /**
   * H2-F7 falsification only. Restores the exact F-R1-006 defect: barrel
   * exports whose type has no call signatures are dropped from discovery
   * before any disposition is recorded. Default false.
   */
  readonly useLegacyCallableOnlyExportDiscovery?: boolean;
  /**
   * H2-F7 falsification only. Suppresses the node-level own call/construct
   * signature census, which did not exist before R2-H2. Set together with
   * `useLegacyUnUnwrappedMemberCallableCheck` it reconstructs the 328f6fc
   * member-handling shape faithfully. Default false.
   */
  readonly useLegacyNoOwnSignatureCensus?: boolean;
  /**
   * H2-F3 falsification only. A member path that is censused but deliberately
   * withheld from the manifest, so the per-node completeness proof must fail.
   */
  readonly dropManifestedMemberPath?: string;
};

const MECHANISM_NAME =
  /(Ops$|Adaptor|Adapter|Bindings|Executor|Loader|Reader|Writer|Verifier)/i;

function stableCompare(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function compareManifest(a: DerivedMemberRecord, b: DerivedMemberRecord): number {
  return (
    stableCompare(a.exportName, b.exportName) ||
    a.signatureIndex - b.signatureIndex ||
    a.parameterIndex - b.parameterIndex ||
    stableCompare(a.parameterName, b.parameterName) ||
    stableCompare(a.typePath, b.typePath) ||
    stableCompare(a.memberPath, b.memberPath)
  );
}

function compareFinding(a: PublicAuthorityFinding, b: PublicAuthorityFinding): number {
  return (
    stableCompare(a.functionName, b.functionName) ||
    stableCompare(a.parameterName, b.parameterName) ||
    stableCompare(a.memberPath, b.memberPath) ||
    stableCompare(a.reason, b.reason)
  );
}

function compareDisposition(a: DispositionRecord, b: DispositionRecord): number {
  return (
    stableCompare(a.exportName, b.exportName) ||
    a.signatureIndex - b.signatureIndex ||
    a.parameterIndex - b.parameterIndex ||
    stableCompare(a.parameterName, b.parameterName) ||
    stableCompare(a.typePath, b.typePath) ||
    stableCompare(a.memberPath, b.memberPath) ||
    stableCompare(a.disposition, b.disposition) ||
    stableCompare(a.canonicalTypeIdentity, b.canonicalTypeIdentity)
  );
}

type ProgramCacheEntry = {
  readonly program: ts.Program;
  /** Content key of every input file at the moment the Program was built. */
  readonly contentKey: string;
};

const programCache = new Map<string, ProgramCacheEntry>();

/**
 * Content key for a Program (R2-H2 §1.6 / GAP-063): the sorted list of
 * (repository-relative path, SHA-256 of current file content) for EVERY source
 * file in the Program, plus a hash of the compiler options. Path, size and
 * mtime are deliberately NOT keys — a same-size, same-mtime edit must still
 * invalidate. A file that has become unreadable hashes as "missing", so
 * deletion invalidates too.
 */
function programContentKey(program: ts.Program, repoRoot: string): string {
  const parts: string[] = [];
  for (const sf of program.getSourceFiles()) {
    let contentHash: string;
    try {
      contentHash = createHash("sha256").update(readFileSync(sf.fileName)).digest("hex");
    } catch {
      contentHash = "missing";
    }
    parts.push(`${repoRelativePath(repoRoot, sf.fileName)}\u0000${contentHash}`);
  }
  parts.sort(stableCompare);
  const options = program.getCompilerOptions() as Record<string, unknown>;
  const optionEntries = Object.keys(options)
    .sort(stableCompare)
    .map((key) => [key, options[key]]);
  return createHash("sha256")
    .update(parts.join("\n"))
    .update("\u0001")
    .update(JSON.stringify(optionEntries))
    .digest("hex");
}

function createRepositoryTypeScriptProgram(repoRoot: string): ts.Program {
  const configPath = ts.findConfigFile(
    repoRoot,
    (p) => existsSync(p),
    "tsconfig.json",
  );
  if (configPath === undefined) {
    throw new Error(`tsconfig.json not found under ${repoRoot}`);
  }
  const configFile = ts.readConfigFile(configPath, (p) =>
    readFileSync(p, "utf8"),
  );
  if (configFile.error !== undefined) {
    throw new Error(
      ts.formatDiagnostic(configFile.error, {
        getCanonicalFileName: (f) => f,
        getCurrentDirectory: () => repoRoot,
        getNewLine: () => "\n",
      }),
    );
  }
  // R2-H2 §1.7 / GAP-064: never resolve through process.cwd(). The parse host
  // takes an explicit absolute basePath, and the compiler host reports the
  // repository root as its current directory, so module and lib resolution are
  // identical from any working directory.
  const parseConfigHost: ts.ParseConfigHost = {
    useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
    readDirectory: (rootDir, extensions, excludes, includes, depth) =>
      ts.sys.readDirectory(rootDir, extensions, excludes, includes, depth),
    fileExists: (path) => ts.sys.fileExists(path),
    readFile: (path) => ts.sys.readFile(path),
  };
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    parseConfigHost,
    dirname(configPath),
  );
  const options: ts.CompilerOptions = { ...parsed.options, noEmit: true };
  const host = ts.createCompilerHost(options, true);
  host.getCurrentDirectory = () => repoRoot;
  // Root the program at the editing barrel so the TypeChecker pulls only the
  // reachable project graph — far cheaper than the full tsconfig file list.
  const barrel = resolve(repoRoot, DEFAULT_BARREL);
  return ts.createProgram({
    rootNames: [barrel],
    options,
    host,
  });
}

/**
 * Load (or return cached) repository Program. Prefer
 * `loadRepositoryTypeScriptProgramWithMeta` when construction must be counted.
 */
export function loadRepositoryTypeScriptProgram(repoRoot: string): ts.Program {
  return loadRepositoryTypeScriptProgramWithMeta(repoRoot).program;
}

function loadRepositoryTypeScriptProgramWithMeta(repoRoot: string): {
  readonly program: ts.Program;
  readonly constructed: boolean;
} {
  const cached = programCache.get(repoRoot);
  if (
    cached !== undefined &&
    programContentKey(cached.program, repoRoot) === cached.contentKey
  ) {
    return { program: cached.program, constructed: false };
  }
  const program = createRepositoryTypeScriptProgram(repoRoot);
  programCache.set(repoRoot, {
    program,
    contentKey: programContentKey(program, repoRoot),
  });
  return { program, constructed: true };
}

/**
 * Drop cached programs. Retained for compatibility with existing proofs: after
 * R2-H2 §1.6 the cache is content-keyed, so this call is a belt, not the
 * suspenders. Correctness no longer depends on any caller invoking it.
 */
export function clearRepositoryTypeScriptProgramCache(): void {
  programCache.clear();
}

function defaultIsProjectSourceFile(repoRoot: string, fileName: string): boolean {
  const normalized = resolve(fileName);
  const root = resolve(repoRoot);
  if (!normalized.startsWith(root + sep) && normalized !== root) {
    return false;
  }
  const rel = relative(root, normalized).split(sep).join("/");
  if (rel.startsWith("node_modules/") || rel.includes("/node_modules/")) {
    return false;
  }
  // TypeScript lib / @types arrive as absolute paths under node_modules normally;
  // also reject anything that looks like a lib declaration host.
  if (/[\\/]typescript[\\/]lib[\\/]/.test(normalized)) {
    return false;
  }
  return true;
}

function resolveAlias(symbol: ts.Symbol, checker: ts.TypeChecker): ts.Symbol {
  return symbol.flags & ts.SymbolFlags.Alias
    ? checker.getAliasedSymbol(symbol)
    : symbol;
}

function unwrapNonNullish(type: ts.Type): ts.Type {
  if (!type.isUnion()) {
    return type;
  }
  const parts = type.types.filter(
    (part) =>
      !(part.flags & ts.TypeFlags.Undefined) &&
      !(part.flags & ts.TypeFlags.Null),
  );
  if (parts.length === 1) {
    return parts[0]!;
  }
  // Multi-member unions (including optional `T | undefined` flattened with
  // union aliases) are walked by the union branch, which skips nullish parts.
  return type;
}

function typeDisplayName(type: ts.Type, checker: ts.TypeChecker): string {
  const unwrapped = unwrapNonNullish(type);
  const alias = unwrapped.aliasSymbol?.getName();
  if (alias !== undefined) {
    return alias;
  }
  const symbol = unwrapped.getSymbol();
  if (symbol !== undefined) {
    return checker.symbolToString(symbol);
  }
  return checker.typeToString(unwrapped);
}

function isAnonymousObjectType(type: ts.Type): boolean {
  if (!(type.flags & ts.TypeFlags.Object)) {
    return false;
  }
  const objectFlags = (type as ts.ObjectType).objectFlags;
  return (
    (objectFlags & ts.ObjectFlags.Anonymous) !== 0 ||
    (objectFlags & ts.ObjectFlags.ObjectLiteral) !== 0
  );
}

function symbolDeclaringFile(symbol: ts.Symbol | undefined): string | undefined {
  const decl = symbol?.declarations?.[0];
  return decl?.getSourceFile().fileName;
}

function declarationKindOf(
  symbol: ts.Symbol,
): ReviewedTerminalDeclarationKind | undefined {
  for (const decl of symbol.declarations ?? []) {
    if (ts.isInterfaceDeclaration(decl)) return "interface";
    if (ts.isClassDeclaration(decl)) return "class";
    if (ts.isTypeAliasDeclaration(decl)) return "type-alias";
    if (ts.isEnumDeclaration(decl)) return "enum";
  }
  return undefined;
}

function repoRelativePath(repoRoot: string, absolutePath: string): string {
  return relative(resolve(repoRoot), resolve(absolutePath)).split(sep).join("/");
}

/**
 * Canonical identity after alias resolution. Anonymous types use a stable
 * declaration-location + structural key and can never match the reviewed
 * terminal registry.
 */
function canonicalTypeIdentity(
  type: ts.Type,
  checker: ts.TypeChecker,
  repoRoot: string,
): string {
  if (isPrimitiveType(type)) {
    return `primitive:${checker.typeToString(type)}`;
  }
  if (type.flags & ts.TypeFlags.TypeParameter) {
    const name = type.getSymbol()?.getName() ?? checker.typeToString(type);
    return `type-param:${name}`;
  }

  let symbol = type.aliasSymbol ?? type.getSymbol();
  if (symbol !== undefined) {
    symbol = resolveAlias(symbol, checker);
  }

  if (symbol !== undefined) {
    const name = String(symbol.escapedName);
    if (name === "__type" || isAnonymousObjectType(type)) {
      const decl = symbol.declarations?.[0];
      const loc =
        decl !== undefined
          ? `${repoRelativePath(repoRoot, decl.getSourceFile().fileName)}:${decl.pos}`
          : "unknown";
      // Do not embed typeToString — recursive anonymous shapes can overflow.
      return `anon:${loc}`;
    }
    const file = symbolDeclaringFile(symbol);
    const kind = declarationKindOf(symbol);
    if (file !== undefined && kind !== undefined) {
      return reviewedTerminalIdentity({
        declarationPath: repoRelativePath(repoRoot, file),
        symbolName: symbol.getName(),
        declarationKind: kind,
      });
    }
    if (file !== undefined) {
      return `${repoRelativePath(repoRoot, file)}#${symbol.getName()}#unknown`;
    }
  }

  return `ty:${checker.typeToString(type)}`;
}

function isPrimitiveType(type: ts.Type): boolean {
  // Exclude NonPrimitive ("object") — not a scalar terminal.
  const flags = type.flags & ~ts.TypeFlags.NonPrimitive;
  if (
    flags &
    (ts.TypeFlags.String |
      ts.TypeFlags.Number |
      ts.TypeFlags.Boolean |
      ts.TypeFlags.BigInt |
      ts.TypeFlags.ESSymbol |
      ts.TypeFlags.UniqueESSymbol |
      ts.TypeFlags.Null |
      ts.TypeFlags.Undefined |
      ts.TypeFlags.Void |
      ts.TypeFlags.Never |
      ts.TypeFlags.StringLiteral |
      ts.TypeFlags.NumberLiteral |
      ts.TypeFlags.BooleanLiteral |
      ts.TypeFlags.BigIntLiteral |
      ts.TypeFlags.Enum |
      ts.TypeFlags.EnumLiteral |
      ts.TypeFlags.TemplateLiteral)
  ) {
    // Object-flagged types are only primitive when they are enum/literal.
    if (type.flags & ts.TypeFlags.Object) {
      return (
        (type.flags &
          (ts.TypeFlags.Enum |
            ts.TypeFlags.EnumLiteral |
            ts.TypeFlags.StringLiteral |
            ts.TypeFlags.NumberLiteral |
            ts.TypeFlags.BooleanLiteral |
            ts.TypeFlags.BigIntLiteral)) !==
        0
      );
    }
    return true;
  }
  const intrinsic = (type as { intrinsicName?: string }).intrinsicName;
  return (
    intrinsic === "string" ||
    intrinsic === "number" ||
    intrinsic === "boolean" ||
    intrinsic === "bigint" ||
    intrinsic === "symbol" ||
    intrinsic === "null" ||
    intrinsic === "undefined" ||
    intrinsic === "void" ||
    intrinsic === "never"
  );
}

/**
 * A value export is a primitive terminal when it is primitive, or when every
 * union constituent is primitive. Project string-literal-union aliases such as
 * `ActionClass` are of the second kind: they are data, not a member surface,
 * and must never be walked as an object (doing so reaches String.prototype and
 * manufactures false positives — Amendment 1 §4 forbids exactly that).
 */
function isPrimitiveOrPrimitiveUnion(type: ts.Type): boolean {
  if (isPrimitiveType(type)) {
    return true;
  }
  if (!type.isUnion()) {
    return false;
  }
  return type.types.every((part) => isPrimitiveType(part));
}

function isProjectType(
  type: ts.Type,
  _checker: ts.TypeChecker,
  isProjectSourceFile: (fileName: string) => boolean,
): boolean {
  const symbol = type.aliasSymbol ?? type.getSymbol();
  if (symbol === undefined) {
    return false;
  }
  const file = symbolDeclaringFile(symbol);
  if (file === undefined) {
    return false;
  }
  return isProjectSourceFile(file);
}

function isApproved(
  exceptions: readonly PublicAuthorityApprovedException[],
  functionName: string,
  parameterName: string,
  memberPath: string,
): boolean {
  return exceptions.some((entry) => {
    if (entry.functionName.includes("*") || entry.parameterName.includes("*")) {
      return false;
    }
    if (entry.memberPath !== undefined && entry.memberPath.includes("*")) {
      return false;
    }
    if (
      entry.governingContract.length === 0 ||
      entry.reason.length === 0 ||
      entry.targetedTest.length === 0
    ) {
      return false;
    }
    if (entry.functionName !== functionName || entry.parameterName !== parameterName) {
      return false;
    }
    if (entry.memberPath === undefined) {
      // Parameter-scoped exception without member is intentionally narrower than
      // a wildcard: it only covers the parameter itself (empty member path).
      return memberPath === "" || memberPath === entry.parameterName;
    }
    return entry.memberPath === memberPath;
  });
}

function mechanismNameHit(name: string): boolean {
  return MECHANISM_NAME.test(name);
}

function hasUserDefinedCallSignatures(type: ts.Type): boolean {
  return type.getCallSignatures().length > 0;
}

/**
 * Flatten a type into the constituents that matter for callable classification:
 * every union/intersection part, recursively, with null and undefined removed.
 * `q?: (m) => string` has type `((m) => string) | undefined`; the undefined part
 * is dropped and the function part survives. This is the direct correction of
 * F-R1-004 / GAP-060 — optionality is not a shield.
 */
function callableConstituents(type: ts.Type, depth = 0): readonly ts.Type[] {
  if (depth > 8 || !type.isUnionOrIntersection()) {
    return [type];
  }
  const out: ts.Type[] = [];
  for (const part of type.types) {
    if (part.flags & ts.TypeFlags.Undefined || part.flags & ts.TypeFlags.Null) {
      continue;
    }
    for (const inner of callableConstituents(part, depth + 1)) {
      out.push(inner);
    }
  }
  return out;
}

/** A type is callable at its own level if it has call OR construct signatures. */
function typeIsCallableAtOwnLevel(
  type: ts.Type,
  checker: ts.TypeChecker,
): boolean {
  return (
    checker.getSignaturesOfType(type, ts.SignatureKind.Call).length > 0 ||
    checker.getSignaturesOfType(type, ts.SignatureKind.Construct).length > 0
  );
}

/**
 * R2-H2 §1.2. A member is callable if, after removing null and undefined, ANY
 * union or intersection constituent has a call signature or a construct
 * signature, or is an index signature whose value type is callable.
 *
 * Methods, getters of callable type, overloaded function types and generic
 * function types are all covered by this single rule: the TypeChecker reports a
 * method's type and a getter's type as the underlying type, and an overloaded
 * or generic function type carries call signatures like any other.
 */
function isCallableMemberType(type: ts.Type, checker: ts.TypeChecker): boolean {
  for (const part of callableConstituents(unwrapNonNullish(type))) {
    if (typeIsCallableAtOwnLevel(part, checker)) {
      return true;
    }
    for (const info of checker.getIndexInfosOfType(part)) {
      if (typeIsCallableAtOwnLevel(unwrapNonNullish(info.type), checker)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Deterministic member key (R2-H2 §1.3). String-keyed members use their name.
 * Symbol-keyed members — well-known and unique alike — are serialized by
 * DECLARATION IDENTITY: the declaring file of the key symbol plus its
 * description. TypeScript's own `escapedName` for a unique symbol embeds a
 * per-Program symbol id and is therefore not stable; this is.
 *
 * Symbol-keyed-ness is decided from the declaration SHAPE (a computed property
 * name) and the KEY TYPE FLAGS (ESSymbol / UniqueESSymbol) — never from the
 * text of the member name. No name pattern participates.
 */
function memberKeyOf(
  prop: ts.Symbol,
  checker: ts.TypeChecker,
  repoRoot: string,
): string {
  for (const decl of prop.declarations ?? []) {
    const nameNode = (decl as ts.NamedDeclaration).name;
    if (nameNode === undefined || !ts.isComputedPropertyName(nameNode)) {
      continue;
    }
    const keyType = checker.getTypeAtLocation(nameNode.expression);
    if (
      !(
        keyType.flags &
        (ts.TypeFlags.ESSymbol | ts.TypeFlags.UniqueESSymbol)
      )
    ) {
      continue;
    }
    const keySymbol =
      keyType.getSymbol() ?? checker.getSymbolAtLocation(nameNode.expression);
    const file = symbolDeclaringFile(keySymbol);
    const description = keySymbol?.getName() ?? checker.typeToString(keyType);
    const where = file !== undefined ? repoRelativePath(repoRoot, file) : "unknown";
    return `@@[${where}#${description}]`;
  }
  return prop.getName();
}

function pushFinding(
  findings: PublicAuthorityFinding[],
  finding: PublicAuthorityFinding,
  exceptions: readonly PublicAuthorityApprovedException[],
): void {
  if (
    isApproved(
      exceptions,
      finding.functionName,
      finding.parameterName,
      finding.memberPath,
    )
  ) {
    return;
  }
  findings.push(finding);
}

function reviewedTerminalsAreInvalid(
  entries: readonly ReviewedTerminalEntry[],
): PublicAuthorityFinding | undefined {
  for (const entry of entries) {
    if (
      entry.declarationPath.includes("*") ||
      entry.symbolName.includes("*") ||
      entry.declarationPath.includes("?") ||
      entry.symbolName.includes("?") ||
      /[\[\]{}()|]/.test(entry.declarationPath) ||
      /[\[\]{}()|]/.test(entry.symbolName) ||
      entry.symbolName === "__type" ||
      entry.symbolName.length === 0 ||
      entry.declarationPath.length === 0
    ) {
      return {
        functionName: "(reviewed-terminal-registry)",
        parameterName: entry.symbolName || "*",
        memberPath: entry.declarationPath || "*",
        typeName: entry.symbolName,
        typePath: reviewedTerminalIdentity(entry),
        reason:
          "reviewed terminal wildcard/pattern/anonymous entries are forbidden",
      };
    }
  }
  return undefined;
}

function buildReviewedTerminalMap(
  entries: readonly ReviewedTerminalEntry[],
): Map<string, ReviewedTerminalEntry> {
  const map = new Map<string, ReviewedTerminalEntry>();
  for (const entry of entries) {
    map.set(reviewedTerminalIdentity(entry), entry);
  }
  return map;
}

type WalkContext = {
  readonly functionName: string;
  readonly parameterName: string;
  readonly typePath: string;
  readonly typeName: string;
  readonly memberPath: string;
  readonly visited: Set<string>;
  /** Active recursion stack keyed by canonical type identity (cycle break). */
  readonly traversalStack: Set<string>;
  readonly isProjectSourceFile: (fileName: string) => boolean;
  readonly exceptions: readonly PublicAuthorityApprovedException[];
  readonly findings: PublicAuthorityFinding[];
  readonly manifest: DerivedMemberRecord[];
  readonly dispositions: DispositionRecord[];
  readonly nodeCompleteness: NodeCompletenessRecord[];
  /** H2-F7 only — restores F-R1-004 verbatim. */
  readonly useLegacyUnUnwrappedMemberCallableCheck: boolean;
  /** H2-F7 only — restores F-R1-005 verbatim. */
  readonly useLegacySymbolKeyedMemberSkip: boolean;
  /** H2-F7 only — suppresses the node-level own-signature census. */
  readonly useLegacyNoOwnSignatureCensus: boolean;
  /** H2-F3 only — a censused member deliberately withheld from the manifest. */
  readonly dropManifestedMemberPath: string | undefined;
  readonly signatureIndex: number;
  readonly parameterIndex: number;
  readonly repoRoot: string;
  readonly reviewedByIdentity: ReadonlyMap<string, ReviewedTerminalEntry>;
};

function pushDisposition(
  ctx: WalkContext,
  type: ts.Type,
  checker: ts.TypeChecker,
  disposition: TraversalDisposition,
): void {
  ctx.dispositions.push({
    exportName: ctx.functionName,
    signatureIndex: ctx.signatureIndex,
    parameterIndex: ctx.parameterIndex,
    parameterName: ctx.parameterName,
    canonicalTypeIdentity: canonicalTypeIdentity(type, checker, ctx.repoRoot),
    typePath: ctx.typePath,
    memberPath: ctx.memberPath,
    typeName: ctx.typeName,
    disposition,
  });
}

function inspectTypeArguments(
  type: ts.Type,
  checker: ts.TypeChecker,
  ctx: WalkContext,
): void {
  const typeArgs =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (type as any).typeArguments ??
    (type.flags & ts.TypeFlags.Object
      ? checker.getTypeArguments(type as ts.TypeReference)
      : undefined);
  for (const arg of typeArgs ?? []) {
    walkType(arg, checker, {
      ...ctx,
      typePath: `${ctx.typePath}<${typeDisplayName(arg, checker)}>`,
      typeName: typeDisplayName(arg, checker),
    });
  }
}

function walkUnionOrIntersectionParts(
  type: ts.Type,
  checker: ts.TypeChecker,
  ctx: WalkContext,
): void {
  if (!type.isUnionOrIntersection()) {
    return;
  }
  for (const part of type.types) {
    if (
      part.flags & ts.TypeFlags.Undefined ||
      part.flags & ts.TypeFlags.Null
    ) {
      continue;
    }
    walkType(part, checker, {
      ...ctx,
      typePath: `${ctx.typePath}|${checker.typeToString(part)}`,
      typeName: typeDisplayName(part, checker),
    });
  }
}

/** Inspect alias target union/intersection constituents without member-graph walk. */
function inspectAliasUnionConstituents(
  type: ts.Type,
  checker: ts.TypeChecker,
  ctx: WalkContext,
): void {
  if (type.aliasSymbol === undefined) {
    return;
  }
  const declared = checker.getDeclaredTypeOfSymbol(type.aliasSymbol);
  if (declared.isUnionOrIntersection()) {
    walkUnionOrIntersectionParts(unwrapNonNullish(declared), checker, ctx);
  }
}

function walkType(
  type: ts.Type,
  checker: ts.TypeChecker,
  ctx: WalkContext,
): void {
  type = unwrapNonNullish(type);

  // Cycle / diamond key: canonical type identity only — never typeToString of a
  // recursive alias (that can stack-overflow). Path-specific disposition is still
  // emitted below when a type is re-encountered.
  const typeVisitKey = canonicalTypeIdentity(type, checker, ctx.repoRoot);
  const pathKey = `${typeVisitKey}@${ctx.typePath}#${ctx.memberPath}`;
  if (ctx.visited.has(pathKey)) {
    return;
  }
  if (ctx.traversalStack.has(typeVisitKey)) {
    // Self-reference along the active walk: preserve an occurrence, do not re-descend.
    pushDisposition(ctx, type, checker, "TRAVERSED_PROJECT_GRAPH");
    ctx.visited.add(pathKey);
    return;
  }
  ctx.visited.add(pathKey);
  ctx.traversalStack.add(typeVisitKey);
  try {
    walkTypeBody(type, checker, ctx);
  } finally {
    ctx.traversalStack.delete(typeVisitKey);
  }
}

function walkTypeBody(
  type: ts.Type,
  checker: ts.TypeChecker,
  ctx: WalkContext,
): void {

  // Escape hatches on the public surface (Amendment 1 §4 D).
  if (type.flags & ts.TypeFlags.Any || type.flags & ts.TypeFlags.Unknown) {
    pushDisposition(ctx, type, checker, "UNSAFE_ESCAPE_REJECTED");
    pushFinding(
      ctx.findings,
      {
        functionName: ctx.functionName,
        parameterName: ctx.parameterName,
        memberPath: ctx.memberPath || ctx.parameterName,
        typeName: ctx.typeName,
        typePath: ctx.typePath,
        reason: "unreviewed any/unknown escape on public parameter/options surface",
      },
      ctx.exceptions,
    );
    return;
  }

  // Unconstrained / unresolved type parameters on authority-sensitive surfaces.
  if (type.flags & ts.TypeFlags.TypeParameter) {
    const constraint = type.getConstraint();
    const defaultType = type.getDefault();
    if (constraint !== undefined) {
      pushDisposition(ctx, type, checker, "TRAVERSED_PROJECT_GRAPH");
      walkType(constraint, checker, {
        ...ctx,
        typePath: `${ctx.typePath}:constraint`,
        typeName: typeDisplayName(constraint, checker),
      });
      return;
    }
    if (defaultType !== undefined) {
      pushDisposition(ctx, type, checker, "TRAVERSED_PROJECT_GRAPH");
      walkType(defaultType, checker, {
        ...ctx,
        typePath: `${ctx.typePath}:default`,
        typeName: typeDisplayName(defaultType, checker),
      });
      return;
    }
    pushDisposition(ctx, type, checker, "UNSAFE_ESCAPE_REJECTED");
    pushFinding(
      ctx.findings,
      {
        functionName: ctx.functionName,
        parameterName: ctx.parameterName,
        memberPath: ctx.memberPath || ctx.parameterName,
        typeName: ctx.typeName,
        typePath: ctx.typePath,
        reason:
          "unconstrained/unresolved type parameter on authority-sensitive public surface",
      },
      ctx.exceptions,
    );
    return;
  }

  if (isPrimitiveType(type)) {
    pushDisposition(ctx, type, checker, "PRIMITIVE_TERMINAL");
    return;
  }

  // Reviewed / external classification MUST use the pre-collapse symbol so
  // external aliases like ArrayBufferLike are not mislabeled TRAVERSED after
  // expanding to a union. Type arguments and alias constituents are inspected
  // first so containers cannot hide project-owned structure.
  const canon = canonicalTypeIdentity(type, checker, ctx.repoRoot);
  const reviewed = ctx.reviewedByIdentity.get(canon);
  if (reviewed !== undefined && !isAnonymousObjectType(type)) {
    inspectTypeArguments(type, checker, ctx);
    inspectAliasUnionConstituents(type, checker, ctx);
    pushDisposition(ctx, type, checker, "REVIEWED_TERMINAL");
    return;
  }

  const anonymous = isAnonymousObjectType(type);
  const projectOwned = isProjectType(type, checker, ctx.isProjectSourceFile);
  if (!projectOwned) {
    if (!anonymous) {
      inspectTypeArguments(type, checker, ctx);
      inspectAliasUnionConstituents(type, checker, ctx);
      if (type.isUnionOrIntersection()) {
        walkUnionOrIntersectionParts(type, checker, ctx);
      } else if (checker.isArrayType(type) || checker.isTupleType(type)) {
        const typeArgs =
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (type as any).typeArguments ??
          checker.getTypeArguments(type as ts.TypeReference);
        for (const arg of typeArgs ?? []) {
          walkType(arg, checker, {
            ...ctx,
            typePath: `${ctx.typePath}[]`,
            typeName: typeDisplayName(arg, checker),
          });
        }
      }
      pushDisposition(ctx, type, checker, "EXTERNAL_LIBRARY_TERMINAL");
      return;
    }
    const anonFile = symbolDeclaringFile(type.getSymbol());
    if (anonFile !== undefined && !ctx.isProjectSourceFile(anonFile)) {
      pushDisposition(ctx, type, checker, "EXTERNAL_LIBRARY_TERMINAL");
      return;
    }
  }

  // Project-defined: resolve type-alias unions/intersections (`type U = A | B`)
  // without collapsing generic aliases that still carry type arguments.
  if (type.aliasSymbol !== undefined) {
    const declared = checker.getDeclaredTypeOfSymbol(type.aliasSymbol);
    if (declared.isUnionOrIntersection()) {
      type = unwrapNonNullish(declared);
    }
  }

  if (type.isUnionOrIntersection()) {
    pushDisposition(ctx, type, checker, "TRAVERSED_PROJECT_GRAPH");
    walkUnionOrIntersectionParts(type, checker, ctx);
    return;
  }

  // Arrays / tuples: inspect element types; project arrays are traversed as
  // structural containers (elements already walked).
  if (checker.isArrayType(type) || checker.isTupleType(type)) {
    const typeArgs =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (type as any).typeArguments ??
      checker.getTypeArguments(type as ts.TypeReference);
    for (const arg of typeArgs ?? []) {
      walkType(arg, checker, {
        ...ctx,
        typePath: `${ctx.typePath}[]`,
        typeName: typeDisplayName(arg, checker),
      });
    }
    pushDisposition(ctx, type, checker, "TRAVERSED_PROJECT_GRAPH");
    return;
  }

  // Generic project wrappers: inspect type arguments, then members.
  if (
    (type.flags & ts.TypeFlags.Object) !== 0 &&
    (checker.getTypeArguments(type as ts.TypeReference)?.length ?? 0) > 0
  ) {
    inspectTypeArguments(type, checker, ctx);
  }

  // Project-defined structural type — traverse members / bases.
  pushDisposition(ctx, type, checker, "TRAVERSED_PROJECT_GRAPH");

  const bases = type.getBaseTypes?.() ?? [];
  for (const base of bases) {
    walkType(base, checker, {
      ...ctx,
      typePath: `${ctx.typePath}->${typeDisplayName(base, checker)}`,
      typeName: typeDisplayName(base, checker),
    });
  }

  // Resolve alias target when the alias itself has no properties.
  if (type.aliasSymbol !== undefined && type.getProperties().length === 0) {
    const resolved = checker.getDeclaredTypeOfSymbol(type.aliasSymbol);
    if (resolved !== type) {
      walkType(resolved, checker, ctx);
    }
  }

  // ---------------------------------------------------------------------
  // MEMBER CENSUS — UNCONDITIONAL (R2-H2 §§1.3, 1.4).
  //
  // Every checker-visible member of this node is manifested exactly once:
  // every property, every call signature, every construct signature, every
  // index info. There is NO name-based skip on the default path. The per-node
  // completeness record emitted at the end is what makes an omission
  // observable at all (GAP-061) — under the previous shape a skipped
  // symbol-keyed member produced a byte-identical analysis.
  //
  // The three stop authorities of R2-H1 — primitive, external after
  // type-argument inspection, reviewed terminal — apply to members exactly as
  // to roots, and are enforced inside walkType. Nothing else stops a member.
  // ---------------------------------------------------------------------
  const properties = checker.getPropertiesOfType(type);
  // H2-F7 only: when the own-signature census is suppressed, it is suppressed
  // BOTH in the expected count and in the emission, so the completeness
  // identity stays internally consistent under the restored shape.
  const ownCallSignatures = ctx.useLegacyNoOwnSignatureCensus
    ? []
    : checker.getSignaturesOfType(type, ts.SignatureKind.Call);
  const ownConstructSignatures = ctx.useLegacyNoOwnSignatureCensus
    ? []
    : checker.getSignaturesOfType(type, ts.SignatureKind.Construct);
  const indexInfos = checker.getIndexInfosOfType(type);
  const checkerMemberCount =
    properties.length +
    ownCallSignatures.length +
    ownConstructSignatures.length +
    indexInfos.length;
  let manifestedMemberCount = 0;

  const manifestMember = (memberPath: string): void => {
    if (ctx.dropManifestedMemberPath === memberPath) {
      // H2-F3 only: censused but deliberately withheld, so the completeness
      // identity below must fail.
      return;
    }
    manifestedMemberCount += 1;
    ctx.manifest.push({
      exportName: ctx.functionName,
      signatureIndex: ctx.signatureIndex,
      parameterIndex: ctx.parameterIndex,
      parameterName: ctx.parameterName,
      typePath: ctx.typePath,
      memberPath,
      typeName: ctx.typeName,
    });
  };

  const rejectCallableMember = (memberPath: string, memberType: ts.Type): void => {
    pushFinding(
      ctx.findings,
      {
        functionName: ctx.functionName,
        parameterName: ctx.parameterName,
        memberPath,
        typeName: ctx.typeName,
        typePath: ctx.typePath,
        reason: `unreviewed user-defined call signature on member ${memberPath}`,
      },
      ctx.exceptions,
    );
    ctx.dispositions.push({
      exportName: ctx.functionName,
      signatureIndex: ctx.signatureIndex,
      parameterIndex: ctx.parameterIndex,
      parameterName: ctx.parameterName,
      canonicalTypeIdentity: canonicalTypeIdentity(
        unwrapNonNullish(memberType),
        checker,
        ctx.repoRoot,
      ),
      typePath: ctx.typePath,
      memberPath,
      typeName: ctx.typeName,
      disposition: "CALLABLE_REJECTED",
    });
  };

  // Index signatures — an escape under Amendment 1 §4 D, and additionally a
  // callable member when the VALUE type is callable (DIM-3).
  for (const info of indexInfos) {
    const keyName = checker.typeToString(info.keyType);
    const indexPath = `${ctx.memberPath}#index(${keyName})`;
    manifestMember(indexPath);
    pushFinding(
      ctx.findings,
      {
        functionName: ctx.functionName,
        parameterName: ctx.parameterName,
        memberPath: ctx.memberPath || ctx.parameterName,
        typeName: ctx.typeName,
        typePath: ctx.typePath,
        reason: "unreviewed index signature escape on public parameter/options surface",
      },
      ctx.exceptions,
    );
    ctx.dispositions.push({
      exportName: ctx.functionName,
      signatureIndex: ctx.signatureIndex,
      parameterIndex: ctx.parameterIndex,
      parameterName: ctx.parameterName,
      canonicalTypeIdentity: `${canon}#index(${keyName})`,
      typePath: `${ctx.typePath}#index(${keyName})`,
      memberPath: ctx.memberPath,
      typeName: ctx.typeName,
      disposition: "UNSAFE_ESCAPE_REJECTED",
    });
    if (isCallableMemberType(info.type, checker)) {
      rejectCallableMember(indexPath, info.type);
    }
  }

  // Call and construct signatures ON THIS NODE ITSELF (R2-H2 §1.2: a type is
  // callable at its own level if it has call or construct signatures).
  ownCallSignatures.forEach((_signature, index) => {
    const path = `${ctx.memberPath}#call(${index})`;
    manifestMember(path);
    rejectCallableMember(path, type);
  });
  ownConstructSignatures.forEach((_signature, index) => {
    const path = `${ctx.memberPath}#construct(${index})`;
    manifestMember(path);
    rejectCallableMember(path, type);
  });

  for (const prop of properties) {
    if (
      ctx.useLegacySymbolKeyedMemberSkip &&
      prop.getName().startsWith("__@")
    ) {
      // H2-F7 only: the exact F-R1-005 defect, restored verbatim — a
      // name-pattern skip executed BEFORE the manifest push. Never reachable
      // on the default path.
      continue;
    }
    const propName = memberKeyOf(prop, checker, ctx.repoRoot);
    const memberPath =
      ctx.memberPath.length === 0 ? propName : `${ctx.memberPath}.${propName}`;
    const propType = checker.getTypeOfSymbol(prop);

    manifestMember(memberPath);

    let rejected = false;
    const callable = ctx.useLegacyUnUnwrappedMemberCallableCheck
      ? // H2-F7 only: the exact F-R1-004 defect, restored verbatim.
        hasUserDefinedCallSignatures(propType)
      : isCallableMemberType(propType, checker);
    if (callable) {
      rejected = true;
      rejectCallableMember(memberPath, propType);
    }

    if (mechanismNameHit(propName)) {
      // Amendment 1 §4 D — operation / adaptor / bindings / executor / loader /
      // reader / writer / verifier (and *Ops) shapes on the public surface.
      // This is ADDITIVE detection: it can only add a rejection, never skip,
      // gate or suppress traversal, manifesting or classification.
      pushFinding(
        ctx.findings,
        {
          functionName: ctx.functionName,
          parameterName: ctx.parameterName,
          memberPath,
          typeName: ctx.typeName,
          typePath: ctx.typePath,
          reason: `unreviewed mechanism-substitution shape on member ${memberPath}`,
        },
        ctx.exceptions,
      );
      if (!rejected) {
        rejected = true;
        ctx.dispositions.push({
          exportName: ctx.functionName,
          signatureIndex: ctx.signatureIndex,
          parameterIndex: ctx.parameterIndex,
          parameterName: ctx.parameterName,
          canonicalTypeIdentity: canonicalTypeIdentity(
            unwrapNonNullish(propType),
            checker,
            ctx.repoRoot,
          ),
          typePath: ctx.typePath,
          memberPath,
          typeName: ctx.typeName,
          disposition: "CALLABLE_REJECTED",
        });
      }
    }

    // Descent is UNCONDITIONAL. Only the three stop authorities inside
    // walkType may end it — never a rejection, a name, or a container shape.
    const unwrappedProp = unwrapNonNullish(propType);
    walkType(unwrappedProp, checker, {
      ...ctx,
      memberPath,
      typePath: `${ctx.typePath}.${propName}`,
      typeName: typeDisplayName(unwrappedProp, checker),
    });
  }

  ctx.nodeCompleteness.push({
    exportName: ctx.functionName,
    signatureIndex: ctx.signatureIndex,
    parameterIndex: ctx.parameterIndex,
    parameterName: ctx.parameterName,
    typePath: ctx.typePath,
    memberPath: ctx.memberPath,
    canonicalTypeIdentity: canon,
    checkerMemberCount,
    manifestedMemberCount,
  });
}

/**
 * Legacy enumerated three-type discovery (pre-R2). Used only by 2-F7
 * falsification when useLegacyEnumeratedDiscovery is true.
 */
function legacyEnumeratedFindings(
  repoRoot: string,
  exceptions: readonly PublicAuthorityApprovedException[],
): PublicAuthorityAnalysis {
  const surfaces: Array<{ file: string; typeName: string; functionName: string }> = [
    {
      file: "src/editing/replace-existing-file.ts",
      typeName: "ReplaceExistingFileOptions",
      functionName: "replaceExistingFile",
    },
    {
      file: "src/editing/create-file.ts",
      typeName: "CreateFileOptions",
      functionName: "createFile",
    },
    {
      file: "src/editing/multi-file-types.ts",
      typeName: "ExecuteMultiFilePlanOptions",
      functionName: "executeMultiFilePlan",
    },
  ];
  const findings: PublicAuthorityFinding[] = [];
  const manifest: DerivedMemberRecord[] = [];
  const exportedCallables: string[] = [];
  for (const surface of surfaces) {
    const full = join(repoRoot, surface.file);
    if (!existsSync(full)) {
      continue;
    }
    exportedCallables.push(surface.functionName);
    const sourceText = readFileSync(full, "utf8");
    const source = ts.createSourceFile(
      surface.file,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const visit = (node: ts.Node): void => {
      if (
        ts.isTypeAliasDeclaration(node) &&
        node.name.text === surface.typeName &&
        ts.isTypeLiteralNode(node.type)
      ) {
        for (const member of node.type.members) {
          if (ts.isPropertySignature(member) && member.name !== undefined) {
            const name = ts.isIdentifier(member.name)
              ? member.name.text
              : ts.isStringLiteral(member.name)
                ? member.name.text
                : undefined;
            if (name === undefined) continue;
            manifest.push({
              exportName: surface.functionName,
              signatureIndex: 0,
              parameterIndex: 0,
              parameterName: "options",
              typePath: surface.typeName,
              memberPath: name,
              typeName: surface.typeName,
            });
            if (mechanismNameHit(name) || (member.type && /=>|\(/.test(member.type.getText(source)))) {
              const finding: PublicAuthorityFinding = {
                functionName: surface.functionName,
                parameterName: "options",
                memberPath: name,
                typeName: surface.typeName,
                typePath: surface.typeName,
                reason: `unreviewed mechanism-substitution shape on member ${name}`,
              };
              if (
                !isApproved(
                  exceptions,
                  finding.functionName,
                  finding.parameterName,
                  finding.memberPath,
                )
              ) {
                findings.push(finding);
              }
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return {
    exportedCallables: [...exportedCallables].sort(stableCompare),
    manifest: [...manifest].sort(compareManifest),
    findings: [...findings].sort(compareFinding),
    dispositions: [],
    nodeCompleteness: [],
    exportDispositions: [],
    typeOnlyExportCount: 0,
    programConstructionCount: 0,
  };
}

function emptyAnalysisWithFinding(
  finding: PublicAuthorityFinding,
): PublicAuthorityAnalysis {
  return {
    exportedCallables: [],
    manifest: [],
    findings: [finding],
    dispositions: [],
    nodeCompleteness: [],
    exportDispositions: [],
    typeOnlyExportCount: 0,
    programConstructionCount: 0,
  };
}

export function analyzePublicAuthoritySurface(
  options: AnalyzePublicAuthorityOptions,
): PublicAuthorityAnalysis {
  const repoRoot = resolve(options.repoRoot);
  const barrelRelativePath = options.barrelRelativePath ?? DEFAULT_BARREL;
  const exceptions = options.exceptions ?? [];
  const isProjectSourceFile =
    options.isProjectSourceFile ??
    ((fileName: string) => defaultIsProjectSourceFile(repoRoot, fileName));
  const useLegacyNamingGate = options.useLegacyNamingGate === true;
  const useLegacyUnUnwrappedMemberCallableCheck =
    options.useLegacyUnUnwrappedMemberCallableCheck === true;
  const useLegacySymbolKeyedMemberSkip =
    options.useLegacySymbolKeyedMemberSkip === true;
  const useLegacyNoOwnSignatureCensus =
    options.useLegacyNoOwnSignatureCensus === true;
  const useLegacyCallableOnlyExportDiscovery =
    options.useLegacyCallableOnlyExportDiscovery === true;
  const dropManifestedMemberPath = options.dropManifestedMemberPath;
  const reviewedTerminalEntries =
    options.reviewedTerminals ?? PUBLIC_AUTHORITY_REVIEWED_TERMINALS;

  if (options.useLegacyEnumeratedDiscovery === true) {
    return legacyEnumeratedFindings(repoRoot, exceptions);
  }

  // Reject wildcard / incomplete exception entries as structural failures.
  for (const entry of exceptions) {
    if (
      entry.functionName.includes("*") ||
      entry.parameterName.includes("*") ||
      (entry.memberPath !== undefined && entry.memberPath.includes("*"))
    ) {
      return emptyAnalysisWithFinding({
        functionName: entry.functionName,
        parameterName: entry.parameterName,
        memberPath: entry.memberPath ?? "*",
        typeName: "",
        typePath: "",
        reason: "approved exception wildcards are forbidden",
      });
    }
    if (
      entry.governingContract.length === 0 ||
      entry.reason.length === 0 ||
      entry.targetedTest.length === 0
    ) {
      return emptyAnalysisWithFinding({
        functionName: entry.functionName,
        parameterName: entry.parameterName,
        memberPath: entry.memberPath ?? "",
        typeName: "",
        typePath: "",
        reason:
          "approved exception missing governingContract, reason, or targetedTest",
      });
    }
  }

  const reviewedInvalid = reviewedTerminalsAreInvalid(reviewedTerminalEntries);
  if (reviewedInvalid !== undefined) {
    return emptyAnalysisWithFinding(reviewedInvalid);
  }
  const reviewedByIdentity = buildReviewedTerminalMap(reviewedTerminalEntries);

  let program: ts.Program;
  let programConstructionCount = 0;
  if (options.program !== undefined) {
    program = options.program;
  } else {
    const loaded = loadRepositoryTypeScriptProgramWithMeta(repoRoot);
    program = loaded.program;
    programConstructionCount = loaded.constructed ? 1 : 0;
  }

  const checker = program.getTypeChecker();
  const barrelPath = resolve(repoRoot, barrelRelativePath);
  const sourceFile = program.getSourceFile(barrelPath);
  if (sourceFile === undefined) {
    // Fixtures may use a path that needs normalize.
    const match = program.getSourceFiles().find((sf) => {
      const rel = relative(repoRoot, sf.fileName).split(sep).join("/");
      return rel === barrelRelativePath || sf.fileName === barrelPath;
    });
    if (match === undefined) {
      throw new Error(`barrel source file not in program: ${barrelRelativePath}`);
    }
    return analyzeWithSourceFile(match, checker, {
      exceptions,
      isProjectSourceFile,
      repoRoot,
      reviewedByIdentity,
      useLegacyNamingGate,
      useLegacyUnUnwrappedMemberCallableCheck,
      useLegacySymbolKeyedMemberSkip,
      useLegacyNoOwnSignatureCensus,
      useLegacyCallableOnlyExportDiscovery,
      dropManifestedMemberPath,
      programConstructionCount,
    });
  }
  return analyzeWithSourceFile(sourceFile, checker, {
    exceptions,
    isProjectSourceFile,
    repoRoot,
    reviewedByIdentity,
    useLegacyNamingGate,
    useLegacyUnUnwrappedMemberCallableCheck,
    useLegacySymbolKeyedMemberSkip,
    useLegacyNoOwnSignatureCensus,
    useLegacyCallableOnlyExportDiscovery,
    dropManifestedMemberPath,
    programConstructionCount,
  });
}

function analyzeWithSourceFile(
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  opts: {
    readonly exceptions: readonly PublicAuthorityApprovedException[];
    readonly isProjectSourceFile: (fileName: string) => boolean;
    readonly repoRoot: string;
    readonly reviewedByIdentity: ReadonlyMap<string, ReviewedTerminalEntry>;
    readonly useLegacyNamingGate: boolean;
    readonly useLegacyUnUnwrappedMemberCallableCheck: boolean;
    readonly useLegacySymbolKeyedMemberSkip: boolean;
    readonly useLegacyNoOwnSignatureCensus: boolean;
    readonly useLegacyCallableOnlyExportDiscovery: boolean;
    readonly dropManifestedMemberPath: string | undefined;
    readonly programConstructionCount: number;
  },
): PublicAuthorityAnalysis {
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  if (moduleSymbol === undefined) {
    throw new Error(`no module symbol for ${sourceFile.fileName}`);
  }
  const exported = checker.getExportsOfModule(moduleSymbol);
  const exportedCallables: string[] = [];
  const findings: PublicAuthorityFinding[] = [];
  const manifest: DerivedMemberRecord[] = [];
  const dispositions: DispositionRecord[] = [];
  const nodeCompleteness: NodeCompletenessRecord[] = [];
  const exportDispositions: ExportDispositionRecord[] = [];
  let typeOnlyExportCount = 0;

  const baseWalkContext = (
    functionName: string,
    parameterName: string,
    typePath: string,
    typeName: string,
    memberPath: string,
    signatureIndex: number,
    parameterIndex: number,
  ): WalkContext => ({
    functionName,
    parameterName,
    typePath,
    typeName,
    memberPath,
    visited: new Set<string>(),
    traversalStack: new Set<string>(),
    isProjectSourceFile: opts.isProjectSourceFile,
    exceptions: opts.exceptions,
    findings,
    manifest,
    dispositions,
    nodeCompleteness,
    useLegacyUnUnwrappedMemberCallableCheck:
      opts.useLegacyUnUnwrappedMemberCallableCheck,
    useLegacySymbolKeyedMemberSkip: opts.useLegacySymbolKeyedMemberSkip,
    useLegacyNoOwnSignatureCensus: opts.useLegacyNoOwnSignatureCensus,
    dropManifestedMemberPath: opts.dropManifestedMemberPath,
    signatureIndex,
    parameterIndex,
    repoRoot: opts.repoRoot,
    reviewedByIdentity: opts.reviewedByIdentity,
  });

  /**
   * Analyze one callable public root: every signature, every parameter, with
   * the parameter graph traversed unconditionally. Used for function exports
   * AND for callable members of object-valued exports (R2-H2 §1.5), so an
   * object-valued export's callable member is a root in exactly the same
   * sense — one canonical path, no second rule set.
   */
  const analyzeCallableRoot = (
    exportName: string,
    signatures: readonly ts.Signature[],
  ): void => {
    signatures.forEach((signature, signatureIndex) => {
      // Rest parameters: Amendment 1 D escape.
      if (
        signature.parameters.some(
          (param) =>
            param.valueDeclaration &&
            ts.isParameter(param.valueDeclaration) &&
            param.valueDeclaration.dotDotDotToken !== undefined,
        )
      ) {
        pushFinding(
          findings,
          {
            functionName: exportName,
            parameterName: "...",
            memberPath: "...",
            typeName: "",
            typePath: "",
            reason: "unreviewed rest parameter escape on public callable",
          },
          opts.exceptions,
        );
        dispositions.push({
          exportName,
          signatureIndex,
          parameterIndex: -1,
          parameterName: "...",
          canonicalTypeIdentity: "rest",
          typePath: "",
          memberPath: "...",
          typeName: "",
          disposition: "UNSAFE_ESCAPE_REJECTED",
        });
      }

      signature.parameters.forEach((paramSymbol, parameterIndex) => {
        const parameterName = paramSymbol.getName();
        const paramDecl = paramSymbol.valueDeclaration;
        const paramTypeRaw =
          paramDecl !== undefined
            ? checker.getTypeOfSymbolAtLocation(paramSymbol, paramDecl)
            : checker.getTypeOfSymbol(paramSymbol);
        const paramType = unwrapNonNullish(paramTypeRaw);
        const typeName = typeDisplayName(paramType, checker);

        // Record the parameter root in the manifest (P2 complete parameter list).
        manifest.push({
          exportName,
          signatureIndex,
          parameterIndex,
          parameterName,
          typePath: typeName,
          memberPath: "",
          typeName,
        });

        // A parameter that is itself a callable is always inspected. Uses the
        // corrected classifier, so an optional or union-wrapped callable
        // parameter is caught exactly like a required one.
        if (isCallableMemberType(paramTypeRaw, checker)) {
          pushFinding(
            findings,
            {
              functionName: exportName,
              parameterName,
              memberPath: parameterName,
              typeName,
              typePath: typeName,
              reason: `unreviewed user-defined call signature on parameter ${parameterName}`,
            },
            opts.exceptions,
          );
        }

        // H1-F7 only: exact R2 naming gate. Default path traverses every root.
        const deepInspect =
          !opts.useLegacyNamingGate ||
          parameterName === "options" ||
          /Options$/.test(typeName) ||
          hasUserDefinedCallSignatures(paramType);

        if (deepInspect) {
          walkType(
            paramType,
            checker,
            baseWalkContext(
              exportName,
              parameterName,
              typeName,
              typeName,
              "",
              signatureIndex,
              parameterIndex,
            ),
          );
        }
      });
    });
  };

  for (const exportedSymbol of exported) {
    const resolved = resolveAlias(exportedSymbol, checker);
    const name = exportedSymbol.getName();

    // Type-only exports carry no value and are reached through parameter
    // graphs instead; they need no export disposition (R2-H2 §1.5).
    if ((resolved.flags & ts.SymbolFlags.Value) === 0) {
      typeOnlyExportCount += 1;
      continue;
    }

    // Prefer value-side declarations for callables.
    const type = checker.getTypeOfSymbolAtLocation(
      resolved,
      resolved.valueDeclaration ?? resolved.declarations?.[0] ?? sourceFile,
    );
    const signatures = type.getCallSignatures();
    const canon = canonicalTypeIdentity(type, checker, opts.repoRoot);
    const exportTypeName = typeDisplayName(type, checker);

    if (signatures.length > 0) {
      exportDispositions.push({
        exportName: name,
        disposition: "CALLABLE_ROOT",
        canonicalTypeIdentity: canon,
        typeName: exportTypeName,
      });
      exportedCallables.push(name);
      analyzeCallableRoot(name, signatures);
      continue;
    }

    if (opts.useLegacyCallableOnlyExportDiscovery) {
      // H2-F7 only: the exact F-R1-006 defect, restored verbatim — a
      // non-callable value export is dropped before any disposition exists.
      continue;
    }

    // Every non-callable VALUE export is walked, so no export is left
    // undispositioned and no container can hide project-owned structure.
    walkType(
      type,
      checker,
      baseWalkContext(
        name,
        "(export)",
        exportTypeName,
        exportTypeName,
        "(export)",
        -1,
        -1,
      ),
    );

    if (isPrimitiveOrPrimitiveUnion(type)) {
      exportDispositions.push({
        exportName: name,
        disposition: "PRIMITIVE_TERMINAL",
        canonicalTypeIdentity: canon,
        typeName: exportTypeName,
      });
      continue;
    }

    const objectLike = (type.flags & ts.TypeFlags.Object) !== 0;
    const projectOwned = isProjectType(type, checker, opts.isProjectSourceFile);
    const anonymous = isAnonymousObjectType(type);
    const anonymousFile = anonymous
      ? symbolDeclaringFile(type.getSymbol())
      : undefined;
    const anonymousIsProject =
      anonymous &&
      (anonymousFile === undefined || opts.isProjectSourceFile(anonymousFile));

    if (!objectLike || (!projectOwned && !anonymousIsProject)) {
      // External after type-argument inspection (performed by the walk above).
      exportDispositions.push({
        exportName: name,
        disposition: "EXTERNAL_LIBRARY_TERMINAL",
        canonicalTypeIdentity: canon,
        typeName: exportTypeName,
      });
      continue;
    }

    // OBJECT_SURFACE — a public object whose members are a public callable
    // surface (F-R1-006 / GAP-062). Every member was censused and dispositioned
    // by the walk above; every CALLABLE member is additionally promoted to a
    // root whose own parameters are traversed.
    exportDispositions.push({
      exportName: name,
      disposition: "OBJECT_SURFACE",
      canonicalTypeIdentity: canon,
      typeName: exportTypeName,
    });
    for (const member of checker.getPropertiesOfType(type)) {
      const memberName = memberKeyOf(member, checker, opts.repoRoot);
      const memberType = unwrapNonNullish(checker.getTypeOfSymbol(member));
      const memberSignatures = memberType.getCallSignatures();
      if (memberSignatures.length === 0) {
        continue;
      }
      const rootName = `${name}.${memberName}`;
      exportDispositions.push({
        exportName: rootName,
        disposition: "CALLABLE_ROOT",
        canonicalTypeIdentity: canonicalTypeIdentity(
          memberType,
          checker,
          opts.repoRoot,
        ),
        typeName: typeDisplayName(memberType, checker),
      });
      exportedCallables.push(rootName);
      analyzeCallableRoot(rootName, memberSignatures);
    }
  }

  exportedCallables.sort(stableCompare);
  manifest.sort(compareManifest);
  findings.sort(compareFinding);
  dispositions.sort(compareDisposition);
  nodeCompleteness.sort(
    (a, b) =>
      stableCompare(a.exportName, b.exportName) ||
      a.signatureIndex - b.signatureIndex ||
      a.parameterIndex - b.parameterIndex ||
      stableCompare(a.parameterName, b.parameterName) ||
      stableCompare(a.typePath, b.typePath) ||
      stableCompare(a.memberPath, b.memberPath) ||
      stableCompare(a.canonicalTypeIdentity, b.canonicalTypeIdentity),
  );
  exportDispositions.sort(
    (a, b) =>
      stableCompare(a.exportName, b.exportName) ||
      stableCompare(a.disposition, b.disposition),
  );

  return {
    exportedCallables,
    manifest,
    findings,
    dispositions,
    nodeCompleteness,
    exportDispositions,
    typeOnlyExportCount,
    programConstructionCount: opts.programConstructionCount,
  };
}

/** Roots discovered by public parameter enumeration (manifest empty memberPath). */
export function discoveredPublicRoots(
  analysis: PublicAuthorityAnalysis,
): readonly DerivedMemberRecord[] {
  return analysis.manifest.filter((m) => m.memberPath === "");
}

/**
 * Root disposition records: the first disposition emitted for each public
 * parameter occurrence (empty memberPath). Union/alias expansions that keep
 * empty memberPath while deepening typePath are type-path nodes, not roots.
 */
export function manifestedDispositionRoots(
  analysis: PublicAuthorityAnalysis,
): readonly DispositionRecord[] {
  const seen = new Set<string>();
  const roots: DispositionRecord[] = [];
  for (const d of analysis.dispositions) {
    if (d.memberPath !== "") {
      continue;
    }
    const key = publicRootOccurrenceKey(d);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    roots.push(d);
  }
  return roots;
}

/** Stable root occurrence key for completeness comparison. */
export function publicRootOccurrenceKey(root: {
  readonly exportName: string;
  readonly signatureIndex: number;
  readonly parameterIndex: number;
  readonly parameterName: string;
}): string {
  return `${root.exportName}#${root.signatureIndex}#${root.parameterIndex}#${root.parameterName}`;
}

/** Repository root helper for tests living under tests/architecture/. */
export function architectureTestsRepoRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "../..");
}
