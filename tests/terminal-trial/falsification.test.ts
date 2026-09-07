/**
 * P1–P3 bounded falsifications. Snapshot → weaken → observe fail → restore.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import { CHECKOUT_ROOT } from "./helpers.js";

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

describe("P1–P3 falsifications", () => {
  it("P1: bypassing START consent exposes broken predicate (subprocess)", () => {
    const terminalPath = join(
      CHECKOUT_ROOT,
      "scripts/pathcode-cli/terminal.mjs",
    );
    const before = sha256(terminalPath);
    const original = readFileSync(terminalPath, "utf8");
    const weakened = original.replace(
      'export function acceptsStartConsent(line, challenge) {\n  return matchesChallengePhrase("START", challenge, line);\n}',
      'export function acceptsStartConsent(line, challenge) {\n  return true; // P1_WEAKEN\n}',
    );
    expect(weakened.includes("P1_WEAKEN")).toBe(true);
    writeFileSync(terminalPath, weakened);
    try {
      const href = pathToFileURL(terminalPath).href;
      const probe = spawnSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          `import { acceptsStartConsent } from ${JSON.stringify(href)};
           if (acceptsStartConsent("no", "abc") !== true) process.exit(2);
           if (acceptsStartConsent("", "abc") !== true) process.exit(3);
           process.exit(0);`,
        ],
        { encoding: "utf8", cwd: CHECKOUT_ROOT },
      );
      expect(probe.status).toBe(0);
    } finally {
      writeFileSync(terminalPath, original);
      expect(sha256(terminalPath)).toBe(before);
      const href = pathToFileURL(terminalPath).href;
      const restored = spawnSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          `import { acceptsStartConsent } from ${JSON.stringify(href)};
           if (acceptsStartConsent("no", "abc") !== false) process.exit(2);
           if (acceptsStartConsent("START abc", "abc") !== true) process.exit(3);
           process.exit(0);`,
        ],
        { encoding: "utf8", cwd: CHECKOUT_ROOT },
      );
      expect(restored.status).toBe(0);
    }
  });

  it("P2: bypassing APPLY confirmation exposes broken predicate (subprocess)", () => {
    const terminalPath = join(
      CHECKOUT_ROOT,
      "scripts/pathcode-cli/terminal.mjs",
    );
    const before = sha256(terminalPath);
    const original = readFileSync(terminalPath, "utf8");
    const weakened = original.replace(
      'export function acceptsApplyConfirmation(line, challenge) {\n  return matchesChallengePhrase("APPLY", challenge, line);\n}',
      'export function acceptsApplyConfirmation(line, challenge) {\n  return true; // P2_WEAKEN\n}',
    );
    expect(weakened.includes("P2_WEAKEN")).toBe(true);
    writeFileSync(terminalPath, weakened);
    try {
      const href = pathToFileURL(terminalPath).href;
      const probe = spawnSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          `import { acceptsApplyConfirmation, matchesChallengePhrase } from ${JSON.stringify(href)};
           if (acceptsApplyConfirmation("wrong", "chal") !== true) process.exit(2);
           if (matchesChallengePhrase("APPLY", "chal", "wrong") !== false) process.exit(3);
           process.exit(0);`,
        ],
        { encoding: "utf8", cwd: CHECKOUT_ROOT },
      );
      expect(probe.status).toBe(0);
    } finally {
      writeFileSync(terminalPath, original);
      expect(sha256(terminalPath)).toBe(before);
    }
  });

  it("P3: host env constructor inherit canary is detected by T20 predicate", () => {
    const envPath = join(CHECKOUT_ROOT, "scripts/pathcode-cli/child-env.mjs");
    const before = sha256(envPath);
    const original = readFileSync(envPath, "utf8");
    const weakened = original.replace(
      "export function buildTrialChildEnvironment(_hostEnv = process.env) {\n  const env = Object.create(null);\n  // Ordinary locale values only — no wholesale inherit, no credentials.\n  const lang = typeof _hostEnv.LANG === \"string\" && _hostEnv.LANG.length > 0\n    ? _hostEnv.LANG\n    : \"C\";\n  env.LANG = lang;",
      "export function buildTrialChildEnvironment(_hostEnv = process.env) {\n  const env = Object.create(null);\n  // P3_WEAKEN: inherit seeded canary\n  if (typeof _hostEnv.NODE_OPTIONS === \"string\") env.NODE_OPTIONS = _hostEnv.NODE_OPTIONS;\n  const lang = typeof _hostEnv.LANG === \"string\" && _hostEnv.LANG.length > 0\n    ? _hostEnv.LANG\n    : \"C\";\n  env.LANG = lang;",
    );
    expect(weakened.includes("P3_WEAKEN")).toBe(true);
    writeFileSync(envPath, weakened);
    try {
      const href = pathToFileURL(envPath).href;
      const probe = spawnSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          `import { buildTrialChildEnvironment, trialChildEnvironmentExcludesSecrets } from ${JSON.stringify(href)};
           const built = buildTrialChildEnvironment({ NODE_OPTIONS: "--require /tmp/canary", LANG: "C" });
           if (built.NODE_OPTIONS !== "--require /tmp/canary") process.exit(2);
           if (trialChildEnvironmentExcludesSecrets(built) !== false) process.exit(3);
           process.exit(0);`,
        ],
        { encoding: "utf8", cwd: CHECKOUT_ROOT },
      );
      expect(probe.status).toBe(0);
    } finally {
      writeFileSync(envPath, original);
      expect(sha256(envPath)).toBe(before);
      const href = pathToFileURL(envPath).href;
      const restored = spawnSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          `import { buildTrialChildEnvironment, trialChildEnvironmentExcludesSecrets } from ${JSON.stringify(href)};
           const clean = buildTrialChildEnvironment({ NODE_OPTIONS: "--require /tmp/canary", LANG: "C", OPENAI_API_KEY: "sk-canary" });
           if (clean.NODE_OPTIONS !== undefined) process.exit(2);
           if (trialChildEnvironmentExcludesSecrets(clean) !== true) process.exit(3);
           process.exit(0);`,
        ],
        { encoding: "utf8", cwd: CHECKOUT_ROOT },
      );
      expect(restored.status).toBe(0);
    }
  });
});
