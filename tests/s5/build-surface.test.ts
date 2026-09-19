/**
 * S5 — PATH Build product surface smoke (not PATH Code CLI).
 */
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

import { projectBuildForSurface } from "../../scripts/pathcode-cli/build/surface/product-view.mjs";
import { startPathBuildSurface } from "../../scripts/pathcode-cli/build/surface/server.mjs";
import { resolvePathPackageRoot } from "../../scripts/pathcode-cli/paths.mjs";

describe("S5 PATH Build product surface", () => {
  /** @type {Awaited<ReturnType<typeof startPathBuildSurface>> | null} */
  let surface = null;
  /** @type {string | null} */
  let runtimeRoot = null;

  afterEach(async () => {
    if (surface) {
      await surface.stop();
      surface = null;
    }
    if (runtimeRoot) {
      try {
        rmSync(runtimeRoot, { recursive: true, force: true });
      } catch {
        // ignore
      }
      runtimeRoot = null;
    }
  });

  it("product view speaks product language for idle and complete", () => {
    const idle = projectBuildForSurface(null);
    expect(idle.phase).toBe("idle");
    expect(idle.headline).toMatch(/want to build/i);

    const complete = projectBuildForSurface({
      buildId: "b1",
      loop: { status: "complete" },
      intent: { outcome: "Inventory app", outcomeRevision: 1, explicitRequirements: [] },
      outcomeCriteria: [],
      projectBindings: [
        { bindingId: "x", projectRoot: "/tmp/app", originGitInit: true },
      ],
      children: [],
      hypotheses: {},
    });
    expect(complete.phase).toBe("complete");
    expect(complete.handoff?.projectRoot).toBe("/tmp/app");
    expect(JSON.stringify(complete)).not.toMatch(/\/build /);
  });

  it("localhost surface serves UI and starts a Build without pathcode REPL", async () => {
    runtimeRoot = mkdtempSync(join(tmpdir(), "path-build-surface-"));
    const packageRoot = resolvePathPackageRoot();
    surface = await startPathBuildSurface({
      packageRoot,
      runtimeRoot,
      openBrowser: false,
      fakeMode: true,
      port: 0,
    });

    const home = await fetch(surface.url);
    expect(home.status).toBe(200);
    const html = await home.text();
    expect(html).toMatch(/PATH Build/);
    expect(html).toMatch(/What do you want to build|inventory/i);
    expect(html).not.toMatch(/\/build help/);

    const css = await fetch(new URL("/assets/app.css", surface.url));
    expect(css.status).toBe(200);

    const targetDir = join(runtimeRoot, "fresh-app");
    const started = await fetch(new URL("/api/builds", surface.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        outcome: "Build a tiny offline hello CLI with a README",
        targetDir,
      }),
    });
    const body = await started.json();
    expect(started.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.buildId).toBeTruthy();
    expect(existsSync(join(targetDir, ".git"))).toBe(true);
    expect(body.view.phase).not.toBe("idle");
    expect(body.view.projectRoot).toBeTruthy();

    const latest = await fetch(new URL("/api/builds/latest", surface.url));
    const view = await latest.json();
    expect(view.buildId).toBe(body.buildId);
    expect(view.headline).toBeTruthy();
  }, 60_000);

  it("path-build entry module loads", async () => {
    const mod = await import(
      pathToFileURL(
        join(resolvePathPackageRoot(), "scripts/path-build.mjs"),
      ).href
    );
    expect(typeof mod.runPathBuildMain).toBe("function");
    expect(typeof mod.isDirectEntry).toBe("function");
  });
});
