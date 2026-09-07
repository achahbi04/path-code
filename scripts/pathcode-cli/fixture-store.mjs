/**
 * Host-only multiply-01 fixture provisioning.
 * Sole code-writing exception before Phase 3 mutation owners take over.
 * Never overwrites; exclusive creates only inside a fresh mkdtemp directory.
 */

import { mkdir, mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const TRIAL_ID = "multiply-01";
export const MUTATION_RELATIVE_PATH = "src/calculator.ts";

export const SEED_CALCULATOR_SOURCE = `export function multiply(a: number, b: number): number {
  return a + b;
}
`;

export const FIXED_CALCULATOR_SOURCE = `export function multiply(a: number, b: number): number {
  return a * b;
}
`;

export const PACKAGE_JSON_TEXT = `${JSON.stringify(
  {
    name: "pathcode-trial-multiply-01",
    private: true,
    type: "commonjs",
  },
  null,
  2,
)}\n`;

export const TSCONFIG_TEXT = `${JSON.stringify(
  {
    compilerOptions: {
      target: "ES2020",
      module: "CommonJS",
      strict: true,
      rootDir: "src",
      outDir: ".trial-build",
      noEmitOnError: true,
      types: [],
      skipLibCheck: true,
    },
    files: ["src/calculator.ts"],
  },
  null,
  2,
)}\n`;

export const TEST_SCRIPT_TEXT = `const assert = require("node:assert/strict");
const { multiply } = require("../.trial-build/calculator.js");

assert.equal(multiply(2, 3), 6);
assert.equal(multiply(-3, 4), -12);
assert.equal(multiply(0, 9), 0);
assert.equal(multiply(-2, -3), 6);
assert.equal(multiply(1, 0), 0);
assert.equal(multiply(2.5, 4), 10);

process.stdout.write("calculator regression assertions passed\\n");
`;

/**
 * @returns {Promise<{ ok: true, root: string, files: Record<string, string> } | { ok: false, code: string, message: string }>}
 */
export async function provisionMultiply01Workspace() {
  let lexical;
  try {
    lexical = await mkdtemp(join(tmpdir(), "pathcode-trial-01-"));
  } catch (err) {
    return {
      ok: false,
      code: "MKDTEMP_FAILED",
      message: "Failed to create synthetic trial directory",
    };
  }
  let root;
  try {
    root = await realpath(lexical);
  } catch {
    return {
      ok: false,
      code: "REALPATH_FAILED",
      message: "Failed to canonicalize synthetic trial directory",
    };
  }

  const files = {
    "package.json": PACKAGE_JSON_TEXT,
    "tsconfig.json": TSCONFIG_TEXT,
    [MUTATION_RELATIVE_PATH]: SEED_CALCULATOR_SOURCE,
    "tests/calculator.test.cjs": TEST_SCRIPT_TEXT,
  };

  try {
    await mkdir(join(root, "src"), { recursive: false });
    await mkdir(join(root, "tests"), { recursive: false });
    for (const [rel, content] of Object.entries(files)) {
      await writeFile(join(root, rel), content, { encoding: "utf8", flag: "wx" });
    }
  } catch (err) {
    return {
      ok: false,
      code: "PROVISION_FAILED",
      message: "Exclusive fixture create failed; refusing to overwrite",
    };
  }

  return { ok: true, root, files };
}

/**
 * Offline proof that the seeded source fails the independent regression after
 * a correct compile of the broken source would still fail product semantics.
 * Tests invoke the real installed tsc + node against a disposable copy.
 */
export function seedSourceIsDefectiveProduct() {
  return SEED_CALCULATOR_SOURCE.includes("return a + b") &&
    !SEED_CALCULATOR_SOURCE.includes("return a * b");
}
