/**
 * G9 — project version preference resolution.
 * Preference: wrapper → version_file → manifest → host → path_default.
 * Never claim path_default as project-defined.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { whichBinary } from "../ag8/discover.mjs";

/**
 * @typedef {'wrapper'|'version_file'|'manifest'|'host'|'path_default'} VersionSource
 * @typedef {{ version: string, source: VersionSource, evidence: string[] }} ResolvedToolVersion
 */

/**
 * @param {string} root
 * @param {string} rel
 */
function has(root, rel) {
  try {
    return existsSync(join(root, rel));
  } catch {
    return false;
  }
}

/**
 * @param {string} root
 * @param {string} rel
 * @returns {string | null}
 */
function readText(root, rel) {
  try {
    return readFileSync(join(root, rel), "utf8");
  } catch {
    return null;
  }
}

/**
 * @param {string} text
 * @returns {string | null}
 */
function firstNonEmptyLine(text) {
  if (typeof text !== "string") return null;
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    return t;
  }
  return null;
}

/**
 * Strip leading `v` / `=` / ranges to a usable mise-ish version token when possible.
 * @param {string} raw
 */
function normalizeVersionToken(raw) {
  let v = String(raw || "").trim();
  if (!v) return "";
  v = v.replace(/^[=vV]/, "");
  // packageManager "pnpm@9.0.0" → keep after @
  if (v.includes("@") && !v.startsWith("@")) {
    const at = v.lastIndexOf("@");
    v = v.slice(at + 1);
  }
  // engines ranges like ">=20" / "^18.0.0" → major when obvious
  const ge = v.match(/^>=?\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (ge) {
    return ge[2] != null ? `${ge[1]}.${ge[2]}${ge[3] != null ? `.${ge[3]}` : ""}` : ge[1];
  }
  const caret = v.match(/^\^\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (caret) {
    return caret[2] != null
      ? `${caret[1]}.${caret[2]}${caret[3] != null ? `.${caret[3]}` : ""}`
      : caret[1];
  }
  const plain = v.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (plain) {
    return plain[0];
  }
  return v;
}

/**
 * @param {string} bin
 * @returns {string | null}
 */
function hostVersion(bin) {
  const exe = whichBinary(bin);
  if (!exe) return null;
  try {
    const probe = spawnSync(exe, ["--version"], {
      encoding: "utf8",
      timeout: 8_000,
      env: process.env,
    });
    const out = `${probe.stdout || ""}${probe.stderr || ""}`.trim();
    const m = out.match(/(\d+\.\d+(?:\.\d+)?)/);
    return m ? m[1] : out.split(/\s+/)[0] || null;
  } catch {
    return null;
  }
}

/**
 * @param {string} projectRoot
 * @returns {ResolvedToolVersion}
 */
function resolveNode(projectRoot) {
  /** @type {string[]} */
  const evidence = [];

  for (const f of [".nvmrc", ".node-version"]) {
    if (has(projectRoot, f)) {
      const raw = firstNonEmptyLine(readText(projectRoot, f) || "");
      if (raw) {
        evidence.push(f);
        return {
          version: normalizeVersionToken(raw),
          source: "version_file",
          evidence,
        };
      }
      evidence.push(`${f} empty`);
    }
  }

  if (has(projectRoot, "package.json")) {
    try {
      const pkg = JSON.parse(readText(projectRoot, "package.json") || "{}");
      if (typeof pkg.packageManager === "string" && /node@/i.test(pkg.packageManager)) {
        const m = pkg.packageManager.match(/node@([^\s]+)/i);
        if (m) {
          evidence.push("package.json packageManager node@");
          return {
            version: normalizeVersionToken(m[1]),
            source: "manifest",
            evidence,
          };
        }
      }
      const enginesNode =
        pkg.engines && typeof pkg.engines.node === "string" ? pkg.engines.node : null;
      if (enginesNode) {
        evidence.push("package.json engines.node");
        return {
          version: normalizeVersionToken(enginesNode),
          source: "manifest",
          evidence,
        };
      }
      evidence.push("package.json (no engines.node)");
    } catch {
      evidence.push("package.json unreadable");
    }
  }

  const hv = hostVersion("node");
  if (hv) {
    evidence.push(`host node ${hv}`);
    return { version: hv, source: "host", evidence };
  }

  evidence.push("PATH default node@lts");
  return { version: "lts", source: "path_default", evidence };
}

/**
 * @param {string} projectRoot
 * @returns {ResolvedToolVersion}
 */
function resolvePython(projectRoot) {
  /** @type {string[]} */
  const evidence = [];

  if (has(projectRoot, ".python-version")) {
    const raw = firstNonEmptyLine(readText(projectRoot, ".python-version") || "");
    if (raw) {
      evidence.push(".python-version");
      return {
        version: normalizeVersionToken(raw),
        source: "version_file",
        evidence,
      };
    }
  }

  if (has(projectRoot, "pyproject.toml")) {
    const text = readText(projectRoot, "pyproject.toml") || "";
    evidence.push("pyproject.toml");
    const requires =
      text.match(/requires-python\s*=\s*["']([^"']+)["']/i) ||
      text.match(/python\s*=\s*["']([^"']+)["']/i);
    if (requires) {
      return {
        version: normalizeVersionToken(requires[1]),
        source: "manifest",
        evidence: [...evidence, "requires-python / python pin"],
      };
    }
  }

  const hv = hostVersion("python3") || hostVersion("python");
  if (hv) {
    evidence.push(`host python ${hv}`);
    return { version: hv, source: "host", evidence };
  }

  evidence.push("PATH default python@3.12");
  return { version: "3.12", source: "path_default", evidence };
}

/**
 * @param {string} projectRoot
 * @returns {ResolvedToolVersion}
 */
function resolveGo(projectRoot) {
  /** @type {string[]} */
  const evidence = [];
  if (has(projectRoot, "go.mod")) {
    evidence.push("go.mod");
    const text = readText(projectRoot, "go.mod") || "";
    const m = text.match(/^go\s+(\d+\.\d+(?:\.\d+)?)/m);
    if (m) {
      return { version: m[1], source: "manifest", evidence };
    }
  }
  const hv = hostVersion("go");
  if (hv) {
    evidence.push(`host go ${hv}`);
    return { version: hv, source: "host", evidence };
  }
  evidence.push("PATH default go@1.22");
  return { version: "1.22", source: "path_default", evidence };
}

/**
 * @param {string} projectRoot
 * @returns {ResolvedToolVersion}
 */
function resolveRust(projectRoot) {
  /** @type {string[]} */
  const evidence = [];

  if (has(projectRoot, "rust-toolchain.toml") || has(projectRoot, "rust-toolchain")) {
    const rel = has(projectRoot, "rust-toolchain.toml")
      ? "rust-toolchain.toml"
      : "rust-toolchain";
    evidence.push(rel);
    const text = readText(projectRoot, rel) || "";
    const channelMatch = text.match(/channel\s*=\s*["']([^"']+)["']/);
    const ver =
      (channelMatch && channelMatch[1]) ||
      firstNonEmptyLine(text.replace(/^#.*$/gm, ""));
    if (ver) {
      return {
        version: normalizeVersionToken(ver),
        source: "version_file",
        evidence,
      };
    }
  }

  if (has(projectRoot, "Cargo.toml")) {
    evidence.push("Cargo.toml");
    const text = readText(projectRoot, "Cargo.toml") || "";
    const m = text.match(/rust-version\s*=\s*["']([^"']+)["']/);
    if (m) {
      return {
        version: normalizeVersionToken(m[1]),
        source: "manifest",
        evidence,
      };
    }
  }

  const hv = hostVersion("rustc");
  if (hv) {
    evidence.push(`host rustc ${hv}`);
    return { version: hv, source: "host", evidence };
  }

  evidence.push("PATH default rust@stable");
  return { version: "stable", source: "path_default", evidence };
}

/**
 * @param {string} projectRoot
 * @returns {ResolvedToolVersion}
 */
function resolveJava(projectRoot) {
  /** @type {string[]} */
  const evidence = [];

  if (has(projectRoot, "mvnw") || has(projectRoot, "gradlew")) {
    evidence.push(has(projectRoot, "mvnw") ? "mvnw" : "gradlew");
    // Wrapper present — version still from toolchain files when available.
  }

  for (const f of [".java-version", ".sdkmanrc"]) {
    if (has(projectRoot, f)) {
      const text = readText(projectRoot, f) || "";
      const raw =
        f === ".sdkmanrc"
          ? (text.match(/java\s*=\s*([^\s]+)/i) || [])[1]
          : firstNonEmptyLine(text);
      if (raw) {
        evidence.push(f);
        return {
          version: normalizeVersionToken(raw.replace(/.*-(\d+).*/, "$1") || raw),
          source: "version_file",
          evidence,
        };
      }
    }
  }

  if (has(projectRoot, "pom.xml")) {
    evidence.push("pom.xml");
    const text = readText(projectRoot, "pom.xml") || "";
    const m =
      text.match(/<maven\.compiler\.(?:release|source|target)>\s*(\d+)\s*</) ||
      text.match(/<java\.version>\s*(\d+)\s*</) ||
      text.match(/<release>\s*(\d+)\s*</);
    if (m) {
      return { version: m[1], source: "manifest", evidence };
    }
  }

  for (const f of ["build.gradle", "build.gradle.kts"]) {
    if (!has(projectRoot, f)) continue;
    evidence.push(f);
    const text = readText(projectRoot, f) || "";
    const m =
      text.match(/JavaVersion\.VERSION_(\d+)/) ||
      text.match(/jvmToolchain\s*\(\s*(\d+)\s*\)/) ||
      text.match(/sourceCompatibility\s*=\s*['"]?(\d+)/) ||
      text.match(/languageVersion\s*=\s*JavaLanguageVersion\.of\((\d+)\)/);
    if (m) {
      return { version: m[1], source: "manifest", evidence };
    }
  }

  if (has(projectRoot, "mvnw") || has(projectRoot, "gradlew")) {
    return {
      version: "21",
      source: "wrapper",
      evidence: [...evidence, "wrapper present; PATH default JDK 21 unless host"],
    };
  }

  const hv = hostVersion("java");
  if (hv) {
    evidence.push(`host java ${hv}`);
    return { version: hv, source: "host", evidence };
  }

  evidence.push("PATH default java@21");
  return { version: "21", source: "path_default", evidence };
}

/**
 * Maven version is independent of JDK major.
 * @param {string} projectRoot
 * @returns {ResolvedToolVersion}
 */
function resolveMaven(projectRoot) {
  /** @type {string[]} */
  const evidence = [];
  if (has(projectRoot, ".mvn/wrapper/maven-wrapper.properties")) {
    evidence.push(".mvn/wrapper/maven-wrapper.properties");
    const text = readText(projectRoot, ".mvn/wrapper/maven-wrapper.properties") || "";
    const m = text.match(/distributionUrl=.*apache-maven-([0-9.]+)-bin/);
    if (m) {
      return { version: m[1], source: "wrapper", evidence };
    }
  }
  const hv = hostVersion("mvn");
  if (hv) {
    evidence.push(`host mvn ${hv}`);
    return { version: hv, source: "host", evidence };
  }
  evidence.push("PATH default maven@3.9.9");
  return { version: "3.9.9", source: "path_default", evidence };
}

/**
 * @param {string} projectRoot
 * @returns {ResolvedToolVersion}
 */
function resolveGradle(projectRoot) {
  /** @type {string[]} */
  const evidence = [];
  if (has(projectRoot, "gradle/wrapper/gradle-wrapper.properties")) {
    evidence.push("gradle/wrapper/gradle-wrapper.properties");
    const text =
      readText(projectRoot, "gradle/wrapper/gradle-wrapper.properties") || "";
    const m = text.match(/gradle-([0-9.]+)-/);
    if (m) {
      return { version: m[1], source: "wrapper", evidence };
    }
  }
  const hv = hostVersion("gradle");
  if (hv) {
    evidence.push(`host gradle ${hv}`);
    return { version: hv, source: "host", evidence };
  }
  evidence.push("PATH default gradle@8.10.2");
  return { version: "8.10.2", source: "path_default", evidence };
}

/**
 * @param {string} projectRoot
 * @returns {ResolvedToolVersion}
 */
function resolveCsharp(projectRoot) {
  /** @type {string[]} */
  const evidence = [];
  if (has(projectRoot, "global.json")) {
    evidence.push("global.json");
    try {
      const g = JSON.parse(readText(projectRoot, "global.json") || "{}");
      const ver = g?.sdk?.version;
      if (typeof ver === "string" && ver) {
        return {
          version: normalizeVersionToken(ver),
          source: "manifest",
          evidence,
        };
      }
    } catch {
      evidence.push("global.json unreadable");
    }
  }
  const hv = hostVersion("dotnet");
  if (hv) {
    evidence.push(`host dotnet ${hv}`);
    return { version: hv, source: "host", evidence };
  }
  evidence.push("PATH default dotnet@8");
  return { version: "8", source: "path_default", evidence };
}

/**
 * Resolve preferred tool version for a project.
 *
 * @param {string} projectRoot
 * @param {string} toolId node|python|go|rust|java|csharp|dotnet|cargo|…
 * @returns {ResolvedToolVersion}
 */
export function resolveToolVersion(projectRoot, toolId) {
  const root =
    typeof projectRoot === "string" && projectRoot.trim()
      ? projectRoot.trim()
      : process.cwd();
  const id = String(toolId || "")
    .trim()
    .toLowerCase();

  switch (id) {
    case "node":
    case "nodejs":
      return resolveNode(root);
    case "python":
    case "python3":
      return resolvePython(root);
    case "go":
    case "golang":
      return resolveGo(root);
    case "rust":
    case "rustc":
    case "cargo":
      return resolveRust(root);
    case "java":
    case "jdk":
    case "openjdk":
      return resolveJava(root);
    case "maven":
    case "mvn":
      return resolveMaven(root);
    case "gradle":
      return resolveGradle(root);
    case "csharp":
    case "dotnet":
    case "csharp-ls":
      return resolveCsharp(root);
    default: {
      const hv = hostVersion(id);
      if (hv) {
        return {
          version: hv,
          source: "host",
          evidence: [`host ${id} ${hv}`],
        };
      }
      return {
        version: "latest",
        source: "path_default",
        evidence: [`no project pin for ${id}; PATH default latest`],
      };
    }
  }
}
