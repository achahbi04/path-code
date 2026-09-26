/**
 * PATH Build operator shutdown — must return promptly and tear down owned
 * surface / coordinator / gateway processes without hanging on SSE.
 */
import { describe, expect, it, afterEach } from "vitest";
import { createServer } from "node:http";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import http from "node:http";

import {
  closeHttpServerBounded,
  isAlivePid,
  terminateOwnedPid,
  withTimeout,
} from "../../scripts/pathcode-cli/build/shutdown.mjs";
import { startPathBuildSurface } from "../../scripts/pathcode-cli/build/surface/server.mjs";
import { resolvePathPackageRoot } from "../../scripts/pathcode-cli/paths.mjs";
import { resolveBuildCoordinatorPidPath } from "../../scripts/pathcode-cli/build/coordinator/server.mjs";
import { readFileSync, existsSync } from "node:fs";

describe("PATH Build shutdown lifecycle", () => {
  let surface: Awaited<ReturnType<typeof startPathBuildSurface>> | null = null;
  let runtimeRoot: string | null = null;

  afterEach(async () => {
    if (surface) {
      await surface.stop({ teardownOwned: true });
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

  it("closeHttpServerBounded returns while a keep-alive response is open", async () => {
    const server = createServer((req, res) => {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        Connection: "keep-alive",
      });
      res.write(": keepalive\n\n");
      // Intentionally never end — mimics the Builder SSE stream.
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("no address");
    const port = addr.port;

    const held = await new Promise((resolve, reject) => {
      const req = http.get(`http://127.0.0.1:${port}/`, (res) => {
        resolve({ req, res });
      });
      req.on("error", reject);
    });

    const started = Date.now();
    await closeHttpServerBounded(server, 1_500);
    expect(Date.now() - started).toBeLessThan(3_000);
    held.req.destroy();
  });

  it("surface.stop returns promptly with an open SSE client and tears down fake coordinator", async () => {
    runtimeRoot = mkdtempSync(join(tmpdir(), "path-shutdown-rt-"));
    const packageRoot = resolvePathPackageRoot();
    surface = await startPathBuildSurface({
      packageRoot,
      runtimeRoot,
      openBrowser: false,
      fakeMode: true,
      host: "127.0.0.1",
      port: 0,
    });

    // Create a Build so /events has a real stream target.
    const created = await fetch(`${surface.url}api/builds`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcome: "Shutdown proof page" }),
    });
    expect(created.ok).toBe(true);
    const body = await created.json();
    const buildId = body?.build?.buildId || body?.view?.buildId;
    expect(buildId).toBeTruthy();

    const sse = await new Promise((resolve, reject) => {
      const req = http.get(
        `${surface.url}api/builds/${buildId}/events`,
        (res) => resolve({ req, res }),
      );
      req.on("error", reject);
    });

    const pidPath = resolveBuildCoordinatorPidPath(runtimeRoot);
    let coordinatorPid = null;
    if (existsSync(pidPath)) {
      coordinatorPid = Number(String(readFileSync(pidPath, "utf8")).split("\n")[0]);
    }

    const started = Date.now();
    await surface.stop({ teardownOwned: true });
    surface = null;
    expect(Date.now() - started).toBeLessThan(8_000);

    sse.req.destroy();
    if (Number.isFinite(coordinatorPid) && coordinatorPid > 0) {
      expect(isAlivePid(coordinatorPid)).toBe(false);
    }
  }, 30_000);

  it("withTimeout and terminateOwnedPid refuse self and are bounded", async () => {
    const started = Date.now();
    const value = await withTimeout(
      new Promise(() => {}),
      200,
      "fallback",
    );
    expect(value).toBe("fallback");
    expect(Date.now() - started).toBeLessThan(1_000);

    // Must never signal the current process (isAlivePid excludes self).
    const result = await terminateOwnedPid(process.pid);
    expect(result).toEqual({ ok: true, killed: false });
    expect(isAlivePid(process.pid)).toBe(false);
  });
});
