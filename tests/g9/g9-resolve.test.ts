/**
 * G9 — capability resolve / classify / version preference proofs.
 */

import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";

const CHECKOUT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const AG9 = join(CHECKOUT_ROOT, "scripts/pathcode-cli/ag9/index.mjs");

/** @type {string[]} */
const temps: string[] = [];

afterEach(() => {
  while (temps.length) {
    const p = temps.pop();
    if (!p) continue;
    try {
      rmSync(p, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

function tmpFixture(label: string): string {
  const dir = mkdtempSync(join(tmpdir(), `pathcode-g9-${label}-`));
  temps.push(dir);
  return dir;
}

async function loadAg9() {
  return import(`${pathToFileURL(AG9).href}?g9=${randomUUID()}`);
}

describe("G9 resolveToolVersion", () => {
  it("prefers .nvmrc over package engines", async () => {
    const { resolveToolVersion } = await loadAg9();
    const root = tmpFixture("node-nvmrc");
    writeFileSync(join(root, ".nvmrc"), "20.11.0\n");
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ engines: { node: ">=18" } }),
    );
    const v = resolveToolVersion(root, "node");
    expect(v.source).toBe("version_file");
    expect(v.version).toMatch(/^20/);
    expect(v.evidence.some((e: string) => e.includes(".nvmrc"))).toBe(true);
  });

  it("reads go.mod go directive", async () => {
    const { resolveToolVersion } = await loadAg9();
    const root = tmpFixture("go-mod");
    writeFileSync(join(root, "go.mod"), "module example.com/x\n\ngo 1.22.3\n");
    const v = resolveToolVersion(root, "go");
    expect(v.source).toBe("manifest");
    expect(v.version).toBe("1.22.3");
  });

  it("reads rust-toolchain.toml channel", async () => {
    const { resolveToolVersion } = await loadAg9();
    const root = tmpFixture("rust-tc");
    writeFileSync(
      join(root, "rust-toolchain.toml"),
      '[toolchain]\nchannel = "1.83.0"\n',
    );
    const v = resolveToolVersion(root, "rust");
    expect(v.source).toBe("version_file");
    expect(v.version).toBe("1.83.0");
  });

  it("reads csharp global.json sdk version", async () => {
    const { resolveToolVersion } = await loadAg9();
    const root = tmpFixture("csharp");
    writeFileSync(
      join(root, "global.json"),
      JSON.stringify({ sdk: { version: "8.0.100" } }),
    );
    const v = resolveToolVersion(root, "csharp");
    expect(v.source).toBe("manifest");
    expect(v.version).toMatch(/^8/);
  });

  it("labels path_default honestly when no pin exists", async () => {
    const { resolveToolVersion } = await loadAg9();
    const root = tmpFixture("empty");
    const v = resolveToolVersion(root, "definitely-unknown-tool-xyz");
    expect(v.source).toBe("path_default");
    expect(v.evidence.join(" ")).toMatch(/PATH default|no project pin/i);
  });
});

describe("G9 resolveCapabilityRequirements + classifyRequirement", () => {
  it("prefers project gradlew as PROJECT_LOCAL", async () => {
    const { resolveCapabilityRequirements, classifyRequirement, ensureAg9RuntimeDirs } =
      await loadAg9();
    const root = tmpFixture("gradle");
    const runtime = tmpFixture("rt-gradle");
    ensureAg9RuntimeDirs(runtime);

    writeFileSync(join(root, "build.gradle.kts"), "plugins {}\n");
    const wrapper = join(root, "gradlew");
    writeFileSync(wrapper, "#!/bin/sh\necho Gradle 8.0\n");
    chmodSync(wrapper, 0o755);

    const reqs = resolveCapabilityRequirements(root);
    expect(reqs.some((r: { id: string }) => r.id === "gradlew")).toBe(true);

    const gradlew = reqs.find((r: { id: string }) => r.id === "gradlew");
    const classified = classifyRequirement(gradlew, {
      runtimeRoot: runtime,
      projectRoot: root,
    });
    expect(classified.status).toBe("PROJECT_LOCAL");
    expect(classified.executable).toBe(wrapper);
  });

  it("classifies missing cargo as MISSING for rust Cargo.toml projects", async () => {
    const { classifyRequirement, ensureAg9RuntimeDirs, resolveCapabilityRequirements } =
      await loadAg9();
    const root = tmpFixture("rust-miss");
    const runtime = tmpFixture("rt-rust");
    ensureAg9RuntimeDirs(runtime);
    writeFileSync(join(root, "Cargo.toml"), '[package]\nname="x"\nversion="0.1.0"\n');

    const reqs = resolveCapabilityRequirements(root);
    const rustish = reqs.filter(
      (r: { id: string }) =>
        r.id === "rust" || r.id === "cargo" || r.id === "lsp:rust",
    );
    expect(rustish.length).toBeGreaterThan(0);

    const synthetic = {
      id: "cargo-synthetic",
      kind: "toolchain",
      miseTool: "rust",
      bins: [`definitely-missing-cargo-${randomUUID()}`],
      evidence: ["Cargo.toml"],
    };
    const classified = classifyRequirement(synthetic, {
      runtimeRoot: runtime,
      projectRoot: root,
    });
    expect(classified.status).toBe("MISSING");
  });

  it("prefers .venv python as PROJECT_LOCAL", async () => {
    const { classifyRequirement, ensureAg9RuntimeDirs } = await loadAg9();
    const root = tmpFixture("venv");
    const runtime = tmpFixture("rt-venv");
    ensureAg9RuntimeDirs(runtime);
    mkdirSync(join(root, ".venv", "bin"), { recursive: true });
    const py = join(root, ".venv", "bin", "python");
    writeFileSync(py, "#!/bin/sh\necho Python 3.12.0\n");
    chmodSync(py, 0o755);

    const classified = classifyRequirement(
      {
        id: "project-venv-python",
        kind: "wrapper",
        bins: [py],
        evidence: [".venv/bin/python"],
      },
      { runtimeRoot: runtime, projectRoot: root },
    );
    expect(classified.status).toBe("PROJECT_LOCAL");
  });

  it("toSeamDescriptors emits LOCAL_TOOL rows", async () => {
    const { toSeamDescriptors } = await loadAg9();
    const seams = toSeamDescriptors({
      ready: [{ id: "go", status: "HOST_READY", executable: "/usr/bin/go" }],
      failed: [{ id: "rust", status: "MISSING", error: "no mise" }],
    });
    expect(seams.some((s: { kind: string }) => s.kind === "LOCAL_TOOL")).toBe(true);
    expect(seams.find((s: { id: string }) => s.id === "go")?.lifecycle).toBe("expose");
  });
});
