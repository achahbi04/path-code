/**
 * Fixed, closed manifest registry for Phase 2D.
 * Not caller-extensible.
 */

export type ManifestKind =
  | "package.json"
  | "composer.json"
  | "tsconfig.json"
  | "pyproject.toml"
  | "requirements.txt"
  | "Cargo.toml"
  | "go.mod"
  | "pom.xml"
  | "Gemfile";

export type ManifestFormat =
  | "JSON_STRICT"
  | "JSON_STRICT_ATTEMPT"
  | "UNPARSED_TEXT";

export type ManifestRegistryEntry = {
  readonly basename: ManifestKind;
  readonly format: ManifestFormat;
};

export const MANIFEST_REGISTRY: readonly ManifestRegistryEntry[] = [
  { basename: "package.json", format: "JSON_STRICT" },
  { basename: "composer.json", format: "JSON_STRICT" },
  { basename: "tsconfig.json", format: "JSON_STRICT_ATTEMPT" },
  { basename: "pyproject.toml", format: "UNPARSED_TEXT" },
  { basename: "requirements.txt", format: "UNPARSED_TEXT" },
  { basename: "Cargo.toml", format: "UNPARSED_TEXT" },
  { basename: "go.mod", format: "UNPARSED_TEXT" },
  { basename: "pom.xml", format: "UNPARSED_TEXT" },
  { basename: "Gemfile", format: "UNPARSED_TEXT" },
] as const;

const REGISTRY_BY_BASENAME = new Map<string, ManifestRegistryEntry>(
  MANIFEST_REGISTRY.map((entry) => [entry.basename, entry]),
);

export function lookupManifestRegistry(
  basename: string,
): ManifestRegistryEntry | undefined {
  return REGISTRY_BY_BASENAME.get(basename);
}

export function manifestBasename(relativePath: string): string {
  const slash = relativePath.lastIndexOf("/");
  return slash === -1 ? relativePath : relativePath.slice(slash + 1);
}
