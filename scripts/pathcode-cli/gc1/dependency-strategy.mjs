/**
 * Phase GC1-b — deterministic project dependency install strategy.
 * The repository (lockfiles/manifests) is authority; the Engineering Image
 * only supplies toolchains.
 */

/**
 * @param {string[]|Set<string>|{files?: string[], listing?: string[]}|string} rootListingOrFiles
 *   Basename listing, relative paths, or a single path string. Directory
 *   prefixes are ignored — only basenames participate in detection.
 * @returns {{ ecosystem: string, installer: string, args: string[], reason: string }}
 */
export function detectDependencyStrategy(rootListingOrFiles) {
  const names = normalizeListing(rootListingOrFiles);

  // JS / TS — lockfile precedence: pnpm > yarn > npm > package.json alone
  if (names.has("pnpm-lock.yaml")) {
    return {
      ecosystem: "node-pnpm",
      installer: "pnpm",
      args: ["install", "--frozen-lockfile"],
      reason: "pnpm-lock.yaml present (highest JS lockfile precedence)",
    };
  }
  if (names.has("yarn.lock")) {
    return {
      ecosystem: "node-yarn",
      installer: "yarn",
      args: ["install", "--immutable"],
      reason: "yarn.lock present (precedes package-lock.json / package.json)",
    };
  }
  if (names.has("package-lock.json")) {
    return {
      ecosystem: "node-npm",
      installer: "npm",
      args: ["ci"],
      reason: "package-lock.json present (npm ci)",
    };
  }
  if (names.has("package.json")) {
    return {
      ecosystem: "node-npm",
      installer: "npm",
      args: ["install"],
      reason: "package.json without lockfile (non-frozen npm install)",
    };
  }

  // Python — uv.lock > requirements.txt
  if (names.has("uv.lock")) {
    return {
      ecosystem: "python-uv",
      installer: "uv",
      args: ["sync"],
      reason: "uv.lock present",
    };
  }
  if (names.has("requirements.txt")) {
    return {
      ecosystem: "python-pip",
      installer: "pip",
      args: ["install", "-r", "requirements.txt"],
      reason: "requirements.txt present (no uv.lock)",
    };
  }

  if (names.has("Cargo.lock") || names.has("Cargo.toml")) {
    return {
      ecosystem: "rust-cargo",
      installer: "cargo",
      args: names.has("Cargo.lock") ? ["fetch"] : ["fetch"],
      reason: names.has("Cargo.lock")
        ? "Cargo.lock present"
        : "Cargo.toml present (no Cargo.lock)",
    };
  }

  if (names.has("go.mod")) {
    return {
      ecosystem: "go-modules",
      installer: "go",
      args: ["mod", "download"],
      reason: "go.mod present",
    };
  }

  if (names.has("pom.xml")) {
    return {
      ecosystem: "java-maven",
      installer: "mvn",
      args: ["-B", "dependency:resolve"],
      reason: "pom.xml present",
    };
  }

  if (names.has("build.gradle.kts") || names.has("build.gradle")) {
    const which = names.has("build.gradle.kts")
      ? "build.gradle.kts"
      : "build.gradle";
    return {
      ecosystem: "java-gradle",
      installer: "gradle",
      args: ["dependencies", "--quiet"],
      reason: `${which} present`,
    };
  }

  return {
    ecosystem: "none",
    installer: "none",
    args: [],
    reason: "no recognized lockfile or manifest at repository root",
  };
}

/**
 * @param {unknown} input
 * @returns {Set<string>}
 */
function normalizeListing(input) {
  /** @type {string[]} */
  let items = [];
  if (typeof input === "string") {
    items = input.split(/[\n,]/u).map((s) => s.trim()).filter(Boolean);
  } else if (Array.isArray(input)) {
    items = input.map(String);
  } else if (input instanceof Set) {
    items = [...input].map(String);
  } else if (input && typeof input === "object") {
    const obj = /** @type {{ files?: unknown, listing?: unknown }} */ (input);
    const raw = obj.files ?? obj.listing ?? [];
    items = Array.isArray(raw) ? raw.map(String) : [];
  }

  const basenames = new Set();
  for (const item of items) {
    const normalized = item.replace(/\\/g, "/").replace(/^\.\//, "");
    const base = normalized.includes("/")
      ? normalized.slice(normalized.lastIndexOf("/") + 1)
      : normalized;
    if (base) basenames.add(base);
    // Also keep full relative for nested detection of common lock names at root only —
    // detection is root-basename oriented per GC1-b contract.
    if (!normalized.includes("/")) basenames.add(normalized);
  }
  return basenames;
}
