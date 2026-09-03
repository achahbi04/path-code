import { Buffer } from "node:buffer";
import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  authorizePreparedChange,
  createMultiFilePlan,
  executeMultiFilePlan,
  explicitEditApproval,
  MAX_EDIT_FILE_BYTES,
  MAX_FILES_PER_EDIT_OPERATION,
  prepareCreateFile,
  prepareModifyExistingFile,
} from "../../src/editing/index.js";
import { executeMultiFilePlanWithDependencies } from "../../src/editing/multi-file-execute.js";
import type {
  MultiFilePlanEntry,
  PreparedCreation,
  PreparedMutation,
  ReplaceExistingFileResult,
} from "../../src/editing/index.js";
import { resetAuthorizationRegistryForTests } from "../../src/editing/internal/registry.js";
import { loadProjectConfig } from "../../src/config/loader.js";
import type { ResolvedProjectConfig } from "../../src/config/types.js";
import type { WorkspaceBoundary } from "../../src/domain/workspace.js";
import { inventory } from "../../src/inventory/index.js";
import {
  boundaryFor,
  cleanupInventoryFixtures,
  createCanonicalTempRoot,
  writeDenyConfig,
  writeRelative,
} from "../inventory/fixture-helpers.js";

afterEach(async () => {
  resetAuthorizationRegistryForTests();
  await cleanupInventoryFixtures();
});

type SharedFixture = {
  readonly root: string;
  readonly workspace: WorkspaceBoundary;
  readonly config: ResolvedProjectConfig;
};

async function openFixture(root: string): Promise<SharedFixture> {
  const workspace = await boundaryFor(root);
  const loaded = await loadProjectConfig(workspace);
  expect(loaded.ok).toBe(true);
  if (!loaded.ok) {
    throw new Error(`config load failed: ${loaded.error.code}`);
  }
  return { root, workspace, config: loaded.value };
}

async function writePathcodeConfig(root: string, fenceBody: string): Promise<void> {
  await writeFile(
    join(root, "PATHCODE.md"),
    `# Config\n\n\`\`\`pathcode-config\n${fenceBody}\n\`\`\`\n`,
    "utf8",
  );
}

async function earnModify(
  fixture: SharedFixture,
  relativePath: string,
  before: string,
  after: string,
) {
  await writeRelative(fixture.root, relativePath, before);
  const inv = await inventory(fixture.workspace, fixture.config);
  expect(inv.ok).toBe(true);
  if (!inv.ok) {
    throw new Error(`inventory failed: ${inv.error.code}`);
  }
  const observation = inv.value.observations.find(
    (item) =>
      item.relativePath === relativePath && item.disposition === "ADMITTED",
  );
  if (observation?.disposition !== "ADMITTED") {
    throw new Error(`missing admitted entry ${relativePath}`);
  }
  const prepared = await prepareModifyExistingFile(
    observation.entry,
    Buffer.from(after),
    fixture.workspace,
    fixture.config,
  );
  expect(prepared.ok).toBe(true);
  if (!prepared.ok) {
    throw new Error(`prepare modify failed: ${prepared.error.code}`);
  }
  const auth = await authorizePreparedChange(
    prepared.value,
    explicitEditApproval(),
    fixture.config,
  );
  expect(auth.ok).toBe(true);
  if (!auth.ok) {
    throw new Error(`authorize modify failed: ${auth.error.code}`);
  }
  return {
    prepared: prepared.value,
    authorization: auth.value,
  };
}

async function earnCreate(
  fixture: SharedFixture,
  parentRelative: string,
  leafName: string,
  content: string,
) {
  await mkdir(join(fixture.root, parentRelative), { recursive: true });
  const inv = await inventory(fixture.workspace, fixture.config);
  expect(inv.ok).toBe(true);
  if (!inv.ok) {
    throw new Error(`inventory failed: ${inv.error.code}`);
  }
  const observation = inv.value.observations.find((item) => {
    if (item.disposition !== "ADMITTED" && item.disposition !== "DESCENDED") {
      return false;
    }
    return (
      item.relativePath === parentRelative &&
      item.entry.physicalKind === "DIRECTORY"
    );
  });
  if (
    observation?.disposition !== "ADMITTED" &&
    observation?.disposition !== "DESCENDED"
  ) {
    throw new Error(`missing admitted directory ${parentRelative}`);
  }
  const prepared = await prepareCreateFile(
    observation.entry,
    leafName,
    Buffer.from(content),
    fixture.workspace,
    fixture.config,
  );
  expect(prepared.ok).toBe(true);
  if (!prepared.ok) {
    throw new Error(`prepare create failed: ${prepared.error.code}`);
  }
  const auth = await authorizePreparedChange(
    prepared.value,
    explicitEditApproval(),
    fixture.config,
  );
  expect(auth.ok).toBe(true);
  if (!auth.ok) {
    throw new Error(`authorize create failed: ${auth.error.code}`);
  }
  return {
    prepared: prepared.value,
    authorization: auth.value,
  };
}

async function withFixture(prefix: string): Promise<SharedFixture> {
  const root = await createCanonicalTempRoot(prefix);
  return openFixture(root);
}

describe("createMultiFilePlan — construction", () => {
  it("refuses fewer than 2 targets", async () => {
    const fixture = await withFixture("pc-3d-count-");
    const a = await earnModify(fixture, "a.txt", "a0\n", "a1\n");
    const built = createMultiFilePlan([
      { prepared: a.prepared, authorization: a.authorization },
    ]);
    expect(built.ok).toBe(false);
    if (built.ok) {
      return;
    }
    expect(built.error.code).toBe("PLAN_TARGET_COUNT_OUT_OF_BOUNDS");
  });

  it("refuses more than 16 targets", async () => {
    const fixture = await withFixture("pc-3d-max-");
    const entries: MultiFilePlanEntry[] = [];
    for (let i = 0; i < MAX_FILES_PER_EDIT_OPERATION + 1; i += 1) {
      const earned = await earnModify(
        fixture,
        `f${i}.txt`,
        `b${i}\n`,
        `a${i}\n`,
      );
      entries.push({
        prepared: earned.prepared,
        authorization: earned.authorization,
      });
    }
    const built = createMultiFilePlan(entries);
    expect(built.ok).toBe(false);
    if (!built.ok) {
      expect(built.error.code).toBe("PLAN_TARGET_COUNT_OUT_OF_BOUNDS");
    }
  });

  it("copies the entry sequence and freezes the plan", async () => {
    const fixture = await withFixture("pc-3d-copy-");
    const a = await earnModify(fixture, "a.txt", "a0\n", "a1\n");
    const b = await earnModify(fixture, "b.txt", "b0\n", "b1\n");
    const input: MultiFilePlanEntry[] = [
      { prepared: a.prepared, authorization: a.authorization },
      { prepared: b.prepared, authorization: b.authorization },
    ];
    const built = createMultiFilePlan(input);
    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }
    input.pop();
    expect(built.value.entries).toHaveLength(2);
    expect(Object.isFrozen(built.value)).toBe(true);
    expect(Object.isFrozen(built.value.entries)).toBe(true);
  });

  it("refuses duplicate prepared object references", async () => {
    const fixture = await withFixture("pc-3d-dup-p-");
    const a = await earnModify(fixture, "a.txt", "a0\n", "a1\n");
    const b = await earnModify(fixture, "b.txt", "b0\n", "b1\n");
    const built = createMultiFilePlan([
      { prepared: a.prepared, authorization: a.authorization },
      { prepared: a.prepared, authorization: b.authorization },
    ]);
    expect(built.ok).toBe(false);
    if (!built.ok) {
      expect(built.error.code).toBe("DUPLICATE_PREPARED_CHANGE");
    }
  });

  it("refuses duplicate authorization references", async () => {
    const fixture = await withFixture("pc-3d-dup-a-");
    const a = await earnModify(fixture, "a.txt", "a0\n", "a1\n");
    const b = await earnModify(fixture, "b.txt", "b0\n", "b1\n");
    const built = createMultiFilePlan([
      { prepared: a.prepared, authorization: a.authorization },
      { prepared: b.prepared, authorization: a.authorization },
    ]);
    expect(built.ok).toBe(false);
    if (!built.ok) {
      expect(built.error.code).toBe("DUPLICATE_AUTHORIZATION");
    }
  });

  it("refuses cross-workspace plans", async () => {
    const fixtureA = await withFixture("pc-3d-ws-a-");
    const fixtureB = await withFixture("pc-3d-ws-b-");
    const a = await earnModify(fixtureA, "a.txt", "a0\n", "a1\n");
    const b = await earnModify(fixtureB, "b.txt", "b0\n", "b1\n");
    const built = createMultiFilePlan([
      { prepared: a.prepared, authorization: a.authorization },
      { prepared: b.prepared, authorization: b.authorization },
    ]);
    expect(built.ok).toBe(false);
    if (!built.ok) {
      expect(built.error.code).toBe("PLAN_WORKSPACE_MISMATCH");
    }
  });

  it("refuses a target exceeding MAX_EDIT_FILE_BYTES", async () => {
    const fixture = await withFixture("pc-3d-bytes-");
    const a = await earnModify(fixture, "a.txt", "a0\n", "a1\n");
    const b = await earnModify(fixture, "b.txt", "b0\n", "b1\n");
    const oversized = {
      ...a.prepared,
      afterByteLength: MAX_EDIT_FILE_BYTES + 1,
    } as PreparedMutation;
    const built = createMultiFilePlan([
      { prepared: oversized, authorization: a.authorization },
      { prepared: b.prepared, authorization: b.authorization },
    ]);
    expect(built.ok).toBe(false);
    if (!built.ok) {
      expect(built.error.code).toBe("PLAN_TARGET_BYTES_EXCEEDED");
    }
  });

  it("refuses total proposed bytes above the plan ceiling", async () => {
    const fixture = await withFixture("pc-3d-total-");
    const entries: MultiFilePlanEntry[] = [];
    for (let i = 0; i < 9; i += 1) {
      const earned = await earnModify(fixture, `t${i}.txt`, `b${i}\n`, `a${i}\n`);
      entries.push({
        prepared: {
          ...earned.prepared,
          afterByteLength: MAX_EDIT_FILE_BYTES,
        } as PreparedMutation,
        authorization: earned.authorization,
      });
    }
    const built = createMultiFilePlan(entries);
    expect(built.ok).toBe(false);
    if (!built.ok) {
      expect(built.error.code).toBe("PLAN_TOTAL_PROPOSED_BYTES_EXCEEDED");
    }
  });
});

describe("executeMultiFilePlan — success and order", () => {
  it("applies a mixed modify+create plan in input order", async () => {
    const fixture = await withFixture("pc-3d-mixed-");
    const mod = await earnModify(fixture, "src/existing.txt", "old\n", "new\n");
    const cre = await earnCreate(fixture, "src", "fresh.txt", "created\n");
    const built = createMultiFilePlan([
      { prepared: mod.prepared, authorization: mod.authorization },
      { prepared: cre.prepared, authorization: cre.authorization },
    ]);
    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }

    const result = await executeMultiFilePlan(built.value);
    expect(result.planStatus).toBe("ALL_APPLIED");
    expect(result.targetOutcomes).toHaveLength(2);
    expect(result.targetOutcomes[0]?.kind).toBe("APPLIED");
    expect(result.targetOutcomes[1]?.kind).toBe("APPLIED");
    expect(result.knowledgeInvalidations).toHaveLength(2);

    expect(await readFile(join(fixture.root, "src/existing.txt"), "utf8")).toBe("new\n");
    expect(await readFile(join(fixture.root, "src/fresh.txt"), "utf8")).toBe("created\n");
  });

  it("preserves explicit input order (no lexical sort)", async () => {
    const fixture = await withFixture("pc-3d-order-");
    const z = await earnModify(fixture, "z.txt", "z0\n", "z1\n");
    const a = await earnModify(fixture, "a.txt", "a0\n", "a1\n");
    const built = createMultiFilePlan([
      { prepared: z.prepared, authorization: z.authorization },
      { prepared: a.prepared, authorization: a.authorization },
    ]);
    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }

    const order: string[] = [];
    const result = await executeMultiFilePlanWithDependencies(built.value, {
      targetOps: {
        replaceExistingFile: async (authorization, prepared, options) => {
          order.push(prepared.target.relativePath);
          const { replaceExistingFile } = await import(
            "../../src/editing/replace-existing-file.js"
          );
          return replaceExistingFile(authorization, prepared, options);
        },
        createFile: async (authorization, prepared, options) => {
          order.push(prepared.targetRelativePath);
          const { createFile } = await import("../../src/editing/create-file.js");
          return createFile(authorization, prepared, options);
        },
      },
    });
    expect(result.planStatus).toBe("ALL_APPLIED");
    expect(order).toEqual(["z.txt", "a.txt"]);
  });
});

describe("executeMultiFilePlan — preflight", () => {
  it("refuses colliding modify of the same target", async () => {
    const fixture = await withFixture("pc-3d-coll-mod-");
    const first = await earnModify(fixture, "same.txt", "s0\n", "s1\n");
    const second = await earnModify(fixture, "other.txt", "o0\n", "o1\n");
    // Same canonical identity, distinct lexical relativePath — proves canonical
    // (not lexical-only) collision detection (D-F4 load-bearing).
    const collidingPrepared = {
      ...second.prepared,
      target: {
        ...first.prepared.target,
        relativePath: "alias-lexical-name.txt",
      },
    } as PreparedMutation;
    const built = createMultiFilePlan([
      { prepared: first.prepared, authorization: first.authorization },
      { prepared: collidingPrepared, authorization: second.authorization },
    ]);
    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }
    const result = await executeMultiFilePlan(built.value);
    expect(result.planStatus).toBe("REFUSED_AT_PREFLIGHT");
    expect(result.knowledgeInvalidations).toHaveLength(0);
    for (const outcome of result.targetOutcomes) {
      expect(outcome.kind).toBe("PREFLIGHT_FAILED");
      if (outcome.kind === "PREFLIGHT_FAILED") {
        expect(outcome.reasons).toContain("TARGET_COLLISION");
      }
    }
  });

  it("reports every preflight failure and marks ready peers", async () => {
    const fixture = await withFixture("pc-3d-allfail2-");
    const good = await earnModify(fixture, "good.txt", "g0\n", "g1\n");
    const badPrep = await earnModify(fixture, "will-deny.txt", "w0\n", "w1\n");
    await writeDenyConfig(fixture.root, ["will-deny.txt"]);
    const built = createMultiFilePlan([
      { prepared: good.prepared, authorization: good.authorization },
      { prepared: badPrep.prepared, authorization: badPrep.authorization },
    ]);
    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }
    const result = await executeMultiFilePlan(built.value);
    expect(result.planStatus).toBe("REFUSED_AT_PREFLIGHT");
    expect(result.targetOutcomes[0]?.kind).toBe(
      "PREFLIGHT_READY_BUT_PLAN_REFUSED",
    );
    expect(result.targetOutcomes[1]?.kind).toBe("PREFLIGHT_FAILED");
    if (result.targetOutcomes[1]?.kind === "PREFLIGHT_FAILED") {
      expect(result.targetOutcomes[1].reasons).toContain("TARGET_DENIED");
    }
    expect(await readFile(join(fixture.root, "good.txt"), "utf8")).toBe("g0\n");
  });

  it("refuses create+create same parent/leaf", async () => {
    const fixture = await withFixture("pc-3d-coll-cre-");
    const first = await earnCreate(fixture, "src", "dup.txt", "one\n");
    const second = await earnCreate(fixture, "src", "other.txt", "two\n");
    const colliding = {
      ...second.prepared,
      leafName: first.prepared.leafName,
      targetRelativePath: first.prepared.targetRelativePath,
      precondition: first.prepared.precondition,
    } as PreparedCreation;
    const built = createMultiFilePlan([
      { prepared: first.prepared, authorization: first.authorization },
      { prepared: colliding, authorization: second.authorization },
    ]);
    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }
    const result = await executeMultiFilePlan(built.value);
    expect(result.planStatus).toBe("REFUSED_AT_PREFLIGHT");
    for (const outcome of result.targetOutcomes) {
      expect(outcome.kind).toBe("PREFLIGHT_FAILED");
      if (outcome.kind === "PREFLIGHT_FAILED") {
        expect(outcome.reasons).toContain("TARGET_COLLISION");
      }
    }
  });

  it("refuses modify+create of the same publication path", async () => {
    const fixture = await withFixture("pc-3d-cross-");
    const mod = await earnModify(fixture, "src/target.txt", "t0\n", "t1\n");
    const cre = await earnCreate(fixture, "src", "other.txt", "c\n");
    const collidingCreate = {
      ...cre.prepared,
      leafName: "target.txt",
      targetRelativePath: "src/target.txt",
      precondition: {
        ...cre.prepared.precondition,
        leafName: "target.txt",
        targetRelativePath: "src/target.txt",
      },
    } as PreparedCreation;
    const built = createMultiFilePlan([
      { prepared: mod.prepared, authorization: mod.authorization },
      { prepared: collidingCreate, authorization: cre.authorization },
    ]);
    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }
    const result = await executeMultiFilePlan(built.value);
    expect(result.planStatus).toBe("REFUSED_AT_PREFLIGHT");
    for (const outcome of result.targetOutcomes) {
      expect(outcome.kind).toBe("PREFLIGHT_FAILED");
      if (outcome.kind === "PREFLIGHT_FAILED") {
        expect(outcome.reasons).toContain("TARGET_COLLISION");
      }
    }
  });

  it("does not false-collide distinct similar paths", async () => {
    const fixture = await withFixture("pc-3d-nocoll-");
    const a = await earnModify(fixture, "src/file.txt", "a0\n", "a1\n");
    const b = await earnModify(fixture, "src/file2.txt", "b0\n", "b1\n");
    const built = createMultiFilePlan([
      { prepared: a.prepared, authorization: a.authorization },
      { prepared: b.prepared, authorization: b.authorization },
    ]);
    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }
    const result = await executeMultiFilePlan(built.value);
    expect(result.planStatus).toBe("ALL_APPLIED");
  });

  it("marks every target CONFIG_RELOAD_FAILED when PATHCODE.md is malformed", async () => {
    const fixture = await withFixture("pc-3d-cfgfail-");
    const a = await earnModify(fixture, "a.txt", "a0\n", "a1\n");
    const b = await earnModify(fixture, "b.txt", "b0\n", "b1\n");
    await writeFile(
      join(fixture.root, "PATHCODE.md"),
      "# Broken\n\n```pathcode-config\ndeny-path = unterminated\n",
      "utf8",
    );
    const built = createMultiFilePlan([
      { prepared: a.prepared, authorization: a.authorization },
      { prepared: b.prepared, authorization: b.authorization },
    ]);
    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }
    const result = await executeMultiFilePlan(built.value);
    expect(result.planStatus).toBe("REFUSED_AT_PREFLIGHT");
    for (const outcome of result.targetOutcomes) {
      expect(outcome.kind).toBe("PREFLIGHT_FAILED");
      if (outcome.kind === "PREFLIGHT_FAILED") {
        expect(outcome.reasons).toEqual(["CONFIG_RELOAD_FAILED"]);
      }
    }
  });
});

describe("executeMultiFilePlan — stop and partial commit", () => {
  it("stops before any commit when the first target refuses", async () => {
    const fixture = await withFixture("pc-3d-stop0-");
    const a = await earnModify(fixture, "a.txt", "a0\n", "a1\n");
    const b = await earnModify(fixture, "b.txt", "b0\n", "b1\n");
    await writeFile(join(fixture.root, "a.txt"), "changed-underfoot\n", "utf8");
    const built = createMultiFilePlan([
      { prepared: a.prepared, authorization: a.authorization },
      { prepared: b.prepared, authorization: b.authorization },
    ]);
    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }
    const result = await executeMultiFilePlan(built.value);
    if (result.planStatus === "REFUSED_AT_PREFLIGHT") {
      expect(result.targetOutcomes[0]?.kind).toBe("PREFLIGHT_FAILED");
      return;
    }
    expect(result.planStatus).toBe("STOPPED_BEFORE_ANY_COMMIT");
    expect(result.targetOutcomes[0]?.kind).toMatch(
      /REFUSED_PRECOMMIT|FAILED_PRECOMMIT/,
    );
    expect(result.targetOutcomes[1]?.kind).toBe("NOT_ATTEMPTED");
    expect(await readFile(join(fixture.root, "b.txt"), "utf8")).toBe("b0\n");
  });

  it("marks later targets NOT_ATTEMPTED after first non-success", async () => {
    const fixture = await withFixture("pc-3d-stop1-");
    const a = await earnModify(fixture, "a.txt", "a0\n", "a1\n");
    const b = await earnModify(fixture, "b.txt", "b0\n", "b1\n");
    const c = await earnModify(fixture, "c.txt", "c0\n", "c1\n");
    const built = createMultiFilePlan([
      { prepared: a.prepared, authorization: a.authorization },
      { prepared: b.prepared, authorization: b.authorization },
      { prepared: c.prepared, authorization: c.authorization },
    ]);
    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }

    let call = 0;
    const result = await executeMultiFilePlanWithDependencies(built.value, {
      targetOps: {
        replaceExistingFile: async (authorization, prepared, options) => {
          call += 1;
          if (call === 2) {
            await writeFile(join(fixture.root, "b.txt"), "stale\n", "utf8");
          }
          const { replaceExistingFile } = await import(
            "../../src/editing/replace-existing-file.js"
          );
          return replaceExistingFile(authorization, prepared, options);
        },
        createFile: async () => {
          throw new Error("create should not run");
        },
      },
    });
    expect(result.planStatus).toBe("PARTIALLY_COMMITTED");
    expect(result.targetOutcomes[0]?.kind).toBe("APPLIED");
    expect(result.targetOutcomes[1]?.kind).toMatch(
      /REFUSED_PRECOMMIT|FAILED_PRECOMMIT/,
    );
    expect(result.targetOutcomes[2]?.kind).toBe("NOT_ATTEMPTED");
    expect(result.knowledgeInvalidations.length).toBeGreaterThanOrEqual(1);
    expect(await readFile(join(fixture.root, "a.txt"), "utf8")).toBe("a1\n");
    expect(await readFile(join(fixture.root, "c.txt"), "utf8")).toBe("c0\n");
  });

  it("treats COMMITTED_FAILURE as committed and stops", async () => {
    const fixture = await withFixture("pc-3d-cfail-");
    const a = await earnModify(fixture, "a.txt", "a0\n", "a1\n");
    const b = await earnModify(fixture, "b.txt", "b0\n", "b1\n");
    const built = createMultiFilePlan([
      { prepared: a.prepared, authorization: a.authorization },
      { prepared: b.prepared, authorization: b.authorization },
    ]);
    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }

    const committedFailure = {
      outcome: "COMMITTED_FAILURE",
      commitPointReached: true,
      durabilityVerified: false,
      editRecord: {
        kind: "EXISTING_FILE",
        targetRelativePath: "a.txt",
      },
      knowledgeInvalidation: {
        kind: "KNOWLEDGE_INVALIDATION",
        editRecordKind: "EXISTING_FILE",
        targetRelativePath: "a.txt",
      },
      configFreshness: "MUTATION_TIME_RE_RESOLVED",
    } as unknown as ReplaceExistingFileResult;

    const result = await executeMultiFilePlanWithDependencies(built.value, {
      targetOps: {
        replaceExistingFile: async (_auth, prepared) => {
          if (prepared.target.relativePath === "a.txt") {
            return committedFailure;
          }
          throw new Error("second target must not run");
        },
        createFile: async () => {
          throw new Error("create should not run");
        },
      },
    });
    expect(result.planStatus).toBe("PARTIALLY_COMMITTED");
    expect(result.targetOutcomes[0]?.kind).toBe("COMMITTED_FAILURE");
    expect(result.targetOutcomes[1]?.kind).toBe("NOT_ATTEMPTED");
    expect(result.knowledgeInvalidations).toHaveLength(1);
  });

  it("NOT_ATTEMPTED carries no unchanged claim fields", async () => {
    const fixture = await withFixture("pc-3d-na-");
    const a = await earnModify(fixture, "a.txt", "a0\n", "a1\n");
    const b = await earnModify(fixture, "b.txt", "b0\n", "b1\n");
    const built = createMultiFilePlan([
      { prepared: a.prepared, authorization: a.authorization },
      { prepared: b.prepared, authorization: b.authorization },
    ]);
    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }
    const refusal = {
      outcome: "REFUSED_PRECOMMIT",
      commitPointReached: false,
      durabilityVerified: false,
      editRecord: { kind: "EXISTING_FILE", targetRelativePath: "a.txt" },
      knowledgeInvalidation: null,
      configFreshness: "SUPPLIED_ONLY",
      refusalReason: "TARGET_STALE",
    } as unknown as ReplaceExistingFileResult;

    const result = await executeMultiFilePlanWithDependencies(built.value, {
      targetOps: {
        replaceExistingFile: async () => refusal,
        createFile: async () => {
          throw new Error("unused");
        },
      },
    });
    expect(result.planStatus).toBe("STOPPED_BEFORE_ANY_COMMIT");
    const later = result.targetOutcomes[1];
    expect(later).toEqual({ kind: "NOT_ATTEMPTED" });
    expect(later).not.toHaveProperty("unchanged");
    expect(later).not.toHaveProperty("nestedResult");
  });
});

describe("executeMultiFilePlan — mid-plan config", () => {
  it("reloads config per target: restrictive PATHCODE.md stops later targets", async () => {
    const root = await createCanonicalTempRoot("pc-3d-mid-deny-");
    const beforeCfg =
      "# Config\n\n```pathcode-config\n```\n";
    const afterCfg =
      "# Config\n\n```pathcode-config\ndeny-path = b.txt\n```\n";
    await writeFile(join(root, "PATHCODE.md"), beforeCfg, "utf8");
    const fixture = await openFixture(root);
    const cfg = await earnModify(fixture, "PATHCODE.md", beforeCfg, afterCfg);
    const b = await earnModify(fixture, "b.txt", "b0\n", "b1\n");
    const c = await earnModify(fixture, "c.txt", "c0\n", "c1\n");
    const built = createMultiFilePlan([
      { prepared: cfg.prepared, authorization: cfg.authorization },
      { prepared: b.prepared, authorization: b.authorization },
      { prepared: c.prepared, authorization: c.authorization },
    ]);
    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }
    const result = await executeMultiFilePlan(built.value);
    expect(result.planStatus).toBe("PARTIALLY_COMMITTED");
    expect(result.targetOutcomes[0]?.kind).toBe("APPLIED");
    expect(result.targetOutcomes[1]?.kind).toBe("REFUSED_PRECOMMIT");
    expect(result.targetOutcomes[2]?.kind).toBe("NOT_ATTEMPTED");
    if (result.targetOutcomes[1]?.kind === "REFUSED_PRECOMMIT") {
      const nested = result.targetOutcomes[1].nestedResult;
      expect(nested.outcome).toBe("REFUSED_PRECOMMIT");
      if (nested.outcome === "REFUSED_PRECOMMIT") {
        expect(nested.refusalReason).toBe("TARGET_DENIED");
      }
    }
  });

  it("reloads config per target: malformed PATHCODE.md stops later targets", async () => {
    const root = await createCanonicalTempRoot("pc-3d-mid-bad-");
    const beforeCfg =
      "# Config\n\n```pathcode-config\n```\n";
    const afterCfg =
      "# Broken\n\n```pathcode-config\ndeny-path = unterminated\n";
    await writeFile(join(root, "PATHCODE.md"), beforeCfg, "utf8");
    const fixture = await openFixture(root);
    const cfg = await earnModify(fixture, "PATHCODE.md", beforeCfg, afterCfg);
    const b = await earnModify(fixture, "b.txt", "b0\n", "b1\n");
    const built = createMultiFilePlan([
      { prepared: cfg.prepared, authorization: cfg.authorization },
      { prepared: b.prepared, authorization: b.authorization },
    ]);
    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }
    const result = await executeMultiFilePlan(built.value);
    expect(result.planStatus).toBe("PARTIALLY_COMMITTED");
    expect(result.targetOutcomes[0]?.kind).toBe("APPLIED");
    expect(result.targetOutcomes[1]?.kind).toBe("REFUSED_PRECOMMIT");
    if (result.targetOutcomes[1]?.kind === "REFUSED_PRECOMMIT") {
      const nested = result.targetOutcomes[1].nestedResult;
      if (nested.outcome === "REFUSED_PRECOMMIT") {
        expect(nested.refusalReason).toBe("CONFIG_RELOAD_FAILED");
      }
    }
  });

  it("succeeds under successful ABSENT config", async () => {
    const fixture = await withFixture("pc-3d-absent-");
    const a = await earnModify(fixture, "a.txt", "a0\n", "a1\n");
    const b = await earnModify(fixture, "b.txt", "b0\n", "b1\n");
    const built = createMultiFilePlan([
      { prepared: a.prepared, authorization: a.authorization },
      { prepared: b.prepared, authorization: b.authorization },
    ]);
    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }
    const result = await executeMultiFilePlan(built.value);
    expect(result.planStatus).toBe("ALL_APPLIED");
  });
});

describe("executeMultiFilePlan — knowledge and nesting", () => {
  it("aggregates invalidations only from APPLIED and COMMITTED_FAILURE", async () => {
    const fixture = await withFixture("pc-3d-inv-");
    const a = await earnModify(fixture, "a.txt", "a0\n", "a1\n");
    const b = await earnModify(fixture, "b.txt", "b0\n", "b1\n");
    const built = createMultiFilePlan([
      { prepared: a.prepared, authorization: a.authorization },
      { prepared: b.prepared, authorization: b.authorization },
    ]);
    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }
    const result = await executeMultiFilePlan(built.value);
    expect(result.knowledgeInvalidations).toHaveLength(2);
    expect(
      result.knowledgeInvalidations.every((k) => k.kind === "KNOWLEDGE_INVALIDATION"),
    ).toBe(true);
  });

  it("preserves exact nested 3B result identity on APPLIED", async () => {
    const fixture = await withFixture("pc-3d-nest-");
    const a = await earnModify(fixture, "a.txt", "a0\n", "a1\n");
    const b = await earnModify(fixture, "b.txt", "b0\n", "b1\n");
    const built = createMultiFilePlan([
      { prepared: a.prepared, authorization: a.authorization },
      { prepared: b.prepared, authorization: b.authorization },
    ]);
    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }
    let captured: ReplaceExistingFileResult | undefined;
    const result = await executeMultiFilePlanWithDependencies(built.value, {
      targetOps: {
        replaceExistingFile: async (authorization, prepared, options) => {
          const { replaceExistingFile } = await import(
            "../../src/editing/replace-existing-file.js"
          );
          const nested = await replaceExistingFile(
            authorization,
            prepared,
            options,
          );
          if (prepared.target.relativePath === "a.txt") {
            captured = nested;
          }
          return nested;
        },
        createFile: async () => {
          throw new Error("unused");
        },
      },
    });
    expect(result.targetOutcomes[0]?.kind).toBe("APPLIED");
    if (result.targetOutcomes[0]?.kind === "APPLIED") {
      expect(result.targetOutcomes[0].nestedResult).toBe(captured);
    }
  });
});

describe("executeMultiFilePlan — canonical alias collision", () => {
  it("detects symlink parent alias collision for creates when provable", async () => {
    const root = await createCanonicalTempRoot("pc-3d-alias-");
    await mkdir(join(root, "real-parent"), { recursive: true });
    await symlink(join(root, "real-parent"), join(root, "alias-parent"));
    const fixture = await openFixture(root);
    let first;
    let second;
    try {
      first = await earnCreate(fixture, "real-parent", "leaf.txt", "one\n");
      second = await earnCreate(fixture, "alias-parent", "leaf.txt", "two\n");
    } catch {
      return;
    }
    const built = createMultiFilePlan([
      { prepared: first.prepared, authorization: first.authorization },
      { prepared: second.prepared, authorization: second.authorization },
    ]);
    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }
    if (
      first.prepared.parent.canonicalPath ===
      second.prepared.parent.canonicalPath
    ) {
      const result = await executeMultiFilePlan(built.value);
      expect(result.planStatus).toBe("REFUSED_AT_PREFLIGHT");
      for (const outcome of result.targetOutcomes) {
        expect(outcome.kind).toBe("PREFLIGHT_FAILED");
        if (outcome.kind === "PREFLIGHT_FAILED") {
          expect(outcome.reasons).toContain("TARGET_COLLISION");
        }
      }
    }
  });
});

describe("executeMultiFilePlan — action disable preflight", () => {
  it("reports ACTION_DISABLED for all modification targets under disable-action=EDIT", async () => {
    const fixture = await withFixture("pc-3d-dis-");
    const a = await earnModify(fixture, "a.txt", "a0\n", "a1\n");
    const b = await earnModify(fixture, "b.txt", "b0\n", "b1\n");
    await writePathcodeConfig(fixture.root, "disable-action = EDIT");
    const built = createMultiFilePlan([
      { prepared: a.prepared, authorization: a.authorization },
      { prepared: b.prepared, authorization: b.authorization },
    ]);
    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }
    const result = await executeMultiFilePlan(built.value);
    expect(result.planStatus).toBe("REFUSED_AT_PREFLIGHT");
    for (const outcome of result.targetOutcomes) {
      expect(outcome.kind).toBe("PREFLIGHT_FAILED");
      if (outcome.kind === "PREFLIGHT_FAILED") {
        expect(outcome.reasons).toContain("ACTION_DISABLED");
      }
    }
  });
});
