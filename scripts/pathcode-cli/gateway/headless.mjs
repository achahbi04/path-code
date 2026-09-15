/**
 * S1 — Headless PATH Gateway client.
 *
 * Examples:
 *   node scripts/pathcode-cli/gateway/headless.mjs bind --cwd /path/to/project
 *   node scripts/pathcode-cli/gateway/headless.mjs start --objective "Fix tests"
 *   node scripts/pathcode-cli/gateway/headless.mjs attach --task-id <id>
 *   node scripts/pathcode-cli/gateway/headless.mjs capabilities
 */

import { ensureGateway } from "./ensure.mjs";
import { createGatewayRuntime } from "./runtime.mjs";
import { GatewayMethods } from "./protocol.mjs";

function usage() {
  return `PATH Gateway headless client

Usage:
  headless.mjs bind [--cwd <dir>]
  headless.mjs start --objective <text> [--cwd <dir>] [--wait]
  headless.mjs attach --task-id <id> [--wait]
  headless.mjs snapshot --task-id <id>
  headless.mjs steer --task-id <id> --text <text>
  headless.mjs cancel --task-id <id>
  headless.mjs capabilities
  headless.mjs status
`;
}

function argValue(argv, name) {
  const i = argv.indexOf(name);
  if (i < 0) return null;
  return argv[i + 1] ?? null;
}

async function main(argv = process.argv.slice(2)) {
  const cmd = argv[0] || "help";
  if (cmd === "help" || cmd === "--help" || cmd === "-h") {
    process.stdout.write(usage());
    return 0;
  }

  const mode = String(process.env.PATHCODE_GATEWAY_MODE || "socket").toLowerCase();
  /** @type {any} */
  let client;
  /** @type {any} */
  let runtime = null;

  if (mode === "inprocess" || mode === "inline") {
    runtime = createGatewayRuntime();
    client = {
      async hello() {
        return runtime.dispatch(GatewayMethods.HELLO, {}, "h").then((r) => r.result);
      },
      async bindProject(cwd) {
        return runtime.bindProject({ cwd });
      },
      async startTask(objective, extra) {
        return runtime.startTask({ objective, ...extra });
      },
      async attachTask(taskId) {
        return runtime.dispatch(GatewayMethods.TASK_ATTACH, { taskId }, "a").then(
          (r) => (r.error ? Promise.reject(new Error(r.error.message)) : r.result),
        );
      },
      async snapshotTask(taskId) {
        return runtime.snapshotTask(taskId);
      },
      async steerTask(taskId, text) {
        return runtime.steerTask(taskId, text);
      },
      async cancelTask(taskId) {
        return runtime.cancelTask(taskId);
      },
      async listCapabilities() {
        return runtime.listCapabilities();
      },
      async getResult(taskId) {
        return runtime.dispatch(GatewayMethods.RESULT_GET, { taskId }, "r").then(
          (r) => (r.error ? Promise.reject(new Error(r.error.message)) : r.result),
        );
      },
      onEvent(fn) {
        return runtime.onEvent(fn);
      },
      onTaskEvent(taskId, fn) {
        return runtime.onTaskEvent(taskId, fn);
      },
      close() {},
      async awaitTask(taskId) {
        return runtime.awaitTask(taskId);
      },
    };
    await client.hello();
  } else {
    const ensured = await ensureGateway({});
    client = ensured.client;
  }

  try {
    if (cmd === "bind") {
      const cwd = argValue(argv, "--cwd") || process.cwd();
      const r = await client.bindProject(cwd);
      process.stdout.write(`${JSON.stringify(r, null, 2)}\n`);
      return 0;
    }
    if (cmd === "capabilities") {
      const r = await client.listCapabilities();
      process.stdout.write(`${JSON.stringify(r, null, 2)}\n`);
      return 0;
    }
    if (cmd === "status") {
      const res = await client.request?.(GatewayMethods.PROJECT_STATUS, {});
      if (res) {
        process.stdout.write(`${JSON.stringify(res.result || res, null, 2)}\n`);
      } else if (runtime) {
        process.stdout.write(
          `${JSON.stringify({ project: runtime.getProject(), tasks: runtime.listTasks() }, null, 2)}\n`,
        );
      }
      return 0;
    }
    if (cmd === "start") {
      const objective = argValue(argv, "--objective") || argValue(argv, "-o");
      if (!objective) {
        process.stderr.write("--objective required\n");
        return 2;
      }
      const cwd = argValue(argv, "--cwd") || process.cwd();
      await client.bindProject(cwd);
      const off = client.onEvent((env) => {
        const ev = env.event || {};
        process.stdout.write(
          `[event] ${ev.type || "?"} ${ev.label || ev.detail || ""}\n`,
        );
      });
      const started = await client.startTask(objective, { cwd });
      process.stdout.write(`${JSON.stringify({ started }, null, 2)}\n`);
      if (argv.includes("--wait")) {
        if (typeof client.awaitTask === "function") {
          const snap = await client.awaitTask(started.taskId);
          process.stdout.write(`${JSON.stringify({ finished: snap }, null, 2)}\n`);
        } else {
          // Socket mode: poll snapshot until not running.
          for (;;) {
            await new Promise((r) => setTimeout(r, 1000));
            const snap = await client.snapshotTask(started.taskId);
            if (snap.status !== "running") {
              process.stdout.write(`${JSON.stringify({ finished: snap }, null, 2)}\n`);
              break;
            }
          }
        }
      }
      off();
      return 0;
    }
    if (cmd === "attach") {
      const taskId = argValue(argv, "--task-id");
      if (!taskId) {
        process.stderr.write("--task-id required\n");
        return 2;
      }
      const attached = await client.attachTask(taskId);
      process.stdout.write(`${JSON.stringify(attached, null, 2)}\n`);
      const off = client.onTaskEvent(taskId, (env) => {
        const ev = env.event || {};
        process.stdout.write(
          `[event] ${ev.type || "?"} ${ev.label || ev.detail || ""}\n`,
        );
      });
      if (argv.includes("--wait")) {
        for (;;) {
          await new Promise((r) => setTimeout(r, 1000));
          const snap = await client.snapshotTask(taskId);
          if (snap.status !== "running") {
            process.stdout.write(`${JSON.stringify({ finished: snap }, null, 2)}\n`);
            break;
          }
        }
      }
      off();
      return 0;
    }
    if (cmd === "snapshot") {
      const taskId = argValue(argv, "--task-id");
      const snap = await client.snapshotTask(taskId);
      process.stdout.write(`${JSON.stringify(snap, null, 2)}\n`);
      return 0;
    }
    if (cmd === "steer") {
      const taskId = argValue(argv, "--task-id");
      const text = argValue(argv, "--text");
      const r = await client.steerTask(taskId, text);
      process.stdout.write(`${JSON.stringify(r, null, 2)}\n`);
      return 0;
    }
    if (cmd === "cancel") {
      const taskId = argValue(argv, "--task-id");
      const r = await client.cancelTask(taskId);
      process.stdout.write(`${JSON.stringify(r, null, 2)}\n`);
      return 0;
    }
    process.stderr.write(usage());
    return 2;
  } finally {
    client.close?.();
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("headless.mjs")) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (err) => {
      process.stderr.write(`${err?.stack || err}\n`);
      process.exitCode = 1;
    },
  );
}

export { main as runHeadlessMain };
