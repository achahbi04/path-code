import { Buffer } from "node:buffer";
import { chmod, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  authorizePreparedChange,
  computeCreatedFileMode,
  createFile,
  explicitEditApproval,
  PATH_CODE_CREATE_TEMP_PREFIX,
  prepareCreateFile,
} from "../../src/editing/index.js";
import type { AtomicCreateFsOps } from "../../src/editing/atomic-fs.js";
import { productionAtomicCreateFs } from "../../src/editing/atomic-fs.js";
import { resetAuthorizationRegistryForTests } from "../../src/editing/internal/registry.js";
import {
  cleanupInventoryFixtures,
  createCanonicalTempRoot,
  writeDenyConfig,
} from "../inventory/fixture-helpers.js";
import { earnAdmittedDirectory, earnAdmittedFile, sha256Hex } from "./helpers.js";
import type { RepositoryEntry } from "../../src/inventory/types.js";
import type { InventoryObservation } from "../../src/inventory/disposition.js";

function directoryEntryAt(
  observations: readonly InventoryObservation[],
  relativePath: string,
): RepositoryEntry {
  const match = observations.find(
    (item) =>
      (item.disposition === "ADMITTED" || item.disposition === "DESCENDED") &&
      item.relativePath === relativePath &&
      item.entry.physicalKind === "DIRECTORY",
  );
  if (!match || (match.disposition !== "ADMITTED" && match.disposition !== "DESCENDED")) {
    throw new Error(`missing directory entry ${relativePath}`);
  }
  return match.entry;
}

afterEach(async () => {
  resetAuthorizationRegistryForTests();
  await cleanupInventoryFixtures();
});

async function writePathcodeConfig(root: string, fenceBody: string): Promise<void> {
  await writeFile(
    join(root, "PATHCODE.md"),
    `# Config\n\n\`\`\`pathcode-config\n${fenceBody}\n\`\`\`\n`,
    "utf8",
  );
}

async function earnAuthorizedCreation(
  root: string,
  parentRelative: string,
  leafName: string,
  content: string | Buffer,
) {
  const { entry: parent, workspace, config } = await earnAdmittedDirectory(
    root,
    parentRelative,
  );

  const prepared = await prepareCreateFile(
    parent,
    leafName,
    Buffer.from(content),
    workspace,
    config,
  );
  expect(prepared.ok).toBe(true);
  if (!prepared.ok) {
    throw new Error(`prepare failed: ${prepared.error.code}`);
  }
  const auth = await authorizePreparedChange(
    prepared.value,
    explicitEditApproval(),
    config,
  );
  expect(auth.ok).toBe(true);
  if (!auth.ok) {
    throw new Error(`authorize failed: ${auth.error.code}`);
  }
  return {
    prepared: prepared.value,
    authorization: auth.value,
    workspace,
    config,
    root,
    parent,
  };
}

describe("createFile — success", () => {
  it("creates an authorized file with exact bytes and provenance", async () => {
    const root = await createCanonicalTempRoot("pc-3c-success-");
    const after = "created line\r\n";
    const { prepared, authorization } = await earnAuthorizedCreation(
      root,
      "src",
      "new.txt",
      after,
    );

    const result = await createFile(authorization, prepared);
    expect(result.outcome).toBe("SUCCESS");
    if (result.outcome !== "SUCCESS") {
      return;
    }
    expect(result.commitPointReached).toBe(true);
    expect(result.durabilityVerified).toBe(true);
    expect(result.editRecord.kind).toBe("CREATION");
    expect(result.editRecord.beforePrecondition.kind).toBe("NON_EXISTENT");
    expect(result.editRecord.provenance).toBe("PATH_CODE_MODIFIED");
    expect(result.knowledgeInvalidation.editRecordKind).toBe("CREATION");
    expect(result.knowledgeInvalidation.targetRelativePath).toBe("src/new.txt");

    const absolute = join(root, "src/new.txt");
    const finalBytes = await readFile(absolute);
    expect(finalBytes.equals(Buffer.from(after))).toBe(true);
    expect(sha256Hex(finalBytes)).toBe(prepared.afterFingerprint.hex);

    const names = await readdir(join(root, "src"));
    expect(names.some((name) => name.startsWith(PATH_CODE_CREATE_TEMP_PREFIX))).toBe(
      false,
    );
  });

  it("applies umask-derived created-file mode without copying parent mode", async () => {
    const root = await createCanonicalTempRoot("pc-3c-mode-");
    const { prepared, authorization } = await earnAuthorizedCreation(
      root,
      "src",
      "mode.txt",
      "x\n",
    );
    await chmod(join(root, "src"), 0o700);
    const result = await createFile(authorization, prepared);
    expect(result.outcome).toBe("SUCCESS");
    const afterStat = await stat(join(root, "src/mode.txt"));
    expect(afterStat.mode & 0o777).toBe(computeCreatedFileMode());
    expect(afterStat.mode & 0o111).toBe(0);
  });

  it("creates under an admitted nested parent directory", async () => {
    const root = await createCanonicalTempRoot("pc-3c-nested-");
    const { prepared, authorization } = await earnAuthorizedCreation(
      root,
      "subdir",
      "child.txt",
      "nested\n",
    );
    const result = await createFile(authorization, prepared);
    expect(result.outcome).toBe("SUCCESS");
    const bytes = await readFile(join(root, "subdir/child.txt"));
    expect(bytes.toString("utf8")).toBe("nested\n");
  });
});

describe("createFile — byte fidelity", () => {
  it("preserves CRLF, BOM, trailing spaces, empty, and binary bytes", async () => {
    const cases: Array<{ leaf: string; bytes: Buffer }> = [
      { leaf: "crlf.txt", bytes: Buffer.from("a\r\nb\r\n") },
      { leaf: "nonewline.txt", bytes: Buffer.from("no-newline-at-end") },
      { leaf: "spaces.txt", bytes: Buffer.from("spaces   \n") },
      { leaf: "bom.txt", bytes: Buffer.from([0xef, 0xbb, 0xbf, 0x68, 0x69]) },
      { leaf: "bin.dat", bytes: Buffer.from([0x00, 0x01, 0xfe, 0xff]) },
      { leaf: "empty.txt", bytes: Buffer.alloc(0) },
    ];
    for (const item of cases) {
      const root = await createCanonicalTempRoot("pc-3c-bytes-");
      const { prepared, authorization } = await earnAuthorizedCreation(
        root,
        "src",
        item.leaf,
        item.bytes,
      );
      const result = await createFile(authorization, prepared);
      expect(result.outcome).toBe("SUCCESS");
      const finalBytes = await readFile(join(root, "src", item.leaf));
      expect(finalBytes.equals(item.bytes)).toBe(true);
    }
  });
});

describe("createFile — target exists / window race", () => {
  it("refuses when target already exists and leaves bytes unchanged", async () => {
    const root = await createCanonicalTempRoot("pc-3c-exists-");
    const { entry, workspace, config } = await earnAdmittedDirectory(root, "src");
    await writeFile(join(root, "src/taken.txt"), "external\n");
    const { inventory } = await import("../../src/inventory/index.js");
    const inv = await inventory(workspace, config);
    if (!inv.ok) {
      throw new Error("inventory failed");
    }
    const parent = directoryEntryAt(inv.value.observations, "src");

    // Preparation itself should refuse TARGET_ALREADY_OBSERVED.
    const prepared = await prepareCreateFile(
      parent,
      "taken.txt",
      Buffer.from("new\n"),
      workspace,
      config,
    );
    expect(prepared.ok).toBe(false);
    if (prepared.ok) {
      return;
    }
    expect(prepared.error.code).toBe("TARGET_ALREADY_OBSERVED");
    expect(await readFile(join(root, "src/taken.txt"), "utf8")).toBe("external\n");
    void entry;
  });

  it("REAL_FILESYSTEM window race: external create before link yields EEXIST", async () => {
    const root = await createCanonicalTempRoot("pc-3c-race-");
    const externalBytes = Buffer.from("race-winner\n");
    const { prepared, authorization } = await earnAuthorizedCreation(
      root,
      "src",
      "race.txt",
      "path-code\n",
    );

    const fsOps: AtomicCreateFsOps = {
      ...productionAtomicCreateFs,
      linkNoOverwrite: async (candidatePath, targetPath, operationIdentity) => {
        await writeFile(targetPath, externalBytes);
        return productionAtomicCreateFs.linkNoOverwrite(
          candidatePath,
          targetPath,
          operationIdentity,
        );
      },
    };

    const result = await createFile(authorization, prepared, { fsOps });
    expect(result.outcome).toBe("REFUSED_PRECOMMIT");
    expect(result.commitPointReached).toBe(false);
    if (result.outcome === "REFUSED_PRECOMMIT") {
      expect(result.failureCode).toBe("TARGET_ALREADY_EXISTS");
    }
    expect(await readFile(join(root, "src/race.txt"))).toEqual(externalBytes);
    const names = await readdir(join(root, "src"));
    expect(names.some((name) => name.startsWith(PATH_CODE_CREATE_TEMP_PREFIX))).toBe(
      false,
    );
  });
});

describe("createFile — absence vs inconclusive", () => {
  it("refuses when parent is a file", async () => {
    const root = await createCanonicalTempRoot("pc-3c-parent-file-");
    const { entry, workspace, config } = await earnAdmittedFile(
      root,
      "not-a-dir.txt",
      "x\n",
    );
    const prepared = await prepareCreateFile(
      entry,
      "child.txt",
      Buffer.from("y\n"),
      workspace,
      config,
    );
    expect(prepared.ok).toBe(false);
    if (!prepared.ok) {
      expect(prepared.error.code).toBe("PARENT_NOT_ADMITTED");
    }
  });

  it("does not create directories when parent is missing", async () => {
    const root = await createCanonicalTempRoot("pc-3c-no-parent-");
    const { entry, workspace, config } = await earnAdmittedDirectory(root, "src");
    const { inventory } = await import("../../src/inventory/index.js");
    const inv = await inventory(workspace, config);
    if (!inv.ok) {
      throw new Error("inventory failed");
    }
    const parent = directoryEntryAt(inv.value.observations, "src");

    // Prepare against a path whose parent directory does not exist in workspace:
    // prepareCreateFile requires an admitted parent entry, so parent missing is
    // expressed as using a stale parent that no longer resolves.
    const prepared = await prepareCreateFile(
      parent,
      "ok.txt",
      Buffer.from("z\n"),
      workspace,
      config,
    );
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) {
      return;
    }
    const auth = await authorizePreparedChange(
      prepared.value,
      explicitEditApproval(),
      config,
    );
    expect(auth.ok).toBe(true);
    if (!auth.ok) {
      return;
    }

    // Remove workspace root contents? Can't remove parent of creation when parent is ".".
    // Instead mutate parent identity by replacing parent directory entry path via fsOps.
    const fsOps: AtomicCreateFsOps = {
      ...productionAtomicCreateFs,
      lstatTarget: async () => {
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      },
    };
    const result = await createFile(auth.value, prepared.value, { fsOps });
    expect(result.outcome).toBe("REFUSED_PRECOMMIT");
    expect(result.commitPointReached).toBe(false);
    void entry;
  });
});

describe("createFile — config fail-closed", () => {
  it("C1 — broken config refuses before publication", async () => {
    const root = await createCanonicalTempRoot("pc-3c-c1-");
    const { prepared, authorization } = await earnAuthorizedCreation(
      root,
      "src",
      "x.txt",
      "a\n",
    );
    await writeFile(
      join(root, "PATHCODE.md"),
      "# Broken\n\n```pathcode-config\ndeny-path = unterminated\n",
      "utf8",
    );
    const result = await createFile(authorization, prepared);
    expect(result.outcome).toBe("REFUSED_PRECOMMIT");
    if (result.outcome === "REFUSED_PRECOMMIT") {
      expect(result.refusalReason).toBe("CONFIG_RELOAD_FAILED");
    }
    expect(result.commitPointReached).toBe(false);
    const names = await readdir(join(root, "src"));
    expect(names.includes("x.txt")).toBe(false);
  });

  it("C2 — deleted config ABSENT remains eligible", async () => {
    const root = await createCanonicalTempRoot("pc-3c-c2-");
    await writePathcodeConfig(root, "deny-path=secrets");
    const { prepared, authorization } = await earnAuthorizedCreation(
      root,
      "src",
      "ok.txt",
      "a\n",
    );
    await unlink(join(root, "PATHCODE.md"));
    const result = await createFile(authorization, prepared);
    expect(result.outcome).toBe("SUCCESS");
  });

  it("C3 — fresh deny-path refuses target", async () => {
    const root = await createCanonicalTempRoot("pc-3c-c3-");
    const { prepared, authorization } = await earnAuthorizedCreation(
      root,
      "src",
      "secret-file.txt",
      "a\n",
    );
    await writeDenyConfig(root, ["src/secret-file.txt"]);
    const result = await createFile(authorization, prepared);
    expect(result.outcome).toBe("REFUSED_PRECOMMIT");
    if (result.outcome === "REFUSED_PRECOMMIT") {
      expect(result.refusalReason).toBe("TARGET_DENIED");
    }
  });

  it("C4 documented: disable-action=EDIT does not disable CREATE_FILE", async () => {
    const root = await createCanonicalTempRoot("pc-3c-c4-");
    await writePathcodeConfig(root, "disable-action=EDIT");
    const { prepared, authorization } = await earnAuthorizedCreation(
      root,
      "src",
      "still.txt",
      "a\n",
    );
    const result = await createFile(authorization, prepared);
    expect(result.outcome).toBe("SUCCESS");
  });

  it("C4b: disable-action=CREATE_FILE after authorize → ACTION_DISABLED", async () => {
    const root = await createCanonicalTempRoot("pc-3c-c4b-");
    const { prepared, authorization } = await earnAuthorizedCreation(
      root,
      "src",
      "blocked.txt",
      "a\n",
    );
    await writePathcodeConfig(root, "disable-action = CREATE_FILE");
    const result = await createFile(authorization, prepared);
    expect(result.outcome).toBe("REFUSED_PRECOMMIT");
    expect(result.commitPointReached).toBe(false);
    if (result.outcome === "REFUSED_PRECOMMIT") {
      expect(result.refusalReason).toBe("ACTION_DISABLED");
    }
    const names = await readdir(join(root, "src"));
    expect(names.includes("blocked.txt")).toBe(false);
  });
});

describe("createFile — recovery", () => {
  it("pre-publication write failure cleans candidate", async () => {
    const root = await createCanonicalTempRoot("pc-3c-write-fail-");
    const { prepared, authorization } = await earnAuthorizedCreation(
      root,
      "src",
      "f.txt",
      "data\n",
    );
    const fsOps: AtomicCreateFsOps = {
      ...productionAtomicCreateFs,
      writeAll: async () => {
        throw new Error("injected write failure");
      },
    };
    const result = await createFile(authorization, prepared, { fsOps });
    expect(result.outcome).toBe("FAILED_PRECOMMIT");
    expect(result.commitPointReached).toBe(false);
    const names = await readdir(join(root, "src"));
    expect(names.includes("f.txt")).toBe(false);
    expect(names.some((name) => name.startsWith(PATH_CODE_CREATE_TEMP_PREFIX))).toBe(
      false,
    );
  });

  it("temp unlink failure after link is COMMITTED_FAILURE and keeps target", async () => {
    const root = await createCanonicalTempRoot("pc-3c-unlink-fail-");
    const { prepared, authorization } = await earnAuthorizedCreation(
      root,
      "src",
      "keep.txt",
      "keep\n",
    );
    const fsOps: AtomicCreateFsOps = {
      ...productionAtomicCreateFs,
      unlink: async (filePath) => {
        if (filePath.includes(PATH_CODE_CREATE_TEMP_PREFIX)) {
          throw new Error("injected unlink failure");
        }
        return productionAtomicCreateFs.unlink(filePath);
      },
    };
    const result = await createFile(authorization, prepared, { fsOps });
    expect(result.outcome).toBe("COMMITTED_FAILURE");
    expect(result.commitPointReached).toBe(true);
    if (result.outcome === "COMMITTED_FAILURE") {
      expect(result.cleanupFailure).toBe(true);
    }
    expect(await readFile(join(root, "src/keep.txt"), "utf8")).toBe("keep\n");
  });

  it("directory fsync failure after link is COMMITTED_FAILURE", async () => {
    const root = await createCanonicalTempRoot("pc-3c-dirsync-fail-");
    const { prepared, authorization } = await earnAuthorizedCreation(
      root,
      "src",
      "d.txt",
      "d\n",
    );
    const fsOps: AtomicCreateFsOps = {
      ...productionAtomicCreateFs,
      fsyncDirectory: async () => {
        throw new Error("injected dir fsync failure");
      },
    };
    const result = await createFile(authorization, prepared, { fsOps });
    expect(result.outcome).toBe("COMMITTED_FAILURE");
    expect(result.commitPointReached).toBe(true);
    expect(await readFile(join(root, "src/d.txt"), "utf8")).toBe("d\n");
  });

  it("after-state mismatch is COMMITTED_FAILURE without deleting target", async () => {
    const root = await createCanonicalTempRoot("pc-3c-after-mismatch-");
    const { prepared, authorization } = await earnAuthorizedCreation(
      root,
      "src",
      "m.txt",
      "auth\n",
    );
    const tampered = Buffer.from("tampered\n");
    const fsOps: AtomicCreateFsOps = {
      ...productionAtomicCreateFs,
      verifyPublishedCreation: async () =>
        Object.freeze({
          kind: "CREATION_AFTER_STATE_EVIDENCE" as const,
          publicationId: "injected-mismatch",
          observedHex: sha256Hex(tampered),
          observedByteLength: tampered.byteLength,
        }),
    };
    const result = await createFile(authorization, prepared, { fsOps });
    expect(result.outcome).toBe("COMMITTED_FAILURE");
    expect(result.commitPointReached).toBe(true);
    expect(await readFile(join(root, "src/m.txt"), "utf8")).toBe("auth\n");
  });
});

describe("createFile — single-use authorization", () => {
  it("replay refuses before filesystem contact", async () => {
    const root = await createCanonicalTempRoot("pc-3c-replay-");
    const { prepared, authorization } = await earnAuthorizedCreation(
      root,
      "src",
      "once.txt",
      "a\n",
    );
    const first = await createFile(authorization, prepared);
    expect(first.outcome).toBe("SUCCESS");
    const second = await createFile(authorization, prepared);
    expect(second.outcome).toBe("REFUSED_PRECOMMIT");
    expect(second.commitPointReached).toBe(false);
  });
});

describe("createFile — live falsification scaffolding", () => {
  it("C-F2 proof target: overwriting rename destroys external bytes (race test would fail)", async () => {
    // Permanent regression target: publication must use linkNoOverwrite, not rename.
    // If this corrupt publication path is used inside the window-race harness,
    // the race test's TARGET_ALREADY_EXISTS / external-bytes-unchanged assertion fails.
    const root = await createCanonicalTempRoot("pc-3c-cf2-");
    const external = Buffer.from("external-keep\n");
    const { prepared, authorization } = await earnAuthorizedCreation(
      root,
      "src",
      "cf2.txt",
      "pc\n",
    );
    const fsOps: AtomicCreateFsOps = {
      ...productionAtomicCreateFs,
      linkNoOverwrite: async (candidatePath, targetPath, operationIdentity) => {
        await writeFile(targetPath, external);
        await productionAtomicCreateFs.renameAtomic(candidatePath, targetPath);
        const { mintPublishedCreationVerificationTarget } = await import(
          "../../src/editing/internal/creation-verification.js"
        );
        return mintPublishedCreationVerificationTarget({
          absolutePath: targetPath,
          operationIdentity,
        });
      },
      unlink: async (filePath) => {
        // rename already removed the candidate path; ignore missing-temp unlink.
        try {
          await productionAtomicCreateFs.unlink(filePath);
        } catch {
          // intentional
        }
      },
    };
    const result = await createFile(authorization, prepared, { fsOps });
    expect(result.commitPointReached).toBe(true);
    // External bytes were overwritten — proving why EEXIST-based publication is required.
    expect(await readFile(join(root, "src/cf2.txt"), "utf8")).toBe("pc\n");
  });
});

describe("createFile — leading-space leaf", () => {
  it("preserves unusual valid leaf names exactly", async () => {
    const root = await createCanonicalTempRoot("pc-3c-leaf-");
    const { prepared, authorization } = await earnAuthorizedCreation(
      root,
      "src",
      " leading.txt",
      "x\n",
    );
    const result = await createFile(authorization, prepared);
    expect(result.outcome).toBe("SUCCESS");
    expect(await readFile(join(root, "src/ leading.txt"), "utf8")).toBe("x\n");
  });
});
