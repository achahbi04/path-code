/**
 * Canonical public authority-surface analyzer (Phase 3-R2).
 *
 * Discovery is driven by the TypeScript Program / TypeChecker from the editing
 * barrel export surface. Standing guard and permanent proofs MUST call this
 * module — do not duplicate the rule set elsewhere.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

import type { PublicAuthorityApprovedException } from "./public-authority-approved-exceptions.js";

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

export type PublicAuthorityAnalysis = {
  readonly exportedCallables: readonly string[];
  readonly manifest: readonly DerivedMemberRecord[];
  readonly findings: readonly PublicAuthorityFinding[];
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

const programCache = new Map<string, ts.Program>();

export function loadRepositoryTypeScriptProgram(repoRoot: string): ts.Program {
  const cached = programCache.get(repoRoot);
  if (cached !== undefined) {
    return cached;
  }
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
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    dirname(configPath),
  );
  // Root the program at the editing barrel so the TypeChecker pulls only the
  // reachable project graph — far cheaper than the full tsconfig file list.
  const barrel = resolve(repoRoot, DEFAULT_BARREL);
  const program = ts.createProgram({
    rootNames: [barrel],
    options: { ...parsed.options, noEmit: true },
  });
  programCache.set(repoRoot, program);
  return program;
}

/** Drop cached programs after temporary src/ corruption or restore. */
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

function walkType(
  type: ts.Type,
  checker: ts.TypeChecker,
  ctx: {
    readonly functionName: string;
    readonly parameterName: string;
    readonly typePath: string;
    readonly typeName: string;
    readonly memberPath: string;
    readonly visited: Set<string>;
    readonly isProjectSourceFile: (fileName: string) => boolean;
    readonly exceptions: readonly PublicAuthorityApprovedException[];
    readonly findings: PublicAuthorityFinding[];
    readonly manifest: DerivedMemberRecord[];
    readonly signatureIndex: number;
    readonly parameterIndex: number;
  },
): void {
  type = unwrapNonNullish(type);
  // Resolve type-alias unions/intersections (`type U = A | B`) without
  // collapsing generic aliases that still carry type arguments.
  if (type.aliasSymbol !== undefined) {
    const declared = checker.getDeclaredTypeOfSymbol(type.aliasSymbol);
    if (declared.isUnionOrIntersection()) {
      type = unwrapNonNullish(declared);
    }
  }
  const symbolKey = (() => {
    const sym = type.aliasSymbol ?? type.getSymbol();
    const rendered = checker.typeToString(type);
    if (sym !== undefined) {
      const name = String(sym.escapedName);
      // Anonymous object types share the symbol name "__type"; discriminate by
      // structural rendering so union/intersection constituents stay distinct.
      if (name === "__type") {
        return `anon:${rendered}`;
      }
      return `sym:${name}:${symbolDeclaringFile(sym) ?? ""}`;
    }
    return `ty:${rendered}`;
  })();
  const identity = `${symbolKey}@${ctx.typePath}#${ctx.memberPath}`;
  if (ctx.visited.has(identity)) {
    return;
  }
  ctx.visited.add(identity);

  // Escape hatches on the public surface (Amendment 1 §4 D).
  if (type.flags & ts.TypeFlags.Any || type.flags & ts.TypeFlags.Unknown) {
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

  if (type.isUnionOrIntersection()) {
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
      });
    }
    return;
  }

  if (checker.isArrayType(type) || checker.isTupleType(type)) {
    const typeArgs =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (type as any).typeArguments ??
      checker.getTypeArguments(type as ts.TypeReference);
    for (const arg of typeArgs ?? []) {
      if (isProjectType(arg, checker, ctx.isProjectSourceFile)) {
        walkType(arg, checker, {
          ...ctx,
          typePath: `${ctx.typePath}[]`,
          typeName: typeDisplayName(arg, checker),
        });
      }
    }
    return;
  }

  // Generic wrappers: inspect project-defined type arguments.
  if (type.flags & ts.TypeFlags.Object) {
    const typeArgs = checker.getTypeArguments(type as ts.TypeReference);
    if (typeArgs !== undefined && typeArgs.length > 0) {
      for (const arg of typeArgs) {
        if (isProjectType(arg, checker, ctx.isProjectSourceFile)) {
          walkType(arg, checker, {
            ...ctx,
            typePath: `${ctx.typePath}<${typeDisplayName(arg, checker)}>`,
            typeName: typeDisplayName(arg, checker),
          });
        }
      }
    }
  }

  if (!isProjectType(type, checker, ctx.isProjectSourceFile)) {
    // External/library boundary — do not walk Buffer / Node method graphs.
    // Anonymous object literals that appear as union/intersection constituents
    // of project aliases are still walked (they are user-defined shapes).
    if (!isAnonymousObjectType(type)) {
      return;
    }
    const anonFile = symbolDeclaringFile(type.getSymbol());
    if (anonFile !== undefined && !ctx.isProjectSourceFile(anonFile)) {
      return;
    }
  }

  const symbol = type.aliasSymbol ?? type.getSymbol();
  // Interface extends chains.
  const bases = type.getBaseTypes?.() ?? [];
  for (const base of bases) {
    walkType(base, checker, {
      ...ctx,
      typePath: `${ctx.typePath}->${typeDisplayName(base, checker)}`,
      typeName: typeDisplayName(base, checker),
    });
  }

  // Resolve alias target when the alias itself has no properties.
  if (
    type.aliasSymbol !== undefined &&
    type.getProperties().length === 0
  ) {
    const resolved = checker.getDeclaredTypeOfSymbol(type.aliasSymbol);
    if (resolved !== type) {
      walkType(resolved, checker, ctx);
    }
  }

  const stringIndex = checker.getIndexInfoOfType(type, ts.IndexKind.String);
  const numberIndex = checker.getIndexInfoOfType(type, ts.IndexKind.Number);
  if (stringIndex !== undefined || numberIndex !== undefined) {
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
  }

  for (const prop of type.getProperties()) {
    const propName = prop.getName();
    const memberPath =
      ctx.memberPath.length === 0 ? propName : `${ctx.memberPath}.${propName}`;
    const propType = checker.getTypeOfSymbol(prop);

    ctx.manifest.push({
      exportName: ctx.functionName,
      signatureIndex: ctx.signatureIndex,
      parameterIndex: ctx.parameterIndex,
      parameterName: ctx.parameterName,
      typePath: ctx.typePath,
      memberPath,
      typeName: ctx.typeName,
    });

    if (hasUserDefinedCallSignatures(propType)) {
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
    }

    if (mechanismNameHit(propName)) {
      // Amendment 1 §4 D — operation / adaptor / bindings / executor / loader /
      // reader / writer / verifier (and *Ops) shapes on the public surface.
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
    }

    const unwrappedProp = unwrapNonNullish(propType);
    if (isProjectType(unwrappedProp, checker, ctx.isProjectSourceFile)) {
      walkType(unwrappedProp, checker, {
        ...ctx,
        memberPath,
        typePath: `${ctx.typePath}.${propName}`,
        typeName: typeDisplayName(unwrappedProp, checker),
      });
    } else if (unwrappedProp.isUnionOrIntersection()) {
      walkType(unwrappedProp, checker, {
        ...ctx,
        memberPath,
        typePath: `${ctx.typePath}.${propName}`,
        typeName: typeDisplayName(unwrappedProp, checker),
      });
    } else if (isAnonymousObjectType(unwrappedProp)) {
      // Inline object shapes on project surfaces (e.g. authorityOps?: { issue })
      // are walked; String/Array/Buffer lib graphs are not anonymous in this sense
      // once they carry an external class/interface symbol — still refuse those.
      const nestedSymbol = unwrappedProp.getSymbol();
      const nestedFile = symbolDeclaringFile(nestedSymbol);
      if (
        nestedFile === undefined ||
        ctx.isProjectSourceFile(nestedFile)
      ) {
        walkType(unwrappedProp, checker, {
          ...ctx,
          memberPath,
          typePath: `${ctx.typePath}.${propName}`,
          typeName: typeDisplayName(unwrappedProp, checker),
        });
        // If walkType returned immediately at the external boundary, walk
        // properties explicitly for project-owned anonymous literals.
        if (!isProjectType(unwrappedProp, checker, ctx.isProjectSourceFile)) {
          for (const nested of unwrappedProp.getProperties()) {
            const nestedName = nested.getName();
            const nestedPath = `${memberPath}.${nestedName}`;
            const nestedType = unwrapNonNullish(
              checker.getTypeOfSymbol(nested),
            );
            ctx.manifest.push({
              exportName: ctx.functionName,
              signatureIndex: ctx.signatureIndex,
              parameterIndex: ctx.parameterIndex,
              parameterName: ctx.parameterName,
              typePath: ctx.typePath,
              memberPath: nestedPath,
              typeName: ctx.typeName,
            });
            if (hasUserDefinedCallSignatures(nestedType)) {
              pushFinding(
                ctx.findings,
                {
                  functionName: ctx.functionName,
                  parameterName: ctx.parameterName,
                  memberPath: nestedPath,
                  typeName: ctx.typeName,
                  typePath: ctx.typePath,
                  reason: `unreviewed user-defined call signature on member ${nestedPath}`,
                },
                ctx.exceptions,
              );
            }
            if (mechanismNameHit(nestedName)) {
              pushFinding(
                ctx.findings,
                {
                  functionName: ctx.functionName,
                  parameterName: ctx.parameterName,
                  memberPath: nestedPath,
                  typeName: ctx.typeName,
                  typePath: ctx.typePath,
                  reason: `unreviewed mechanism-substitution shape on member ${nestedPath}`,
                },
                ctx.exceptions,
              );
            }
          }
        }
      }
    }
  }

  void symbol;
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
      return {
        exportedCallables: [],
        manifest: [],
        findings: [
          {
            functionName: entry.functionName,
            parameterName: entry.parameterName,
            memberPath: entry.memberPath ?? "*",
            typeName: "",
            typePath: "",
            reason: "approved exception wildcards are forbidden",
          },
        ],
      };
    }
    if (
      entry.governingContract.length === 0 ||
      entry.reason.length === 0 ||
      entry.targetedTest.length === 0
    ) {
      return {
        exportedCallables: [],
        manifest: [],
        findings: [
          {
            functionName: entry.functionName,
            parameterName: entry.parameterName,
            memberPath: entry.memberPath ?? "",
            typeName: "",
            typePath: "",
            reason:
              "approved exception missing governingContract, reason, or targetedTest",
          },
        ],
      };
    }
  }

  const program = options.program ?? loadRepositoryTypeScriptProgram(repoRoot);
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
    });
  }
  return analyzeWithSourceFile(sourceFile, checker, {
    exceptions,
    isProjectSourceFile,
  });
}

function analyzeWithSourceFile(
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  opts: {
    readonly exceptions: readonly PublicAuthorityApprovedException[];
    readonly isProjectSourceFile: (fileName: string) => boolean;
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

  for (const exportedSymbol of exported) {
    const resolved = resolveAlias(exportedSymbol, checker);
    const name = exportedSymbol.getName();
    // Prefer value-side declarations for callables.
    const type = checker.getTypeOfSymbolAtLocation(
      resolved,
      resolved.valueDeclaration ?? resolved.declarations?.[0] ?? sourceFile,
    );
    const signatures = type.getCallSignatures();
    if (signatures.length === 0) {
      continue;
    }
    exportedCallables.push(name);

    signatures.forEach((signature, signatureIndex) => {
      // Rest parameters: Amendment 1 D escape.
      if (signature.parameters.some((p) => p.valueDeclaration && ts.isParameter(p.valueDeclaration) && p.valueDeclaration.dotDotDotToken !== undefined)) {
        pushFinding(
          findings,
          {
            functionName: name,
            parameterName: "...",
            memberPath: "...",
            typeName: "",
            typePath: "",
            reason: "unreviewed rest parameter escape on public callable",
          },
          opts.exceptions,
        );
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
          exportName: name,
          signatureIndex,
          parameterIndex,
          parameterName,
          typePath: typeName,
          memberPath: "",
          typeName,
        });

        // A parameter that is itself a callable is always inspected.
        if (hasUserDefinedCallSignatures(paramType)) {
          pushFinding(
            findings,
            {
              functionName: name,
              parameterName,
              memberPath: parameterName,
              typeName,
              typePath: typeName,
              reason: `unreviewed user-defined call signature on parameter ${parameterName}`,
            },
            opts.exceptions,
          );
        }

        // Deep option/input graph inspection: options parameters and *Options
        // types (Amendment 1 §4 C/D). Positional earned opaques are represented
        // in the manifest but are not recursive method-graph roots — otherwise
        // WorkspaceBoundary.canonicalize and similar create false positives
        // against contracted 2-F5 positive controls.
        const deepInspect =
          parameterName === "options" ||
          /Options$/.test(typeName) ||
          hasUserDefinedCallSignatures(paramType);

        if (deepInspect) {
          walkType(paramType, checker, {
            functionName: name,
            parameterName,
            typePath: typeName,
            typeName,
            memberPath: "",
            visited: new Set<string>(),
            isProjectSourceFile: opts.isProjectSourceFile,
            exceptions: opts.exceptions,
            findings,
            manifest,
            signatureIndex,
            parameterIndex,
          });
        }
      });
    });
  }

  exportedCallables.sort(stableCompare);
  manifest.sort(compareManifest);
  findings.sort(compareFinding);

  return {
    exportedCallables,
    manifest,
    findings,
  };
}

/** Repository root helper for tests living under tests/architecture/. */
export function architectureTestsRepoRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "../..");
}
