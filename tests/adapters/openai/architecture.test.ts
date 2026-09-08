/**
 * Phase 5E1 OpenAI adapter architecture assertions (F30 / transport amendment).
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

const openaiDir = fileURLToPath(
  new URL("../../../src/adapters/openai", import.meta.url),
);
const srcDir = fileURLToPath(new URL("../../../src", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const require = createRequire(import.meta.url);

const ALLOWED_FILES = new Set([
  "src/adapters/openai/adapter.ts",
  "src/adapters/openai/budget.ts",
  "src/adapters/openai/index.ts",
  "src/adapters/openai/profiles.ts",
  "src/adapters/openai/request.ts",
  "src/adapters/openai/response.ts",
  "src/adapters/openai/transport.ts",
  "src/adapters/openai/types.ts",
]);

const ALLOWED_VALUE_EXPORTS = new Set([
  "createOpenAIAdapter",
  "OPENAI_PROVIDER_ID",
  "OPENAI_RESPONSES_URL",
  "DEFAULT_MAX_TRANSPORT_ATTEMPTS",
  "HARD_MAX_TRANSPORT_ATTEMPTS",
  "DEFAULT_MAX_REQUEST_BODY_BYTES",
  "HARD_MAX_REQUEST_BODY_BYTES",
  "DEFAULT_CUMULATIVE_REQUEST_BODY_BYTES",
  "HARD_CUMULATIVE_REQUEST_BODY_BYTES",
  "HARD_MAX_OUTPUT_TOKENS_PER_ATTEMPT",
  "DEFAULT_CUMULATIVE_OUTPUT_TOKENS",
  "HARD_CUMULATIVE_OUTPUT_TOKENS",
  "DEFAULT_MAX_RESPONSE_ENVELOPE_BYTES",
  "HARD_MAX_RESPONSE_ENVELOPE_BYTES",
  "DEFAULT_MAX_PROPOSAL_TEXT_UTF8_BYTES",
  "HARD_MAX_PROPOSAL_TEXT_UTF8_BYTES",
  "REASONING_PROPOSAL_NATIVE_SCHEMA",
  "ENGINEERING_EDIT_PROPOSAL_NATIVE_SCHEMA",
  "ENGINEERING_SCOPE_PLAN_NATIVE_SCHEMA",
  "REASONING_SCHEMA_NAME",
  "EDIT_SCHEMA_NAME",
  "SCOPE_SCHEMA_NAME",
  "REASONING_PROFILE_INSTRUCTIONS",
  "EDIT_PROFILE_INSTRUCTIONS",
  "SCOPE_PROFILE_INSTRUCTIONS",
  "buildOpenAIResponsesRequest",
  "translateOpenAITransportResult",
]);

function listTsFiles(dir: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      files.push(...listTsFiles(full));
    } else if (name.endsWith(".ts")) {
      files.push(full);
    }
  }
  return files;
}

describe("openai adapter architecture", () => {
  it("F30: allowlisted modules; only transport may fetch; no env; finite barrel; not on root", async () => {
    const files = listTsFiles(openaiDir).map((f) =>
      relative(repoRoot, f).replaceAll("\\", "/"),
    );
    expect(new Set(files)).toEqual(ALLOWED_FILES);

    for (const rel of files) {
      const src = readFileSync(join(repoRoot, rel), "utf8");
      expect(src).not.toMatch(/process\.env/);
      expect(src).not.toMatch(
        /from ["']node:(fs|path|child_process|http|https|net|dns|tls)["']/,
      );
      expect(src).not.toMatch(
        /from ["']\.\.\/\.\.\/(reasoning|editing|validation|engineering-run|run-evidence|orchestrator)\//,
      );
      if (rel !== "src/adapters/openai/transport.ts") {
        expect(src).not.toMatch(/globalThis\.fetch/);
        expect(src).not.toMatch(/\bfetch\s*\(/);
        expect(src).not.toMatch(/\bfetch\s*=/);
      }
    }

    const transport = readFileSync(
      join(repoRoot, "src/adapters/openai/transport.ts"),
      "utf8",
    );
    expect(transport).toMatch(/fetchImpl/);
    expect(transport).toMatch(/redirect:\s*["']error["']/);

    const mod = await import("../../../src/adapters/openai/index.js");
    expect(new Set(Object.keys(mod).sort())).toEqual(
      new Set([...ALLOWED_VALUE_EXPORTS].sort()),
    );

    const root = await import("../../../src/index.js");
    expect(Object.keys(root)).not.toContain("createOpenAIAdapter");

    const pkg = JSON.parse(
      readFileSync(join(repoRoot, "package.json"), "utf8"),
    ) as { dependencies?: unknown; devDependencies?: Record<string, string> };
    expect(pkg.dependencies ?? {}).toEqual({});
    // Installed dependency count unchanged: only prior devDependencies.
    expect(Object.keys(pkg.devDependencies ?? {}).sort()).toEqual([
      "@types/node",
      "tsx",
      "typescript",
      "vitest",
    ]);

    // Lockfile dependency identity for openai SDK absence
    const lock = readFileSync(join(repoRoot, "package-lock.json"), "utf8");
    expect(lock).not.toMatch(/"openai"/);
    expect(lock).not.toMatch(/@openai\//);

    // Live harness not collected by vitest patterns
    const vitestCfg = readFileSync(join(repoRoot, "vitest.config.ts"), "utf8");
    expect(vitestCfg).toMatch(/tests\/\*\*\/\*\.test\.ts/);
    expect(vitestCfg).not.toMatch(/openai-live-smoke/);
    void require;
    void srcDir;
  });
});
