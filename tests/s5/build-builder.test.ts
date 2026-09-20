/**
 * S5 — Build origin exact-root + artifact/runtime/builder regressions.
 */
import { describe, it, expect, afterEach } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  existsSync,
  realpathSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir, homedir } from "node:os";
import { resolve } from "node:path";

import {
  ensureBuildOrigin,
  createBuildController,
  deriveProductBrief,
  parseProductBriefResult,
  detectBuildArtifact,
  createBuildRuntimeManager,
  startPathBuildSurface,
  projectBuildForSurface,
} from "../../scripts/pathcode-cli/build/index.mjs";
import { resolveTargetProjectRoot } from "../../scripts/pathcode-cli/paths.mjs";
import { resolvePathPackageRoot } from "../../scripts/pathcode-cli/paths.mjs";

function canon(p: string) {
  try {
    return realpathSync(p);
  } catch {
    return resolve(p);
  }
}

describe("S5 Build exact-origin identity", () => {
  const temps: string[] = [];

  afterEach(() => {
    for (const t of temps.splice(0)) {
      try {
        rmSync(t, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });

  it("build-created child under a home-like parent never binds $HOME", () => {
    // Simulate PATH Builds under a directory that looks like a project (Public + json).
    const fakeHome = mkdtempSync(join(tmpdir(), "path-build-homeish-"));
    temps.push(fakeHome);
    mkdirSync(join(fakeHome, "Public"), { recursive: true });
    writeFileSync(join(fakeHome, "Public", ".localized"), "");
    writeFileSync(join(fakeHome, ".claude.json"), "{}\n");
    const buildsRoot = join(fakeHome, "PATH Builds");
    const target = join(buildsRoot, "ice-site-abc123");
    mkdirSync(target, { recursive: true });

    // Upward discovery WOULD admit fakeHome without exactRoot protection.
    const walked = resolveTargetProjectRoot(target);
    // May or may not succeed depending on marker logic — exact origin must ignore it.
    void walked;

    const origin = ensureBuildOrigin({ targetDir: target, exactRoot: true });
    expect(origin.ok).toBe(true);
    if (!origin.ok) return;
    expect(origin.binding.projectRoot).toBe(canon(target));
    expect(origin.binding.originKind).toBe("build-created");
    expect(origin.binding.projectRoot).not.toBe(canon(fakeHome));
    expect(existsSync(join(target, ".git"))).toBe(true);
  });

  it("controller startBuild with originKind build-created binds exact targetDir", async () => {
    const runtimeRoot = mkdtempSync(join(tmpdir(), "path-build-rt-"));
    const target = mkdtempSync(join(tmpdir(), "path-build-proj-"));
    temps.push(runtimeRoot, target);

    const controller = createBuildController({
      runtimeRoot,
      fakeMode: true,
      gateway: {
        async bindProject() {
          return { ok: true };
        },
        async startTask() {
          return { ok: true, taskId: "t1" };
        },
      },
    });

    const started = await controller.startBuild(
      "Build an emergency website for ICE",
      { targetDir: target, originKind: "build-created" },
    );
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.projectRoot).toBe(canon(target));
    expect(started.build.projectBindings[0]!.projectRoot).toBe(canon(target));
    expect(started.build.projectBindings[0]!.originKind).toBe("build-created");
    expect(started.build.outcomeCriteria.length).toBeGreaterThan(2);
    expect(
      started.build.outcomeCriteria.some((c) => /landing|hero|cta|render|website|page/i.test(c.statement)),
    ).toBe(true);
  });
});

describe("S5 product brief + artifact detection", () => {
  it("derives concrete criteria beyond the two generics", () => {
    const brief = deriveProductBrief(
      "Build an emergency website for ICE. Explain the product clearly.",
    );
    expect(brief.productKind).toBe("web");
    expect(brief.acceptanceCriteria.length).toBeGreaterThan(2);
    const ids = brief.acceptanceCriteria.map((c) => c.id);
    expect(ids).toContain("c-runnable");
    expect(ids).toContain("c-outcome");
  });

  it("validates cognitive ProductBrief envelopes and rejects stale intent", () => {
    const envelope = {
      version: 1,
      buildId: "build-1",
      intentRevision: 3,
      revision: 2,
      productKind: "web",
      summary: "A focused emergency response site",
      functionalRequirements: ["Explain the response workflow"],
      visualRequirements: ["Present a clear primary action"],
      nonFunctionalRequirements: ["Responsive"],
      constraints: ["Runs locally"],
      acceptanceCriteria: [
        {
          id: "c-action",
          statement: "The primary action is visible and usable",
          required: true,
          evidenceKinds: ["evaluation", "challenge"],
        },
      ],
      assumptions: [],
      openQuestions: [],
    };
    const accepted = parseProductBriefResult(
      `\`\`\`path-build-product-brief\n${JSON.stringify(envelope)}\n\`\`\``,
      { buildId: "build-1", intentRevision: 3 },
    );
    expect(accepted.ok).toBe(true);
    expect(accepted.brief?.source).toBe("cognitive");

    const stale = parseProductBriefResult(
      `\`\`\`path-build-product-brief\n${JSON.stringify(envelope)}\n\`\`\``,
      { buildId: "build-1", intentRevision: 4 },
    );
    expect(stale.ok).toBe(false);
    expect(stale.errors).toContain("intentRevision_mismatch");
  });

  it("detects static web artifact from index.html", () => {
    const dir = mkdtempSync(join(tmpdir(), "path-art-"));
    writeFileSync(
      join(dir, "index.html"),
      "<!doctype html><title>ICE</title><h1>ICE</h1>",
    );
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({
        name: "ice",
        scripts: { test: "node -e \"process.exit(0)\"", start: "npx serve -l 8080 ." },
      }),
    );
    const art = detectBuildArtifact(dir);
    expect(art.kind).toBe("web");
    expect(art.preview.capability).toBe("web");
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("S5 runtime manager + surface builder", () => {
  let surface: Awaited<ReturnType<typeof startPathBuildSurface>> | null = null;
  let runtimeRoot: string | null = null;
  let manager: ReturnType<typeof createBuildRuntimeManager> | null = null;

  afterEach(async () => {
    if (manager) {
      await manager.stopAll();
      manager = null;
    }
    if (surface) {
      await surface.stop();
      surface = null;
    }
    if (runtimeRoot) {
      try {
        rmSync(runtimeRoot, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
      runtimeRoot = null;
    }
  });

  it("starts static preview with cwd == project root", async () => {
    runtimeRoot = mkdtempSync(join(tmpdir(), "path-rtm-"));
    const project = mkdtempSync(join(tmpdir(), "path-static-"));
    writeFileSync(
      join(project, "index.html"),
      "<!doctype html><html><body><h1>Hello ICE</h1></body></html>",
    );
    manager = createBuildRuntimeManager({ runtimeRoot });
    const started = await manager.start("build-static-1", project, {
      bindingId: "bind-1",
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(canon(started.runtime.projectRoot)).toBe(canon(project));
    expect(started.runtime.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\//);
    const page = await fetch(started.runtime.url);
    const html = await page.text();
    expect(html).toMatch(/Hello ICE/);
    await manager.stop("build-static-1");
    rmSync(project, { recursive: true, force: true });
  }, 30_000);

  it("surface creates build-created root not equal to homedir", async () => {
    runtimeRoot = mkdtempSync(join(tmpdir(), "path-build-surface2-"));
    const packageRoot = resolvePathPackageRoot();
    surface = await startPathBuildSurface({
      packageRoot,
      runtimeRoot,
      openBrowser: false,
      fakeMode: true,
      autoLoop: false,
      port: 0,
    });

    const targetDir = join(runtimeRoot, "fresh-web");
    const started = await fetch(new URL("/api/builds", surface.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        outcome: "Build a tiny emergency website for ICE",
        targetDir,
        originKind: "build-created",
      }),
    });
    const body = (await started.json()) as {
      ok: boolean;
      projectRoot: string;
      view: {
        criteria: unknown[];
        conversation?: unknown[];
      };
    };
    expect(started.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(canon(body.projectRoot)).toBe(canon(targetDir));
    expect(canon(body.projectRoot)).not.toBe(canon(homedir()));
    expect(existsSync(join(targetDir, ".git"))).toBe(true);
    expect(body.view.criteria.length).toBeGreaterThan(2);
    expect(body.view.conversation?.length).toBeGreaterThan(0);

    const html = await (await fetch(surface.url)).text();
    expect(html).toMatch(/previewFrame|Product preview|chat/i);
    expect(html).not.toMatch(/Engines use your real PATH fabric/);
  }, 120_000);

  it("product view exposes preview-centric uiState", () => {
    const view = projectBuildForSurface({
      buildId: "b1",
      loop: { status: "running" },
      intent: { outcome: "Site", outcomeRevision: 1, explicitRequirements: [] },
      outcomeCriteria: [],
      projectBindings: [
        {
          bindingId: "x",
          projectRoot: "/tmp/app",
          originGitInit: true,
          originKind: "build-created",
        },
      ],
      children: [],
      hypotheses: {},
      conversation: [{ id: "1", role: "user", text: "Site", at: "t" }],
    }, {
      preview: { status: "ready", embedPath: "/preview/b1/", url: "http://127.0.0.1:9/" },
      runtime: { status: "ready", url: "http://127.0.0.1:9/" },
    });
    expect(view.uiState).toMatch(/ready|applying/);
    expect(view.preview.embedPath).toBe("/preview/b1/");
  });
});

describe("S5 completion cannot ignore derived criteria", () => {
  it("assessCompletion stays incomplete while derived required criteria are UNKNOWN", async () => {
    const runtimeRoot = mkdtempSync(join(tmpdir(), "path-build-complete-"));
    const target = mkdtempSync(join(tmpdir(), "path-build-cproj-"));
    const controller = createBuildController({
      runtimeRoot,
      fakeMode: true,
      gateway: {
        async bindProject() {
          return { ok: true };
        },
        async startTask() {
          return { ok: true, taskId: "t" };
        },
      },
    });
    const started = await controller.startBuild("Build a website with a hero CTA", {
      targetDir: target,
      originKind: "build-created",
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const build = started.build;
    // Prove only generics
    for (const c of build.outcomeCriteria) {
      if (c.id === "c-runnable" || c.id === "c-outcome") c.status = "PROVEN";
    }
    const { writeBuildRecord } = await import(
      "../../scripts/pathcode-cli/build/record.mjs"
    );
    writeBuildRecord(runtimeRoot, build);
    const assessment = controller.assessCompletion(build.buildId);
    expect(assessment.complete).toBe(false);
    expect(assessment.reason).toMatch(/criteria_unproven|evaluate_required|challenge_required/);
    rmSync(runtimeRoot, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  });
});
