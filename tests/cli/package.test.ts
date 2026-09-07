import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../..", import.meta.url));
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  private?: boolean;
  bin?: Record<string, string>;
  dependencies?: Record<string, string>;
};
const entrySource = readFileSync(join(root, "src/cli/entry.ts"), "utf8");

describe("CLI package and entry foundation", () => {
  it("registers a fixed pathcode bin path and remains private", () => {
    expect(packageJson.private).toBe(true);
    expect(packageJson.bin).toEqual({
      pathcode: "./scripts/pathcode.mjs",
    });
    expect(packageJson.dependencies ?? {}).toEqual({});
  });

  it("preserves the foundation CLI compiled entry for legacy smoke/delegation", () => {
    const compiledPath = join(root, "dist/cli/entry.js");
    const compiled = readFileSync(compiledPath, "utf8");
    expect(compiled.startsWith("#!/usr/bin/env node\n")).toBe(true);
    const host = readFileSync(join(root, "scripts/pathcode.mjs"), "utf8");
    expect(host.startsWith("#!/usr/bin/env node\n")).toBe(true);
    expect(host).toContain("delegateLegacy");
  });

  it("keeps a Node shebang on the CLI source entry", () => {
    expect(entrySource.startsWith("#!/usr/bin/env node\n")).toBe(true);
  });

  it("keeps a Node shebang on the compiled CLI entry", () => {
    const compiledPath = join(root, "dist/cli/entry.js");
    const compiled = readFileSync(compiledPath, "utf8");
    expect(compiled.startsWith("#!/usr/bin/env node\n")).toBe(true);
  });
});
