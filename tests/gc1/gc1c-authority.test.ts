/**
 * GC1C-B — model injection refused; host owns preparation.
 */

import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const CHECKOUT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const GC1 = join(CHECKOUT, "scripts/pathcode-cli/gc1");
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

async function load() {
  const b = randomUUID();
  return {
    ...(await import(`${pathToFileURL(join(GC1, "mock-transport.mjs")).href}?b=${b}`)),
    ...(await import(`${pathToFileURL(join(GC1, "cloud-effects.mjs")).href}?b=${b}`)),
  };
}

describe("GC1C-B execution authority", () => {
  it("refuses unre-mapped /Users paths and backend/workstation injection fields", async () => {
    const { createCloudEffectsBackend, createMockWorkstationTransport, refuseModelInjection } =
      await load();
    const transport = createMockWorkstationTransport();
    const primary = mkdtempSync(join(tmpdir(), "gc1c-prim-"));
    const task = mkdtempSync(join(tmpdir(), "gc1c-task-"));
    temps.push(primary, task);
    const backend = createCloudEffectsBackend({
      transport,
      workstationName: "ws",
      taskWorkspaceRoot: task,
      localPrimaryRoot: primary,
    });

    await expect(
      backend.runProcess({
        executable: "/Users/evil/bin/pwn",
        argv: [],
        cwd: task,
        env: {},
        timeoutMs: 1000,
        maxStdoutBytes: 10,
        maxStderrBytes: 10,
      }),
    ).rejects.toMatchObject({ code: "GC1C_MODEL_INJECTION" });

    expect(() =>
      refuseModelInjection(
        {
          executable: "/usr/bin/node",
          argv: [],
          cwd: task,
          backend: "evil-cloud",
        },
        { localPrimaryRoot: primary, taskWorkspaceRoot: task, remoteRoot: "/home/user/workspace" },
      ),
    ).toThrow(/host-owned/);
  });

  it("remaps host node/npm paths onto Engineering Image locations", async () => {
    const {
      createCloudEffectsBackend,
      createMockWorkstationTransport,
      remapExecutable,
      remapArgv,
      REMOTE_NODE_EXECUTABLE,
      REMOTE_NPM_CLI_JS,
    } = await load();
    const transport = createMockWorkstationTransport();
    const primary = mkdtempSync(join(tmpdir(), "gc1c-prim-"));
    const task = mkdtempSync(join(tmpdir(), "gc1c-task-"));
    temps.push(primary, task);
    mkdirSync(join(primary, "node_modules/typescript/lib"), { recursive: true });
    writeFileSync(join(primary, "node_modules/typescript/lib/tsc.js"), "// stub\n");

    const ctx = {
      localPrimaryRoot: primary,
      taskWorkspaceRoot: task,
      remoteRoot: "/home/user/workspace",
    };
    expect(
      remapExecutable("/opt/homebrew/Cellar/node/22.0.0/bin/node", ctx),
    ).toBe(REMOTE_NODE_EXECUTABLE);
    expect(
      remapArgv(
        [
          "/Users/me/.nvm/versions/node/v22.0.0/lib/node_modules/npm/bin/npm-cli.js",
          "run",
          "test",
          join(primary, "node_modules/typescript/lib/tsc.js"),
        ],
        ctx,
      ),
    ).toEqual([
      REMOTE_NPM_CLI_JS,
      "run",
      "test",
      "/home/user/workspace/node_modules/typescript/lib/tsc.js",
    ]);

    const backend = createCloudEffectsBackend({
      transport,
      workstationName: "ws",
      taskWorkspaceRoot: task,
      localPrimaryRoot: primary,
      scriptedProcessResults: [{ exitCode: 0, stdout: "ok", stderr: "" }],
    });
    const obs = await backend.runProcess({
      executable: "/opt/homebrew/bin/node",
      argv: [
        "/opt/homebrew/lib/node_modules/npm/bin/npm-cli.js",
        "run",
        "typecheck",
      ],
      cwd: primary,
      env: { PATH: "/usr/bin" },
      timeoutMs: 1000,
      maxStdoutBytes: 64,
      maxStderrBytes: 64,
    });
    expect(obs.exitCode).toBe(0);
    const logged = backend.getProcessLog()[0]?.request;
    expect(logged.executable).toBe(REMOTE_NODE_EXECUTABLE);
    expect(logged.argv[0]).toBe(REMOTE_NPM_CLI_JS);
    expect(logged.cwd).toBe("/home/user/workspace");
  });

  it("never falls back to local spawn when remote worker fails", async () => {
    const { createCloudEffectsBackend, createMockWorkstationTransport } = await load();
    const transport = createMockWorkstationTransport();
    // Break worker by making invokeWorkerRequest fail.
    transport.invokeWorkerRequest = async () => ({
      v: "gc1c-worker-v1",
      ok: false,
      error: { code: "TRANSPORT", message: "simulated transport failure" },
    });
    const primary = mkdtempSync(join(tmpdir(), "gc1c-prim-"));
    const task = mkdtempSync(join(tmpdir(), "gc1c-task-"));
    temps.push(primary, task);
    const backend = createCloudEffectsBackend({
      transport,
      workstationName: "ws",
      taskWorkspaceRoot: task,
      localPrimaryRoot: primary,
    });
    await expect(
      backend.runProcess({
        executable: "/usr/bin/true",
        argv: [],
        cwd: task,
        env: {},
        timeoutMs: 1000,
        maxStdoutBytes: 10,
        maxStderrBytes: 10,
      }),
    ).rejects.toMatchObject({ code: "REMOTE_PROCESS_FAILED" });
  });
});
