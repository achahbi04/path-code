/**
 * G9 — corrupt install rebuild + cancel-during-provision recovery APIs.
 */

import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  chmodSync,
  rmSync,
  existsSync,
} from "node:fs";
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
  const dir = mkdtempSync(join(tmpdir(), `pathcode-g9-fail-${label}-`));
  temps.push(dir);
  return dir;
}

async function loadAg9() {
  return import(`${pathToFileURL(AG9).href}?g9=${randomUUID()}`);
}

describe("G9 failure matrix — corrupt / cancel recovery", () => {
  it("classifies corrupt PATH-runtime binary as BROKEN", async () => {
    const { ensureAg9RuntimeDirs, classifyRequirement } = await loadAg9();
    const runtimeRoot = tmpFixture("corrupt-rt");
    const projectRoot = tmpFixture("corrupt-proj");
    const dirs = ensureAg9RuntimeDirs(runtimeRoot);
    const binDir = join(dirs.languageServers, "bin");
    mkdirSync(binDir, { recursive: true });
    const broken = join(binDir, "gopls");
    // Non-executable / empty file that exists → health probe fails → BROKEN.
    writeFileSync(broken, "");
    chmodSync(broken, 0o644);

    const classified = classifyRequirement(
      {
        id: "lsp:go",
        kind: "lsp",
        miseTool: "gopls",
        bins: ["gopls"],
        evidence: ["fixture"],
      },
      { runtimeRoot, projectRoot },
    );
    expect(classified.status).toBe("BROKEN");
    expect(classified.executable).toBe(broken);
  });

  it("provisionRequirements treats BROKEN as acquire target (rebuild path)", async () => {
    const { provisionRequirements } = await loadAg9();
    const runtimeRoot = tmpFixture("rebuild-rt");
    const projectRoot = tmpFixture("rebuild-proj");

    // Abort immediately so we do not download — proves BROKEN enters acquire loop.
    const ac = new AbortController();
    ac.abort();

    const result = await provisionRequirements(
      [
        {
          id: "lsp:go",
          kind: "lsp",
          status: "BROKEN",
          miseTool: "gopls",
          bins: ["gopls"],
          executable: join(runtimeRoot, "language-servers", "bin", "gopls"),
          evidence: ["corrupt fixture"],
        },
      ],
      { runtimeRoot, projectRoot, signal: ac.signal },
    );

    expect(result.failed.some((f: { id?: string; error?: string }) => f.id === "lsp:go")).toBe(
      true,
    );
    expect(
      result.failed.some(
        (f: { error?: string }) =>
          String(f.error || "").includes("aborted") ||
          result.briefLines.some((l: string) => /FAILED|aborted/i.test(l)),
      ) || result.briefLines.some((l: string) => /lsp:go/i.test(l)),
    ).toBe(true);
  });

  it("prepareEngineeringEnvironment returns abortedResult when signal already aborted", async () => {
    const { prepareEngineeringEnvironment, ensureAg9RuntimeDirs } =
      await loadAg9();
    const runtimeRoot = tmpFixture("cancel-rt");
    const projectRoot = tmpFixture("cancel-proj");
    ensureAg9RuntimeDirs(runtimeRoot);
    writeFileSync(
      join(projectRoot, "package.json"),
      JSON.stringify({ name: "cancel-fixture", version: "1.0.0" }),
    );

    const ac = new AbortController();
    ac.abort();
    const prepared = await prepareEngineeringEnvironment({
      projectRoot,
      runtimeRoot,
      signal: ac.signal,
      startServices: false,
    });

    expect(prepared.capabilityBrief).toMatch(/aborted/i);
    expect(prepared.scip?.reason).toBe("aborted");
    expect(prepared.affected?.source).toBe("aborted");
    expect(prepared.dirs?.root).toBeTruthy();
  });

  it("detectProjectServices reports compose evidence without requiring docker", async () => {
    const { detectProjectServices } = await loadAg9();
    const projectRoot = tmpFixture("compose");
    writeFileSync(
      join(projectRoot, "compose.yaml"),
      "services:\n  web:\n    image: nginx:alpine\n",
    );
    const detected = detectProjectServices(projectRoot);
    expect(detected.composeFile).toBeTruthy();
    expect(detected.evidence).toContain("compose.yaml");
    expect(existsSync(String(detected.composeFile))).toBe(true);
  });
});
