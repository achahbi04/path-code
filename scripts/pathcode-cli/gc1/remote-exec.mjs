/**
 * Phase GC1-a/b — remote command execution via Control-SA TCP tunnel + OpenSSH.
 *
 * Root cause of empty stdout (GC1-a): `gcloud workstations ssh` without
 * `--impersonate-service-account=<Control SA>` used operator ADC and got
 * `workstations.workstations.use` PERMISSION_DENIED (exit=0, stderr=ERROR,
 * stdout=""). Timing retries could not fix that.
 *
 * `gcloud workstations ssh --command` also drops remote exit codes. We:
 *   1. start-tcp-tunnel with Control SA impersonation (session-reusable)
 *   2. ssh -T to localhost (pipes; no PTY)
 *   3. await stream end + close
 *   4. return { exitCode, stdout, stderr } as three independent channels
 */

import { spawn } from "node:child_process";
import { createServer } from "node:net";
import {
  GC1_CLUSTER,
  GC1_CONFIG,
  GC1_CONTROL_SA,
  GC1_PROJECT_ID,
  GC1_REGION,
  GC1_SSH_USER,
} from "./constants.mjs";
import { assertRemoteCommandString } from "./shell-encode.mjs";

/**
 * @param {import("node:child_process").ChildProcessWithoutNullStreams} child
 * @returns {Promise<{ exitCode: number, stdout: string, stderr: string }>}
 */
export function captureChildStreams(child) {
  return new Promise((resolve) => {
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let stdoutEnded = false;
    let stderrEnded = false;
    let closed = false;
    let exitCode = 1;
    let settled = false;

    function settle() {
      if (settled) return;
      if (!(closed && stdoutEnded && stderrEnded)) return;
      settled = true;
      resolve({
        exitCode,
        stdout: stdout.toString("utf8"),
        stderr: stderr.toString("utf8"),
      });
    }

    child.stdout.on("data", (d) => {
      stdout = Buffer.concat([stdout, Buffer.isBuffer(d) ? d : Buffer.from(d)]);
    });
    child.stderr.on("data", (d) => {
      stderr = Buffer.concat([stderr, Buffer.isBuffer(d) ? d : Buffer.from(d)]);
    });
    child.stdout.on("end", () => {
      stdoutEnded = true;
      settle();
    });
    child.stderr.on("end", () => {
      stderrEnded = true;
      settle();
    });
    child.stdout.on("error", () => {
      stdoutEnded = true;
      settle();
    });
    child.stderr.on("error", () => {
      stderrEnded = true;
      settle();
    });
    child.on("close", (code) => {
      closed = true;
      exitCode = code ?? 1;
      if (child.stdout?.readableEnded) stdoutEnded = true;
      if (child.stderr?.readableEnded) stderrEnded = true;
      settle();
      setTimeout(() => {
        stdoutEnded = true;
        stderrEnded = true;
        settle();
      }, 100).unref?.();
    });
    child.on("error", (err) => {
      settled = true;
      resolve({
        exitCode: 1,
        stdout: stdout.toString("utf8"),
        stderr: String(err.message || err),
      });
    });
  });
}

function freeLocalPort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close((err) => (err ? reject(err) : resolve(port)));
    });
    srv.on("error", reject);
  });
}

/**
 * Parse cluster/config/workstation id from a full workstation resource name
 * or accept explicit short ids.
 * @param {{ workstationName?: string, workstationId?: string, cluster?: string, config?: string }} opts
 */
export function resolveWorkstationTunnelTarget(opts = {}) {
  const full = String(opts.workstationName || "");
  let workstationId = opts.workstationId;
  let cluster = opts.cluster || GC1_CLUSTER;
  let config = opts.config || GC1_CONFIG;

  if (full.includes("/workstations/")) {
    const m = full.match(
      /workstationClusters\/([^/]+)\/workstationConfigs\/([^/]+)\/workstations\/([^/]+)/,
    );
    if (m) {
      cluster = m[1];
      config = m[2];
      workstationId = m[3];
    } else {
      workstationId = full.split("/").pop();
    }
  } else if (!workstationId) {
    workstationId = full || undefined;
  }

  if (!workstationId) {
    throw new Error("resolveWorkstationTunnelTarget requires workstationId or workstationName");
  }
  return { workstationId, cluster, config };
}

/**
 * Session-scoped tunnel manager: one gcloud tcp-tunnel per (cluster,config,ws),
 * reused across executeCommand calls (critical for hydration uploads).
 */
export function createTunnelSession() {
  /** @type {Map<string, { port: number, tunnel: import('node:child_process').ChildProcess, log: string }>} */
  const tunnels = new Map();

  function tunnelKey({ workstationId, cluster, config }) {
    return `${cluster}/${config}/${workstationId}`;
  }

  async function ensureTunnel(target) {
    const { workstationId, cluster, config } = resolveWorkstationTunnelTarget(target);
    const key = tunnelKey({ workstationId, cluster, config });
    const existing = tunnels.get(key);
    if (existing && existing.tunnel.exitCode == null && !existing.tunnel.killed) {
      return existing;
    }

    const port = await freeLocalPort();
    const tunnelArgs = [
      "workstations",
      "start-tcp-tunnel",
      workstationId,
      "22",
      `--project=${GC1_PROJECT_ID}`,
      `--region=${GC1_REGION}`,
      `--cluster=${cluster}`,
      `--config=${config}`,
      `--local-host-port=127.0.0.1:${port}`,
      `--impersonate-service-account=${GC1_CONTROL_SA}`,
    ];

    const tunnel = spawn("gcloud", tunnelArgs, {
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let log = "";
    let listening = false;
    const onChunk = (d) => {
      const s = d.toString("utf8");
      log += s;
      if (/Listening on port/i.test(s)) listening = true;
    };
    tunnel.stdout.on("data", onChunk);
    tunnel.stderr.on("data", onChunk);

    const deadline = Date.now() + 90_000;
    while (!listening && Date.now() < deadline) {
      if (tunnel.exitCode != null && !listening) {
        throw new Error(`tcp-tunnel exited before listen: ${log.slice(-500)}`);
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    if (!listening) {
      tunnel.kill("SIGTERM");
      throw new Error(`tcp-tunnel did not become ready: ${log.slice(-500)}`);
    }

    const entry = { port, tunnel, log, workstationId, cluster, config };
    tunnels.set(key, entry);
    tunnel.on("close", () => {
      if (tunnels.get(key) === entry) tunnels.delete(key);
    });
    return entry;
  }

  /**
   * @param {{ workstationName?: string, workstationId?: string, cluster?: string, config?: string, command: string, stdin?: Buffer|string }} opts
   */
  async function execute(opts) {
    const target = resolveWorkstationTunnelTarget(opts);
    const { port } = await ensureTunnel(target);
    // CRITICAL: command MUST be a string. Arrays coerce via Array.toString()
    // to "node,/tmp/..." when passed as a single ssh argv element — the live
    // GC1-c WORKER_PROTOCOL / exit=127 failure mode.
    const remoteCommand = assertRemoteCommandString(opts.command);
    const sshArgs = [
      "-T",
      "-p",
      String(port),
      "-o",
      "BatchMode=yes",
      "-o",
      "StrictHostKeyChecking=no",
      "-o",
      "UserKnownHostsFile=/dev/null",
      "-o",
      "GlobalKnownHostsFile=/dev/null",
      "-o",
      "LogLevel=ERROR",
      "-o",
      "ConnectTimeout=30",
      "-o",
      "ServerAliveInterval=15",
      "-o",
      "ServerAliveCountMax=4",
      `${GC1_SSH_USER}@127.0.0.1`,
      remoteCommand,
    ];

    const hasStdin = opts.stdin != null;
    const ssh = spawn("ssh", sshArgs, {
      env: { ...process.env },
      stdio: [hasStdin ? "pipe" : "ignore", "pipe", "pipe"],
      shell: false,
    });

    /** @type {{ stdinEnded: boolean, stdinError: Error|null }} */
    const stdinMeta = { stdinEnded: !hasStdin, stdinError: null };

    if (hasStdin) {
      const buf = Buffer.isBuffer(opts.stdin)
        ? opts.stdin
        : Buffer.from(String(opts.stdin), "utf8");
      await new Promise((resolve, reject) => {
        let settled = false;
        const fail = (err) => {
          if (settled) return;
          settled = true;
          stdinMeta.stdinError = err instanceof Error ? err : new Error(String(err));
          reject(stdinMeta.stdinError);
        };
        const ok = () => {
          if (settled) return;
          settled = true;
          stdinMeta.stdinEnded = true;
          resolve();
        };
        ssh.stdin.on("error", fail);
        // Explicit EOF is part of the worker protocol contract.
        ssh.stdin.end(buf, (err) => {
          if (err) fail(err);
          else ok();
        });
      });
    }

    const result = await captureChildStreams(ssh);
    return {
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      meta: {
        executable: "ssh",
        via: "gcloud-workstations-start-tcp-tunnel",
        impersonateServiceAccount: GC1_CONTROL_SA,
        localPort: port,
        cluster: target.cluster,
        config: target.config,
        workstationId: target.workstationId,
        pty: false,
        stdio: [hasStdin ? "pipe" : "ignore", "pipe", "pipe"],
        shell: false,
        awaitsStreamEnd: true,
        sessionReuse: true,
        stdinEnded: stdinMeta.stdinEnded,
        remoteCommandIsString: true,
      },
    };
  }

  async function closeAll() {
    for (const [, entry] of tunnels) {
      try {
        entry.tunnel.kill("SIGTERM");
      } catch {
        /* ignore */
      }
    }
    tunnels.clear();
    await new Promise((r) => setTimeout(r, 200));
  }

  return { execute, closeAll, ensureTunnel };
}

/** One-shot helper — opens a tunnel, runs one command, closes. Prefer session for multi-command. */
export async function executeViaControlSaTunnel(opts) {
  const session = createTunnelSession();
  try {
    return await session.execute(opts);
  } finally {
    await session.closeAll();
  }
}

/**
 * Normalize shell text for exact token comparison (CR/LF only).
 * @param {string} text
 */
export function normalizeRemoteText(text) {
  return String(text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n+$/u, "");
}
