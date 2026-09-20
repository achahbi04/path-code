/**
 * B1 — Honest greenfield origin + live product preview falsification (F1–F7).
 */
import { describe, it, expect, afterEach } from "vitest";
import {
  createHash,
  randomUUID,
} from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
  realpathSync,
  readdirSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir, homedir } from "node:os";
import { createServer } from "node:net";

import {
  ensureBuildOrigin,
  isBindableProject,
  createBuildController,
  createBuildRuntimeManager,
  startPathBuildSurface,
  HOME_BINDING_GUARD,
  assertAllowedProjectRoot,
} from "../../scripts/pathcode-cli/build/index.mjs";
import {
  resolveTargetProjectRoot,
} from "../../scripts/pathcode-cli/paths.mjs";
import { resolvePathPackageRoot } from "../../scripts/pathcode-cli/paths.mjs";

function canon(p: string) {
  try {
    return realpathSync(p);
  } catch {
    return resolve(p);
  }
}

function sha256(buf: string | Buffer) {
  return createHash("sha256").update(buf).digest("hex");
}

async function portInUse(port: number): Promise<boolean> {
  return new Promise((resolvePort) => {
    const s = createServer();
    s.once("error", () => resolvePort(true));
    s.listen(port, "127.0.0.1", () => {
      s.close(() => resolvePort(false));
    });
  });
}

describe("B1 Part 1 — honest greenfield origin (F1–F3)", () => {
  const temps: string[] = [];

  afterEach(() => {
    HOME_BINDING_GUARD.enabled = true;
    for (const t of temps.splice(0)) {
      try {
        rmSync(t, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });

  it("F1: empty PATH Builds child walks to $HOME BEFORE exactRoot; AFTER binds Build folder", () => {
    const home = canon(homedir());
    expect(existsSync(join(home, "Public"))).toBe(true);

    const slug = `b1-f1-${randomUUID().slice(0, 8)}`;
    const target = join(home, "PATH Builds", slug);
    mkdirSync(target, { recursive: true });
    temps.push(target);

    expect(readdirSync(target).filter((n) => n !== ".DS_Store")).toHaveLength(0);
    expect(isBindableProject(target)).toBe(false);

    // Reconstruct the historical failure mode: unversioned walk with guard off.
    HOME_BINDING_GUARD.enabled = false;
    const before = resolveTargetProjectRoot(target);
    expect(before.ok).toBe(true);
    if (!before.ok) return;
    expect(canon(before.projectRoot)).toBe(home);

    HOME_BINDING_GUARD.enabled = true;
    const afterWalk = resolveTargetProjectRoot(target);
    expect(afterWalk.ok).toBe(false);

    const origin = ensureBuildOrigin({ targetDir: target, exactRoot: true });
    expect(origin.ok).toBe(true);
    if (!origin.ok) return;
    expect(canon(origin.binding.projectRoot)).toBe(canon(target));
    expect(origin.binding.originGitInit).toBe(true);
    expect(canon(origin.binding.projectRoot)).not.toBe(home);
    expect(existsSync(join(target, ".git"))).toBe(true);
  });

  it("F2: $HOME bind is refused; corrupt guard → succeeds; restore → refused", async () => {
    const home = canon(homedir());
    const runtimeRoot = mkdtempSync(join(tmpdir(), "b1-f2-rt-"));
    temps.push(runtimeRoot);

    const refuse = assertAllowedProjectRoot(home);
    expect(refuse.ok).toBe(false);
    if (refuse.ok) return;
    expect(refuse.code).toMatch(/HOME/);

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

    const blocked = await controller.startBuild("Should not bind home", {
      targetDir: home,
      originKind: "build-created",
    });
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(String(blocked.code || "")).toMatch(/HOME|ORIGIN/);

    // Corrupt the guard — force-bind path can now admit $HOME via walk.
    HOME_BINDING_GUARD.enabled = false;
    const empty = join(home, "PATH Builds", `b1-f2-corrupt-${randomUUID().slice(0, 6)}`);
    mkdirSync(empty, { recursive: true });
    temps.push(empty);
    const corruptedWalk = resolveTargetProjectRoot(empty);
    expect(corruptedWalk.ok).toBe(true);
    if (!corruptedWalk.ok) return;
    expect(canon(corruptedWalk.projectRoot)).toBe(home);

    const allowedWhileCorrupt = assertAllowedProjectRoot(home);
    expect(allowedWhileCorrupt.ok).toBe(true);

    // Restore — refuse again.
    HOME_BINDING_GUARD.enabled = true;
    const restored = assertAllowedProjectRoot(home);
    expect(restored.ok).toBe(false);
    const restoredWalk = resolveTargetProjectRoot(empty);
    expect(restoredWalk.ok).toBe(false);
    const blockedAgain = await controller.startBuild("Still refuse home", {
      targetDir: home,
      originKind: "existing-project",
    });
    expect(blockedAgain.ok).toBe(false);
  });

  it("F3: bound projectRoot === artifact === UI field === Open-folder target", async () => {
    const runtimeRoot = mkdtempSync(join(tmpdir(), "b1-f3-rt-"));
    temps.push(runtimeRoot);
    const packageRoot = resolvePathPackageRoot();
    const surface = await startPathBuildSurface({
      packageRoot,
      runtimeRoot,
      openBrowser: false,
      fakeMode: true,
      autoLoop: false,
      port: 0,
    });

    try {
      const targetDir = join(homedir(), "PATH Builds", `b1-f3-${randomUUID().slice(0, 6)}`);
      temps.push(targetDir);

      const started = await fetch(new URL("/api/builds", surface.url), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outcome: "Build a tiny ICE emergency website",
          targetDir,
          originKind: "build-created",
        }),
      });
      const body = (await started.json()) as {
        ok?: boolean;
        buildId?: string;
        projectRoot?: string;
        view?: {
          projectRoot?: string;
          binding?: { projectRoot?: string };
        };
      };
      expect(started.status).toBe(200);
      expect(body.ok).toBe(true);

      const bound = canon(body.projectRoot || "");
      expect(bound).toBe(canon(targetDir));
      expect(bound).not.toBe(canon(homedir()));
      expect(body.view?.projectRoot).toBeDefined();
      expect(canon(body.view?.projectRoot || "")).toBe(bound);
      expect(body.view?.binding?.projectRoot
        ? canon(body.view.binding.projectRoot)
        : bound).toBe(bound);

      // Seed a static artifact so Open-folder still targets the same root.
      writeFileSync(
        join(targetDir, "index.html"),
        "<!doctype html><title>ICE</title><h1>ICE</h1>\n",
      );

      const open = await fetch(new URL("/api/open-folder", surface.url), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buildId: body.buildId }),
      });
      const openBody = (await open.json()) as {
        ok?: boolean;
        path?: string;
        launched?: boolean;
      };
      expect(open.status).toBe(200);
      expect(openBody.ok).toBe(true);
      expect(openBody.path).toBeDefined();
      expect(canon(openBody.path!)).toBe(bound);
      expect(openBody.launched).toBe(true);
    } finally {
      await surface.stop();
    }
  }, 60_000);
});

describe("B1 Part 2 — live product runtime + preview (F4–F7)", () => {
  const temps: string[] = [];
  let manager: ReturnType<typeof createBuildRuntimeManager> | null = null;

  afterEach(async () => {
    if (manager) {
      await manager.stopAll();
      manager = null;
    }
    for (const t of temps.splice(0)) {
      try {
        rmSync(t, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });

  it("F4: served bytes hash matches on-disk artifact", async () => {
    const runtimeRoot = mkdtempSync(join(tmpdir(), "b1-f4-rt-"));
    const project = mkdtempSync(join(tmpdir(), "b1-f4-proj-"));
    temps.push(runtimeRoot, project);
    const html =
      "<!doctype html><html><body><h1>ICE Emergency Lifeline</h1><p>Call trusted contacts.</p></body></html>\n";
    writeFileSync(join(project, "index.html"), html);
    const diskHash = sha256(html);

    manager = createBuildRuntimeManager({ runtimeRoot });
    const started = await manager.start("b1-f4", project, { bindingId: "b" });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.runtime.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\//);

    const res = await fetch(started.runtime.url);
    const served = Buffer.from(await res.arrayBuffer());
    expect(sha256(served)).toBe(diskHash);
    expect(served.toString("utf8")).toContain("ICE Emergency Lifeline");
  }, 30_000);

  it("F5: dead-process honesty — failed start shows no live preview", async () => {
    const runtimeRoot = mkdtempSync(join(tmpdir(), "b1-f5-rt-"));
    const project = mkdtempSync(join(tmpdir(), "b1-f5-proj-"));
    temps.push(runtimeRoot, project);

    writeFileSync(
      join(project, "package.json"),
      JSON.stringify({
        name: "fail-preview",
        scripts: {
          start: "node -e \"console.error('INTENTIONAL_START_FAIL'); process.exit(7)\"",
          // No index.html → forces spawn path (dev_server), not static.
        },
      }),
    );
    writeFileSync(
      join(project, "server.js"),
      "console.error('should not run');\n",
    );

    manager = createBuildRuntimeManager({ runtimeRoot });
    const started = await manager.start("b1-f5", project, { bindingId: "b" });
    expect(started.ok).toBe(false);
    expect(started.runtime?.status).toMatch(/failed|unavailable|exited/);
    expect(started.runtime?.stderrTail || "").toMatch(/INTENTIONAL_START_FAIL/);
    expect(started.runtime?.exitCode).toBe(7);
    const preview = manager.getPreviewDescriptor("b1-f5");
    expect(preview.status).not.toBe("ready");
    expect(preview.url).toBeNull();
    expect(preview.embedPath).toBeNull();

    // Restore to a working static artifact → preview returns.
    writeFileSync(
      join(project, "index.html"),
      "<!doctype html><h1>Restored ICE</h1>\n",
    );
    // Prefer static when index.html exists.
    const restored = await manager.start("b1-f5", project, {
      bindingId: "b",
      forceRestart: true,
    });
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.runtime.status).toBe("ready");
    expect(manager.getPreviewDescriptor("b1-f5").status).toBe("ready");
    const page = await fetch(restored.runtime.url);
    expect(await page.text()).toMatch(/Restored ICE/);
  }, 90_000);

  it("F6: change-reflection — served hash tracks on-disk hash", async () => {
    const runtimeRoot = mkdtempSync(join(tmpdir(), "b1-f6-rt-"));
    const project = mkdtempSync(join(tmpdir(), "b1-f6-proj-"));
    temps.push(runtimeRoot, project);
    const indexPath = join(project, "index.html");
    writeFileSync(indexPath, "<!doctype html><h1>Version A</h1>\n");

    manager = createBuildRuntimeManager({ runtimeRoot });
    const started = await manager.start("b1-f6", project);
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    const a = await fetch(started.runtime.url);
    const aBuf = Buffer.from(await a.arrayBuffer());
    expect(sha256(aBuf)).toBe(sha256(readFileSync(indexPath)));

    writeFileSync(indexPath, "<!doctype html><h1>Version B — visible change</h1>\n");
    const b = await fetch(started.runtime.url);
    const bBuf = Buffer.from(await b.arrayBuffer());
    expect(sha256(bBuf)).toBe(sha256(readFileSync(indexPath)));
    expect(bBuf.toString("utf8")).toMatch(/Version B/);
    expect(sha256(bBuf)).not.toBe(sha256(aBuf));
  }, 30_000);

  it("F7: start/stop/restart — no duplicate process, no orphaned port", async () => {
    const runtimeRoot = mkdtempSync(join(tmpdir(), "b1-f7-rt-"));
    const project = mkdtempSync(join(tmpdir(), "b1-f7-proj-"));
    temps.push(runtimeRoot, project);
    writeFileSync(join(project, "index.html"), "<!doctype html><h1>Port owner</h1>\n");

    manager = createBuildRuntimeManager({ runtimeRoot });
    const first = await manager.start("b1-f7", project);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const port = first.runtime.port as number;
    const url = first.runtime.url as string;

    const reused = await manager.start("b1-f7", project);
    expect(reused.ok).toBe(true);
    if (!reused.ok) return;
    expect(reused.reused).toBe(true);
    expect(reused.runtime.port).toBe(port);

    await manager.stop("b1-f7");
    await new Promise((r) => setTimeout(r, 200));
    expect(await portInUse(port)).toBe(false);
    await expect(fetch(url, { signal: AbortSignal.timeout(1500) })).rejects.toThrow();

    const restarted = await manager.start("b1-f7", project, { forceRestart: true });
    expect(restarted.ok).toBe(true);
    if (!restarted.ok) return;
    expect(restarted.runtime.status).toBe("ready");
    const page = await fetch(restarted.runtime.url);
    expect(await page.text()).toMatch(/Port owner/);
    await manager.stop("b1-f7");
  }, 45_000);
});
