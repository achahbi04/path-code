/**
 * Phase 4 follow-up — restart must rematerialize a renderable preview, not
 * only durable SHA/embedPath metadata.
 */
import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

import {
  readBuildRecord,
  startPathBuildSurface,
  writeBuildRecord,
} from "../../scripts/pathcode-cli/build/index.mjs";
import { resolvePathPackageRoot } from "../../scripts/pathcode-cli/paths.mjs";
import {
  previewFrameSrc,
  previewNeedsCommit,
  previewTransition,
} from "../../scripts/pathcode-cli/build/surface/public/view-revision.js";

describe("Phase 4 restart renders last-good preview", () => {
  const temps: string[] = [];

  afterEach(async () => {
    for (const t of temps.splice(0)) {
      try {
        rmSync(t, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });

  it("keep/hold with unloaded frame still requires iframe commit", () => {
    const durable = previewFrameSrc("/preview/build-1/", "abc123");
    const keep = previewTransition({
      heldSrc: durable,
      nextReady: true,
      nextSrc: durable,
    });
    expect(keep.action).toBe("keep");
    // Restart painted nothing yet — same URL must still commit.
    expect(previewNeedsCommit(keep, "")).toBe(true);
    expect(previewNeedsCommit(keep, durable)).toBe(false);

    const hold = previewTransition({
      heldSrc: "/preview/build-1/?rev=old",
      nextReady: false,
      preparing: true,
    });
    expect(hold.action).toBe("hold");
    expect(previewNeedsCommit(hold, "")).toBe(true);
    expect(previewNeedsCommit(hold, hold.src)).toBe(false);
  });

  it("after runtime stop (restart simulation), open rematerializes HTML at embedPath", async () => {
    const runtimeRoot = mkdtempSync(join(tmpdir(), "p4-render-rt-"));
    temps.push(runtimeRoot);
    const surface = await startPathBuildSurface({
      packageRoot: resolvePathPackageRoot(),
      runtimeRoot,
      openBrowser: false,
      fakeMode: true,
      autoLoop: false,
      port: 0,
    });
    const targetDir = join(mkdtempSync(join(tmpdir(), "p4-render-proj-")), "site");
    temps.push(dirname(targetDir));
    try {
      const created = await fetch(new URL("/api/builds", surface.url), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outcome: "Dark mode homepage",
          targetDir,
          originKind: "build-created",
          autoRun: false,
        }),
      });
      expect(created.status).toBe(200);
      const body = (await created.json()) as { buildId: string };
      const marker = `<!doctype html><title>Dark</title><h1>Phase4 Last Good</h1>\n`;
      writeFileSync(join(targetDir, "index.html"), marker);
      const git = (...args: string[]) =>
        execFileSync("git", args, { cwd: targetDir, encoding: "utf8" }).trim();
      git("add", "-A");
      git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "site");
      const sha = git("rev-parse", "HEAD");
      const record = readBuildRecord(runtimeRoot, body.buildId)!;
      writeBuildRecord(runtimeRoot, {
        ...record,
        authoritativeSha: sha,
        lastAppliedCandidate: {
          taskId: "applied-1",
          adoptedSha: sha,
          at: "2026-01-01T00:00:00.000Z",
        },
        lastGoodPreview: {
          embedPath: `/preview/${body.buildId}/`,
          sha,
          at: "2026-01-01T00:00:00.000Z",
        },
        loop: { ...record.loop, status: "complete" },
        coordinator: { ...(record.coordinator || {}), autoRun: false },
      });

      // First open starts runtime and serves HTML.
      const open1 = await fetch(new URL(`/api/builds/${body.buildId}`, surface.url));
      const view1 = (await open1.json()) as {
        preview?: { status?: string; embedPath?: string };
        lastGoodPreview?: { sha?: string; embedPath?: string };
      };
      expect(view1.lastGoodPreview?.sha).toBe(sha);
      expect(view1.preview?.status).toBe("ready");
      expect(view1.preview?.embedPath).toBeTruthy();
      const page1 = await fetch(new URL(view1.preview!.embedPath!, surface.url));
      expect(page1.status).toBe(200);
      expect(await page1.text()).toMatch(/Phase4 Last Good/);

      // Simulate Builder restart: stop the product runtime. Persist identity.
      const stopped = await fetch(
        new URL(`/api/builds/${body.buildId}/runtime`, surface.url),
        { method: "DELETE" },
      );
      expect(stopped.status).toBe(200);

      // Direct embed must rematerialize — not stay PREVIEW_UNAVAILABLE forever.
      const page2 = await fetch(
        new URL(`/preview/${encodeURIComponent(body.buildId)}/`, surface.url),
      );
      expect(page2.status).toBe(200);
      expect(await page2.text()).toMatch(/Phase4 Last Good/);

      const open2 = await fetch(new URL(`/api/builds/${body.buildId}`, surface.url));
      const view2 = (await open2.json()) as {
        preview?: { status?: string; embedPath?: string };
        lastGoodPreview?: { sha?: string };
      };
      expect(view2.lastGoodPreview?.sha).toBe(sha);
      expect(view2.preview?.status).toBe("ready");
      const page3 = await fetch(new URL(view2.preview!.embedPath!, surface.url));
      expect(page3.status).toBe(200);
      expect(await page3.text()).toMatch(/Phase4 Last Good/);
    } finally {
      await surface.stop();
    }
  }, 90_000);
});
