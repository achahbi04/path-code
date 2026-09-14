/**
 * G9 — SCIP fingerprint + stale-index refusal proofs.
 */

import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";

const CHECKOUT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const SCIP = join(CHECKOUT_ROOT, "scripts/pathcode-cli/ag9/scip.mjs");

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
  const dir = mkdtempSync(join(tmpdir(), `pathcode-g9-scip-${label}-`));
  temps.push(dir);
  return dir;
}

async function loadScip() {
  return import(`${pathToFileURL(SCIP).href}?g9=${randomUUID()}`);
}

describe("G9 scipFingerprint + shouldBuildScipIndex", () => {
  it("shouldBuildScipIndex is true for pnpm-workspace monorepo", async () => {
    const { shouldBuildScipIndex } = await loadScip();
    const root = tmpFixture("ws");
    writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - 'packages/*'\n");
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "mono" }));
    expect(shouldBuildScipIndex({ projectRoot: root })).toBe(true);
  });

  it("shouldBuildScipIndex is true for Cargo workspace members", async () => {
    const { shouldBuildScipIndex } = await loadScip();
    const root = tmpFixture("cargo-ws");
    writeFileSync(
      join(root, "Cargo.toml"),
      `[workspace]\nmembers = ["a", "b"]\n`,
    );
    expect(shouldBuildScipIndex({ projectRoot: root })).toBe(true);
  });

  it("shouldBuildScipIndex is false for tiny single package", async () => {
    const { shouldBuildScipIndex } = await loadScip();
    const root = tmpFixture("tiny");
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ name: "tiny", version: "1.0.0" }),
    );
    writeFileSync(join(root, "index.js"), "export const x = 1;\n");
    expect(shouldBuildScipIndex({ projectRoot: root })).toBe(false);
  });

  it("scipFingerprint is stable for unchanged tree and changes when lockfile changes", async () => {
    const { scipFingerprint } = await loadScip();
    const root = tmpFixture("fp");
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ name: "demo", version: "1.0.0" }),
    );
    writeFileSync(join(root, "pnpm-lock.yaml"), "lockfileVersion: 9\n");

    const a = scipFingerprint({ projectRoot: root, indexerVersion: "scip-typescript@1" });
    const b = scipFingerprint({ projectRoot: root, indexerVersion: "scip-typescript@1" });
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{32}$/);

    writeFileSync(join(root, "pnpm-lock.yaml"), "lockfileVersion: 9\npackages:\n  foo: 1\n");
    const c = scipFingerprint({ projectRoot: root, indexerVersion: "scip-typescript@1" });
    expect(c).not.toBe(a);

    const d = scipFingerprint({ projectRoot: root, indexerVersion: "scip-typescript@2" });
    expect(d).not.toBe(c);
  });

  it(
    "ensureScipIndex refuses stale fingerprint directory as current",
    async () => {
    const { ensureScipIndex, queryScipIndex } = await loadScip();
    const project = tmpFixture("proj");
    const runtime = tmpFixture("runtime");
    writeFileSync(join(project, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
    writeFileSync(join(project, "package.json"), JSON.stringify({ name: "m" }));
    mkdirSync(join(project, "packages", "a"), { recursive: true });
    writeFileSync(
      join(project, "packages", "a", "package.json"),
      JSON.stringify({ name: "a" }),
    );
    writeFileSync(join(project, "packages", "a", "index.ts"), "export function hello() {}\n");

    const first = await ensureScipIndex({
      projectRoot: project,
      runtimeRoot: runtime,
      language: "typescript",
    });
    expect(first.ok).toBe(true);
    expect(first.indexDir).toBeTruthy();
    expect(existsSync(join(first.indexDir, "fingerprint.json"))).toBe(true);

    // Poison cache: rewrite meta fingerprint so it no longer matches directory key.
    writeFileSync(join(first.indexDir, "index.scip"), "stale-bytes\n");
    writeFileSync(
      join(first.indexDir, "fingerprint.json"),
      JSON.stringify({ fingerprint: "deadbeef_not_matching" }),
    );

    const again = await ensureScipIndex({
      projectRoot: project,
      runtimeRoot: runtime,
      language: "typescript",
    });
    expect(again.ok).toBe(true);
    const meta = JSON.parse(
      readFileSync(join(again.indexDir, "fingerprint.json"), "utf8"),
    );
    expect(meta.fingerprint).toBe(again.fingerprint);
    expect(meta.fingerprint).not.toBe("deadbeef_not_matching");
    expect(
      again.evidence.some(
        (e: string) => /mismatch|refusing stale|rebuilding|cache hit|heuristic/i.test(e),
      ),
    ).toBe(true);

    const q = queryScipIndex({
      indexDir: again.indexDir,
      op: "search",
      symbol: "hello",
    });
    expect(q.ok).toBe(true);
  },
    20_000,
  );
});
