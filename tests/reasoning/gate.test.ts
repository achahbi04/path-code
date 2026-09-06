/**
 * Phase 5B reference binding gate proofs B01–B20 (runtime).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  bindReasoningProposalJson,
  resolveCatalogReference,
} from "../../src/reasoning/bind.js";
import {
  checkReferenceBoundReasoningApplicability,
} from "../../src/reasoning/applicability.js";
import {
  createReferenceCatalog,
  describeReferenceCatalog,
  disposeReferenceCatalog,
} from "../../src/reasoning/catalog.js";
import { admittedEntry } from "../snapshot/helpers.js";
import {
  cleanupReasoningFixtures,
  fixtureWithSourceAndManifest,
  handleFor,
  proposalJson,
  writeDenyConfig,
  writeRelative,
} from "./helpers.js";

afterEach(async () => {
  await cleanupReasoningFixtures();
});

describe("reference catalog", () => {
  it("B01: compatible catalog from real artifacts; clones/incompatible refused", async () => {
    const fx = await fixtureWithSourceAndManifest();
    expect(fx.descriptors.length).toBeGreaterThan(0);
    for (const d of fx.descriptors) {
      expect(d.handle).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(d).not.toHaveProperty("bytes");
      expect(JSON.stringify(d)).not.toContain(fx.root);
    }

    const cloneSelection = createReferenceCatalog({
      workspace: fx.fixture.workspace,
      snapshot: fx.fixture.snapshot,
      selection: {
        entries: [{ ...fx.sourceEntry } as typeof fx.sourceEntry],
      },
    });
    expect(cloneSelection.ok).toBe(false);

    const other = await fixtureWithSourceAndManifest();
    const mixed = createReferenceCatalog({
      workspace: fx.fixture.workspace,
      snapshot: fx.fixture.snapshot,
      selection: {
        entries: [other.sourceEntry],
        contentObservations: [fx.sourceObservation],
      },
    });
    expect(mixed.ok).toBe(false);
  });
});

describe("reference binding gate", () => {
  it("B04: invented handle, other-catalog handle, and path fallback after bad ID refuse", async () => {
    const fx = await fixtureWithSourceAndManifest();
    const other = await fixtureWithSourceAndManifest();
    const otherHandle = handleFor(
      other.descriptors,
      "CONTENT",
      "src/hello.ts",
    );

    const invented = await bindReasoningProposalJson(
      proposalJson({
        schemaVersion: 1,
        proposalId: "p",
        requestedOutcome: "x",
        claims: [
          {
            claimId: "c1",
            kind: "CONTENT",
            statement: "s",
            proposedSubject: { kind: "EVIDENCE_ID", id: "not-a-real-handle" },
            proposedCitations: [],
          },
        ],
        hypotheses: [],
      }),
      fx.catalog,
    );
    expect(invented.ok).toBe(false);
    if (!invented.ok && invented.error.kind === "REFUSAL") {
      expect(invented.error.refusal.code).toBe("UNBOUND_CLAIM");
    }

    const foreign = await bindReasoningProposalJson(
      proposalJson({
        schemaVersion: 1,
        proposalId: "p",
        requestedOutcome: "x",
        claims: [
          {
            claimId: "c1",
            kind: "CONTENT",
            statement: "s",
            proposedSubject: { kind: "EVIDENCE_ID", id: otherHandle },
            proposedCitations: [],
          },
        ],
        hypotheses: [],
      }),
      fx.catalog,
    );
    expect(foreign.ok).toBe(false);

    const badIdGoodPath = await bindReasoningProposalJson(
      proposalJson({
        schemaVersion: 1,
        proposalId: "p",
        requestedOutcome: "x",
        claims: [
          {
            claimId: "c1",
            kind: "CONTENT",
            statement: "s",
            proposedSubject: { kind: "EVIDENCE_ID", id: "missing" },
            proposedCitations: [
              {
                kind: "REPOSITORY_RELATIVE_PATH",
                relativePath: "src/hello.ts",
              },
            ],
          },
        ],
        hypotheses: [],
      }),
      fx.catalog,
    );
    expect(badIdGoodPath.ok).toBe(false);
    if (!badIdGoodPath.ok && badIdGoodPath.error.kind === "REFUSAL") {
      expect(badIdGoodPath.error.refusal.code).toBe("UNBOUND_CLAIM");
    }
  });

  it("B05: exact path hint works; absolute/traversal/unselected refuse", async () => {
    const fx = await fixtureWithSourceAndManifest();

    const ok = await bindReasoningProposalJson(
      proposalJson({
        schemaVersion: 1,
        proposalId: "p",
        requestedOutcome: "x",
        claims: [
          {
            claimId: "c1",
            kind: "EXISTS",
            statement: "exists",
            proposedSubject: {
              kind: "REPOSITORY_RELATIVE_PATH",
              relativePath: "src/hello.ts",
            },
            proposedCitations: [],
          },
        ],
        hypotheses: [],
      }),
      fx.catalog,
    );
    expect(ok.ok).toBe(true);

    for (const bad of [
      "/tmp/src/hello.ts",
      "../hello.ts",
      "src/../hello.ts",
      "src//hello.ts",
      "C:\\\\hello.ts",
      "unselected.ts",
    ]) {
      const refused = await bindReasoningProposalJson(
        proposalJson({
          schemaVersion: 1,
          proposalId: "p",
          requestedOutcome: "x",
          claims: [
            {
              claimId: "c1",
              kind: "EXISTS",
              statement: "exists",
              proposedSubject: {
                kind: "REPOSITORY_RELATIVE_PATH",
                relativePath: bad,
              },
              proposedCitations: [],
            },
          ],
          hypotheses: [],
        }),
        fx.catalog,
      );
      expect(refused.ok).toBe(false);
    }
  });

  it("B06: EXISTS/CONTENT bind to original objects; subject/citation mismatch refuses", async () => {
    const fx = await fixtureWithSourceAndManifest();
    const contentHandle = handleFor(fx.descriptors, "CONTENT", "src/hello.ts");
    const packageContent = handleFor(
      fx.descriptors,
      "CONTENT",
      "package.json",
    );

    const bound = await bindReasoningProposalJson(
      proposalJson({
        schemaVersion: 1,
        proposalId: "p",
        requestedOutcome: "x",
        claims: [
          {
            claimId: "c1",
            kind: "EXISTS",
            statement: "file exists",
            proposedSubject: {
              kind: "REPOSITORY_RELATIVE_PATH",
              relativePath: "src/hello.ts",
            },
            proposedCitations: [],
          },
          {
            claimId: "c2",
            kind: "CONTENT",
            statement: "source text",
            proposedSubject: { kind: "EVIDENCE_ID", id: contentHandle },
            proposedCitations: [],
          },
        ],
        hypotheses: [],
      }),
      fx.catalog,
    );
    expect(bound.ok).toBe(true);
    if (!bound.ok) {
      return;
    }
    const exists = bound.value.reasoning.claims[0];
    const content = bound.value.reasoning.claims[1];
    expect(exists?.kind).toBe("EXISTS");
    expect(content?.kind).toBe("CONTENT");
    if (exists?.kind === "EXISTS") {
      expect(exists.subject).toBe(fx.sourceEntry);
    }
    if (content?.kind === "CONTENT") {
      expect(content.subject).toBe(fx.sourceObservation);
    }

    const mismatch = await bindReasoningProposalJson(
      proposalJson({
        schemaVersion: 1,
        proposalId: "p",
        requestedOutcome: "x",
        claims: [
          {
            claimId: "c1",
            kind: "CONTENT",
            statement: "mismatch",
            proposedSubject: { kind: "EVIDENCE_ID", id: contentHandle },
            proposedCitations: [
              { kind: "EVIDENCE_ID", id: packageContent },
            ],
          },
        ],
        hypotheses: [],
      }),
      fx.catalog,
    );
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok && mismatch.error.kind === "REFUSAL") {
      expect(mismatch.error.refusal.code).toBe("EVIDENCE_IDENTITY_MISMATCH");
    }
  });

  it("B07: correct dependency binds; absent/wrong-manifest refuse", async () => {
    const fx = await fixtureWithSourceAndManifest();
    const manifestHandle = handleFor(
      fx.descriptors,
      "MANIFEST",
      "package.json",
    );

    const ok = await bindReasoningProposalJson(
      proposalJson({
        schemaVersion: 1,
        proposalId: "p",
        requestedOutcome: "x",
        claims: [
          {
            claimId: "c1",
            kind: "DEPENDS_DECLARED",
            statement: "depends on typescript",
            dependencyName: "typescript",
            proposedSubject: { kind: "EVIDENCE_ID", id: manifestHandle },
            proposedCitations: [],
          },
        ],
        hypotheses: [],
      }),
      fx.catalog,
    );
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      const claim = ok.value.reasoning.claims[0];
      expect(claim?.kind).toBe("DEPENDS_DECLARED");
      if (claim?.kind === "DEPENDS_DECLARED") {
        expect(claim.subject).toBe(fx.typescriptEvidence);
        expect(claim.requiredVerification.method).toBe("OBSERVATION");
      }
    }

    const absent = await bindReasoningProposalJson(
      proposalJson({
        schemaVersion: 1,
        proposalId: "p",
        requestedOutcome: "x",
        claims: [
          {
            claimId: "c1",
            kind: "DEPENDS_DECLARED",
            statement: "depends on lodash",
            dependencyName: "lodash",
            proposedSubject: { kind: "EVIDENCE_ID", id: manifestHandle },
            proposedCitations: [],
          },
        ],
        hypotheses: [],
      }),
      fx.catalog,
    );
    expect(absent.ok).toBe(false);
    if (!absent.ok && absent.error.kind === "REFUSAL") {
      expect(absent.error.refusal.code).toBe("GROUNDING_OVERCLAIM");
    }
  });

  it("B08: same-size/same-mtime changed content rejected via full-content verification", async () => {
    const fx = await fixtureWithSourceAndManifest({
      extraSource: "export function hello() { return 1; }\n",
    });
    const path = join(fx.root, "src/hello.ts");
    const original = readFileSync(path);
    // Same length replacement
    const replacement = Buffer.from("export function hello() { return 2; }\n");
    expect(replacement.byteLength).toBe(original.byteLength);
    writeFileSync(path, replacement);

    const bound = await bindReasoningProposalJson(
      proposalJson({
        schemaVersion: 1,
        proposalId: "p",
        requestedOutcome: "x",
        claims: [
          {
            claimId: "c1",
            kind: "CONTENT",
            statement: "stale",
            proposedSubject: {
              kind: "REPOSITORY_RELATIVE_PATH",
              relativePath: "src/hello.ts",
            },
            proposedCitations: [],
          },
        ],
        hypotheses: [],
      }),
      fx.catalog,
    );
    expect(bound.ok).toBe(false);
    if (!bound.ok && bound.error.kind === "REFUSAL") {
      expect(bound.error.refusal.code).toBe("STALE_EVIDENCE");
    }
  });

  it("B09: deleted/denied source cannot bind; diagnostics omit hidden path", async () => {
    const fx = await fixtureWithSourceAndManifest();
    writeFileSync(join(fx.root, "src/hello.ts"), "");
    // delete by overwriting then unlinking
    const { unlinkSync } = await import("node:fs");
    unlinkSync(join(fx.root, "src/hello.ts"));

    const deleted = await bindReasoningProposalJson(
      proposalJson({
        schemaVersion: 1,
        proposalId: "p",
        requestedOutcome: "x",
        claims: [
          {
            claimId: "c1",
            kind: "EXISTS",
            statement: "gone",
            proposedSubject: {
              kind: "REPOSITORY_RELATIVE_PATH",
              relativePath: "src/hello.ts",
            },
            proposedCitations: [],
          },
        ],
        hypotheses: [],
      }),
      fx.catalog,
    );
    expect(deleted.ok).toBe(false);
    if (!deleted.ok) {
      const text = JSON.stringify(deleted.error);
      expect(text).not.toContain(fx.root);
      expect(text).not.toMatch(/\/Users\//);
    }

    const deniedFx = await fixtureWithSourceAndManifest();
    await writeDenyConfig(deniedFx.root, ["src"]);
    const denied = await bindReasoningProposalJson(
      proposalJson({
        schemaVersion: 1,
        proposalId: "p",
        requestedOutcome: "x",
        claims: [
          {
            claimId: "c1",
            kind: "CONTENT",
            statement: "denied",
            proposedSubject: {
              kind: "REPOSITORY_RELATIVE_PATH",
              relativePath: "src/hello.ts",
            },
            proposedCitations: [],
          },
        ],
        hypotheses: [],
      }),
      deniedFx.catalog,
    );
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      const text = JSON.stringify(denied.error);
      expect(text).not.toContain(deniedFx.root);
      if (denied.error.kind === "REFUSAL") {
        expect(
          ["CLAIM_OUTSIDE_ADMITTED_SET", "STALE_EVIDENCE"].includes(
            denied.error.refusal.code,
          ),
        ).toBe(true);
      } else if (denied.error.kind === "CATALOG") {
        expect(denied.error.code).toBe("RESTRICTIONS_CHANGED");
      }
    }
  });

  it("B10: successful ABSENT config follows existing semantics", async () => {
    const fx = await fixtureWithSourceAndManifest();
    // No PATHCODE.md => ABSENT; binding still succeeds
    const bound = await bindReasoningProposalJson(
      proposalJson({
        schemaVersion: 1,
        proposalId: "p",
        requestedOutcome: "x",
        claims: [
          {
            claimId: "c1",
            kind: "EXISTS",
            statement: "exists",
            proposedSubject: {
              kind: "REPOSITORY_RELATIVE_PATH",
              relativePath: "package.json",
            },
            proposedCitations: [],
          },
        ],
        hypotheses: [],
      }),
      fx.catalog,
    );
    expect(bound.ok).toBe(true);
    expect(fx.fixture.config.source.kind).toBe("ABSENT");
  });

  it("B11: CONTAINS stays deferred; DEFINES/BEHAVES keep EXECUTION obligations", async () => {
    const fx = await fixtureWithSourceAndManifest({
      extraSource: "export function hello() { return 'needle-visible'; }\n",
    });
    const contentHandle = handleFor(fx.descriptors, "CONTENT", "src/hello.ts");

    const bound = await bindReasoningProposalJson(
      proposalJson({
        schemaVersion: 1,
        proposalId: "p",
        requestedOutcome: "x",
        claims: [
          {
            claimId: "c1",
            kind: "CONTAINS",
            statement: "has needle",
            needle: "needle-visible",
            proposedSubject: { kind: "EVIDENCE_ID", id: contentHandle },
            proposedCitations: [],
          },
          {
            claimId: "c2",
            kind: "DEFINES",
            statement: "defines hello",
            symbolName: "hello",
            proposedSubject: { kind: "EVIDENCE_ID", id: contentHandle },
            proposedCitations: [],
          },
          {
            claimId: "c3",
            kind: "BEHAVES",
            statement: "behaves",
            scenarioDescription: "hello returns string",
            proposedSubject: { kind: "EVIDENCE_ID", id: contentHandle },
            proposedCitations: [],
          },
        ],
        hypotheses: [],
      }),
      fx.catalog,
    );
    expect(bound.ok).toBe(true);
    if (!bound.ok) {
      return;
    }
    const [contains, defines, behaves] = bound.value.reasoning.claims;
    expect(contains?.kind).toBe("CONTAINS");
    if (contains?.kind === "CONTAINS") {
      expect(contains.requiredVerification.method).toBe(
        "DEFERRED_CONTENT_CHECK",
      );
    }
    expect(defines?.kind).toBe("DEFINES");
    if (defines?.kind === "DEFINES") {
      expect(defines.requiredVerification.method).toBe("EXECUTION");
      expect(defines.requiredVerification.checkKinds).toEqual(["TYPECHECK"]);
      expect(defines.requiredVerification.checkPurpose.length).toBeGreaterThan(
        0,
      );
    }
    expect(behaves?.kind).toBe("BEHAVES");
    if (behaves?.kind === "BEHAVES") {
      expect(behaves.requiredVerification.method).toBe("EXECUTION");
      expect(behaves.requiredVerification.checkKinds).toEqual([
        "TARGETED_TEST",
      ]);
    }
  });

  it("B12: supported INFERRED and UNVERIFIED hypotheses retain labels", async () => {
    const fx = await fixtureWithSourceAndManifest();
    const bound = await bindReasoningProposalJson(
      proposalJson({
        schemaVersion: 1,
        proposalId: "p",
        requestedOutcome: "x",
        claims: [
          {
            claimId: "c1",
            kind: "EXISTS",
            statement: "exists",
            proposedSubject: {
              kind: "REPOSITORY_RELATIVE_PATH",
              relativePath: "src/hello.ts",
            },
            proposedCitations: [],
          },
        ],
        hypotheses: [
          {
            hypothesisId: "h1",
            epistemic: "INFERRED",
            statement: "inferred",
            supportingClaimIds: ["c1"],
          },
          {
            hypothesisId: "h2",
            epistemic: "UNVERIFIED",
            statement: "unverified",
          },
        ],
      }),
      fx.catalog,
    );
    expect(bound.ok).toBe(true);
    if (!bound.ok) {
      return;
    }
    expect(bound.value.reasoning.hypotheses[0]?.epistemic).toBe("INFERRED");
    expect(bound.value.reasoning.hypotheses[1]?.epistemic).toBe("UNVERIFIED");
  });

  it("B13: caller mutations cannot change retained binding", async () => {
    const fx = await fixtureWithSourceAndManifest();
    const selectionEntries = [fx.sourceEntry];
    const catalog = createReferenceCatalog({
      workspace: fx.fixture.workspace,
      snapshot: fx.fixture.snapshot,
      selection: {
        entries: selectionEntries,
        contentObservations: [fx.sourceObservation],
        manifestEvidence: [fx.typescriptEvidence],
      },
    });
    expect(catalog.ok).toBe(true);
    if (!catalog.ok) {
      return;
    }
    // Mutate caller-held selection after catalog creation
    selectionEntries.length = 0;

    const descriptors = describeReferenceCatalog(catalog.value);
    expect(descriptors.ok).toBe(true);
    if (!descriptors.ok) {
      return;
    }
    expect(descriptors.value.length).toBeGreaterThan(0);
    expect(() => {
      (descriptors.value as { handle: string }[])[0]!.handle = "mutated";
    }).toThrow();

    const bound = await bindReasoningProposalJson(
      proposalJson({
        schemaVersion: 1,
        proposalId: "p",
        requestedOutcome: "x",
        claims: [
          {
            claimId: "c1",
            kind: "EXISTS",
            statement: "exists",
            proposedSubject: {
              kind: "REPOSITORY_RELATIVE_PATH",
              relativePath: "src/hello.ts",
            },
            proposedCitations: [],
          },
        ],
        hypotheses: [],
      }),
      catalog.value,
    );
    expect(bound.ok).toBe(true);
  });

  it("B14: JSON copies fail registration; disposal invalidates binding", async () => {
    const fx = await fixtureWithSourceAndManifest();
    const bound = await bindReasoningProposalJson(
      proposalJson({
        schemaVersion: 1,
        proposalId: "p",
        requestedOutcome: "x",
        claims: [
          {
            claimId: "c1",
            kind: "EXISTS",
            statement: "exists",
            proposedSubject: {
              kind: "REPOSITORY_RELATIVE_PATH",
              relativePath: "src/hello.ts",
            },
            proposedCitations: [],
          },
        ],
        hypotheses: [],
      }),
      fx.catalog,
    );
    expect(bound.ok).toBe(true);
    if (!bound.ok) {
      return;
    }
    const copy = JSON.parse(
      JSON.stringify(bound.value.reasoning),
    ) as typeof bound.value.reasoning;
    const app = await checkReferenceBoundReasoningApplicability(
      copy,
      fx.catalog,
    );
    expect(app.ok).toBe(false);
    if (!app.ok) {
      expect(app.error.kind).toBe("CATALOG");
      if (app.error.kind === "CATALOG") {
        expect(app.error.code).toBe("RESULT_NOT_REGISTERED");
      }
    }

    disposeReferenceCatalog(fx.catalog);
    const afterDispose = await bindReasoningProposalJson(
      proposalJson({
        schemaVersion: 1,
        proposalId: "p",
        requestedOutcome: "x",
        claims: [
          {
            claimId: "c1",
            kind: "EXISTS",
            statement: "exists",
            proposedSubject: {
              kind: "REPOSITORY_RELATIVE_PATH",
              relativePath: "src/hello.ts",
            },
            proposedCitations: [],
          },
        ],
        hypotheses: [],
      }),
      fx.catalog,
    );
    expect(afterDispose.ok).toBe(false);
  });

  it("B15: fresh applicability rereads; stale refuses while original result unchanged", async () => {
    const fx = await fixtureWithSourceAndManifest();
    const bound = await bindReasoningProposalJson(
      proposalJson({
        schemaVersion: 1,
        proposalId: "p",
        requestedOutcome: "x",
        claims: [
          {
            claimId: "c1",
            kind: "CONTENT",
            statement: "content",
            proposedSubject: {
              kind: "REPOSITORY_RELATIVE_PATH",
              relativePath: "src/hello.ts",
            },
            proposedCitations: [],
          },
        ],
        hypotheses: [],
      }),
      fx.catalog,
    );
    expect(bound.ok).toBe(true);
    if (!bound.ok) {
      return;
    }

    const fresh = await checkReferenceBoundReasoningApplicability(
      bound.value.reasoning,
      fx.catalog,
    );
    expect(fresh.ok).toBe(true);

    writeFileSync(
      join(fx.root, "src/hello.ts"),
      "export function hello() { return 99; }\n",
    );
    const stale = await checkReferenceBoundReasoningApplicability(
      bound.value.reasoning,
      fx.catalog,
    );
    expect(stale.ok).toBe(false);
    expect(bound.value.reasoning.claims[0]?.kind).toBe("CONTENT");
  });

  it("B16: one invalid claim refuses the whole proposal; no partial bundle", async () => {
    const fx = await fixtureWithSourceAndManifest();
    const result = await bindReasoningProposalJson(
      proposalJson({
        schemaVersion: 1,
        proposalId: "p",
        requestedOutcome: "x",
        claims: [
          {
            claimId: "c1",
            kind: "EXISTS",
            statement: "ok",
            proposedSubject: {
              kind: "REPOSITORY_RELATIVE_PATH",
              relativePath: "src/hello.ts",
            },
            proposedCitations: [],
          },
          {
            claimId: "c2",
            kind: "CONTENT",
            statement: "bad",
            proposedSubject: {
              kind: "EVIDENCE_ID",
              id: "missing-handle",
            },
            proposedCitations: [],
          },
        ],
        hypotheses: [],
      }),
      fx.catalog,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result).not.toHaveProperty("value");
    }
  });

  it("B17: desired creation outcome text grants no EXISTS invent and no edit authority", async () => {
    const fx = await fixtureWithSourceAndManifest();
    const bound = await bindReasoningProposalJson(
      proposalJson({
        schemaVersion: 1,
        proposalId: "p",
        requestedOutcome: "create src/future.ts with helper",
        claims: [
          {
            claimId: "c1",
            kind: "EXISTS",
            statement: "package.json exists today",
            proposedSubject: {
              kind: "REPOSITORY_RELATIVE_PATH",
              relativePath: "package.json",
            },
            proposedCitations: [],
          },
        ],
        hypotheses: [],
      }),
      fx.catalog,
    );
    expect(bound.ok).toBe(true);
    if (!bound.ok) {
      return;
    }
    expect(bound.value.reasoning.claims.every((c) => c.bindingStage === "REFERENCES_ONLY")).toBe(
      true,
    );
    expect(bound.value.reasoning).not.toHaveProperty("authorization");
    expect(bound.value.reasoning).not.toHaveProperty("editContract");
  });

  it("B18: E2E manifest+source -> REFERENCES_ONLY; changed bytes refuse next bind/applicability", async () => {
    const fx = await fixtureWithSourceAndManifest();
    const manifestHandle = handleFor(
      fx.descriptors,
      "MANIFEST",
      "package.json",
    );
    const contentHandle = handleFor(fx.descriptors, "CONTENT", "src/hello.ts");

    const bound = await bindReasoningProposalJson(
      proposalJson({
        schemaVersion: 1,
        proposalId: "p",
        requestedOutcome: "understand deps",
        claims: [
          {
            claimId: "c1",
            kind: "DEPENDS_DECLARED",
            statement: "typescript declared",
            dependencyName: "typescript",
            proposedSubject: { kind: "EVIDENCE_ID", id: manifestHandle },
            proposedCitations: [],
          },
          {
            claimId: "c2",
            kind: "CONTENT",
            statement: "source present",
            proposedSubject: { kind: "EVIDENCE_ID", id: contentHandle },
            proposedCitations: [],
          },
        ],
        hypotheses: [],
      }),
      fx.catalog,
    );
    expect(bound.ok).toBe(true);
    if (!bound.ok) {
      return;
    }
    expect(
      bound.value.reasoning.claims.every((c) => c.bindingStage === "REFERENCES_ONLY"),
    ).toBe(true);

    await writeRelative(
      fx.root,
      "package.json",
      `${JSON.stringify({ name: "phase5b-fixture", dependencies: { typescript: "^5.1.0" } }, null, 2)}\n`,
    );

    const next = await bindReasoningProposalJson(
      proposalJson({
        schemaVersion: 1,
        proposalId: "p2",
        requestedOutcome: "understand deps",
        claims: [
          {
            claimId: "c1",
            kind: "DEPENDS_DECLARED",
            statement: "typescript declared",
            dependencyName: "typescript",
            proposedSubject: { kind: "EVIDENCE_ID", id: manifestHandle },
            proposedCitations: [],
          },
        ],
        hypotheses: [],
      }),
      fx.catalog,
    );
    expect(next.ok).toBe(false);

    const app = await checkReferenceBoundReasoningApplicability(
      bound.value.reasoning,
      fx.catalog,
    );
    expect(app.ok).toBe(false);
  });
});

describe("private resolver seam (bypass target)", () => {
  it("B04/B06 private resolveCatalogReference rejects invented handles", async () => {
    const fx = await fixtureWithSourceAndManifest();
    const { lookupCatalog } = await import(
      "../../src/reasoning/internal/registry.js"
    );
    const internal = lookupCatalog(fx.catalog);
    expect(internal).toBeDefined();
    const resolved = resolveCatalogReference(
      internal!,
      { kind: "EVIDENCE_ID", id: "invented" },
      "CONTENT",
      "c1",
    );
    expect(resolved.ok).toBe(false);
  });
});

describe("compile-contract preservation markers", () => {
  it("B19/B20: type-contracts file and types-only types.ts still present", () => {
    const typeContracts = readFileSync(
      new URL("./type-contracts.ts", import.meta.url),
      "utf8",
    );
    expect(typeContracts).toContain("T01");
    expect(typeContracts).toContain("T12");
    const types = readFileSync(
      new URL("../../src/reasoning/types.ts", import.meta.url),
      "utf8",
    );
    expect(types).toContain("export type ReasoningProposal");
    expect(types).not.toMatch(/\bexport function\b/);
  });
});
