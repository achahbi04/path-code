import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { link, readFile, readdir, stat, unlink, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  authorizePreparedChange,
  explicitEditApproval,
  prepareModifyExistingFile,
} from "../../src/editing/index.js";
import type { AtomicReplaceFsOps } from "../../src/editing/atomic-fs.js";
import { productionAtomicReplaceFs } from "../../src/editing/atomic-fs.js";
import { resetAuthorizationRegistryForTests } from "../../src/editing/internal/registry.js";
import {
  replaceExistingFile,
  replaceExistingFileWithDependencies,
} from "../../src/editing/replace-existing-file.js";
import {
  cleanupInventoryFixtures,
  createCanonicalTempRoot,
  writeDenyConfig,
} from "../inventory/fixture-helpers.js";
import { earnAdmittedFile, sha256Hex } from "./helpers.js";

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

async function earnAuthorizedMutation(
  root: string,
  relativePath: string,
  before: string | Buffer,
  after: string | Buffer,
) {
  const { entry, workspace, config } = await earnAdmittedFile(
    root,
    relativePath,
    before,
  );
  const prepared = await prepareModifyExistingFile(
    entry,
    Buffer.from(after),
    workspace,
    config,
  );
  expect(prepared.ok).toBe(true);
  if (!prepared.ok) {
    throw new Error("prepare failed");
  }
  const auth = await authorizePreparedChange(
    prepared.value,
    explicitEditApproval(),
    config,
  );
  expect(auth.ok).toBe(true);
  if (!auth.ok) {
    throw new Error("authorize failed");
  }
  return {
    prepared: prepared.value,
    authorization: auth.value,
    workspace,
    config,
    root,
    entry,
  };
}

describe("replaceExistingFile — success", () => {
  it("replaces authorized content with exact bytes and provenance", async () => {
    const root = await createCanonicalTempRoot("pc-3b-success-");
    const before = "before line\n";
    const after = "after line\r\n";
    const { prepared, authorization, root: fixtureRoot } = await earnAuthorizedMutation(
      root,
      "target.txt",
      before,
      after,
    );

    const result = await replaceExistingFile(authorization, prepared);
    expect(result.outcome).toBe("SUCCESS");
    if (result.outcome !== "SUCCESS") {
      return;
    }
    expect(result.commitPointReached).toBe(true);
    expect(result.durabilityVerified).toBe(true);
    expect(result.editRecord.provenance).toBe("PATH_CODE_MODIFIED");
    expect(result.knowledgeInvalidation.kind).toBe("KNOWLEDGE_INVALIDATION");

    const absolute = join(fixtureRoot, "target.txt");
    const finalBytes = await readFile(absolute);
    expect(finalBytes.equals(Buffer.from(after))).toBe(true);
    expect(sha256Hex(finalBytes)).toBe(prepared.afterFingerprint.hex);

    const names = await import("node:fs/promises").then((fs) =>
      fs.readdir(fixtureRoot),
    );
    expect(names.some((name) => name.startsWith(".path-code-replace-"))).toBe(
      false,
    );
  });

  it("preserves mode on the replaced target", async () => {
    const root = await createCanonicalTempRoot("pc-3b-mode-");
    const { prepared, authorization } = await earnAuthorizedMutation(
      root,
      "mode.txt",
      "x\n",
      "y\n",
    );
    const absolute = join(root, "mode.txt");
    await import("node:fs/promises").then((fs) => fs.chmod(absolute, 0o640));

    const beforeStat = await stat(absolute);
    const result = await replaceExistingFile(authorization, prepared);
    expect(result.outcome).toBe("SUCCESS");
    const afterStat = await stat(absolute);
    expect(afterStat.mode & 0o777).toBe(beforeStat.mode & 0o777);
  });
});

describe("replaceExistingFile — byte fidelity", () => {
  it("preserves CRLF, BOM, trailing spaces, and binary bytes exactly", async () => {
    const cases: Buffer[] = [
      Buffer.from("a\r\nb\r\n"),
      Buffer.from("no-newline-at-end"),
      Buffer.from("spaces   \n"),
      Buffer.from([0xef, 0xbb, 0xbf, 0x68, 0x69]),
      Buffer.from([0x00, 0x01, 0xfe, 0xff]),
    ];
    for (const after of cases) {
      const root = await createCanonicalTempRoot("pc-3b-bytes-");
      const { prepared, authorization } = await earnAuthorizedMutation(
        root,
        "bin.dat",
        Buffer.from("original"),
        after,
      );
      const result = await replaceExistingFile(authorization, prepared);
      expect(result.outcome).toBe("SUCCESS");
      const finalBytes = await readFile(join(root, "bin.dat"));
      expect(finalBytes.equals(after)).toBe(true);
      await cleanupInventoryFixtures();
      resetAuthorizationRegistryForTests();
    }
  });
});

describe("replaceExistingFile — refusals", () => {
  it("refuses stale content before temp staging", async () => {
    const root = await createCanonicalTempRoot("pc-3b-stale-");
    const { prepared, authorization } = await earnAuthorizedMutation(
      root,
      "stale.txt",
      "original\n",
      "new\n",
    );
    await writeFile(join(root, "stale.txt"), "changed externally\n");
    const result = await replaceExistingFile(authorization, prepared);
    expect(result.outcome).toBe("REFUSED_PRECOMMIT");
    expect(result.commitPointReached).toBe(false);
    const bytes = await readFile(join(root, "stale.txt"));
    expect(bytes.toString()).toBe("changed externally\n");
  });

  it("refuses same-size same-mtime changed bytes via full hash", async () => {
    const root = await createCanonicalTempRoot("pc-3b-mtime-");
    const before = "1234567890";
    const { prepared, authorization } = await earnAuthorizedMutation(
      root,
      "mtime.txt",
      before,
      "abcdefghij",
    );
    const absolute = join(root, "mtime.txt");
    const originalStat = await stat(absolute);
    await writeFile(absolute, "0987654321");
    await utimes(absolute, originalStat.atime, originalStat.mtime);

    const result = await replaceExistingFile(authorization, prepared);
    expect(result.outcome).toBe("REFUSED_PRECOMMIT");
    expect(createHash("sha256").update(await readFile(absolute)).digest("hex")).toBe(
      createHash("sha256").update("0987654321").digest("hex"),
    );
  });

  it("refuses hard-linked targets", async () => {
    const root = await createCanonicalTempRoot("pc-3b-hardlink-");
    const { prepared, authorization } = await earnAuthorizedMutation(
      root,
      "main.txt",
      "shared\n",
      "new\n",
    );
    await link(join(root, "main.txt"), join(root, "alias.txt"));
    const result = await replaceExistingFile(authorization, prepared);
    expect(result.outcome).toBe("REFUSED_PRECOMMIT");
    expect((await readFile(join(root, "main.txt"))).toString()).toBe("shared\n");
  });

  it("consumes authorization even when refusing", async () => {
    const root = await createCanonicalTempRoot("pc-3b-spent-");
    const { prepared, authorization } = await earnAuthorizedMutation(
      root,
      "once.txt",
      "a\n",
      "b\n",
    );
    await writeFile(join(root, "once.txt"), "changed\n");
    const first = await replaceExistingFile(authorization, prepared);
    expect(first.outcome).toBe("REFUSED_PRECOMMIT");
    const second = await replaceExistingFile(authorization, prepared);
    expect(second.outcome).toBe("REFUSED_PRECOMMIT");
  });
});

describe("replaceExistingFile — concurrency detection", () => {
  it("refuses content changed during temp preparation on final read", async () => {
    const root = await createCanonicalTempRoot("pc-3b-during-");
    const { prepared, authorization } = await earnAuthorizedMutation(
      root,
      "during.txt",
      "before\n",
      "after\n",
    );

    const fsOps: AtomicReplaceFsOps = {
      ...productionAtomicReplaceFs,
      readCandidateBytes: async (handle, expectedLength) => {
        await writeFile(join(root, "during.txt"), "mutated during temp\n");
        return productionAtomicReplaceFs.readCandidateBytes(handle, expectedLength);
      },
    };

    const result = await replaceExistingFileWithDependencies(authorization, prepared, { fsOps });
    expect(result.outcome).toBe("FAILED_PRECOMMIT");
    expect(result.commitPointReached).toBe(false);
    expect((await readFile(join(root, "during.txt"))).toString()).toBe(
      "mutated during temp\n",
    );
  });
});

describe("replaceExistingFile — recovery", () => {
  it("leaves original bytes intact on temp write failure", async () => {
    const root = await createCanonicalTempRoot("pc-3b-recover-write-");
    const before = "keep-me\n";
    const { prepared, authorization } = await earnAuthorizedMutation(
      root,
      "recover.txt",
      before,
      "new\n",
    );
    const fsOps: AtomicReplaceFsOps = {
      ...productionAtomicReplaceFs,
      writeAll: async () => {
        throw new Error("injected write failure");
      },
    };
    const result = await replaceExistingFileWithDependencies(authorization, prepared, { fsOps });
    expect(result.outcome).toBe("FAILED_PRECOMMIT");
    expect(result.commitPointReached).toBe(false);
    expect((await readFile(join(root, "recover.txt"))).toString()).toBe(before);
  });

  it("reports committed failure without rollback when directory fsync fails", async () => {
    const root = await createCanonicalTempRoot("pc-3b-postcommit-");
    const after = "committed-new\n";
    const { prepared, authorization } = await earnAuthorizedMutation(
      root,
      "post.txt",
      "old\n",
      after,
    );
    const fsOps: AtomicReplaceFsOps = {
      ...productionAtomicReplaceFs,
      fsyncDirectory: async () => {
        throw new Error("injected directory fsync failure");
      },
    };
    const result = await replaceExistingFileWithDependencies(authorization, prepared, { fsOps });
    expect(result.outcome).toBe("COMMITTED_FAILURE");
    expect(result.commitPointReached).toBe(true);
    expect(result.durabilityVerified).toBe(false);
    expect((await readFile(join(root, "post.txt"))).toString()).toBe(after);
    expect(result.knowledgeInvalidation).not.toBeNull();
  });
});

describe("replaceExistingFile — platform policy", () => {
  it("refuses unsupported platform before temp creation", async () => {
    const root = await createCanonicalTempRoot("pc-3b-platform-");
    const { prepared, authorization } = await earnAuthorizedMutation(
      root,
      "plat.txt",
      "a\n",
      "b\n",
    );
    const platformSpy = vi.spyOn(process, "platform", "get").mockReturnValue("win32");
    try {
      const result = await replaceExistingFile(authorization, prepared);
      expect(result.outcome).toBe("REFUSED_PRECOMMIT");
      expect(result.commitPointReached).toBe(false);
    } finally {
      platformSpy.mockRestore();
    }
  });
});

describe("replaceExistingFile — mutation-time config fail-closed", () => {
  it("C1: corrupted PATHCODE.md after authorize → REFUSED_PRECOMMIT CONFIG_RELOAD_FAILED", async () => {
    const root = await createCanonicalTempRoot("pc-3bh1-c1-");
    const before = "keep-c1\n";
    const { prepared, authorization } = await earnAuthorizedMutation(
      root,
      "c1.txt",
      before,
      "new-c1\n",
    );
    await writeFile(
      join(root, "PATHCODE.md"),
      "# Broken\n\n```pathcode-config\ndeny-path = unterminated\n",
      "utf8",
    );

    const result = await replaceExistingFile(authorization, prepared);
    expect(result.outcome).toBe("REFUSED_PRECOMMIT");
    expect(result.commitPointReached).toBe(false);
    if (result.outcome !== "REFUSED_PRECOMMIT") {
      return;
    }
    expect(result.refusalReason).toBe("CONFIG_RELOAD_FAILED");
    expect((await readFile(join(root, "c1.txt"))).toString()).toBe(before);
    const names = await readdir(root);
    expect(names.some((name) => name.startsWith(".path-code-replace-"))).toBe(false);

    const second = await replaceExistingFile(authorization, prepared);
    expect(second.outcome).toBe("REFUSED_PRECOMMIT");
  });

  it("C2: delete PATHCODE.md after authorize → successful ABSENT, mutation proceeds", async () => {
    const root = await createCanonicalTempRoot("pc-3bh1-c2-");
    await writePathcodeConfig(root, "deny-path = unrelated-secret");
    const before = "keep-c2\n";
    const after = "new-c2\n";
    const { prepared, authorization } = await earnAuthorizedMutation(
      root,
      "c2.txt",
      before,
      after,
    );
    await unlink(join(root, "PATHCODE.md"));

    const result = await replaceExistingFile(authorization, prepared);
    expect(result.outcome).toBe("SUCCESS");
    if (result.outcome !== "SUCCESS") {
      return;
    }
    expect(result.configFreshness).toBe("MUTATION_TIME_RE_RESOLVED");
    expect((await readFile(join(root, "c2.txt"))).toString()).toBe(after);
  });

  it("C3: deny-path covering target after authorize → TARGET_DENIED not CONFIG_RELOAD_FAILED", async () => {
    const root = await createCanonicalTempRoot("pc-3bh1-c3-");
    const before = "keep-c3\n";
    const { prepared, authorization } = await earnAuthorizedMutation(
      root,
      "c3.txt",
      before,
      "new-c3\n",
    );
    await writeDenyConfig(root, ["c3.txt"]);

    const result = await replaceExistingFile(authorization, prepared);
    expect(result.outcome).toBe("REFUSED_PRECOMMIT");
    expect(result.commitPointReached).toBe(false);
    if (result.outcome !== "REFUSED_PRECOMMIT") {
      return;
    }
    expect(result.refusalReason).toBe("TARGET_DENIED");
    expect(result.refusalReason).not.toBe("CONFIG_RELOAD_FAILED");
    expect((await readFile(join(root, "c3.txt"))).toString()).toBe(before);
  });

  it("C4: disable mapped EDIT action after authorize → ACTION_DISABLED", async () => {
    const root = await createCanonicalTempRoot("pc-3bh1-c4-");
    const before = "keep-c4\n";
    const { prepared, authorization } = await earnAuthorizedMutation(
      root,
      "c4.txt",
      before,
      "new-c4\n",
    );
    await writePathcodeConfig(root, "disable-action = EDIT");

    const result = await replaceExistingFile(authorization, prepared);
    expect(result.outcome).toBe("REFUSED_PRECOMMIT");
    expect(result.commitPointReached).toBe(false);
    if (result.outcome !== "REFUSED_PRECOMMIT") {
      return;
    }
    expect(result.refusalReason).toBe("ACTION_DISABLED");
    expect((await readFile(join(root, "c4.txt"))).toString()).toBe(before);
  });
});

describe("replaceExistingFile — temp-creation recovery", () => {
  it("injected createTempExclusive failure returns FAILED_PRECOMMIT without escaping", async () => {
    const root = await createCanonicalTempRoot("pc-3bh1-temp-");
    const before = "keep-temp\n";
    const { prepared, authorization } = await earnAuthorizedMutation(
      root,
      "temp.txt",
      before,
      "new-temp\n",
    );
    const fsOps: AtomicReplaceFsOps = {
      ...productionAtomicReplaceFs,
      createTempExclusive: async () => {
        throw new Error("injected createTempExclusive failure");
      },
    };

    let thrown: unknown = null;
    let result: Awaited<ReturnType<typeof replaceExistingFile>> | null = null;
    try {
      result = await replaceExistingFileWithDependencies(authorization, prepared, { fsOps });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeNull();
    expect(result).not.toBeNull();
    if (result === null) {
      return;
    }
    expect(result.outcome).toBe("FAILED_PRECOMMIT");
    expect(result.commitPointReached).toBe(false);
    expect((await readFile(join(root, "temp.txt"))).toString()).toBe(before);
    const names = await readdir(root);
    expect(names.some((name) => name.startsWith(".path-code-replace-"))).toBe(false);
  });

  it("partial mid-stream write failure recovers with original target intact", async () => {
    const root = await createCanonicalTempRoot("pc-3bh1-partial-");
    const before = "keep-partial\n";
    const after = "abcdefghij\n";
    const { prepared, authorization } = await earnAuthorizedMutation(
      root,
      "partial.txt",
      before,
      after,
    );
    const fsOps: AtomicReplaceFsOps = {
      ...productionAtomicReplaceFs,
      writeAll: async (handle, bytes) => {
        const slice = bytes.subarray(0, Math.min(1, bytes.byteLength));
        await productionAtomicReplaceFs.writeAll(handle, slice);
        throw new Error("injected mid-stream write failure");
      },
    };
    const result = await replaceExistingFileWithDependencies(authorization, prepared, { fsOps });
    expect(result.outcome).toBe("FAILED_PRECOMMIT");
    expect(result.commitPointReached).toBe(false);
    expect((await readFile(join(root, "partial.txt"))).toString()).toBe(before);
  });

  it("cleanup unlink failure surfaces cleanupFailure after pre-commit recovery", async () => {
    const root = await createCanonicalTempRoot("pc-3bh1-unlink-");
    const before = "keep-unlink\n";
    const { prepared, authorization } = await earnAuthorizedMutation(
      root,
      "unlink.txt",
      before,
      "new-unlink\n",
    );
    const fsOps: AtomicReplaceFsOps = {
      ...productionAtomicReplaceFs,
      readCandidateBytes: async (handle, expectedLength) => {
        await writeFile(join(root, "unlink.txt"), "mutated during temp\n", "utf8");
        return productionAtomicReplaceFs.readCandidateBytes(handle, expectedLength);
      },
      unlink: async () => {
        throw new Error("injected unlink failure");
      },
    };
    const result = await replaceExistingFileWithDependencies(authorization, prepared, { fsOps });
    expect(result.outcome).toBe("FAILED_PRECOMMIT");
    expect(result.commitPointReached).toBe(false);
    if (result.outcome !== "FAILED_PRECOMMIT") {
      return;
    }
    expect(result.cleanupFailure).toBe(true);
    expect((await readFile(join(root, "unlink.txt"))).toString()).toBe(
      "mutated during temp\n",
    );
  });

  it("after-state mismatch via rename seam yields COMMITTED_FAILURE", async () => {
    const root = await createCanonicalTempRoot("pc-3bh1-after-");
    const before = "keep-after\n";
    const after = "new-after\n";
    const { prepared, authorization } = await earnAuthorizedMutation(
      root,
      "after.txt",
      before,
      after,
    );
    const fsOps: AtomicReplaceFsOps = {
      ...productionAtomicReplaceFs,
      renameAtomic: async (tempPath, targetPath) => {
        await productionAtomicReplaceFs.renameAtomic(tempPath, targetPath);
        await writeFile(targetPath, "corrupted-after-rename\n", "utf8");
      },
    };
    const result = await replaceExistingFileWithDependencies(authorization, prepared, { fsOps });
    expect(result.outcome).toBe("COMMITTED_FAILURE");
    expect(result.commitPointReached).toBe(true);
    expect((await readFile(join(root, "after.txt"))).toString()).toBe(
      "corrupted-after-rename\n",
    );
  });
});