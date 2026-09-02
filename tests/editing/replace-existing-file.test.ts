import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { link, readFile, stat, utimes, writeFile } from "node:fs/promises";
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
import { replaceExistingFile } from "../../src/editing/replace-existing-file.js";
import {
  cleanupInventoryFixtures,
  createCanonicalTempRoot,
} from "../inventory/fixture-helpers.js";
import { earnAdmittedFile, sha256Hex } from "./helpers.js";

afterEach(async () => {
  resetAuthorizationRegistryForTests();
  await cleanupInventoryFixtures();
});

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

    const result = await replaceExistingFile(authorization, prepared, { fsOps });
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
    const result = await replaceExistingFile(authorization, prepared, { fsOps });
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
    const result = await replaceExistingFile(authorization, prepared, { fsOps });
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
