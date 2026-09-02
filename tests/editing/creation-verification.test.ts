import { Buffer } from "node:buffer";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { productionAtomicCreateFs } from "../../src/editing/atomic-fs.js";
import {
  mintPublishedCreationVerificationTarget,
  publishedCreationTargetBoundToOperation,
  resolvePublishedCreationTarget,
} from "../../src/editing/internal/creation-verification.js";

describe("post-creation verification opacity", () => {
  it("binds tokens to operation identity and rejects cross-operation verify", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pc-creation-verify-"));
    const absolutePath = join(dir, "published.txt");
    await writeFile(absolutePath, "published\n");

    const opA = Object.freeze({ id: "A" });
    const opB = Object.freeze({ id: "B" });
    const token = mintPublishedCreationVerificationTarget({
      absolutePath,
      operationIdentity: opA,
    });

    expect(publishedCreationTargetBoundToOperation(token, opA)).toBe(true);
    expect(publishedCreationTargetBoundToOperation(token, opB)).toBe(false);

    const evidence = await productionAtomicCreateFs.verifyPublishedCreation(
      token,
      opA,
    );
    expect(evidence.kind).toBe("CREATION_AFTER_STATE_EVIDENCE");
    expect(evidence.observedByteLength).toBe(Buffer.from("published\n").byteLength);

    await expect(
      productionAtomicCreateFs.verifyPublishedCreation(token, opB),
    ).rejects.toThrow(/not bound to this creation operation/);
  });

  it("rejects forged plain objects as verification targets", async () => {
    const op = Object.freeze({ id: "forge" });
    await expect(
      productionAtomicCreateFs.verifyPublishedCreation(
        { forged: true } as never,
        op,
      ),
    ).rejects.toThrow(/not registered/);
  });

  it("does not expose a path-shaped public constructor", () => {
    const op = Object.freeze({ id: "path" });
    const token = mintPublishedCreationVerificationTarget({
      absolutePath: "/tmp/should-not-be-caller-path",
      operationIdentity: op,
    });
    const resolved = resolvePublishedCreationTarget(token, op);
    expect(resolved.absolutePath).toBe("/tmp/should-not-be-caller-path");
    // Token itself has no absolutePath property for callers to retarget.
    expect(
      Object.prototype.hasOwnProperty.call(token, "absolutePath"),
    ).toBe(false);
  });
});
