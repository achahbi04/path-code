/**
 * Running-code identity: the Builder reports the SHA its processes loaded,
 * and flags stale code once the checkout moves past it.
 */
import { describe, it, expect, afterEach } from "vitest";
import { cpSync, mkdtempSync, rmSync, appendFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { readBuildEvents, readBuildRecord } from "../../scripts/pathcode-cli/build/index.mjs";

const REPO = fileURLToPath(new URL("../..", import.meta.url));

type Proc = {
  role: string;
  sha: string | null;
  currentSha: string | null;
  stale: boolean;
  reasons: string[];
  pid: number | null;
};
type Serving = {
  sha: string | null;
  label: string;
  stale: boolean;
  exact: boolean;
  warnings: string[];
  processes: Proc[];
  coordinatorReused: boolean;
};

const proc = (serving: Serving, role: string) =>
  serving.processes.find((p) => p.role === role) as Proc;

describe("running Build identity", () => {
  const temps: string[] = [];
  const stops: Array<() => Promise<void>> = [];

  afterEach(async () => {
    for (const stop of stops.splice(0)) await stop().catch(() => {});
    for (const t of temps.splice(0)) {
      try {
        rmSync(t, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });

  it("reports the loaded SHA and flags stale code after a commit", async () => {
    const pkg = mkdtempSync(join(tmpdir(), "identity-pkg-"));
    const runtimeRoot = mkdtempSync(join(tmpdir(), "identity-rt-"));
    const target = mkdtempSync(join(tmpdir(), "identity-proj-"));
    temps.push(pkg, runtimeRoot, target);
    cpSync(join(REPO, "scripts"), join(pkg, "scripts"), { recursive: true });
    copyFileSync(join(REPO, "package.json"), join(pkg, "package.json"));
    const git = (...args: string[]) =>
      execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], {
        cwd: pkg,
        encoding: "utf8",
      }).trim();
    git("init", "-q");
    git("add", "-A");
    git("commit", "-q", "-m", "loaded");
    const loadedSha = git("rev-parse", "HEAD");

    const surfaceModule = pathToFileURL(
      join(pkg, "scripts/pathcode-cli/build/surface/server.mjs"),
    ).href;
    const { startPathBuildSurface } = await import(surfaceModule);
    const surface = await startPathBuildSurface({
      packageRoot: pkg,
      runtimeRoot,
      openBrowser: false,
      fakeMode: true,
      autoLoop: true,
      port: 0,
    });
    stops.push(() => surface.stop());
    const getJson = async (path: string) =>
      (await (await fetch(new URL(path, surface.url))).json()) as any;

    const fresh = (await getJson("/api/identity")) as Serving;
    expect(fresh.sha).toBe(loadedSha);
    expect(proc(fresh, "surface").sha).toBe(loadedSha);
    expect(proc(fresh, "coordinator").sha).toBe(loadedSha);
    expect(proc(fresh, "coordinator").pid).not.toBe(process.pid);
    expect(fresh.stale).toBe(false);
    expect(fresh.exact).toBe(true);
    expect(fresh.warnings).toEqual([]);

    const created = await fetch(new URL("/api/builds", surface.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        outcome: "Identity probe site",
        targetDir: join(target, "site"),
        originKind: "build-created",
        autoRun: false,
      }),
    });
    const { buildId } = (await created.json()) as { buildId: string };
    const firstView = await getJson(`/api/builds/${buildId}`);
    expect(firstView.serving.sha).toBe(loadedSha);
    const announced = readBuildEvents(runtimeRoot, buildId, { afterId: 0, limit: 1000 }).find(
      (e: { type: string }) => e.type === "surface.identity",
    );
    expect((announced?.data as any)?.surface?.sha).toBe(loadedSha);

    const running = await fetch(new URL("/api/builds", surface.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        outcome: "Identity dispatch probe",
        targetDir: join(target, "dispatch"),
        originKind: "build-created",
      }),
    });
    const runningId = ((await running.json()) as { buildId: string }).buildId;
    let dispatched: any = null;
    for (let i = 0; i < 100 && !dispatched; i += 1) {
      const record = readBuildRecord(runtimeRoot, runningId);
      dispatched = (record?.children || []).find((c: any) => c.dispatchedBy) || null;
      if (!dispatched) await new Promise((r) => setTimeout(r, 200));
    }
    expect(dispatched?.dispatchedBy?.coordinatorSha).toBe(loadedSha);
    expect(dispatched?.dispatchedBy?.coordinatorDirty).toBe(false);
    const loopIdentity = readBuildEvents(runtimeRoot, runningId, { afterId: 0, limit: 1000 }).find(
      (e: { type: string }) => e.type === "coordinator.identity",
    );
    expect((loopIdentity?.data as any)?.sha).toBe(loadedSha);
    await fetch(new URL(`/api/builds/${runningId}/stop`, surface.url), { method: "POST" });

    appendFileSync(join(pkg, "scripts/pathcode-cli/build/controller.mjs"), "\n// changed\n");
    git("commit", "-q", "-am", "moved");
    const checkoutSha = git("rev-parse", "HEAD");
    expect(checkoutSha).not.toBe(loadedSha);
    await new Promise((r) => setTimeout(r, 1_100));

    const view = await getJson(`/api/builds/${buildId}`);
    const moved = view.serving as Serving;
    expect(moved.sha).toBe(loadedSha);
    expect(moved.stale).toBe(true);
    for (const role of ["surface", "coordinator"]) {
      expect(proc(moved, role).sha).toBe(loadedSha);
      expect(proc(moved, role).currentSha).toBe(checkoutSha);
      expect(proc(moved, role).reasons).toContain("checkout_moved");
    }
    expect(moved.warnings.join("\n")).toContain(loadedSha.slice(0, 7));
    expect(moved.warnings.join("\n")).toContain(checkoutSha.slice(0, 7));

    // A Builder started after the commit reuses the coordinator that still
    // runs the old code: the new surface is current, the coordinator is not.
    const probe = `
      const { startPathBuildSurface } = await import(${JSON.stringify(surfaceModule)});
      const s = await startPathBuildSurface(${JSON.stringify({
        packageRoot: pkg,
        runtimeRoot,
        openBrowser: false,
        fakeMode: true,
        autoLoop: false,
        port: 0,
      })});
      process.stdout.write(JSON.stringify(await s.identity()));
      process.exit(0);
    `;
    const second = JSON.parse(
      execFileSync(process.execPath, ["--input-type=module", "-e", probe], {
        encoding: "utf8",
        timeout: 60_000,
      }),
    ) as Serving;
    expect(second.coordinatorReused).toBe(true);
    expect(proc(second, "surface").sha).toBe(checkoutSha);
    expect(proc(second, "surface").stale).toBe(false);
    expect(proc(second, "coordinator").sha).toBe(loadedSha);
    expect(proc(second, "coordinator").stale).toBe(true);
    expect(second.stale).toBe(true);
    expect(second.warnings.some((w) => /coordinator/i.test(w))).toBe(true);
  }, 120_000);
});
