import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
// @ts-expect-error The focused .mjs module is exercised directly as runtime code.
import { compareDatabaseMigrationVersions, inventoryCommittedDatabaseMigrations } from "../../scripts/pathcode-cli/build/database-migrations.mjs";

describe("committed migration inventory", () => {
  const sha = "a".repeat(40);
  it("uses only authoritative ls-tree identities and computes a deterministic digest", () => {
    const output = Buffer.from([
      `100644 blob ${"1".repeat(40)}\tsupabase/migrations/20260101000000_init.sql\0`,
      `100644 blob ${"2".repeat(40)}\tsupabase/migrations/20260102000000_add_users.sql\0`,
      `100644 blob ${"3".repeat(40)}\tsupabase/migrations/README.md\0`,
    ].join(""));
    let args: any;
    const spawn = (_cmd: string, argv: string[]) => { args = argv; return { status: 0, stdout: output }; };
    const one = inventoryCommittedDatabaseMigrations("/tmp/project", sha, { spawn: spawn as any });
    const two = inventoryCommittedDatabaseMigrations("/tmp/project", sha, { spawn: spawn as any });
    expect(args).toContain(sha);
    expect(args).toContain("ls-tree");
    expect(one).toMatchObject({ ok: true, sourceSha: sha, localCount: 2, localHeadVersion: "20260102000000" });
    expect(two).toMatchObject({ ok: true, localDigest: (one as any).localDigest });
    expect(compareDatabaseMigrationVersions(["1", "2"], ["1"])).toBe("pending");
  });
  it("rejects malformed SQL migration identities and invalid SHAs", () => {
    const output = Buffer.from(`100644 blob ${"1".repeat(40)}\tsupabase/migrations/not-a-version.sql\0`);
    expect(inventoryCommittedDatabaseMigrations("/tmp/project", sha, { spawn: (() => ({ status: 0, stdout: output })) as any }))
      .toEqual({ ok: false, code: "DATABASE_MIGRATION_SOURCE_INVALID" });
    expect(inventoryCommittedDatabaseMigrations("/tmp/project", "invalid")).toEqual({ ok: false, code: "DATABASE_MIGRATION_SOURCE_INVALID" });
  });
  function gitRepo() {
    const root = mkdtempSync(join(tmpdir(), "path-p13-real-git-migrations-"));
    execFileSync("git", ["init", "-q", root]);
    execFileSync("git", ["-C", root, "config", "user.email", "synthetic@example.invalid"]);
    execFileSync("git", ["-C", root, "config", "user.name", "Synthetic Fixture"]);
    mkdirSync(join(root, "supabase", "migrations"), { recursive: true });
    const commit = () => {
      execFileSync("git", ["-C", root, "add", "-A"]);
      execFileSync("git", ["-C", root, "commit", "-qm", "synthetic migration fixture", "--allow-empty"]);
      return execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    };
    return { root, commit };
  }
  it("uses committed Git objects at the authoritative SHA and excludes dirty working-tree bytes", () => {
    const { root, commit } = gitRepo();
    try {
      const migration = join(root, "supabase", "migrations", "20260101000000_init.sql");
      writeFileSync(migration, "SELECT 'committed';\n");
      writeFileSync(join(root, "supabase", "migrations", "README.md"), "incidental");
      const sha = commit();
      const before = inventoryCommittedDatabaseMigrations(root, sha) as any;
      writeFileSync(migration, "SELECT 'dirty sentinel';\n");
      const after = inventoryCommittedDatabaseMigrations(root, sha) as any;
      expect(after).toMatchObject({ ok: true, sourceSha: sha, versions: ["20260101000000"], localCount: 1,
        localDigest: before.localDigest });
      expect(JSON.stringify(after)).not.toContain("dirty sentinel");
      expect(execFileSync("git", ["-C", root, "status", "--porcelain"], { encoding: "utf8" })).toContain("20260101000000_init.sql");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it("changes blob identity and digest when committed migration bytes change", () => {
    const { root, commit } = gitRepo();
    try {
      const migration = join(root, "supabase", "migrations", "20260101000000_init.sql");
      writeFileSync(migration, "SELECT 1;\n"); const sha1 = commit();
      const first = inventoryCommittedDatabaseMigrations(root, sha1) as any;
      const blob1 = execFileSync("git", ["-C", root, "rev-parse", `${sha1}:supabase/migrations/20260101000000_init.sql`], { encoding: "utf8" }).trim();
      writeFileSync(migration, "SELECT 2;\n"); const sha2 = commit();
      const second = inventoryCommittedDatabaseMigrations(root, sha2) as any;
      const blob2 = execFileSync("git", ["-C", root, "rev-parse", `${sha2}:supabase/migrations/20260101000000_init.sql`], { encoding: "utf8" }).trim();
      expect(second.versions).toEqual(first.versions);
      expect(blob2).not.toBe(blob1);
      expect(second.localDigest).not.toBe(first.localDigest);
      expect(second).not.toHaveProperty("sql");
      expect(JSON.stringify(second)).not.toContain("SELECT 2");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it("accepts empty history and rejects duplicate or malformed committed SQL names", () => {
    const empty = gitRepo();
    try {
      const sha = empty.commit();
      expect(inventoryCommittedDatabaseMigrations(empty.root, sha)).toMatchObject({ ok: true, localCount: 0, localHeadVersion: null,
        localDigest: createHash("sha256").update("").digest("hex") });
    } finally { rmSync(empty.root, { recursive: true, force: true }); }
    for (const filenames of [["20260101000000_first.sql", "20260101000000_second.sql"], ["not-a-version.sql"]]) {
      const fixture = gitRepo();
      try {
        for (const filename of filenames) writeFileSync(join(fixture.root, "supabase", "migrations", filename), "SELECT 1;");
        expect(inventoryCommittedDatabaseMigrations(fixture.root, fixture.commit())).toEqual({ ok: false, code: "DATABASE_MIGRATION_SOURCE_INVALID" });
      } finally { rmSync(fixture.root, { recursive: true, force: true }); }
    }
  });
  it("bounds large inventories and Git failures without leaking stderr or mutating Git", () => {
    const rows = Array.from({ length: 5001 }, (_, i) => `100644 blob ${String(i + 1).padStart(40, "0")}\tsupabase/migrations/${String(i + 1).padStart(14, "0")}_migration.sql\0`).join("");
    const tooMany = inventoryCommittedDatabaseMigrations("/tmp/synthetic", sha, { spawn: (() => ({ status: 0, stdout: Buffer.from(rows) })) as any });
    expect(tooMany).toEqual({ ok: false, code: "DATABASE_MIGRATION_SOURCE_INVALID" });
    const failed = inventoryCommittedDatabaseMigrations("/tmp/synthetic", sha, { spawn: (() => ({ status: 128, stdout: Buffer.alloc(0), stderr: "secret stderr" })) as any });
    expect(failed).toEqual({ ok: false, code: "DATABASE_MIGRATION_SOURCE_UNAVAILABLE" });
    expect(JSON.stringify(failed)).not.toContain("secret stderr");
  });
});
