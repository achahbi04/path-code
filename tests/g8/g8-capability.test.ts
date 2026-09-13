/**
 * G8 — Native Capability Gateway proofs.
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";

const CHECKOUT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const AG8 = join(CHECKOUT_ROOT, "scripts/pathcode-cli/ag8/index.mjs");

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
  // Host /tmp — avoid checkout paths where `.vscode` / `.venv` are ignore-blocked.
  const dir = mkdtempSync(join(tmpdir(), `pathcode-g8-${label}-`));
  temps.push(dir);
  return dir;
}

async function loadAg8() {
  return import(`${pathToFileURL(AG8).href}?g8=${randomUUID()}`);
}

describe("G8 discovery — language metadata fixtures", () => {
  it("detects JS/TS from package.json + lock + tsconfig", async () => {
    const { discoverCapabilityPlane } = await loadAg8();
    const root = tmpFixture("js");
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ name: "demo", scripts: { test: "vitest" } }),
    );
    writeFileSync(join(root, "package-lock.json"), "{}");
    writeFileSync(join(root, "tsconfig.json"), "{}");

    const plane = discoverCapabilityPlane(root);
    expect(plane.languages.some((l: { id: string }) => l.id === "typescript")).toBe(
      true,
    );
    expect(plane.toolchains.some((t: { id: string }) => t.id === "npm")).toBe(true);
    expect(plane.briefForEngine).toMatch(/Languages:/);
    expect(plane.briefForEngine).toMatch(/typescript|javascript/);
  });

  it("detects pnpm from pnpm-lock.yaml", async () => {
    const { discoverCapabilityPlane } = await loadAg8();
    const root = tmpFixture("pnpm");
    writeFileSync(join(root, "package.json"), "{}");
    writeFileSync(join(root, "pnpm-lock.yaml"), "lockfileVersion: 9\n");
    const plane = discoverCapabilityPlane(root);
    expect(plane.toolchains.some((t: { id: string }) => t.id === "pnpm")).toBe(true);
  });

  it("detects Python from pyproject + requirements", async () => {
    const { discoverCapabilityPlane } = await loadAg8();
    const root = tmpFixture("py");
    writeFileSync(
      join(root, "pyproject.toml"),
      '[project]\nname="x"\n[tool.pytest.ini_options]\n',
    );
    writeFileSync(join(root, "requirements.txt"), "pytest\n");
    mkdirSync(join(root, ".venv", "bin"), { recursive: true });

    const plane = discoverCapabilityPlane(root);
    expect(plane.languages.some((l: { id: string }) => l.id === "python")).toBe(true);
    expect(plane.toolchains.some((t: { id: string }) => t.id === "pip")).toBe(true);
    expect(plane.toolchains.some((t: { id: string }) => t.id === "pytest")).toBe(true);
    expect(
      plane.languageIntelligence.some((l: { id: string }) => l.id === "python"),
    ).toBe(true);
  });

  it("detects Go from go.mod", async () => {
    const { discoverCapabilityPlane } = await loadAg8();
    const root = tmpFixture("go");
    writeFileSync(join(root, "go.mod"), "module example.com/x\n\ngo 1.22\n");
    const plane = discoverCapabilityPlane(root);
    expect(plane.languages.some((l: { id: string }) => l.id === "go")).toBe(true);
    expect(plane.toolchains.some((t: { id: string }) => t.id === "go")).toBe(true);
  });

  it("detects Rust from Cargo.toml", async () => {
    const { discoverCapabilityPlane } = await loadAg8();
    const root = tmpFixture("rust");
    writeFileSync(join(root, "Cargo.toml"), '[package]\nname="x"\nversion="0.1.0"\n');
    const plane = discoverCapabilityPlane(root);
    expect(plane.languages.some((l: { id: string }) => l.id === "rust")).toBe(true);
    expect(plane.toolchains.some((t: { id: string }) => t.id === "cargo")).toBe(true);
  });

  it("detects Java Maven and Gradle", async () => {
    const { discoverCapabilityPlane } = await loadAg8();
    const maven = tmpFixture("maven");
    writeFileSync(join(maven, "pom.xml"), "<project></project>\n");
    const mPlane = discoverCapabilityPlane(maven);
    expect(mPlane.languages.some((l: { id: string }) => l.id === "java")).toBe(true);
    expect(mPlane.toolchains.some((t: { id: string }) => t.id === "mvn")).toBe(true);

    const gradle = tmpFixture("gradle");
    writeFileSync(join(gradle, "build.gradle.kts"), "plugins {}\n");
    writeFileSync(join(gradle, "gradlew"), "#!/bin/sh\n");
    const gPlane = discoverCapabilityPlane(gradle);
    expect(gPlane.languages.some((l: { id: string }) => l.id === "java")).toBe(true);
    expect(gPlane.toolchains.some((t: { id: string }) => t.id === "gradlew")).toBe(
      true,
    );
  });

  it("detects C/C++ from CMakeLists and Makefile", async () => {
    const { discoverCapabilityPlane } = await loadAg8();
    const root = tmpFixture("cc");
    writeFileSync(join(root, "CMakeLists.txt"), "cmake_minimum_required(VERSION 3.20)\n");
    writeFileSync(join(root, "Makefile"), "all:\n\t@echo ok\n");
    writeFileSync(join(root, "compile_commands.json"), "[]\n");
    const plane = discoverCapabilityPlane(root);
    expect(plane.languages.some((l: { id: string }) => l.id === "c_cpp")).toBe(true);
    expect(plane.toolchains.some((t: { id: string }) => t.id === "cmake")).toBe(true);
    expect(plane.toolchains.some((t: { id: string }) => t.id === "make")).toBe(true);
  });

  it("detects Bazel from MODULE.bazel / WORKSPACE only", async () => {
    const { discoverCapabilityPlane } = await loadAg8();
    const root = tmpFixture("bazel");
    writeFileSync(join(root, "MODULE.bazel"), 'module(name = "x")\n');
    const plane = discoverCapabilityPlane(root);
    expect(plane.languages.some((l: { id: string }) => l.id === "bazel")).toBe(true);
  });

  it("LSP ready requires binary or clear config — extensions alone not enough", async () => {
    const { discoverCapabilityPlane } = await loadAg8();
    const root = tmpFixture("lsp-ext");
    writeFileSync(join(root, "package.json"), "{}");
    writeFileSync(join(root, "tsconfig.json"), "{}");
    // Extensions recommendations alone must not force LSP ready.
    mkdirSync(join(root, ".path-code"), { recursive: true });
    writeFileSync(
      join(root, ".path-code", "extensions-note.json"),
      JSON.stringify({ recommendations: ["ms-python.python"] }),
    );
    const plane = discoverCapabilityPlane(root, { homeDir: root });
    const ts = plane.languageIntelligence.find(
      (l: { id: string }) => l.id === "typescript",
    );
    expect(ts).toBeTruthy();
    if (!ts.serverBinary) {
      expect(ts.status).toBe("unavailable");
    }

    const withSettings = tmpFixture("lsp-settings");
    writeFileSync(join(withSettings, "go.mod"), "module x\n\ngo 1.22\n");
    // Project-scoped Copilot LSP config is valid readiness evidence (mandate §5).
    mkdirSync(join(withSettings, ".copilot"), { recursive: true });
    writeFileSync(
      join(withSettings, ".copilot", "lsp.json"),
      JSON.stringify({ gopls: { command: "gopls" } }),
    );
    const plane2 = discoverCapabilityPlane(withSettings, { homeDir: root });
    const goLsp = plane2.languageIntelligence.find(
      (l: { id: string }) => l.id === "go",
    );
    expect(goLsp?.status).toBe("ready");
  });

  it("whichBinary returns null for missing binaries", async () => {
    const { whichBinary } = await loadAg8();
    expect(whichBinary(`definitely-missing-bin-${randomUUID()}`)).toBeNull();
  });
});

describe("G8 MCP trust firewall", () => {
  it("discovers only project-local MCP configs", async () => {
    const { discoverProjectMcpConfigs } = await loadAg8();
    const root = tmpFixture("mcp-discover");
    writeFileSync(
      join(root, ".mcp.json"),
      JSON.stringify({
        mcpServers: {
          docs: {
            command: "npx",
            args: ["-y", "mcp-docs"],
            tools: [{ name: "list_docs", description: "list documentation" }],
          },
        },
      }),
    );
    mkdirSync(join(root, ".github"), { recursive: true });
    writeFileSync(
      join(root, ".github", "mcp.json"),
      JSON.stringify({
        servers: [
          {
            name: "search",
            command: "mcp-search",
            tools: [{ name: "search_code", description: "search the repo" }],
          },
        ],
      }),
    );
    mkdirSync(join(root, ".path-code"), { recursive: true });
    writeFileSync(
      join(root, ".path-code", "mcp.json"),
      JSON.stringify({
        mcpServers: {
          "bad name!!": { command: "evil" },
          ok_server: { command: "ok", tools: [{ name: "get_info" }] },
        },
      }),
    );

    const servers = discoverProjectMcpConfigs(root);
    expect(servers.length).toBeGreaterThanOrEqual(2);
    expect(servers.every((s: { name: string }) => /^[a-zA-Z0-9_-]+$/.test(s.name))).toBe(
      true,
    );
    expect(servers.some((s: { name: string }) => s.name === "docs")).toBe(true);
    expect(servers.some((s: { name: string }) => s.name === "ok_server")).toBe(true);
  });

  it("denies/hides malicious write and deploy tools", async () => {
    const { applyMcpTrustPolicy, classifyMcpToolTrust, toAntigravityMcpServers } =
      await loadAg8();

    expect(classifyMcpToolTrust("deploy_service", "deploy to production")).toBe(
      "external_mutation",
    );
    expect(classifyMcpToolTrust("write_file", "write a file in the workspace")).toBe(
      "workspace_mutation",
    );
    expect(classifyMcpToolTrust("list_files", "list files read-only")).toBe("read_only");

    const filtered = applyMcpTrustPolicy({
      name: "dangerous",
      command: "mcp-danger",
      tools: [
        { name: "list_files", description: "list files" },
        { name: "deploy_prod", description: "deploy and publish to cloud" },
        { name: "push_branch", description: "git push remote" },
        { name: "billing_charge", description: "charge billing account" },
      ],
    });

    // Mutation tools are hidden; read-only surface may still reach the engine.
    expect(filtered.trustClass).toBe("read_only");
    expect(filtered.enabled).toBe(true);
    expect(filtered.enabled_tools).toEqual(["list_files"]);
    expect(filtered.disabled_tools).toEqual(
      expect.arrayContaining(["deploy_prod", "push_branch", "billing_charge"]),
    );

    const refused = applyMcpTrustPolicy({
      name: "evil_only",
      command: "mcp-evil",
      tools: [
        { name: "deploy_prod", description: "deploy and publish to cloud" },
        { name: "billing_charge", description: "charge billing account" },
      ],
    });
    expect(refused.enabled).toBe(false);
    expect(refused.denialReason).toBeTruthy();

    const ag = toAntigravityMcpServers([filtered]);
    expect(ag).toHaveLength(1);
    expect(ag[0].enabled_tools).toEqual(["list_files"]);
    expect(ag[0].disabled_tools).toEqual(
      expect.arrayContaining(["deploy_prod", "push_branch", "billing_charge"]),
    );
  });

  it("strips credential env from project MCP config", async () => {
    const { applyMcpTrustPolicy, sanitizeMcpEnv, toAntigravityMcpServers } =
      await loadAg8();

    expect(
      sanitizeMcpEnv({
        PATH: "/usr/bin",
        HOME: "/tmp",
        NODE_ENV: "test",
        AWS_SECRET_ACCESS_KEY: "AKIASECRET",
        OPENAI_API_KEY: "sk-secret",
        GITHUB_TOKEN: "ghp_xxx",
        DATABASE_URL: "postgres://u:p@host/db",
      }),
    ).toEqual({
      PATH: "/usr/bin",
      HOME: "/tmp",
      NODE_ENV: "test",
    });

    const filtered = applyMcpTrustPolicy({
      name: "creds",
      command: "mcp-creds",
      env: {
        PATH: "/usr/bin",
        API_KEY: "should-not-pass",
        SECRET_TOKEN: "nope",
        LANG: "C",
      },
      tools: [{ name: "get_status", description: "read status info" }],
    });

    expect(filtered.env).toEqual({ PATH: "/usr/bin", LANG: "C" });
    expect(filtered.env).not.toHaveProperty("API_KEY");
    expect(filtered.env).not.toHaveProperty("SECRET_TOKEN");

    const ag = toAntigravityMcpServers([filtered]);
    expect(ag[0].env).toEqual({ PATH: "/usr/bin", LANG: "C" });
  });
});

describe("G8 handoff extraction", () => {
  it("extracts factual summary and bullets without CoT / provider names", async () => {
    const { extractEngineeringHandoff } = await loadAg8();
    const handoff = extractEngineeringHandoff(
      [
        "Thinking: I should reason about Antigravity and Claude step-by-step.",
        "Fixed the flaky timeout in session validation.",
        "- Updated timeout to 30s in session.mjs",
        "- Added regression test for cancel restore",
        "- Verified with npm test",
        "OpenAI suggested an alternate approach that was discarded.",
      ].join("\n"),
    );

    expect(handoff.summary.length).toBeGreaterThan(10);
    expect(handoff.summary.length).toBeLessThanOrEqual(400);
    expect(handoff.summary).not.toMatch(/Thinking:/i);
    expect(handoff.summary).not.toMatch(/\b(Claude|OpenAI|Antigravity)\b/i);
    expect(handoff.bullets.length).toBeGreaterThanOrEqual(2);
    expect(handoff.bullets.some((b: string) => /timeout/i.test(b))).toBe(true);
  });
});

describe("G8 copilot advisory gates", () => {
  it("shouldTriggerAdvisory only for known reasons", async () => {
    const { shouldTriggerAdvisory } = await loadAg8();
    expect(shouldTriggerAdvisory({ reason: "repeated_type_failure" })).toBe(true);
    expect(shouldTriggerAdvisory({ reason: "symbol_ambiguity" })).toBe(true);
    expect(shouldTriggerAdvisory({ reason: "operator_request" })).toBe(true);
    expect(shouldTriggerAdvisory({ reason: "final_diff_risk" })).toBe(true);
    expect(shouldTriggerAdvisory({ reason: "random" })).toBe(false);
  });

  it("runCopilotAdvisory returns unavailable when CLI missing", async () => {
    const { runCopilotAdvisory } = await loadAg8();
    const result = runCopilotAdvisory({
      question: "What does this type error mean?",
      cwd: tmpFixture("copilot"),
      executable: join(tmpdir(), `no-such-copilot-${randomUUID()}`),
    });
    expect(result.value).toBe("unavailable");
    expect(result.ok).toBe(false);
  });
});
