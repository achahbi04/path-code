/**
 * Stage 3 malicious runtime proofs — public wrappers ignore mechanism substitution.
 */

import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  authorizePreparedChange,
  createFile,
  createMultiFilePlan,
  executeMultiFilePlan,
  explicitEditApproval,
  prepareCreateFile,
  prepareModifyExistingFile,
  replaceExistingFile,
} from "../../src/editing/index.js";
import { resetAuthorizationRegistryForTests } from "../../src/editing/internal/registry.js";
import {
  cleanupInventoryFixtures,
  createCanonicalTempRoot,
  writeRelative,
} from "../inventory/fixture-helpers.js";
import { earnAdmittedDirectory, earnAdmittedFile } from "./helpers.js";

afterEach(async () => {
  resetAuthorizationRegistryForTests();
  await cleanupInventoryFixtures();
});

const throwingFsOps = new Proxy(
  {},
  {
    get(_target, prop) {
      return () => {
        throw new Error(`malicious fsOps invoked: ${String(prop)}`);
      };
    },
  },
);

const throwingTargetOps = {
  replaceExistingFile: async () => {
    throw new Error("malicious targetOps.replaceExistingFile invoked");
  },
  createFile: async () => {
    throw new Error("malicious targetOps.createFile invoked");
  },
};

describe("public authority surface — malicious mechanism substitution ignored", () => {
  it("replaceExistingFile ignores throwing fsOps and mutates via production FS", async () => {
    const root = await createCanonicalTempRoot("pc-auth-mal-replace-");
    const before = "before-mal\n";
    const after = "after-mal\n";
    const { entry, workspace, config } = await earnAdmittedFile(
      root,
      "target.txt",
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

    const widened = {
      fsOps: throwingFsOps,
    } as unknown as Parameters<typeof replaceExistingFile>[2];

    const result = await replaceExistingFile(
      auth.value,
      prepared.value,
      widened,
    );
    expect(result.outcome).toBe("SUCCESS");
    expect(result.commitPointReached).toBe(true);
    expect(await readFile(join(root, "target.txt"), "utf8")).toBe(after);
  });

  it("createFile ignores throwing fsOps and publishes via production FS", async () => {
    const root = await createCanonicalTempRoot("pc-auth-mal-create-");
    await writeRelative(root, "src/.keep", "");
    const { entry, workspace, config } = await earnAdmittedDirectory(root, "src");
    const prepared = await prepareCreateFile(
      entry,
      "fresh.txt",
      Buffer.from("created-mal\n"),
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

    const widened = {
      fsOps: throwingFsOps,
    } as unknown as Parameters<typeof createFile>[2];

    const result = await createFile(auth.value, prepared.value, widened);
    expect(result.outcome).toBe("SUCCESS");
    expect(result.commitPointReached).toBe(true);
    expect(await readFile(join(root, "src/fresh.txt"), "utf8")).toBe(
      "created-mal\n",
    );
  });

  it("executeMultiFilePlan ignores throwing targetOps and applies via real wrappers", async () => {
    const root = await createCanonicalTempRoot("pc-auth-mal-multi-");
    await writeRelative(root, "a.txt", "a0\n");
    await writeRelative(root, "b.txt", "b0\n");
    const first = await earnAdmittedFile(root, "a.txt", "a0\n");
    // Reuse the same workspace/config; inventory both targets from that boundary.
    const { inventory } = await import("../../src/inventory/index.js");
    const inv = await inventory(first.workspace, first.config);
    expect(inv.ok).toBe(true);
    if (!inv.ok) {
      return;
    }
    const entryA = inv.value.observations.find(
      (item) =>
        item.relativePath === "a.txt" && item.disposition === "ADMITTED",
    );
    const entryB = inv.value.observations.find(
      (item) =>
        item.relativePath === "b.txt" && item.disposition === "ADMITTED",
    );
    expect(entryA?.disposition).toBe("ADMITTED");
    expect(entryB?.disposition).toBe("ADMITTED");
    if (entryA?.disposition !== "ADMITTED" || entryB?.disposition !== "ADMITTED") {
      return;
    }

    const preparedA = await prepareModifyExistingFile(
      entryA.entry,
      Buffer.from("a1\n"),
      first.workspace,
      first.config,
    );
    const preparedB = await prepareModifyExistingFile(
      entryB.entry,
      Buffer.from("b1\n"),
      first.workspace,
      first.config,
    );
    expect(preparedA.ok).toBe(true);
    expect(preparedB.ok).toBe(true);
    if (!preparedA.ok || !preparedB.ok) {
      return;
    }
    const authA = await authorizePreparedChange(
      preparedA.value,
      explicitEditApproval(),
      first.config,
    );
    const authB = await authorizePreparedChange(
      preparedB.value,
      explicitEditApproval(),
      first.config,
    );
    expect(authA.ok).toBe(true);
    expect(authB.ok).toBe(true);
    if (!authA.ok || !authB.ok) {
      return;
    }
    const built = createMultiFilePlan([
      { prepared: preparedA.value, authorization: authA.value },
      { prepared: preparedB.value, authorization: authB.value },
    ]);
    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }

    const widened = {
      targetOps: throwingTargetOps,
    } as unknown as Parameters<typeof executeMultiFilePlan>[1];

    const result = await executeMultiFilePlan(built.value, widened);
    expect(result.planStatus).toBe("ALL_APPLIED");
    expect(result.targetOutcomes[0]?.kind).toBe("APPLIED");
    expect(result.targetOutcomes[1]?.kind).toBe("APPLIED");
    expect(await readFile(join(root, "a.txt"), "utf8")).toBe("a1\n");
    expect(await readFile(join(root, "b.txt"), "utf8")).toBe("b1\n");
  });
});
