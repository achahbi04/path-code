/**
 * Opening a paused Build shows the preview of its authoritative revision.
 */
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

import { startPathBuildSurface } from "../../scripts/pathcode-cli/build/index.mjs";
import { updateBuildRecord } from "../../scripts/pathcode-cli/build/record.mjs";
import { readBuildEvents } from "../../scripts/pathcode-cli/build/events.mjs";
import { resolvePathPackageRoot } from "../../scripts/pathcode-cli/paths.mjs";

type View = {
  status?: string;
  preview?: { status?: string; embedPath?: string | null; url?: string | null };
};

describe("paused Build preview on open", () => {
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

  async function openPaused(files: Record<string, string>) {
    const runtimeRoot = mkdtempSync(join(tmpdir(), "paused-preview-rt-"));
    temps.push(runtimeRoot);
    const surface = await startPathBuildSurface({
      packageRoot: resolvePathPackageRoot(),
      runtimeRoot,
      openBrowser: false,
      fakeMode: true,
      autoLoop: false,
      port: 0,
    });
    const targetDir = join(mkdtempSync(join(tmpdir(), "paused-preview-proj-")), "site");
    temps.push(dirname(targetDir));
    const created = await fetch(new URL("/api/builds", surface.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        outcome: "ICE emergency website",
        targetDir,
        originKind: "build-created",
        autoRun: false,
      }),
    });
    const body = (await created.json()) as { buildId: string };
    expect(created.status).toBe(200);
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(join(targetDir, name), content);
    }
    const git = (...args: string[]) =>
      execFileSync("git", args, { cwd: targetDir, encoding: "utf8" }).trim();
    if (Object.keys(files).length) {
      git("add", "-A");
      git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "site");
    }
    const sha = git("rev-parse", "HEAD");
    updateBuildRecord(runtimeRoot, body.buildId, (r) => {
      r.authoritativeSha = sha;
      r.loop.status = "paused";
      r.loop.pausedAt = new Date().toISOString();
      r.coordinator = { ...(r.coordinator || {}), autoRun: false };
      return r;
    });
    return { surface, runtimeRoot, buildId: body.buildId, sha };
  }

  it("starts the preview for a paused web Build and serves its revision", async () => {
    const { surface, buildId } = await openPaused({
      "index.html": "<!doctype html><title>ICE</title><h1>Restored ICE</h1>\n",
    });
    try {
      const res = await fetch(new URL(`/api/builds/${buildId}`, surface.url));
      const view = (await res.json()) as View;
      expect(view.status).toBe("paused");
      expect(view.preview?.status).toBe("ready");
      expect(view.preview?.embedPath).toBeTruthy();
      const page = await fetch(new URL(view.preview!.embedPath!, surface.url));
      expect(await page.text()).toMatch(/Restored ICE/);
    } finally {
      await surface.stop();
    }
  }, 60_000);

  it("does not start a runtime for a paused Build with no website", async () => {
    const { surface, runtimeRoot, buildId } = await openPaused({});
    try {
      for (let i = 0; i < 2; i += 1) {
        const res = await fetch(new URL(`/api/builds/${buildId}`, surface.url));
        expect(res.status).toBe(200);
      }
      const starts = readBuildEvents(runtimeRoot, buildId, { afterId: 0, limit: 1000 })
        .filter((e: { type: string }) => e.type.startsWith("runtime."));
      expect(starts).toHaveLength(0);
    } finally {
      await surface.stop();
    }
  }, 60_000);
});
