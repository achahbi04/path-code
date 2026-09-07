import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CHECKOUT_ROOT, importHost } from "./helpers.js";

describe("T28 T29 host architecture and offline canon", () => {
  it("T28: fixture provisioning and auth constructors stay in named host modules", () => {
    const trialSrc = readFileSync(
      join(CHECKOUT_ROOT, "scripts/pathcode-cli/trial.mjs"),
      "utf8",
    );
    const fixtureSrc = readFileSync(
      join(CHECKOUT_ROOT, "scripts/pathcode-cli/fixture-store.mjs"),
      "utf8",
    );
    expect(fixtureSrc).toContain("provisionMultiply01Workspace");
    expect(fixtureSrc).toContain('flag: "wx"');
    expect(trialSrc).toContain("authorizePreparedChange");
    expect(trialSrc).toContain("explicitEditApproval");
    expect(trialSrc).toContain("authorizeValidationPlan");
    expect(trialSrc).toContain("acceptsApplyConfirmation");
    expect(trialSrc).toContain("acceptsCheckConfirmation");

    // No reverse import of host from src/
    const srcAdapters = join(CHECKOUT_ROOT, "src");
    const walk = (dir: string): string[] => {
      const out: string[] = [];
      for (const ent of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, ent.name);
        if (ent.isDirectory()) out.push(...walk(p));
        else if (ent.name.endsWith(".ts")) out.push(p);
      }
      return out;
    };
    for (const file of walk(srcAdapters)) {
      const text = readFileSync(file, "utf8");
      expect(text).not.toContain("pathcode-cli");
      expect(text).not.toContain("scripts/pathcode");
    }

    const pkg = JSON.parse(
      readFileSync(join(CHECKOUT_ROOT, "package.json"), "utf8"),
    );
    expect(pkg.exports).toEqual({
      ".": {
        types: "./dist/index.d.ts",
        import: "./dist/index.js",
      },
    });
  });

  it("T29: production route has no test Brain/fetch/approval bypass via args/env", async () => {
    const main = readFileSync(
      join(CHECKOUT_ROOT, "scripts/pathcode.mjs"),
      "utf8",
    );
    expect(main).not.toMatch(/PATHCODE_TEST_AUTO_APPROVE/);
    expect(main).toContain("Refused flag");
    expect(main).toContain("--yes");
    expect(main).toContain("--auto-approve");
    // No enablement path for auto-approve — only refusal.
    expect(main).not.toMatch(/autoApprove\s*=\s*true/);

    const trial = await importHost("trial.mjs");
    expect(typeof trial.runMultiply01Trial).toBe("function");
  });

  it("T27: missing dist diagnosed before dispatch", async () => {
    const paths = await importHost("paths.mjs");
    const bad = paths.resolveRuntimePrerequisites("/tmp/not-a-pathcode-root");
    expect(bad.ok).toBe(false);
    expect(["MISSING_PACKAGE", "MISSING_DIST"]).toContain(bad.code);
  });
});
