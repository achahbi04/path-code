/**
 * GC1C-C / D — E/P/H scope + snapshot currentness / secrets / symlinks.
 */

import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const CHECKOUT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const GC1 = join(CHECKOUT, "scripts/pathcode-cli/gc1");
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

function makeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "gc1c-scope-"));
  temps.push(root);
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src/a.ts"), "export const a = 1;\n");
  writeFileSync(join(root, "src/b.ts"), "export const b = 2;\n");
  writeFileSync(join(root, "package.json"), '{"name":"x"}\n');
  writeFileSync(join(root, ".env"), "SECRET=1\n");
  return root;
}

describe("GC1C-C E/P/H distinct", () => {
  it("E and P must be subsets of H; siblings/secrets/symlinks refused", async () => {
    const {
      resolveHydrationPaths,
      captureTaskSnapshot,
      normalizeHydrationRelativePath,
    } = await load();
    const approved = {
      editableTargets: [{ relativePath: "src/a.ts" }],
      contextPaths: [{ relativePath: "package.json" }],
      hydrationPaths: ["src/a.ts", "package.json"],
    };
    expect(resolveHydrationPaths(approved)).toEqual(["package.json", "src/a.ts"]);

    expect(() =>
      resolveHydrationPaths({
        editableTargets: [{ relativePath: "src/a.ts" }],
        contextPaths: [],
        hydrationPaths: ["package.json"], // missing E
      }),
    ).toThrow(/E path not in H/);

    expect(normalizeHydrationRelativePath(".env").ok).toBe(false);
    expect(normalizeHydrationRelativePath("../escape").ok).toBe(false);
    expect(normalizeHydrationRelativePath("node_modules/x").ok).toBe(false);

    const root = makeRepo();
    await expect(
      captureTaskSnapshot({
        projectRoot: root,
        hydrationPaths: ["src/a.ts", ".env"],
      }),
    ).rejects.toMatchObject({ code: "PATH_SECRET" });

    // Symlink escape
    symlinkSync("/etc/passwd", join(root, "src/link.ts"));
    await expect(
      captureTaskSnapshot({
        projectRoot: root,
        hydrationPaths: ["src/a.ts", "src/link.ts"],
      }),
    ).rejects.toMatchObject({ code: "SNAPSHOT_SYMLINK" });
  });
});

describe("GC1C-D snapshot currentness", () => {
  it("drift / incomplete hydration refused; partial hydration cannot verify", async () => {
    const {
      captureTaskSnapshot,
      materializeTaskWorkspace,
      verifySnapshotCurrentness,
    } = await load();
    const root = makeRepo();
    const snap = await captureTaskSnapshot({
      projectRoot: root,
      hydrationPaths: ["src/a.ts", "src/b.ts", "package.json"],
    });
    expect(snap.manifestDigest).toMatch(/^[a-f0-9]{64}$/);

    writeFileSync(join(root, "src/a.ts"), "export const a = 99;\n");
    const drift = verifySnapshotCurrentness(root, snap);
    expect(drift.ok).toBe(false);
    expect(drift.status).toBe("drift");

    const dest = mkdtempSync(join(tmpdir(), "gc1c-mat-"));
    temps.push(dest);
    // Incomplete payload → materialize fails
    const incomplete = {
      ...snap,
      payload: new Map([["src/a.ts", snap.payload.get("src/a.ts")!]]),
    };
    await expect(materializeTaskWorkspace(incomplete, dest)).rejects.toMatchObject({
      code: "SNAPSHOT_INCOMPLETE",
    });

    // Full materialize succeeds and verifies.
    const dest2 = mkdtempSync(join(tmpdir(), "gc1c-mat2-"));
    temps.push(dest2);
    // Restore primary file for a clean snapshot first.
    writeFileSync(join(root, "src/a.ts"), "export const a = 1;\n");
    const snap2 = await captureTaskSnapshot({
      projectRoot: root,
      hydrationPaths: ["src/a.ts", "package.json"],
    });
    await materializeTaskWorkspace(snap2, dest2);
    expect(verifySnapshotCurrentness(dest2, snap2).ok).toBe(true);
    expect(readFileSync(join(dest2, "src/a.ts"), "utf8")).toBe("export const a = 1;\n");
  });
});

describe("GC1-c directionality helpers", () => {
  it("mutate primary after capture → assert fails; restore → passes", async () => {
    const {
      captureLocalDirectionalityState,
      assertDirectionalityUnchanged,
    } = await load();
    const root = makeRepo();
    const paths = ["src/a.ts", "package.json"];
    const before = captureLocalDirectionalityState(root, paths);
    expect(before.hashes["src/a.ts"]).toMatch(/^[a-f0-9]{64}$/);

    writeFileSync(join(root, "src/a.ts"), "export const a = mutated;\n");
    const afterMut = captureLocalDirectionalityState(root, paths);
    expect(() => assertDirectionalityUnchanged(before, afterMut)).toThrow(
      /directionality hash changed/,
    );

    writeFileSync(join(root, "src/a.ts"), "export const a = 1;\n");
    const afterRestore = captureLocalDirectionalityState(root, paths);
    expect(assertDirectionalityUnchanged(before, afterRestore)).toEqual({ ok: true });
  });
});
