/**
 * G9 — affected-check discovery proofs.
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";

const CHECKOUT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const AFFECTED = join(CHECKOUT_ROOT, "scripts/pathcode-cli/ag9/affected.mjs");

/** @type {string[]} */
const temps: string[] = [];

afterEach(() => {
  while (temps.length) {
    const p = temps.pop();
    if (!p) continue;
    try {
      rmSync(p, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

function tmpFixture(label: string): string {
  const dir = mkdtempSync(join(tmpdir(), `pathcode-g9-aff-${label}-`));
  temps.push(dir);
  return dir;
}

async function loadAffected() {
  return import(`${pathToFileURL(AFFECTED).href}?g9=${randomUUID()}`);
}

describe("G9 discoverAffectedChecks", () => {
  it("classifies Nx as PROJECT_EXACT when nx.json present", async () => {
    const { discoverAffectedChecks } = await loadAffected();
    const root = tmpFixture("nx");
    writeFileSync(join(root, "nx.json"), JSON.stringify({ targetDefaults: {} }));
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ name: "mono", private: true }),
    );
    // Local nx shim so we don't depend on host nx.
    mkdirSync(join(root, "node_modules", ".bin"), { recursive: true });
    writeFileSync(join(root, "node_modules", ".bin", "nx"), "#!/bin/sh\nexit 0\n", {
      mode: 0o755,
    });

    const result = discoverAffectedChecks(root);
    expect(result.classification).toBe("PROJECT_EXACT");
    expect(result.source).toBe("nx");
    expect(result.commands.length).toBeGreaterThan(0);
    expect(result.commands.some((c: string) => /affected/i.test(c))).toBe(true);
    expect(result.evidence.some((e: string) => e.includes("nx.json"))).toBe(true);
  });

  it("classifies turbo.json as PROJECT_EXACT", async () => {
    const { discoverAffectedChecks } = await loadAffected();
    const root = tmpFixture("turbo");
    writeFileSync(join(root, "turbo.json"), JSON.stringify({ pipeline: { test: {} } }));
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "t" }));
    mkdirSync(join(root, "node_modules", ".bin"), { recursive: true });
    writeFileSync(
      join(root, "node_modules", ".bin", "turbo"),
      "#!/bin/sh\nexit 0\n",
      { mode: 0o755 },
    );

    const result = discoverAffectedChecks(root);
    expect(result.classification).toBe("PROJECT_EXACT");
    expect(result.source).toBe("turbo");
    expect(result.commands.some((c: string) => /turbo/i.test(c))).toBe(true);
  });

  it("classifies pnpm workspace as PROJECT_EXACT", async () => {
    const { discoverAffectedChecks } = await loadAffected();
    const root = tmpFixture("pnpm");
    writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "ws" }));
    writeFileSync(join(root, "pnpm-lock.yaml"), "lockfileVersion: 9\n");

    const result = discoverAffectedChecks(root);
    // If pnpm is on PATH → PROJECT_EXACT; otherwise evidence still records workspace.
    if (result.source === "pnpm" && result.commands.length) {
      expect(result.classification).toBe("PROJECT_EXACT");
      expect(result.commands.some((c: string) => /pnpm/i.test(c))).toBe(true);
    } else {
      expect(result.evidence.some((e: string) => /pnpm/i.test(e))).toBe(true);
    }
  });

  it("classifies Cargo workspace as CONSERVATIVE with -p commands", async () => {
    const { discoverAffectedChecks } = await loadAffected();
    const root = tmpFixture("cargo");
    writeFileSync(
      join(root, "Cargo.toml"),
      `[workspace]\nmembers = ["crates/foo", "crates/bar"]\n`,
    );

    const result = discoverAffectedChecks(root);
    if (result.source.startsWith("cargo")) {
      expect(["CONSERVATIVE", "PROJECT_EXACT"]).toContain(result.classification);
      expect(result.commands.length).toBeGreaterThan(0);
      expect(
        result.commands.some(
          (c: string) => /cargo test/.test(c) && (/ -p /.test(c) || /--workspace/.test(c)),
        ),
      ).toBe(true);
    } else {
      // cargo missing on PATH — still UNAVAILABLE or evidence of Cargo.toml
      expect(result.evidence.some((e: string) => /Cargo/i.test(e))).toBe(true);
    }
  });

  it("returns UNAVAILABLE for empty project", async () => {
    const { discoverAffectedChecks } = await loadAffected();
    const root = tmpFixture("empty");
    writeFileSync(join(root, "README.md"), "hi\n");
    const result = discoverAffectedChecks(root);
    expect(result.classification).toBe("UNAVAILABLE");
    expect(result.commands).toEqual([]);
  });
});
