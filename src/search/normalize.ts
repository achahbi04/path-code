/**
 * Pure lexical normalization for Phase 2E search comparison.
 *
 * Comparison keys use Unicode NFC and locale-independent lowercase.
 * Original repository paths remain authoritative and untouched.
 */

const UTF8 = new TextEncoder();

export function utf8ByteLength(value: string): number {
  return UTF8.encode(value).length;
}

export function containsNulByte(value: string): boolean {
  return value.includes("\0");
}

export function normalizeSearchText(value: string): string {
  return value.normalize("NFC").toLowerCase();
}

export function splitPathComponents(relativePath: string): readonly string[] {
  if (relativePath.length === 0) {
    return [];
  }
  return relativePath.split("/");
}

export function basename(relativePath: string): string {
  const slash = relativePath.lastIndexOf("/");
  return slash === -1 ? relativePath : relativePath.slice(slash + 1);
}

export function basenameStem(relativePath: string): string {
  const base = basename(relativePath);
  const dot = base.lastIndexOf(".");
  if (dot <= 0) {
    return base;
  }
  return base.slice(0, dot);
}

export function fileExtension(relativePath: string): string {
  const base = basename(relativePath);
  const dot = base.lastIndexOf(".");
  if (dot <= 0) {
    return "";
  }
  return base.slice(dot);
}

export function lexicalDepth(relativePath: string): number {
  if (relativePath.length === 0) {
    return 0;
  }
  return relativePath.split("/").length - 1;
}

export function isAbsoluteWorkspaceRelativePath(value: string): boolean {
  return value.startsWith("/") || value.startsWith("\\");
}

export function scopePrefixHasParentEscape(value: string): boolean {
  const components = splitPathComponents(value.replace(/\/+$/, ""));
  return components.some((component) => component === "..");
}

export function componentsMatchPrefix(
  candidate: readonly string[],
  prefix: readonly string[],
): boolean {
  if (prefix.length === 0) {
    return true;
  }
  if (candidate.length < prefix.length) {
    return false;
  }
  for (let index = 0; index < prefix.length; index += 1) {
    if (candidate[index] !== prefix[index]) {
      return false;
    }
  }
  return true;
}

export function matchesScopePrefix(
  entryRelativePath: string,
  scopePrefix: string,
): boolean {
  const normalizedPrefix = scopePrefix.replace(/\/+$/, "");
  if (normalizedPrefix.length === 0) {
    return true;
  }
  const entryComponents = splitPathComponents(entryRelativePath);
  const prefixComponents = splitPathComponents(normalizedPrefix);
  return componentsMatchPrefix(entryComponents, prefixComponents);
}

export function boundaryMatchesSearchLexical(
  boundaryRelativePath: string,
  normalizedTerms: readonly string[],
  normalizedScopePrefix: string | undefined,
): boolean {
  const normalizedBoundary = normalizeSearchText(
    boundaryRelativePath.replace(/\/+$/, ""),
  );
  const boundaryComponents = splitPathComponents(normalizedBoundary);
  const boundaryBasename = basename(normalizedBoundary);
  const boundaryStem = basenameStem(normalizedBoundary);

  if (
    normalizedScopePrefix !== undefined &&
    normalizedScopePrefix.length > 0 &&
    (normalizedBoundary === normalizedScopePrefix ||
      componentsMatchPrefix(
        splitPathComponents(normalizedBoundary),
        splitPathComponents(normalizedScopePrefix),
      ) ||
      componentsMatchPrefix(
        splitPathComponents(normalizedScopePrefix),
        splitPathComponents(normalizedBoundary),
      ))
  ) {
    return true;
  }

  for (const term of normalizedTerms) {
    if (term.length === 0) {
      continue;
    }
    if (
      boundaryBasename === term ||
      boundaryStem === term ||
      boundaryComponents.some((component) => component === term) ||
      normalizedBoundary.includes(term)
    ) {
      return true;
    }
  }

  return false;
}
