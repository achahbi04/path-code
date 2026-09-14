/**
 * G9 — discover project-native affected / incremental check commands.
 * Classification: PROJECT_EXACT | CONSERVATIVE | UNAVAILABLE
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { whichBinary } from "../ag8/discover.mjs";

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
 */
function readText(root, rel) {
  try {
    return readFileSync(join(root, rel), "utf8");
  } catch {
    return null;
  }
}

/**
 * @param {string} root
 * @param {string} rel
 */
function readJson(root, rel) {
  const t = readText(root, rel);
  if (!t) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

/**
 * Discover affected-check commands from package-graph tooling.
 *
 * @param {string} projectRoot
 * @returns {{
 *   classification: 'PROJECT_EXACT'|'CONSERVATIVE'|'UNAVAILABLE',
 *   commands: string[],
 *   source: string,
 *   evidence: string[],
 * }}
 */
export function discoverAffectedChecks(projectRoot) {
  /** @type {string[]} */
  const evidence = [];
  /** @type {string[]} */
  const commands = [];
  if (typeof projectRoot !== "string" || !projectRoot.trim()) {
    return {
      classification: "UNAVAILABLE",
      commands: [],
      source: "none",
      evidence: ["projectRoot required"],
    };
  }
  const root = projectRoot.trim();

  // Nx affected
  if (has(root, "nx.json")) {
    evidence.push("nx.json");
    const nx = whichBinary("nx") || (has(root, "node_modules/.bin/nx")
      ? join(root, "node_modules/.bin/nx")
      : null);
    const npx = whichBinary("npx");
    if (nx) {
      commands.push(`${nx} affected -t test`);
      commands.push(`${nx} affected -t lint`);
      evidence.push(`nx → ${nx}`);
      return {
        classification: "PROJECT_EXACT",
        commands,
        source: "nx",
        evidence,
      };
    }
    if (npx) {
      commands.push("npx nx affected -t test");
      evidence.push("nx via npx");
      return {
        classification: "PROJECT_EXACT",
        commands,
        source: "nx",
        evidence,
      };
    }
    evidence.push("nx.json present but nx binary missing");
  }

  // Turborepo
  if (has(root, "turbo.json")) {
    evidence.push("turbo.json");
    const turbo =
      whichBinary("turbo") ||
      (has(root, "node_modules/.bin/turbo")
        ? join(root, "node_modules/.bin/turbo")
        : null);
    if (turbo) {
      commands.push(`${turbo} run test --filter=...[HEAD^1]`);
      evidence.push(`turbo → ${turbo}`);
      return {
        classification: "PROJECT_EXACT",
        commands,
        source: "turbo",
        evidence,
      };
    }
    const npx = whichBinary("npx");
    if (npx) {
      commands.push("npx turbo run test --filter=...[HEAD^1]");
      return {
        classification: "PROJECT_EXACT",
        commands,
        source: "turbo",
        evidence: [...evidence, "turbo via npx"],
      };
    }
    evidence.push("turbo.json present but turbo missing");
  }

  // Bazel
  if (
    has(root, "WORKSPACE") ||
    has(root, "WORKSPACE.bazel") ||
    has(root, "MODULE.bazel") ||
    has(root, "BUILD") ||
    has(root, "BUILD.bazel")
  ) {
    evidence.push("bazel workspace markers");
    const bazel = whichBinary("bazel") || whichBinary("bazelisk");
    if (bazel) {
      commands.push(`${bazel} test --test_tag_filters=-manual //...`);
      // More precise when git diff available — still PROJECT_EXACT intent with query.
      commands.push(
        `${bazel} query 'kind(test, rdeps(//..., set($(git diff --name-only HEAD~1))))' 2>/dev/null || true`,
      );
      evidence.push(`bazel → ${bazel}`);
      return {
        classification: "PROJECT_EXACT",
        commands,
        source: "bazel",
        evidence,
      };
    }
    evidence.push("bazel markers without bazel binary");
  }

  // pnpm recursive / filter
  if (
    has(root, "pnpm-workspace.yaml") ||
    has(root, "pnpm-workspace.yml") ||
    has(root, "pnpm-lock.yaml")
  ) {
    const pnpm = whichBinary("pnpm");
    evidence.push(
      has(root, "pnpm-workspace.yaml") || has(root, "pnpm-workspace.yml")
        ? "pnpm workspace"
        : "pnpm-lock.yaml",
    );
    if (pnpm) {
      if (has(root, "pnpm-workspace.yaml") || has(root, "pnpm-workspace.yml")) {
        commands.push(`${pnpm} -r --filter=...[HEAD^1] test`);
        evidence.push(`pnpm → ${pnpm}`);
        return {
          classification: "PROJECT_EXACT",
          commands,
          source: "pnpm",
          evidence,
        };
      }
      commands.push(`${pnpm} test`);
      return {
        classification: "CONSERVATIVE",
        commands,
        source: "pnpm",
        evidence: [...evidence, "single-package pnpm test"],
      };
    }
    evidence.push("pnpm not on PATH");
  }

  // npm/yarn workspaces — conservative
  const pkg = readJson(root, "package.json");
  if (pkg) {
    evidence.push("package.json");
    const hasWorkspaces =
      (Array.isArray(pkg.workspaces) && pkg.workspaces.length > 0) ||
      (pkg.workspaces &&
        typeof pkg.workspaces === "object" &&
        Array.isArray(pkg.workspaces.packages) &&
        pkg.workspaces.packages.length > 0);
    if (hasWorkspaces) {
      const npm = whichBinary("npm");
      const yarn = whichBinary("yarn");
      if (yarn) {
        commands.push(`${yarn} workspaces run test`);
        return {
          classification: "CONSERVATIVE",
          commands,
          source: "yarn-workspaces",
          evidence: [...evidence, "yarn workspaces"],
        };
      }
      if (npm) {
        commands.push(`${npm} test --workspaces --if-present`);
        return {
          classification: "CONSERVATIVE",
          commands,
          source: "npm-workspaces",
          evidence: [...evidence, "npm workspaces"],
        };
      }
    }
    if (pkg.scripts && typeof pkg.scripts.test === "string") {
      const npm = whichBinary("npm");
      if (npm) {
        commands.push(`${npm} test`);
        return {
          classification: "CONSERVATIVE",
          commands,
          source: "npm-test",
          evidence: [...evidence, "package.json scripts.test"],
        };
      }
    }
  }

  // Cargo workspace / package
  if (has(root, "Cargo.toml")) {
    const cargoToml = readText(root, "Cargo.toml") || "";
    evidence.push("Cargo.toml");
    const cargo = whichBinary("cargo");
    if (cargo) {
      if (/\[workspace\]/i.test(cargoToml)) {
        // Prefer testing changed packages when names can be guessed from members.
        const members = [...cargoToml.matchAll(/members\s*=\s*\[([^\]]*)\]/gim)];
        /** @type {string[]} */
        const pkgs = [];
        for (const m of members) {
          for (const part of (m[1] || "").split(",")) {
            const cleaned = part.replace(/["'\s]/g, "");
            if (cleaned) pkgs.push(cleaned.split("/").pop() || cleaned);
          }
        }
        if (pkgs.length > 0) {
          for (const p of pkgs.slice(0, 8)) {
            commands.push(`${cargo} test -p ${p}`);
          }
          evidence.push(`workspace members≈${pkgs.length}`);
          return {
            classification: "CONSERVATIVE",
            commands,
            source: "cargo-workspace",
            evidence,
          };
        }
        commands.push(`${cargo} test --workspace`);
        return {
          classification: "CONSERVATIVE",
          commands,
          source: "cargo-workspace",
          evidence,
        };
      }
      commands.push(`${cargo} test`);
      return {
        classification: "CONSERVATIVE",
        commands,
        source: "cargo",
        evidence,
      };
    }
    evidence.push("cargo not on PATH");
  }

  // Go modules / workspaces
  if (has(root, "go.mod") || has(root, "go.work")) {
    evidence.push(has(root, "go.work") ? "go.work" : "go.mod");
    const go = whichBinary("go");
    if (go) {
      if (has(root, "go.work")) {
        commands.push(`${go} test ./...`);
        return {
          classification: "CONSERVATIVE",
          commands,
          source: "go-work",
          evidence,
        };
      }
      // Heuristic: multiple modules under subdirs
      const moduleDirs = findGoModules(root);
      if (moduleDirs.length > 1) {
        for (const d of moduleDirs.slice(0, 8)) {
          commands.push(`${go} test ./${d}/...`);
        }
        evidence.push(`go modules=${moduleDirs.length}`);
        return {
          classification: "CONSERVATIVE",
          commands,
          source: "go-modules",
          evidence,
        };
      }
      commands.push(`${go} test ./...`);
      return {
        classification: "CONSERVATIVE",
        commands,
        source: "go",
        evidence,
      };
    }
    evidence.push("go not on PATH");
  }

  return {
    classification: "UNAVAILABLE",
    commands: [],
    source: "none",
    evidence: evidence.length ? evidence : ["no affected mechanism detected"],
  };
}

/**
 * @param {string} root
 * @returns {string[]}
 */
function findGoModules(root) {
  /** @type {string[]} */
  const out = [];
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    if (ent.name.startsWith(".") || ent.name === "vendor") continue;
    if (has(root, join(ent.name, "go.mod"))) out.push(ent.name);
  }
  return out;
}
