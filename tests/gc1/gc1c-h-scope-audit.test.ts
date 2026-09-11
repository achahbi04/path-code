/**
 * GC1-c H-scope audit — effective hydration set disclosure + allowlist bounds.
 */

import { createHash, randomUUID } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const CHECKOUT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const GC1 = join(CHECKOUT, "scripts/pathcode-cli/gc1");
const CLOUD_SESSION = join(GC1, "cloud-session.mjs");
const temps: string[] = [];
afterEach(() => {
  for (const t of temps.splice(0)) {
    try {
      rmSync(t, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

async function load() {
  const b = randomUUID();
  return {
    ...(await import(`${pathToFileURL(join(GC1, "task-snapshot.mjs")).href}?b=${b}`)),
    ...(await import(`${pathToFileURL(join(GC1, "cloud-session.mjs")).href}?b=${b}`)),
  };
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function fixtureInventory() {
  // Conceptual fixture:
  //   E: src/edit.ts
  //   P: src/context.ts
  //   support: package.json (allowlisted)
  //   sibling: src/sibling.ts (NOT in H)
  //   secret: .env (NOT in H; refused)
  return {
    entries: [
      { relativePath: "src/edit.ts" },
      { relativePath: "src/context.ts" },
      { relativePath: "package.json" },
      { relativePath: "src/sibling.ts" },
      { relativePath: ".env" },
    ],
    observations: [
      { disposition: "ADMITTED", relativePath: "src/edit.ts", entry: { relativePath: "src/edit.ts" } },
      { disposition: "ADMITTED", relativePath: "src/context.ts", entry: { relativePath: "src/context.ts" } },
      { disposition: "ADMITTED", relativePath: "package.json", entry: { relativePath: "package.json" } },
      { disposition: "ADMITTED", relativePath: "src/sibling.ts", entry: { relativePath: "src/sibling.ts" } },
      { disposition: "ADMITTED", relativePath: ".env", entry: { relativePath: ".env" } },
    ],
  };
}

function approvedEP() {
  return {
    editableTargets: [{ relativePath: "src/edit.ts" }],
    contextPaths: [{ relativePath: "src/context.ts" }],
  };
}

describe("GC1-c H-scope audit", () => {
  it("computeEffectiveHydrationSet = E ∪ P ∪ allowlisted support only", async () => {
    const {
      computeEffectiveHydrationSet,
      resolveHydrationPaths,
      collectValidationSupportPaths,
      assertHydrationSetExact,
      VALIDATION_SUPPORT_BASENAMES,
      normalizeHydrationRelativePath,
      captureTaskSnapshot,
    } = await load();

    const inventory = fixtureInventory();
    const approved = approvedEP();

    const support = collectValidationSupportPaths(inventory);
    expect(support).toEqual(["package.json"]);
    for (const p of support) {
      const base = p.split("/").pop()!;
      expect(VALIDATION_SUPPORT_BASENAMES).toContain(base);
    }
    // Sibling must never be emitted by support collector.
    expect(support).not.toContain("src/sibling.ts");
    expect(support).not.toContain(".env");

    const set = computeEffectiveHydrationSet({ approved, inventory });
    expect(set.hydrationPaths).toEqual([
      "package.json",
      "src/context.ts",
      "src/edit.ts",
    ]);
    expect(set.editable).toEqual(["src/edit.ts"]);
    expect(set.context).toEqual(["src/context.ts"]);
    expect(set.supportOnly).toEqual(["package.json"]);
    // supportOnly paths are not in editable or context
    for (const p of set.supportOnly) {
      expect(set.editable).not.toContain(p);
      expect(set.context).not.toContain(p);
    }

    assertHydrationSetExact(set, {
      mustInclude: ["src/edit.ts", "src/context.ts", "package.json"],
      mustExclude: ["src/sibling.ts", ".env"],
    });
    expect(() =>
      assertHydrationSetExact(set, { mustInclude: ["src/sibling.ts"] }),
    ).toThrow(/H missing/);

    // resolve with omitted hydrationPaths matches compute
    expect(
      resolveHydrationPaths(approved, {
        supportPaths: collectValidationSupportPaths(inventory),
      }),
    ).toEqual(set.hydrationPaths);

    // Secret refused by normalize / capture
    expect(normalizeHydrationRelativePath(".env").ok).toBe(false);
    expect(normalizeHydrationRelativePath(".env").code).toBe("PATH_SECRET");

    const root = mkdtempSync(join(tmpdir(), "gc1c-h-scope-"));
    temps.push(root);
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src/edit.ts"), "export const edit = 1;\n");
    writeFileSync(join(root, "src/context.ts"), "export const ctx = 1;\n");
    writeFileSync(join(root, "src/sibling.ts"), "export const sib = 1;\n");
    writeFileSync(join(root, "package.json"), '{"name":"h-scope"}\n');
    writeFileSync(join(root, ".env"), "SECRET=1\n");

    await expect(
      captureTaskSnapshot({
        projectRoot: root,
        hydrationPaths: [...set.hydrationPaths, ".env"],
      }),
    ).rejects.toMatchObject({ code: "PATH_SECRET" });

    const snap = await captureTaskSnapshot({
      projectRoot: root,
      hydrationPaths: set.hydrationPaths,
    });
    expect(snap.manifest.files.map((f: { relativePath: string }) => f.relativePath)).toEqual(
      set.hydrationPaths,
    );
    // When TARGETED_TEST is planned, host-deterministic test/spec paths join H
    // as support-only — still not siblings/secrets.
    const withTests = computeEffectiveHydrationSet({
      approved,
      inventory: {
        ...inventory,
        entries: [
          ...inventory.entries,
          { relativePath: "src/edit.test.ts" },
          { relativePath: "src/sibling.ts" },
        ],
        observations: [
          ...inventory.observations,
          {
            disposition: "ADMITTED",
            relativePath: "src/edit.test.ts",
            entry: { relativePath: "src/edit.test.ts" },
          },
        ],
      },
      plannedCheckKinds: ["TYPECHECK", "TARGETED_TEST"],
    });
    expect(withTests.hydrationPaths).toContain("src/edit.test.ts");
    expect(withTests.supportOnly).toContain("src/edit.test.ts");
    expect(withTests.hydrationPaths).not.toContain("src/sibling.ts");
    expect(withTests.editable).not.toContain("src/edit.test.ts");
    expect(withTests.context).not.toContain("src/edit.test.ts");
  });

  it("falsify: mutating collectValidationSupportPaths to admit sibling fails; restore by hash", async () => {
    const before = sha256File(CLOUD_SESSION);
    const original = readFileSync(CLOUD_SESSION, "utf8");
    expect(original).toContain("VALIDATION_SUPPORT_BASENAMES");
    expect(original).toMatch(/host-deterministic allowlist/i);

    // Mutation: widen allowlist to include a non-support source basename.
    const mutated = original.replace(
      'export const VALIDATION_SUPPORT_BASENAMES = Object.freeze([\n  "package.json",',
      'export const VALIDATION_SUPPORT_BASENAMES = Object.freeze([\n  "sibling.ts",\n  "package.json",',
    );
    expect(mutated).not.toBe(original);
    writeFileSync(CLOUD_SESSION, mutated);
    try {
      expect(sha256File(CLOUD_SESSION)).not.toBe(before);
      const mod = await import(
        `${pathToFileURL(CLOUD_SESSION).href}?falsify=${randomUUID()}`
      );
      expect(mod.VALIDATION_SUPPORT_BASENAMES).toContain("sibling.ts");
      const widened = mod.collectValidationSupportPaths(fixtureInventory());
      // Widened collector would admit sibling — that is the falsifying observation.
      expect(widened).toContain("src/sibling.ts");
      // Canonical floor: allowlist must NOT contain arbitrary source basenames.
      expect(original).not.toMatch(/"sibling\.ts"/);
    } finally {
      writeFileSync(CLOUD_SESSION, original);
    }
    expect(sha256File(CLOUD_SESSION)).toBe(before);

    // Restored module excludes sibling again.
    const restored = await import(
      `${pathToFileURL(CLOUD_SESSION).href}?restored=${randomUUID()}`
    );
    expect(restored.VALIDATION_SUPPORT_BASENAMES).not.toContain("sibling.ts");
    expect(restored.collectValidationSupportPaths(fixtureInventory())).toEqual([
      "package.json",
    ]);
  });
});
