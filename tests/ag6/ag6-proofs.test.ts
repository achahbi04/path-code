/**
 * AG6 focused proofs — platform gates, release audit, version identity.
 */

import { randomUUID } from "node:crypto";
import {
  writeFileSync,
  rmSync,
  mkdtempSync,
  readFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

const CHECKOUT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const CLI = join(CHECKOUT_ROOT, "scripts/pathcode-cli");

async function load(rel: string) {
  return import(`${pathToFileURL(join(CLI, rel)).href}?ag6=${randomUUID()}`);
}

describe("AG6 platform honesty", () => {
  it("accepts darwin/arm64 and refuses others", async () => {
    const { assertSupportedPlatform } = await load("ag6/platform.mjs");
    expect(assertSupportedPlatform({ platform: "darwin", arch: "arm64" }).ok).toBe(
      true,
    );
    const bad = assertSupportedPlatform({ platform: "linux", arch: "x64" });
    expect(bad.ok).toBe(false);
    expect(bad.code).toBe("UNSUPPORTED_PLATFORM");
  });

  it("enforces Node major floor", async () => {
    const { assertSupportedNode } = await load("ag6/platform.mjs");
    expect(assertSupportedNode({ nodeVersion: "22.14.0" }).ok).toBe(true);
    expect(assertSupportedNode({ nodeVersion: "26.5.0" }).ok).toBe(true);
    const old = assertSupportedNode({ nodeVersion: "18.20.0" });
    expect(old.ok).toBe(false);
    expect(old.code).toBe("UNSUPPORTED_NODE");
  });
});

describe("AG6 release audit", () => {
  it("flags embedded machine paths and secrets without printing values", async () => {
    const { auditUnpackedPackage } = await import(
      `${pathToFileURL(join(CHECKOUT_ROOT, "scripts/audit-release.mjs")).href}?ag6=${randomUUID()}`
    );
    const dir = mkdtempSync(join(tmpdir(), "ag6-audit-"));
    try {
      writeFileSync(
        join(dir, "package.json"),
        JSON.stringify({ name: "path-code", version: "1.0.0" }),
      );
      writeFileSync(
        join(dir, "leak.js"),
        `const x = "${CHECKOUT_ROOT}/secret";\n`,
      );
      writeFileSync(
        join(dir, "tok.js"),
        "const t = 'ghp_abcdefghijklmnopqrstuvwx';\n",
      );
      const result = auditUnpackedPackage(dir, {
        repoRoot: CHECKOUT_ROOT,
      });
      expect(result.ok).toBe(false);
      expect(result.findings.some((f: { category: string }) => f.category === "MACHINE_PATH")).toBe(
        true,
      );
      expect(result.findings.some((f: { category: string }) => f.category === "SECRET")).toBe(
        true,
      );
      const dumped = JSON.stringify(result);
      expect(dumped).not.toContain("ghp_abcdefghijklmnopqrstuvwx");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("package.json is 1.0.0 with darwin/arm64 and node engines", () => {
    const pkg = JSON.parse(
      readFileSync(join(CHECKOUT_ROOT, "package.json"), "utf8"),
    ) as {
      version: string;
      engines?: { node?: string };
      os?: string[];
      cpu?: string[];
    };
    expect(pkg.version).toBe("1.0.0");
    expect(pkg.engines?.node).toMatch(/>=\s*22/);
    expect(pkg.os).toEqual(["darwin"]);
    expect(pkg.cpu).toEqual(["arm64"]);
  });
});
