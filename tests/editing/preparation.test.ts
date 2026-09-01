import { Buffer } from "node:buffer";

import { afterEach, describe, expect, it } from "vitest";

import {
  MAX_EDIT_FILE_BYTES,
  prepareCreateFile,
  prepareModifyExistingFile,
} from "../../src/editing/index.js";
import {
  cleanupInventoryFixtures,
  createCanonicalTempRoot,
  resolvedConfigAt,
  writeDenyConfig,
  writeRelative,
} from "../inventory/fixture-helpers.js";
import {
  earnAdmittedDirectory,
  earnAdmittedFile,
  sha256Hex,
} from "./helpers.js";

afterEach(async () => {
  await cleanupInventoryFixtures();
});

describe("prepareModifyExistingFile", () => {
  it("earns exact before hash/length through Phase 2B read", async () => {
    const root = await createCanonicalTempRoot("pc-3a-mod-");
    const content = "before bytes\n";
    const { entry, workspace, config } = await earnAdmittedFile(
      root,
      "src/a.ts",
      content,
    );
    const proposed = Buffer.from("after bytes\n");

    const prepared = await prepareModifyExistingFile(
      entry,
      proposed,
      workspace,
      config,
    );
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) {
      return;
    }

    expect(prepared.value.target).toBe(entry);
    expect(prepared.value.beforeFingerprint.hex).toBe(sha256Hex(content));
    expect(prepared.value.beforeByteLength).toBe(content.length);
    expect(prepared.value.afterFingerprint.hex).toBe(sha256Hex(proposed));
    expect(prepared.value.afterByteLength).toBe(proposed.byteLength);
    expect(Array.from(prepared.value.proposedBytes)).toEqual(Array.from(proposed));
  });

  it("retains immutable proposed bytes when caller mutates the original buffer", async () => {
    const root = await createCanonicalTempRoot("pc-3a-mut-");
    const { entry, workspace, config } = await earnAdmittedFile(root, "b.ts", "x\n");
    const mutable = Buffer.from("original\n");
    const prepared = await prepareModifyExistingFile(
      entry,
      mutable,
      workspace,
      config,
    );
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) {
      return;
    }
    const beforeHash = prepared.value.afterFingerprint.hex;
    mutable[0] = 90;
    expect(prepared.value.afterFingerprint.hex).toBe(beforeHash);
    expect(prepared.value.proposedBytes[0]).not.toBe(90);
  });

  it("refuses files above the 1 MiB preparation bound", async () => {
    const root = await createCanonicalTempRoot("pc-3a-large-");
    const big = Buffer.alloc(MAX_EDIT_FILE_BYTES + 1, 97);
    const { entry, workspace, config } = await earnAdmittedFile(root, "big.bin", "x\n");
    const prepared = await prepareModifyExistingFile(entry, big, workspace, config);
    expect(prepared.ok).toBe(false);
    if (prepared.ok) {
      return;
    }
    expect(prepared.error.code).toBe("FILE_TOO_LARGE");
  });

  it("refuses denied targets distinctly from action-disabled failures", async () => {
    const root = await createCanonicalTempRoot("pc-3a-deny-");
    const earned = await earnAdmittedFile(root, "secrets/key.txt", "secret\n");
    await writeDenyConfig(root, ["secrets"]);
    const denying = await resolvedConfigAt(root);
    const prepared = await prepareModifyExistingFile(
      earned.entry,
      Buffer.from("nope\n"),
      earned.workspace,
      denying,
    );
    expect(prepared.ok).toBe(false);
    if (prepared.ok) {
      return;
    }
    expect(prepared.error.code).toBe("TARGET_DENIED");
  });
});

describe("prepareCreateFile", () => {
  it("establishes honest NON_EXISTENT evidence for a valid leaf", async () => {
    const root = await createCanonicalTempRoot("pc-3a-create-");
    const { entry: parent, workspace, config } = await earnAdmittedDirectory(
      root,
      "src",
    );
    const proposed = Buffer.from("new file\n");
    const prepared = await prepareCreateFile(
      parent,
      "new.ts",
      proposed,
      workspace,
      config,
    );
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) {
      return;
    }
    expect(prepared.value.precondition.kind).toBe("NON_EXISTENT");
    expect(prepared.value.targetRelativePath).toBe("src/new.ts");
    expect(prepared.value.afterFingerprint.hex).toBe(sha256Hex(proposed));
  });

  it("rejects invalid leaf names", async () => {
    const root = await createCanonicalTempRoot("pc-3a-leaf-");
    await mkdirpHelper(root, "src");
    const { entry: parent, workspace, config } = await earnAdmittedDirectory(
      root,
      "src",
    );
    for (const leaf of ["", ".", "..", "a/b", "a\\b"]) {
      const prepared = await prepareCreateFile(
        parent,
        leaf,
        Buffer.from("x\n"),
        workspace,
        config,
      );
      expect(prepared.ok).toBe(false);
      if (prepared.ok) {
        throw new Error(`expected invalid leaf rejection for ${leaf}`);
      }
      expect(prepared.error.code).toBe("INVALID_LEAF_NAME");
    }
  });

  it("refuses creation when the leaf already exists", async () => {
    const root = await createCanonicalTempRoot("pc-3a-exists-");
    await mkdirpHelper(root, "src");
    await writeRelative(root, "src/exists.ts", "already\n");
    const { entry: parent, workspace, config } = await earnAdmittedDirectory(
      root,
      "src",
    );
    const prepared = await prepareCreateFile(
      parent,
      "exists.ts",
      Buffer.from("new\n"),
      workspace,
      config,
    );
    expect(prepared.ok).toBe(false);
    if (prepared.ok) {
      return;
    }
    expect(prepared.error.code).toBe("TARGET_ALREADY_OBSERVED");
  });

  it("refuses denied parent paths without claiming NON_EXISTENT", async () => {
    const root = await createCanonicalTempRoot("pc-3a-create-deny-");
    await mkdirpHelper(root, "src");
    await writeDenyConfig(root, ["src/denied.ts"]);
    const { entry: parent, workspace, config } = await earnAdmittedDirectory(
      root,
      "src",
    );
    const prepared = await prepareCreateFile(
      parent,
      "denied.ts",
      Buffer.from("x\n"),
      workspace,
      config,
    );
    expect(prepared.ok).toBe(false);
    if (prepared.ok) {
      return;
    }
    expect(prepared.error.code).toBe("TARGET_DENIED");
  });
});

async function mkdirpHelper(root: string, relativeDir: string): Promise<void> {
  const { mkdir } = await import("node:fs/promises");
  const { join } = await import("node:path");
  await mkdir(join(root, relativeDir), { recursive: true });
}
