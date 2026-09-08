/**
 * Phase 5G-R1 — approved-scope catalog membership (H1 / CLASS III fix).
 *
 * Proves earnApprovedScopeContext builds a Gate 1 catalog whose membership is
 * exactly the approved set — not ambient inventory, siblings, descendants, or
 * dependency trees — and that read-context stays read-only.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  CHECKOUT_ROOT,
  SEED_SOURCE,
  cleanupTrackedRoots,
  importHost,
  loadOwners,
  provisionProject,
} from "./helpers.js";

afterAll(() => {
  cleanupTrackedRoots();
});

const LIVE_EDITABLE = "src/lib/utils.ts";
const LIVE_CONTEXT = ["tsconfig.json", "package.json"] as const;
const LIVE_APPROVED = [LIVE_EDITABLE, ...LIVE_CONTEXT] as const;

function findFileEntry(inventory: any, relativePath: string): any {
  const found = inventory.observations.find(
    (item: any) =>
      item.disposition === "ADMITTED" &&
      item.relativePath === relativePath &&
      "entry" in item,
  );
  if (found === undefined) {
    throw new Error(`missing ADMITTED inventory entry for ${relativePath}`);
  }
  return found.entry;
}

function nordicExtraFiles(overrides?: Record<string, string>): Record<string, string> {
  return {
    [LIVE_EDITABLE]: SEED_SOURCE,
    "src/lib/cn.ts": "export const cn = () => '';\n",
    "src/lib/data/x.ts": "export const x = 1;\n",
    "README.md": "# fixture\n",
    "node_modules/foo/package.json": JSON.stringify({ name: "foo" }),
    ...overrides,
  };
}

async function preflightNordic(extraFiles?: Record<string, string>) {
  const fixture = provisionProject({
    // Default seed is src/answer.ts; live shape uses nested utils + root configs.
    extraFiles: nordicExtraFiles(extraFiles),
  });
  const owners = await loadOwners();
  const { runGeneralSessionPreflight } = await importHost("preflight.mjs");
  const preflight = await runGeneralSessionPreflight(owners, {
    projectRoot: fixture.projectRoot,
    checkoutRoot: CHECKOUT_ROOT,
    env: fixture.env,
  });
  expect(preflight.ok, JSON.stringify(preflight)).toBe(true);
  return { fixture, owners, preflight };
}

async function admitLiveThree(owners: any, preflight: any) {
  const parsed = owners.parseEngineeringScopePlan(
    JSON.stringify({
      schemaVersion: 1,
      taskSummary: "Touch utils under Nordic-shaped scope.",
      editableTargets: [
        {
          relativePath: LIVE_EDITABLE,
          changeKind: "REPLACE_TEXT",
          reason: "primary edit target",
        },
      ],
      contextPaths: [...LIVE_CONTEXT],
      validationCandidateIds: [],
      assumptions: [],
      limitations: [],
    }),
  );
  expect(parsed.ok, JSON.stringify(parsed)).toBe(true);
  const admitted = owners.admitScopePlan(parsed.value, {
    inventory: preflight.inventory,
    admittedValidationCandidateIds: [],
    policy: { forbiddenRelativePrefixes: preflight.forbiddenRelativePrefixes },
  });
  expect(admitted.ok, JSON.stringify(admitted)).toBe(true);
  return admitted.value;
}

describe("H1-A/B/R1-A: live Nordic shape catalogs exactly three approved paths", () => {
  it("H1-A/B/R1-A: catalog + disclosedObservations are exactly the approved trio", async () => {
    const { owners, preflight } = await preflightNordic();
    const { earnApprovedScopeContext } = await importHost("general-session.mjs");
    const approved = await admitLiveThree(owners, preflight);

    const context = await earnApprovedScopeContext(owners, {
      workspace: preflight.workspace,
      config: preflight.config,
      inventory: preflight.inventory,
      approved,
    });
    expect(context.ok, JSON.stringify(context)).toBe(true);

    const described = owners.describeReferenceCatalog(context.catalog);
    expect(described.ok, JSON.stringify(described)).toBe(true);
    const relativePaths = described.value.map((d: any) => d.relativePath);
    const uniquePaths = [...new Set(relativePaths)];
    expect(uniquePaths.sort()).toEqual([...LIVE_APPROVED].sort());
    expect(uniquePaths).toHaveLength(3);

    const kindsByPath = new Map<string, Set<string>>();
    for (const d of described.value) {
      const set = kindsByPath.get(d.relativePath) ?? new Set();
      set.add(d.evidenceKind);
      kindsByPath.set(d.relativePath, set);
    }
    for (const path of LIVE_APPROVED) {
      const kinds = kindsByPath.get(path);
      expect(kinds, path).toBeDefined();
      expect(kinds!.has("ENTRY")).toBe(true);
      expect(kinds!.has("CONTENT")).toBe(true);
    }

    const disclosedPaths = context.disclosedObservations.map(
      (o: any) => o.entry.relativePath,
    );
    expect([...new Set(disclosedPaths)].sort()).toEqual([...LIVE_APPROVED].sort());

    owners.disposeReferenceCatalog(context.catalog);
  });
});

describe("H1-C/R1-B: siblings, descendants, unrelated, and node_modules stay out", () => {
  it("H1-C/R1-B: approving the live three never catalogs ambient neighbors", async () => {
    const { owners, preflight } = await preflightNordic();
    const { earnApprovedScopeContext } = await importHost("general-session.mjs");
    const approved = await admitLiveThree(owners, preflight);

    const context = await earnApprovedScopeContext(owners, {
      workspace: preflight.workspace,
      config: preflight.config,
      inventory: preflight.inventory,
      approved,
    });
    expect(context.ok, JSON.stringify(context)).toBe(true);

    const described = owners.describeReferenceCatalog(context.catalog);
    expect(described.ok).toBe(true);
    const relativePaths = described.value.map((d: any) => d.relativePath);
    const disclosed = context.disclosedObservations.map(
      (o: any) => o.entry.relativePath,
    );
    const forbidden = [
      "src/lib/cn.ts",
      "src/lib/data/x.ts",
      "README.md",
      "node_modules/foo/package.json",
      "src/answer.ts",
    ];
    for (const path of forbidden) {
      expect(relativePaths, path).not.toContain(path);
      expect(disclosed, path).not.toContain(path);
    }

    owners.disposeReferenceCatalog(context.catalog);
  });
});

describe("H1-D: read-context stays read-only in permittedTargets", () => {
  it("H1-D: context paths are not REPLACE/CREATE edit targets", async () => {
    const { owners, preflight } = await preflightNordic();
    const { earnApprovedScopeContext } = await importHost("general-session.mjs");
    const approved = await admitLiveThree(owners, preflight);

    const context = await earnApprovedScopeContext(owners, {
      workspace: preflight.workspace,
      config: preflight.config,
      inventory: preflight.inventory,
      approved,
    });
    expect(context.ok, JSON.stringify(context)).toBe(true);

    const editPaths = context.permittedTargets.map((t: any) => {
      if (t.kind === "REPLACE_TEXT") return t.contentObservation.entry.relativePath;
      return `${t.parentDirectory.relativePath}/${t.leafName}`;
    });
    expect(editPaths).toEqual([LIVE_EDITABLE]);
    for (const path of LIVE_CONTEXT) {
      expect(editPaths).not.toContain(path);
    }

    owners.disposeReferenceCatalog(context.catalog);
  });
});

describe("H1-E/R1-C: oversized approved scope hits reference budget", () => {
  it("H1-E/R1-C: synthetic approved context >64 files exceeds MAX_CATALOG_RECORDS", async () => {
    const extraFiles: Record<string, string> = {};
    for (let i = 0; i < 70; i += 1) {
      extraFiles[`ctx/file-${String(i).padStart(3, "0")}.ts`] = `export const n${i} = ${i};\n`;
    }
    const fixture = provisionProject({ extraFiles });
    const owners = await loadOwners();
    const { runGeneralSessionPreflight } = await importHost("preflight.mjs");
    const { earnApprovedScopeContext } = await importHost("general-session.mjs");
    const preflight = await runGeneralSessionPreflight(owners, {
      projectRoot: fixture.projectRoot,
      checkoutRoot: CHECKOUT_ROOT,
      env: fixture.env,
    });
    expect(preflight.ok, JSON.stringify(preflight)).toBe(true);

    const editableEntry = findFileEntry(preflight.inventory, "src/answer.ts");
    const contextPaths = Object.keys(extraFiles).map((relativePath) => ({
      relativePath,
      entry: findFileEntry(preflight.inventory, relativePath),
    }));
    expect(contextPaths.length).toBeGreaterThan(64);

    const syntheticApproved = {
      editableTargets: [
        {
          changeKind: "REPLACE_TEXT" as const,
          relativePath: "src/answer.ts",
          reason: "budget probe",
          entry: editableEntry,
        },
      ],
      contextPaths,
      validationCandidateIds: [],
    };

    const selectionTotal =
      1 /* editable entry */ +
      contextPaths.length /* context entries (unique) */ +
      (1 + contextPaths.length); /* content observations */
    // entries ≈ 71, content ≈ 71 → total ≈ 142 > 128
    expect(selectionTotal).toBeGreaterThan(owners.MAX_CATALOG_RECORDS);

    const context = await earnApprovedScopeContext(owners, {
      workspace: preflight.workspace,
      config: preflight.config,
      inventory: preflight.inventory,
      approved: syntheticApproved,
    });
    expect(context.ok).toBe(false);
    expect(context.code).toBe("APPROVED_SCOPE_EXCEEDS_REFERENCE_BUDGET");
  });
});

describe("H1-F: sensitive paths still refused at admission", () => {
  it("H1-F: .env and node_modules paths are sensitive / not admitted", async () => {
    const fixture = provisionProject({
      extraFiles: {
        ".env": "SECRET=1\n",
        "node_modules/foo/package.json": JSON.stringify({ name: "foo" }),
      },
    });
    const owners = await loadOwners();
    const { runGeneralSessionPreflight } = await importHost("preflight.mjs");
    const preflight = await runGeneralSessionPreflight(owners, {
      projectRoot: fixture.projectRoot,
      checkoutRoot: CHECKOUT_ROOT,
      env: fixture.env,
    });
    expect(preflight.ok).toBe(true);

    const envVerdict = owners.classifyScopePathSensitivity(".env", {
      forbiddenRelativePrefixes: preflight.forbiddenRelativePrefixes,
    });
    expect(envVerdict.sensitive).toBe(true);

    const nmVerdict = owners.classifyScopePathSensitivity(
      "node_modules/foo/package.json",
      { forbiddenRelativePrefixes: preflight.forbiddenRelativePrefixes },
    );
    expect(nmVerdict.sensitive).toBe(true);

    for (const relativePath of [".env", "node_modules/foo/package.json"]) {
      const parsed = owners.parseEngineeringScopePlan(
        JSON.stringify({
          schemaVersion: 1,
          taskSummary: "sensitive probe",
          editableTargets: [
            {
              relativePath,
              changeKind: "REPLACE_TEXT",
              reason: "should refuse",
            },
          ],
          contextPaths: [],
          validationCandidateIds: [],
          assumptions: [],
          limitations: [],
        }),
      );
      expect(parsed.ok).toBe(true);
      const admitted = owners.admitScopePlan(parsed.value, {
        inventory: preflight.inventory,
        admittedValidationCandidateIds: [],
        policy: { forbiddenRelativePrefixes: preflight.forbiddenRelativePrefixes },
      });
      expect(admitted.ok).toBe(false);
      expect(admitted.error.code).toBe("SCOPE_PATH_SENSITIVE");
    }
  });
});

describe("H1-G: Gate 1 still receives ENTRY+CONTENT for approved files", () => {
  it("H1-G: createReferenceCatalog selection carries both evidence kinds", async () => {
    const { owners, preflight } = await preflightNordic();
    const { earnApprovedScopeContext } = await importHost("general-session.mjs");
    const approved = await admitLiveThree(owners, preflight);

    const context = await earnApprovedScopeContext(owners, {
      workspace: preflight.workspace,
      config: preflight.config,
      inventory: preflight.inventory,
      approved,
    });
    expect(context.ok, JSON.stringify(context)).toBe(true);

    const described = owners.describeReferenceCatalog(context.catalog);
    expect(described.ok).toBe(true);
    const kinds = new Set(described.value.map((d: any) => d.evidenceKind));
    expect(kinds.has("ENTRY")).toBe(true);
    expect(kinds.has("CONTENT")).toBe(true);
    // Every approved path contributes both kinds (3 paths × 2 = 6 descriptors).
    expect(described.value).toHaveLength(LIVE_APPROVED.length * 2);

    const host = await importHost("general-session.mjs");
    const source = readFileSync(
      join(CHECKOUT_ROOT, "scripts/pathcode-cli/general-session.mjs"),
      "utf8",
    );
    expect(source).toContain("createReferenceCatalog");
    expect(source).toContain("contentObservations: catalogContentObservations");
    expect(source).toContain("entries: catalogEntries");
    expect(typeof host.earnApprovedScopeContext).toBe("function");

    owners.disposeReferenceCatalog(context.catalog);
  });
});
