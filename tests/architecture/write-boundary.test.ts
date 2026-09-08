import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const srcDir = join(repoRoot, "src");

/** Phase 3B authorized low-level filesystem mutation module. */
export const AUTHORIZED_WRITE_MODULE = "src/editing/atomic-fs.ts";

/**
 * Phase 6A authorized low-level store module. It writes ONLY under the
 * recovery checkpoint store root the host supplies, which lives outside the
 * target workspace; project mutation primitives remain confined to
 * AUTHORIZED_WRITE_MODULE. Recovery's own workspace writes go through that
 * module, not through this one.
 */
export const AUTHORIZED_RECOVERY_STORE_WRITE_MODULE =
  "src/recovery/store-fs.ts";

const AUTHORIZED_WRITE_MODULES = new Set([
  AUTHORIZED_WRITE_MODULE,
  AUTHORIZED_RECOVERY_STORE_WRITE_MODULE,
]);

const WRITE_PATTERNS = [
  /(?<![.\w])writeFile\s*\(/,
  /(?<![.\w])appendFile\s*\(/,
  /(?<![.\w])rename\s*\(/,
  /(?<![.\w])unlink\s*\(/,
  /(?<![.\w])mkdir\s*\(/,
  /(?<![.\w])createWriteStream\s*\(/,
  /(?<![.\w])truncate\s*\(/,
  /(?<![.\w])copyFile\s*\(/,
  /(?<![.\w])link\s*\(/,
  /(?<![.\w])symlink\s*\(/,
  /(?<![.\w])fchmod\s*\(/,
  /(?<![.\w])fchown\s*\(/,
  /(?<![.\w])fsync\s*\(/,
  /constants\.O_CREAT/,
  /constants\.O_EXCL/,
];

function listProductionTsFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...listProductionTsFiles(full));
    } else if (entry.endsWith(".ts")) {
      files.push(full);
    }
  }
  return files;
}

function relativeFromRepo(absolutePath: string): string {
  const normalizedRoot = repoRoot.endsWith("/") ? repoRoot : `${repoRoot}/`;
  return absolutePath.slice(normalizedRoot.length);
}

describe("Phase 3B write boundary", () => {
  it("allows project-write primitives only in the authorized atomic-fs module", () => {
    const violations: string[] = [];
    for (const filePath of listProductionTsFiles(srcDir)) {
      const relative = relativeFromRepo(filePath);
      if (AUTHORIZED_WRITE_MODULES.has(relative)) {
        continue;
      }
      const source = readFileSync(filePath, "utf8");
      for (const pattern of WRITE_PATTERNS) {
        if (pattern.test(source)) {
          violations.push(`${relative} matched ${pattern}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("names the exact authorized write module for falsification F1", () => {
    const authorizedPath = join(repoRoot, AUTHORIZED_WRITE_MODULE);
    const source = readFileSync(authorizedPath, "utf8");
    expect(source).toMatch(/productionAtomicReplaceFs/);
    expect(source).toMatch(/\brename\b/);
    expect(source).toMatch(/O_EXCL/);
  });

  it("names the exact authorized recovery store write module", () => {
    const authorizedPath = join(
      repoRoot,
      AUTHORIZED_RECOVERY_STORE_WRITE_MODULE,
    );
    const source = readFileSync(authorizedPath, "utf8");
    expect(source).toMatch(/productionRecoveryStoreFs/);
    expect(source).toMatch(/O_EXCL/);
    // The store never reaches into the workspace: it only joins under the
    // host-supplied store root.
    expect(source).not.toMatch(/WorkspaceBoundary|canonicalize/);
  });

  it("keeps recovery workspace writes on the Phase 3B authorized module", () => {
    const recoveryDir = join(repoRoot, "src/recovery");
    for (const filePath of listProductionTsFiles(recoveryDir)) {
      const relative = relativeFromRepo(filePath);
      if (relative === AUTHORIZED_RECOVERY_STORE_WRITE_MODULE) {
        continue;
      }
      const source = readFileSync(filePath, "utf8");
      expect(source).not.toMatch(/from\s+["']node:fs/);
    }
    const executeSource = readFileSync(
      join(repoRoot, "src/recovery/execute.ts"),
      "utf8",
    );
    expect(executeSource).toMatch(/editing\/atomic-fs/);
  });

  it("keeps replace orchestration free of direct node fs write imports", () => {
    const orchestrationPath = join(repoRoot, "src/editing/replace-existing-file.ts");
    const source = readFileSync(orchestrationPath, "utf8");
    expect(source).not.toMatch(/from\s+["']node:fs/);
    expect(source).not.toMatch(/from\s+["']node:fs\/promises/);
    expect(source).toMatch(/atomic-fs/);
  });

  it("keeps create orchestration free of direct node fs write imports", () => {
    const orchestrationPath = join(repoRoot, "src/editing/create-file.ts");
    const source = readFileSync(orchestrationPath, "utf8");
    expect(source).not.toMatch(/from\s+["']node:fs/);
    expect(source).not.toMatch(/from\s+["']node:fs\/promises/);
    expect(source).toMatch(/atomic-fs/);
  });
});
