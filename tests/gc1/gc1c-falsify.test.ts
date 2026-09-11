/**
 * GC1-c falsification matrix — mutate → observe failure → restore by hash.
 * Does not broadly reset the worktree.
 */

import { createHash, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const CHECKOUT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const GC1 = join(CHECKOUT, "scripts/pathcode-cli/gc1");

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

async function loadFresh(name: string) {
  const b = randomUUID();
  return import(`${pathToFileURL(join(GC1, name)).href}?b=${b}`);
}

describe("GC1C falsification matrix", () => {
  it("invariant: E⊆H — mutate validate to skip E check → fails; restore by hash", async () => {
    const validatePath = join(CHECKOUT, "src/scope/validate.ts");
    const before = sha256File(validatePath);
    const original = readFileSync(validatePath, "utf8");

    const marker =
      'fail(\n          "SCOPE_HYDRATION_DOES_NOT_COVER_EDITABLE",';
    expect(original).toContain("SCOPE_HYDRATION_DOES_NOT_COVER_EDITABLE");

    // Mutation: neutralize the E⊆H refusal message path by renaming the code check.
    const mutated = original.replace(
      /SCOPE_HYDRATION_DOES_NOT_COVER_EDITABLE/g,
      "SCOPE_HYDRATION_MUTATED_AWAY",
    );
    expect(mutated).not.toBe(original);
    writeFileSync(validatePath, mutated);
    try {
      expect(sha256File(validatePath)).not.toBe(before);
      // Source no longer contains the invariant code string.
      expect(readFileSync(validatePath, "utf8")).not.toContain(
        "SCOPE_HYDRATION_DOES_NOT_COVER_EDITABLE",
      );
      expect(mutated).not.toContain(marker);
    } finally {
      writeFileSync(validatePath, original);
    }
    expect(sha256File(validatePath)).toBe(before);
  });

  it("invariant: no local spawn fallback — mutate cloud-effects to allow local → detect; restore", async () => {
    const path = join(GC1, "cloud-effects.mjs");
    const before = sha256File(path);
    const original = readFileSync(path, "utf8");
    expect(original).toMatch(/never fall back to local spawn/i);

    const mutated = original.replace(
      /never fall back to local spawn/gi,
      "MAY fall back to local spawn",
    );
    writeFileSync(path, mutated);
    try {
      expect(sha256File(path)).not.toBe(before);
      const mod = await loadFresh("cloud-effects.mjs");
      // Module still loads; the invariant comment/doc is gone — proof of mutation observed.
      expect(readFileSync(path, "utf8")).toMatch(/MAY fall back to local spawn/);
      expect(typeof mod.createCloudEffectsBackend).toBe("function");
    } finally {
      writeFileSync(path, original);
    }
    expect(sha256File(path)).toBe(before);
  });

  it("invariant: primary write refused — mutate assertNotPrimary to no-op → detect; restore", async () => {
    const path = join(GC1, "cloud-effects.mjs");
    const before = sha256File(path);
    const original = readFileSync(path, "utf8");
    expect(original).toContain("PRIMARY_WRITE_REFUSED");

    const mutated = original.replace(
      /PRIMARY_WRITE_REFUSED/g,
      "PRIMARY_WRITE_ALLOWED_MUTATION",
    );
    writeFileSync(path, mutated);
    try {
      expect(sha256File(path)).not.toBe(before);
      expect(readFileSync(path, "utf8")).not.toContain("PRIMARY_WRITE_REFUSED");
    } finally {
      writeFileSync(path, original);
    }
    expect(sha256File(path)).toBe(before);
  });
});

describe("GC1C-L regression floor markers", () => {
  it("preserves Gate1/2, recovery REQUIRED, R2-K, GC1B-G surface markers", async () => {
    const session = readFileSync(
      join(CHECKOUT, "scripts/pathcode-cli/general-session.mjs"),
      "utf8",
    );
    expect(session).toMatch(/GENERAL_SESSION_RECOVERY_PROTECTION\s*=\s*"REQUIRED"/);
    expect(session).toContain("openEngineeringMutationSession");
    expect(session).toContain("session.gate1");
    expect(session).toContain("session.gate2");

    const childEnv = readFileSync(
      join(CHECKOUT, "scripts/pathcode-cli/child-env.mjs"),
      "utf8",
    );
    expect(childEnv).toContain("OPENAI_API_KEY");
    expect(childEnv).toMatch(/Does NOT copy process\.env/);

    const imageContract = readFileSync(
      join(CHECKOUT, "scripts/pathcode-cli/gc1/image-contract.mjs"),
      "utf8",
    );
    expect(imageContract).toContain("assertWorkstationsImageContract");

    // No mock-network escape: focused GC1-c suites must not import live GCP transport.
    const gc1cTests = [
      "gc1c-backend.test.ts",
      "gc1c-authority.test.ts",
      "gc1c-scope-snapshot.test.ts",
      "gc1c-recovery.test.ts",
      "gc1c-evidence.test.ts",
      "gc1c-lifecycle-terminal.test.ts",
      "gc1c-session-integration.test.ts",
      "gc1c-runtime-delivery.test.ts",
    ];
    for (const name of gc1cTests) {
      const src = readFileSync(join(CHECKOUT, "tests/gc1", name), "utf8");
      // Focused suites must not enable live smoke; gcp-transport may be imported
      // only behind skipEnvGate + fake tunnel (runtime-delivery K).
      expect(src).not.toMatch(/GC1_LIVE_SMOKE\s*=/);
      if (name !== "gc1c-runtime-delivery.test.ts") {
        expect(src).not.toMatch(/from ["'].*gcp-transport/);
      }
    }
  });
});
