/**
 * S1 — gateway protocol / runtime / socket smoke tests (no live engines).
 */

import { mkdtempSync, rmSync, writeFileSync, realpathSync } from "node:fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { randomUUID } from "crypto";
import { spawnSync } from "child_process";
import { afterEach, describe, expect, it } from "vitest";

const CHECKOUT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const GATEWAY = join(CHECKOUT, "scripts/pathcode-cli/gateway/index.mjs");

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

async function loadGw() {
  return import(`${pathToFileURL(GATEWAY).href}?s1=${randomUUID()}`);
}

function tmpGitRepo() {
  const dir = mkdtempSync(join(tmpdir(), "pathcode-s1-"));
  temps.push(dir);
  spawnSync("git", ["init"], { cwd: dir, encoding: "utf8" });
  spawnSync("git", ["config", "user.email", "s1@test"], { cwd: dir });
  spawnSync("git", ["config", "user.name", "s1"], { cwd: dir });
  writeFileSync(join(dir, "README.md"), "s1\n");
  spawnSync("git", ["add", "."], { cwd: dir });
  spawnSync("git", ["commit", "-m", "init"], { cwd: dir });
  return dir;
}

describe("S1 gateway extraction", () => {
  it("exposes capability registry with collaborator engines and future slots", async () => {
    const { createGatewayRuntime } = await loadGw();
    const rt = createGatewayRuntime({
      runtimeRoot: mkdtempSync(join(tmpdir(), "gw-rt-")),
    });
    temps.push(rt.runtimeRoot);
    const caps = rt.listCapabilities();
    expect(caps.engines.some((e: { id: string }) => e.id === "antigravity")).toBe(
      true,
    );
    expect(caps.engines.some((e: { id: string }) => e.id === "copilot")).toBe(
      true,
    );
    const copilot = caps.engines.find((e: { id: string }) => e.id === "copilot");
    expect(copilot.role).toBe("engineering_collaborator");
    expect(caps.engines.some((e: { id: string }) => e.id === "cursor")).toBe(
      true,
    );
    expect(caps.extensibility.workflows).toContain("path_build_slot");
    expect(caps.extensibility.clients).toContain("studio_slot");
  });

  it(
    "binds a real git project and serves hello over the Unix socket",
    async () => {
    const prev = process.env.PATHCODE_GATEWAY_SKIP_BOOTSTRAP;
    process.env.PATHCODE_GATEWAY_SKIP_BOOTSTRAP = "1";
    try {
    const { createGatewayRuntime, startGatewayServer, createGatewayClient } =
      await loadGw();
    const repo = tmpGitRepo();
    const runtimeRoot = mkdtempSync(join(tmpdir(), "gw-sock-"));
    temps.push(runtimeRoot);
    const runtime = createGatewayRuntime({
      packageRoot: CHECKOUT,
      runtimeRoot,
    });
    const bound = await runtime.bindProject({ cwd: repo });
    expect(bound.ok).toBe(true);
    expect(bound.projectRoot).toBe(realpathSync(repo));

    const server = await startGatewayServer({ runtime, runtimeRoot });
    try {
      const client = createGatewayClient({
        socketPath: server.socketPath,
        runtimeRoot,
      });
      await client.connect();
      const hello = await client.hello("test");
      expect(hello.protocolVersion).toBe(1);
      expect(hello.gatewayId).toBeTruthy();
      const caps = await client.listCapabilities();
      expect(caps.engines.length).toBeGreaterThanOrEqual(2);
      const status = await client.request("project.status", {});
      expect(status.result.projectRoot).toBe(realpathSync(repo));
      client.close();
    } finally {
      server.stop();
    }
    } finally {
      if (prev == null) delete process.env.PATHCODE_GATEWAY_SKIP_BOOTSTRAP;
      else process.env.PATHCODE_GATEWAY_SKIP_BOOTSTRAP = prev;
    }
  },
    30_000,
  );

  it("sanitizes credential-like fields from client events", async () => {
    const { sanitizeEventForClient } = await import(
      `${pathToFileURL(join(CHECKOUT, "scripts/pathcode-cli/gateway/protocol.mjs")).href}?s1=${randomUUID()}`
    );
    const cleaned = sanitizeEventForClient({
      type: "session.x",
      detail: "ok",
      apiKey: "secret",
      token: "t",
      password: "p",
    });
    expect(cleaned.detail).toBe("ok");
    expect(cleaned.apiKey).toBeUndefined();
    expect(cleaned.token).toBeUndefined();
    expect(cleaned.password).toBeUndefined();
  });

  it("gateway prompt adapter queues steering and cancel", async () => {
    const { createGatewayPromptAdapter } = await loadGw();
    const p = createGatewayPromptAdapter();
    p.beginCycle();
    expect(p.isCycleActive()).toBe(true);
    p.enqueueSteering("keep API");
    expect(p.drainSteering()).toEqual(["keep API"]);
    expect(p.drainSteering()).toEqual([]);
    p.requestCycleCancel();
    expect(p.isCycleCancelRequested()).toBe(true);
    p.endCycle();
  });
});
