/**
 * Phase 5G — architecture invariants of the General Engineering Session.
 *
 * These read the sources rather than the behaviour, because the properties are
 * about what cannot exist: a second mutation architecture, a downgrade switch,
 * an authorization minted from model text, a destructive Git verb, or scope
 * semantics living in a provider adapter.
 *
 * 5G-E  the scope profile stays provider-neutral and package-internal
 * 5G-L  no destructive Git verb anywhere in the host
 * 5G-S  authority is constructed only after a human typed a challenge
 * 5G-U  recovery protection is a literal REQUIRED
 * 5G-V  the session composes existing owners; it defines no second Gate or
 *       mutation path of its own
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CHECKOUT_ROOT } from "./helpers.js";

const HOST_DIRECTORY = join(CHECKOUT_ROOT, "scripts/pathcode-cli");

/** The Phase 5G host modules, as loaded by the CLI. */
const GENERAL_SESSION_MODULES = [
  "general-session.mjs",
  "autonomy-policy.mjs",
  "preflight.mjs",
  "currentness.mjs",
  "scope-request.mjs",
  "state-dir.mjs",
  "validation-candidates.mjs",
  "recover.mjs",
  "session-events.mjs",
];

function hostSource(file: string): string {
  return readFileSync(join(HOST_DIRECTORY, file), "utf8");
}

function walkTypeScript(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const child = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...walkTypeScript(child));
    else if (entry.name.endsWith(".ts")) found.push(child);
  }
  return found;
}

describe("5G-E: the scope profile is provider-neutral", () => {
  it("5G-E: core owns the semantics; the adapter only names the profile", () => {
    for (const file of readdirSync(join(CHECKOUT_ROOT, "src/adapters/openai"))) {
      const source = readFileSync(
        join(CHECKOUT_ROOT, "src/adapters/openai", file),
        "utf8",
      );
      expect(source, file).not.toMatch(/from "\.\.\/\.\.\/scope/);
      // The adapter may name the wire shape; it may not decide anything about
      // it — no inventory, no sensitivity, no scope admission.
      expect(source, file).not.toMatch(
        /RepositoryInventory|classifyScopePathSensitivity|admitScopePlan|parseEngineeringScopePlan|forbiddenRelativePrefixes/,
      );
    }
    // The scope module knows nothing about any provider.
    for (const file of walkTypeScript(join(CHECKOUT_ROOT, "src/scope"))) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/openai|OpenAI|anthropic|provider-specific/);
      expect(source, file).not.toMatch(/node:fs|fetch\(/);
    }
  });

  it("5G-E: scope stays package-internal and the package root is unchanged", () => {
    const rootIndex = readFileSync(join(CHECKOUT_ROOT, "src/index.ts"), "utf8");
    expect(rootIndex).not.toMatch(/scope/i);

    const pkg = JSON.parse(
      readFileSync(join(CHECKOUT_ROOT, "package.json"), "utf8"),
    ) as Record<string, any>;
    expect(pkg.private).toBe(true);
    expect(pkg.bin).toEqual({ pathcode: "./scripts/pathcode.mjs" });
    expect(pkg.dependencies ?? {}).toEqual({});
    expect(pkg.exports).toEqual({
      ".": { types: "./dist/index.d.ts", import: "./dist/index.js" },
    });
    expect(pkg.scripts["general-session:smoke"]).toBe(
      "node scripts/general-session-smoke.mjs",
    );
    expect(pkg.scripts["bounded-session:smoke"]).toBe(
      "node scripts/bounded-session-smoke.mjs",
    );
  });

  it("5G-E: no core module imports the host", () => {
    for (const file of walkTypeScript(join(CHECKOUT_ROOT, "src"))) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toContain("pathcode-cli");
      expect(source, file).not.toContain("scripts/pathcode");
    }
  });
});

describe("5G-L: the host never mutates Git", () => {
  it("5G-L: no destructive Git verb appears in any Phase 5G host module", () => {
    const destructive =
      /\bgit\s+(stash|reset|clean|checkout|commit|revert|rebase|merge|push|pull|cherry-pick|filter-branch)\b/;
    for (const file of GENERAL_SESSION_MODULES) {
      expect(hostSource(file), file).not.toMatch(destructive);
    }
  });

  it("5G-L: only the read-only Git owners are composed", () => {
    const preflight = hostSource("preflight.mjs");
    expect(preflight).toContain("discoverGitRepository");
    expect(preflight).toContain("collectGitStateBaseline");
    // Working-tree state is disclosed, never repaired.
    expect(preflight).toContain("summarizeWorkingTree");
    expect(preflight).not.toMatch(/writeFile|rm\(|unlink|rename/);
  });
});

describe("5G-S: authority is never minted from model text", () => {
  it("5G-S: every authorization constructor follows an accepted challenge", () => {
    const session = hostSource("general-session.mjs");

    // REVIEW path: APPLY / CHECK still precede host-minted authority.
    const applyGateAt = session.indexOf(": acceptsApplyConfirmation(");
    const editAuthorizeAt = session.indexOf("authorizePreparedChange(");
    const editApprovalAt = session.indexOf("explicitEditApproval()");
    expect(applyGateAt).toBeGreaterThan(-1);
    expect(editAuthorizeAt).toBeGreaterThan(applyGateAt);
    expect(editApprovalAt).toBeGreaterThan(applyGateAt);

    const checkGateAt = session.indexOf(": acceptsCheckConfirmation(");
    const processApprovalAt = session.indexOf("explicitLocalProcessApproval()");
    const planAuthorizeAt = session.indexOf("authorizeValidationPlan(");
    expect(processApprovalAt).toBeGreaterThan(checkGateAt);
    expect(planAuthorizeAt).toBeGreaterThan(checkGateAt);

    // BOUNDED path: one RUN challenge, then trusted-host policy before minting.
    const runGateAt = session.indexOf(": acceptsRunConfirmation(");
    const runConsentAt = session.indexOf('askLine("run-consent"');
    const editPolicyAt = session.indexOf("evaluateEditAgainstPolicy(boundedPolicy");
    const validationPolicyAt = session.indexOf(
      "evaluateValidationAgainstPolicy(",
    );
    expect(runGateAt).toBeGreaterThan(-1);
    expect(runConsentAt).toBeGreaterThan(-1);
    expect(editPolicyAt).toBeGreaterThan(runGateAt);
    expect(editAuthorizeAt).toBeGreaterThan(editPolicyAt);
    expect(planAuthorizeAt).toBeGreaterThan(validationPolicyAt);

    const recover = hostSource("recover.mjs");
    expect(recover.indexOf("authorizeRecoveryReview(")).toBeGreaterThan(
      recover.indexOf("acceptsRestoreConfirmation"),
    );
  });

  it("5G-S: there is no auto-approval switch, flag or environment escape", () => {
    for (const file of [...GENERAL_SESSION_MODULES, "../pathcode.mjs"]) {
      const source = hostSource(file);
      expect(source, file).not.toMatch(/AUTO_APPROVE|autoApprove\s*=\s*true/);
      expect(source, file).not.toMatch(/--yes\b.*=>\s*true/);
    }
    // The consent predicates are injectable for tests, but each one defaults to
    // the exact challenge grammar. BOUNDED adds RUN; it does not add AUTO_APPROVE.
    const session = hostSource("general-session.mjs");
    for (const predicate of [
      "acceptsStartConsent",
      "acceptsScopeConfirmation",
      "acceptsApplyConfirmation",
      "acceptsCheckConfirmation",
      "acceptsRunConfirmation",
    ]) {
      expect(session, predicate).toContain(`: ${predicate}(`);
    }
    expect(session).toContain('autonomyMode === "bounded"');
    expect(session).not.toMatch(/AUTO_APPROVE/);
  });

  it("5G-S: the model's own text never reaches a command, path or id unchecked", () => {
    const session = hostSource("general-session.mjs");
    // Paths go through the parser and the admission owner, never straight to fs.
    expect(session).toContain("parseEngineeringScopePlan");
    expect(session).toContain("admitScopePlan");
    expect(session).not.toMatch(/readFileSync|writeFileSync|spawnSync|child_process/);
    // Untrusted text is always escaped before it is displayed.
    expect(session).toContain("prefixUntrustedLines");
    // The model never mints Scope/Edit/Validation authority in either mode.
    expect(session).toContain("authorizePreparedChange");
    expect(session).toContain("explicitEditApproval()");
    expect(session).toContain("authorizeValidationPlan");
    expect(session).toContain("explicitLocalProcessApproval()");
  });
});

describe("5G-U / 5G-V: one mutation architecture, always recoverable", () => {
  it("5G-U: recovery protection is a literal, with no downgrade path", () => {
    const session = hostSource("general-session.mjs");
    expect(session).toContain(
      'export const GENERAL_SESSION_RECOVERY_PROTECTION = "REQUIRED"',
    );
    expect(session).not.toMatch(/"NONE"/);
    expect(session).not.toMatch(/recoveryProtection\s*=\s*/);
    expect(session).not.toMatch(/options\.recovery/);
  });

  it("5G-V: the session composes owners rather than reimplementing them", () => {
    const session = hostSource("general-session.mjs");
    for (const owner of [
      "openEngineeringMutationSession",
      "createRecoveryStore",
      "createReferenceCatalog",
      "buildRepositorySnapshot",
      "authorizeValidationPlan",
    ]) {
      expect(session, owner).toContain(owner);
    }
    // No second Gate 1 / Gate 2 / mutation implementation lives in the host.
    expect(session).not.toMatch(/function\s+\w*[Gg]ate[12]/);
    expect(session).not.toMatch(/associateEvidence|bindReferences|runGate2/);
    expect(session).toMatch(/session\.propose\(/);
    expect(session).toMatch(/session\.apply\(/);
    expect(session).toMatch(/session\.validate\(/);
  });

  it("5G-V: the smoke script provisions a disposable repository and a store outside it", () => {
    const smoke = readFileSync(
      join(CHECKOUT_ROOT, "scripts/general-session-smoke.mjs"),
      "utf8",
    );
    expect(smoke).toContain("pathcode-5g-project-");
    expect(smoke).toContain("pathcode-5g-state-");
    expect(smoke).toContain("PATHCODE_STATE_DIR");
    expect(smoke).toContain("--recover-phase");
    expect(smoke).not.toMatch(/OPENAI_API_KEY\s*[:=]\s*["']sk-/);
    // A scripted adapter behind the real brain: no network, no credential.
    expect(smoke).toContain("createEngineeringBrain");
    expect(smoke).not.toMatch(/createOpenAIAdapter|fetch\(/);
  });
});
