import { createHash } from "node:crypto";
import { chmod, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { CanonicalPath } from "../../src/domain/workspace.js";
import { inventory } from "../../src/inventory/index.js";
import {
  MAX_REPOSITORY_CONTENT_BYTES,
  readRepositoryContent,
} from "../../src/reader/index.js";
import {
  boundaryFor,
  cleanupInventoryFixtures,
  createCanonicalTempRoot,
  inventoryAt,
  resolvedConfigAt,
  writeDenyConfig,
  writeRelative,
} from "../inventory/fixture-helpers.js";

afterEach(async () => {
  await cleanupInventoryFixtures();
});

function sha256Hex(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function earnFileEntry(
  root: string,
  relativePath: string,
  content: string | Buffer,
) {
  if (typeof content === "string") {
    await writeRelative(root, relativePath, content);
  } else {
    const absolute = path.join(root, relativePath);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, content);
  }
  const workspace = await boundaryFor(root);
  const config = await resolvedConfigAt(root);
  const inv = await inventory(workspace, config);
  expect(inv.ok).toBe(true);
  if (!inv.ok) {
    throw new Error("inventory failed");
  }
  const observation = inv.value.observations.find(
    (item) =>
      item.relativePath === relativePath && item.disposition === "ADMITTED",
  );
  if (observation?.disposition !== "ADMITTED") {
    throw new Error(`missing admitted entry ${relativePath}`);
  }
  return { entry: observation.entry, workspace, config };
}

describe("readRepositoryContent — text / binary / fingerprints", () => {
  it("reads ASCII UTF-8 text with full SHA-256", async () => {
    const root = await createCanonicalTempRoot("pc-read-ascii-");
    const { entry, workspace, config } = await earnFileEntry(
      root,
      "note.txt",
      "hello world\n",
    );

    const result = await readRepositoryContent(entry, workspace, config);
    expect(result.ok).toBe(true);
    if (!result.ok || result.value.status !== "READ") {
      return;
    }
    expect(result.value.observation.kind).toBe("TEXT");
    if (result.value.observation.kind !== "TEXT") {
      return;
    }
    expect(result.value.observation.text).toBe("hello world\n");
    expect(result.value.observation.byteLength).toBe(12);
    expect(result.value.observation.fingerprint).toEqual({
      algorithm: "sha256",
      hex: sha256Hex("hello world\n"),
      byteLength: 12,
    });
    expect(result.value.observation.fingerprint.hex).toHaveLength(64);
    expect(result.value.observation.entry).toBe(entry);
  });

  it("reads Unicode UTF-8 with byteLength distinct from string length", async () => {
    const root = await createCanonicalTempRoot("pc-read-unicode-");
    const text = "café 日本語";
    const bytes = Buffer.from(text, "utf8");
    const { entry, workspace, config } = await earnFileEntry(
      root,
      "u.txt",
      bytes,
    );

    const result = await readRepositoryContent(entry, workspace, config);
    expect(result.ok).toBe(true);
    if (!result.ok || result.value.status !== "READ") {
      return;
    }
    expect(result.value.observation.kind).toBe("TEXT");
    if (result.value.observation.kind !== "TEXT") {
      return;
    }
    expect(result.value.observation.text).toBe(text);
    expect(result.value.observation.byteLength).toBe(bytes.byteLength);
    expect(result.value.observation.byteLength).not.toBe(text.length);
    expect(result.value.observation.fingerprint.hex).toBe(sha256Hex(bytes));
  });

  it("reads empty file as TEXT with zero-byte SHA-256", async () => {
    const root = await createCanonicalTempRoot("pc-read-empty-");
    const { entry, workspace, config } = await earnFileEntry(
      root,
      "empty.txt",
      "",
    );

    const result = await readRepositoryContent(entry, workspace, config);
    expect(result.ok).toBe(true);
    if (!result.ok || result.value.status !== "READ") {
      return;
    }
    expect(result.value.observation.kind).toBe("TEXT");
    if (result.value.observation.kind !== "TEXT") {
      return;
    }
    expect(result.value.observation.text).toBe("");
    expect(result.value.observation.byteLength).toBe(0);
    expect(result.value.observation.fingerprint.hex).toBe(sha256Hex(""));
  });

  it("classifies embedded NUL as BINARY with full hash", async () => {
    const root = await createCanonicalTempRoot("pc-read-nul-");
    const bytes = Buffer.from([0x61, 0x00, 0x62]);
    const { entry, workspace, config } = await earnFileEntry(
      root,
      "bin.dat",
      bytes,
    );

    const result = await readRepositoryContent(entry, workspace, config);
    expect(result.ok).toBe(true);
    if (!result.ok || result.value.status !== "READ") {
      return;
    }
    expect(result.value.observation.kind).toBe("BINARY");
    if (result.value.observation.kind !== "BINARY") {
      return;
    }
    expect(result.value.observation.binaryReason).toBe("NUL_BYTE");
    expect(result.value.observation.fingerprint.hex).toBe(sha256Hex(bytes));
    expect(
      Object.prototype.hasOwnProperty.call(result.value.observation, "text"),
    ).toBe(false);
  });

  it("classifies invalid UTF-8 without NUL as BINARY with full hash", async () => {
    const root = await createCanonicalTempRoot("pc-read-badutf8-");
    const bytes = Buffer.from([0xff, 0xfe, 0xfd]);
    const { entry, workspace, config } = await earnFileEntry(
      root,
      "bad.dat",
      bytes,
    );

    const result = await readRepositoryContent(entry, workspace, config);
    expect(result.ok).toBe(true);
    if (!result.ok || result.value.status !== "READ") {
      return;
    }
    expect(result.value.observation.kind).toBe("BINARY");
    if (result.value.observation.kind !== "BINARY") {
      return;
    }
    expect(result.value.observation.binaryReason).toBe("INVALID_UTF8");
    expect(result.value.observation.fingerprint.hex).toBe(sha256Hex(bytes));
  });
});

describe("readRepositoryContent — bounds", () => {
  it("accepts exactly maxBytes and rejects maxBytes + 1 without hash", async () => {
    const root = await createCanonicalTempRoot("pc-read-bound-");
    const exact = await earnFileEntry(root, "exact.txt", "a".repeat(8));
    const exactResult = await readRepositoryContent(
      exact.entry,
      exact.workspace,
      exact.config,
      { maxBytes: 8 },
    );
    expect(exactResult.ok).toBe(true);
    if (exactResult.ok && exactResult.value.status === "READ") {
      expect(exactResult.value.observation.fingerprint.hex).toBe(
        sha256Hex("a".repeat(8)),
      );
    }

    const over = await earnFileEntry(root, "over.txt", "b".repeat(9));
    const overResult = await readRepositoryContent(
      over.entry,
      over.workspace,
      over.config,
      { maxBytes: 8 },
    );
    expect(overResult.ok).toBe(true);
    if (overResult.ok) {
      expect(overResult.value.status).toBe("TOO_LARGE");
      expect(
        Object.prototype.hasOwnProperty.call(overResult.value, "observation"),
      ).toBe(false);
    }
  });

  it("rejects invalid and widening maxBytes before file access", async () => {
    const root = await createCanonicalTempRoot("pc-read-opts-");
    const { entry, workspace, config } = await earnFileEntry(root, "f.txt", "x");

    for (const maxBytes of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = await readRepositoryContent(entry, workspace, config, {
        maxBytes,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_READER_OPTIONS");
      }
    }

    const widen = await readRepositoryContent(entry, workspace, config, {
      maxBytes: MAX_REPOSITORY_CONTENT_BYTES + 1,
    });
    expect(widen.ok).toBe(false);
    if (!widen.ok) {
      expect(widen.error.code).toBe("INVALID_READER_OPTIONS");
    }
  });

  it("exposes the hard ceiling constant as exactly 1 MiB", () => {
    expect(MAX_REPOSITORY_CONTENT_BYTES).toBe(1_048_576);
  });
});

describe("readRepositoryContent — denial (RI-004)", () => {
  it("returns DENIED for lexically denied files without ContentObservation", async () => {
    const root = await createCanonicalTempRoot("pc-read-deny-lex-");
    const earned = await earnFileEntry(root, "secrets/key.txt", "SECRET");
    await writeDenyConfig(root, ["secrets"]);
    const denying = await resolvedConfigAt(root);

    const result = await readRepositoryContent(
      earned.entry,
      earned.workspace,
      denying,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("DENIED");
      expect(
        Object.prototype.hasOwnProperty.call(result.value, "observation"),
      ).toBe(false);
    }
  });

  it("returns DENIED when the denied lexical path no longer exists", async () => {
    const root = await createCanonicalTempRoot("pc-read-deny-gone-");
    const earned = await earnFileEntry(root, "secrets/key.txt", "SECRET");
    await writeDenyConfig(root, ["secrets"]);
    const denying = await resolvedConfigAt(root);
    await rm(path.join(root, "secrets/key.txt"));

    const result = await readRepositoryContent(
      earned.entry,
      earned.workspace,
      denying,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("DENIED");
    }
  });

  it("does not deny secrets-public when deny-path is secrets", async () => {
    const root = await createCanonicalTempRoot("pc-read-prefix-");
    await writeDenyConfig(root, ["secrets"]);
    const config = await resolvedConfigAt(root);
    await writeRelative(root, "secrets-public/index.html", "ok");
    const workspace = await boundaryFor(root);
    const inv = await inventory(workspace, config);
    expect(inv.ok).toBe(true);
    if (!inv.ok) {
      return;
    }
    const observation = inv.value.observations.find(
      (item) =>
        item.relativePath === "secrets-public/index.html" &&
        item.disposition === "ADMITTED",
    );
    expect(observation?.disposition).toBe("ADMITTED");
    if (observation?.disposition !== "ADMITTED") {
      return;
    }

    const result = await readRepositoryContent(
      observation.entry,
      workspace,
      config,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("READ");
    }
  });
});

describe("readRepositoryContent — JIT revalidation", () => {
  it("returns STALE_ENTRY when the file is deleted after inventory", async () => {
    const root = await createCanonicalTempRoot("pc-read-deleted-");
    const { entry, workspace, config } = await earnFileEntry(
      root,
      "gone.txt",
      "x",
    );
    await rm(path.join(root, "gone.txt"));

    const result = await readRepositoryContent(entry, workspace, config);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("STALE_ENTRY");
      if (result.value.status === "STALE_ENTRY") {
        expect(result.value.reason).toBe("PATH_NOT_FOUND");
      }
    }
  });

  it("returns STALE_ENTRY when symlink target changes inside workspace", async () => {
    const root = await createCanonicalTempRoot("pc-read-swap-in-");
    await writeRelative(root, "a.txt", "A");
    await writeRelative(root, "b.txt", "B");
    await symlink(path.join(root, "a.txt"), path.join(root, "link"));

    const workspace = await boundaryFor(root);
    const config = await resolvedConfigAt(root);
    const inv = await inventory(workspace, config);
    expect(inv.ok).toBe(true);
    if (!inv.ok) {
      return;
    }
    const linkObs = inv.value.observations.find(
      (item) =>
        item.relativePath === "link" && item.disposition === "ADMITTED",
    );
    if (linkObs?.disposition !== "ADMITTED") {
      throw new Error("expected link");
    }

    await rm(path.join(root, "link"));
    await symlink(path.join(root, "b.txt"), path.join(root, "link"));

    const result = await readRepositoryContent(
      linkObs.entry,
      workspace,
      config,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("STALE_ENTRY");
      if (result.value.status === "STALE_ENTRY") {
        expect(result.value.reason).toBe("CANONICAL_PATH_CHANGED");
      }
    }
  });

  it("returns STALE_ENTRY when symlink target moves outside workspace", async () => {
    const root = await createCanonicalTempRoot("pc-read-swap-out-");
    const outside = await createCanonicalTempRoot("pc-read-swap-out-target-");
    await writeRelative(root, "inside.txt", "IN");
    await writeRelative(outside, "loot.txt", "OUT");
    await symlink(path.join(root, "inside.txt"), path.join(root, "link"));

    const workspace = await boundaryFor(root);
    const config = await resolvedConfigAt(root);
    const inv = await inventory(workspace, config);
    expect(inv.ok).toBe(true);
    if (!inv.ok) {
      return;
    }
    const linkObs = inv.value.observations.find(
      (item) =>
        item.relativePath === "link" && item.disposition === "ADMITTED",
    );
    if (linkObs?.disposition !== "ADMITTED") {
      throw new Error("expected link");
    }

    await rm(path.join(root, "link"));
    await symlink(path.join(outside, "loot.txt"), path.join(root, "link"));

    const result = await readRepositoryContent(
      linkObs.entry,
      workspace,
      config,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("STALE_ENTRY");
    }
  });

  it("returns STALE_ENTRY when a file becomes a directory", async () => {
    const root = await createCanonicalTempRoot("pc-read-kind-");
    const { entry, workspace, config } = await earnFileEntry(
      root,
      "morph.txt",
      "x",
    );
    await rm(path.join(root, "morph.txt"));
    await mkdir(path.join(root, "morph.txt"));

    const result = await readRepositoryContent(entry, workspace, config);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("STALE_ENTRY");
      if (result.value.status === "STALE_ENTRY") {
        expect(result.value.reason).toBe("TARGET_KIND_CHANGED");
      }
    }
  });

  it("reads current content when the same admitted file changes in place", async () => {
    const root = await createCanonicalTempRoot("pc-read-inplace-");
    const { entry, workspace, config } = await earnFileEntry(
      root,
      "live.txt",
      "A",
    );
    await writeFile(path.join(root, "live.txt"), "B", "utf8");

    const result = await readRepositoryContent(entry, workspace, config);
    expect(result.ok).toBe(true);
    if (!result.ok || result.value.status !== "READ") {
      return;
    }
    expect(result.value.observation.kind).toBe("TEXT");
    if (result.value.observation.kind === "TEXT") {
      expect(result.value.observation.text).toBe("B");
      expect(result.value.observation.fingerprint.hex).toBe(sha256Hex("B"));
    }
  });
});

describe("readRepositoryContent — non-file / unreadable", () => {
  it("returns NOT_REGULAR_FILE for admitted directories", async () => {
    const root = await createCanonicalTempRoot("pc-read-dir-");
    await mkdir(path.join(root, "src"));
    await writeRelative(root, "src/a.txt", "x");
    const inv = await inventoryAt(root);
    const dirObs = inv.observations.find(
      (item) =>
        item.relativePath === "src" && item.disposition === "DESCENDED",
    );
    if (dirObs?.disposition !== "DESCENDED") {
      throw new Error("expected directory");
    }

    const workspace = await boundaryFor(root);
    const config = await resolvedConfigAt(root);
    const result = await readRepositoryContent(
      dirObs.entry,
      workspace,
      config,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("NOT_REGULAR_FILE");
      expect(
        Object.prototype.hasOwnProperty.call(result.value, "observation"),
      ).toBe(false);
    }
  });

  it("returns UNREADABLE when open permission fails", async () => {
    if (process.getuid?.() === 0) {
      return;
    }
    const root = await createCanonicalTempRoot("pc-read-perm-");
    const { entry, workspace, config } = await earnFileEntry(
      root,
      "secret.txt",
      "x",
    );
    await chmod(path.join(root, "secret.txt"), 0o000);

    const result = await readRepositoryContent(entry, workspace, config);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("UNREADABLE");
      if (result.value.status === "UNREADABLE") {
        expect(result.value.stage).toBe("OPEN");
      }
    }
    await chmod(path.join(root, "secret.txt"), 0o644);
  });
});

describe("readRepositoryContent — source architecture", () => {
  it("allocates a single maxBytes+1 content buffer and closes handles", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(
      new URL("../../src/reader/read.ts", import.meta.url),
      "utf8",
    );
    expect(source).toMatch(/new Uint8Array\(maxBytes \+ 1\)/);
    expect(source).not.toMatch(/chunks\.push/);
    expect(source).not.toMatch(/Buffer\.concat/);
    expect(source).toMatch(/finally/);
    expect(source).toMatch(/handle\.close/);
    expect(source).toMatch(/\.dev/);
    expect(source).toMatch(/\.ino/);
  });
});

describe("readRepositoryContent — RepositoryEntry required at runtime", () => {
  it("succeeds with an earned RepositoryEntry", async () => {
    const root = await createCanonicalTempRoot("pc-read-cp-");
    const { entry, workspace, config } = await earnFileEntry(
      root,
      "only.txt",
      "x",
    );
    const pathOnly = entry.canonicalPath;
    expect(typeof pathOnly).toBe("string");
    const result = await readRepositoryContent(entry, workspace, config);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("READ");
    }
    void (pathOnly as CanonicalPath);
  });
});
