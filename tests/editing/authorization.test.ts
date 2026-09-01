import { Buffer } from "node:buffer";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadProjectConfig } from "../../src/config/index.js";
import {
  authorizePreparedChange,
  explicitEditApproval,
  isModifyExistingFileDisabled,
  prepareModifyExistingFile,
} from "../../src/editing/index.js";
import { consumeEditAuthorization } from "../../src/editing/internal/consume-authorization.js";
import { resetAuthorizationRegistryForTests } from "../../src/editing/internal/registry.js";
import type { GitStateBaseline } from "../../src/git/types.js";
import {
  boundaryFor,
  cleanupInventoryFixtures,
  createCanonicalTempRoot,
} from "../inventory/fixture-helpers.js";
import { earnAdmittedFile } from "./helpers.js";

afterEach(async () => {
  resetAuthorizationRegistryForTests();
  await cleanupInventoryFixtures();
});

async function disabledEditConfig(root: string) {
  await writeFile(
    join(root, "PATHCODE.md"),
    "# Config\n\n```pathcode-config\ndisable-action = EDIT\n```\n",
    "utf8",
  );
  const workspace = await boundaryFor(root);
  const loaded = await loadProjectConfig(workspace);
  expect(loaded.ok).toBe(true);
  if (!loaded.ok) {
    throw new Error("config load failed");
  }
  return { workspace, config: loaded.value };
}

describe("authorizePreparedChange", () => {
  it("requires explicit approval", async () => {
    const root = await createCanonicalTempRoot("pc-3a-auth-");
    const { entry, workspace, config } = await earnAdmittedFile(root, "a.ts", "x\n");
    const prepared = await prepareModifyExistingFile(
      entry,
      Buffer.from("y\n"),
      workspace,
      config,
    );
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) {
      return;
    }
    const unauthorized = await authorizePreparedChange(
      prepared.value,
      {} as never,
      config,
    );
    expect(unauthorized.ok).toBe(false);
  });

  it("binds authorization to exact prepared object identity", async () => {
    const root = await createCanonicalTempRoot("pc-3a-bind-");
    const { entry, workspace, config } = await earnAdmittedFile(root, "a.ts", "x\n");
    const preparedA = await prepareModifyExistingFile(
      entry,
      Buffer.from("a\n"),
      workspace,
      config,
    );
    const preparedB = await prepareModifyExistingFile(
      entry,
      Buffer.from("a\n"),
      workspace,
      config,
    );
    expect(preparedA.ok && preparedB.ok).toBe(true);
    if (!preparedA.ok || !preparedB.ok) {
      return;
    }
    expect(preparedA.value.afterFingerprint.hex).toBe(
      preparedB.value.afterFingerprint.hex,
    );
    expect(preparedA.value).not.toBe(preparedB.value);

    const auth = await authorizePreparedChange(
      preparedA.value,
      explicitEditApproval(),
      config,
    );
    expect(auth.ok).toBe(true);
    if (!auth.ok) {
      return;
    }

    const foreign = consumeEditAuthorization(auth.value, preparedB.value);
    expect(foreign.ok).toBe(false);
    if (foreign.ok) {
      return;
    }
    expect(foreign.error.code).toBe("PREPARED_IDENTITY_MISMATCH");
  });

  it("refuses disabled MODIFY_EXISTING_FILE via disable-action=EDIT", async () => {
    const root = await createCanonicalTempRoot("pc-3a-disabled-");
    const { workspace, config } = await disabledEditConfig(root);
    const { entry } = await earnAdmittedFile(root, "a.ts", "x\n");
    expect(isModifyExistingFileDisabled(config)).toBe(true);

    const prepared = await prepareModifyExistingFile(
      entry,
      Buffer.from("y\n"),
      workspace,
      config,
    );
    expect(prepared.ok).toBe(false);
    if (prepared.ok) {
      return;
    }
    expect(prepared.error.code).toBe("ACTION_DISABLED");
  });

  it("supports authorization without Git context", async () => {
    const root = await createCanonicalTempRoot("pc-3a-nogit-");
    const { entry, workspace, config } = await earnAdmittedFile(root, "a.ts", "x\n");
    const prepared = await prepareModifyExistingFile(
      entry,
      Buffer.from("y\n"),
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
  });

  it("implements one-shot consumption semantics", async () => {
    const root = await createCanonicalTempRoot("pc-3a-once-");
    const { entry, workspace, config } = await earnAdmittedFile(root, "a.ts", "x\n");
    const prepared = await prepareModifyExistingFile(
      entry,
      Buffer.from("y\n"),
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

    const first = consumeEditAuthorization(auth.value, prepared.value);
    expect(first.ok).toBe(true);

    const second = consumeEditAuthorization(auth.value, prepared.value);
    expect(second.ok).toBe(false);
    if (second.ok) {
      return;
    }
    expect(second.error.code).toBe("AUTHORIZATION_ALREADY_CONSUMED");
  });

  it("refuses reconstructed authorization copies", async () => {
    const root = await createCanonicalTempRoot("pc-3a-copy-");
    const { entry, workspace, config } = await earnAdmittedFile(root, "a.ts", "x\n");
    const prepared = await prepareModifyExistingFile(
      entry,
      Buffer.from("y\n"),
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
    const copy = { ...auth.value } as typeof auth.value;
    const consumed = consumeEditAuthorization(copy, prepared.value);
    expect(consumed.ok).toBe(false);
    if (consumed.ok) {
      return;
    }
    expect(consumed.error.code).toBe("AUTHORIZATION_NOT_REGISTERED");
  });

  it("refuses UNMERGED targets when Git context is supplied", async () => {
    const root = await createCanonicalTempRoot("pc-3a-unmerged-");
    const { entry, workspace, config } = await earnAdmittedFile(root, "conflict.ts", "x\n");
    const prepared = await prepareModifyExistingFile(
      entry,
      Buffer.from("y\n"),
      workspace,
      config,
    );
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) {
      return;
    }

    const gitContext = {
      availability: { kind: "NOT_GIT_REPOSITORY" as const },
      annotations: [
        {
          entry,
          observation: {
            gitRelativePath: "conflict.ts",
            workspaceRelativePath: "conflict.ts",
            state: { kind: "UNMERGED" as const, stages: "DD" },
            provenance: "PRE_EXISTING" as const,
          },
        },
      ],
      unmappedVisibleObservations: [],
      inventoryTraversalCompletion: { kind: "COMPLETE" as const },
      provenance: "PRE_EXISTING" as const,
      commandExclusionStatuses: [],
    } as unknown as GitStateBaseline;

    const auth = await authorizePreparedChange(
      prepared.value,
      explicitEditApproval(),
      config,
      { gitContext },
    );
    expect(auth.ok).toBe(false);
    if (auth.ok) {
      return;
    }
    expect(auth.error.code).toBe("GIT_UNMERGED");
  });
});
