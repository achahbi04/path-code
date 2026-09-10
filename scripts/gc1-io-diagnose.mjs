#!/usr/bin/env node
/**
 * GC1-a controlled live I/O diagnostic — ONE probe, force-dispose after.
 * Not part of the canonical suite. Requires GC1_LIVE_SMOKE=1 --confirm-cloud.
 *
 * Captures three channels separately for a remote sentinel command.
 */

import { spawn } from "node:child_process";
import {
  GC1_CLUSTER,
  GC1_CONFIG,
  GC1_PROBE_WORKSTATION,
  GC1_PROJECT_ID,
  GC1_REGION,
  workstationName,
} from "./pathcode-cli/gc1/constants.mjs";
import { createWorkstationLifecycleManager } from "./pathcode-cli/gc1/lifecycle.mjs";

const SENTINEL_CMD =
  "printf 'GC1_STDOUT_SENTINEL\\n'; printf 'GC1_STDERR_SENTINEL\\n' >&2; exit 17";

function spawnCapture(executable, args, label) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(executable, args, {
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    const meta = {
      label,
      executable,
      argv: [executable, ...args],
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      listenersAttachedBeforeSpawn: false,
      dataEvents: { stdout: 0, stderr: 0 },
      bufferTypes: { stdout: [], stderr: [] },
      events: [],
    };
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let exitCode = null;
    let signal = null;
    let closed = false;
    let exited = false;
    let stdoutEnded = false;
    let stderrEnded = false;
    let settled = false;

    function settle(reason) {
      if (settled) return;
      if (!(closed && stdoutEnded && stderrEnded)) return;
      settled = true;
      meta.events.push({ t: Date.now() - started, reason, settle: true });
      resolve({
        meta,
        exitCode,
        signal,
        stdoutBuf: stdout,
        stderrBuf: stderr,
        stdoutText: stdout.toString("utf8"),
        stderrText: stderr.toString("utf8"),
        ms: Date.now() - started,
      });
    }

    // Attach listeners BEFORE any async gap (already sync here).
    meta.listenersAttachedBeforeSpawn = true;
    child.stdout.on("data", (d) => {
      meta.dataEvents.stdout += 1;
      meta.bufferTypes.stdout.push(Buffer.isBuffer(d) ? "Buffer" : typeof d);
      stdout = Buffer.concat([stdout, Buffer.from(d)]);
      meta.events.push({ t: Date.now() - started, ch: "stdout", n: d.length });
    });
    child.stderr.on("data", (d) => {
      meta.dataEvents.stderr += 1;
      meta.bufferTypes.stderr.push(Buffer.isBuffer(d) ? "Buffer" : typeof d);
      stderr = Buffer.concat([stderr, Buffer.from(d)]);
      meta.events.push({ t: Date.now() - started, ch: "stderr", n: d.length });
    });
    child.stdout.on("end", () => {
      stdoutEnded = true;
      meta.events.push({ t: Date.now() - started, ev: "stdout.end" });
      settle("stdout.end");
    });
    child.stderr.on("end", () => {
      stderrEnded = true;
      meta.events.push({ t: Date.now() - started, ev: "stderr.end" });
      settle("stderr.end");
    });
    child.on("exit", (code, sig) => {
      exited = true;
      exitCode = code;
      signal = sig;
      meta.events.push({ t: Date.now() - started, ev: "exit", code, sig });
    });
    child.on("close", (code, sig) => {
      closed = true;
      if (exitCode == null) exitCode = code;
      if (child.stdout.readableEnded) stdoutEnded = true;
      if (child.stderr.readableEnded) stderrEnded = true;
      meta.events.push({ t: Date.now() - started, ev: "close", code, sig });
      settle("close");
      setTimeout(() => {
        stdoutEnded = true;
        stderrEnded = true;
        settle("close+timeout");
      }, 100).unref?.();
    });
    child.on("error", (err) => {
      settled = true;
      resolve({
        meta,
        exitCode: 1,
        signal: null,
        stdoutBuf: stdout,
        stderrBuf: stderr,
        stdoutText: stdout.toString("utf8"),
        stderrText: String(err.message || err),
        ms: Date.now() - started,
        spawnError: String(err),
      });
    });
  });
}

async function main() {
  if (process.env.GC1_LIVE_SMOKE !== "1" || !process.argv.includes("--confirm-cloud")) {
    console.log("REFUSED: need GC1_LIVE_SMOKE=1 and --confirm-cloud");
    process.exit(2);
  }

  const { createGcpWorkstationTransport } = await import(
    "./pathcode-cli/gc1/gcp-transport.mjs"
  );
  const transport = await createGcpWorkstationTransport();
  const manager = createWorkstationLifecycleManager({
    transport,
    deadlineMs: 600_000,
    pollIntervalMs: 3000,
    executionReadyAttempts: 1,
    executionReadyIntervalMs: 0,
  });
  manager.installSignalHandlers();

  const report = { attempts: [], diagnosis: {} };

  try {
    await manager.reconcileStartup();
    await manager.ensureClusterAndConfig();
    const life = await manager.startProbeWorkstation();
    console.log("LIFECYCLE READY", life.state);

    // --- Variant A: current transport argv (no ssh flags) ---
    const baseArgs = [
      "workstations",
      "ssh",
      GC1_PROBE_WORKSTATION,
      `--project=${GC1_PROJECT_ID}`,
      `--region=${GC1_REGION}`,
      `--cluster=${GC1_CLUSTER}`,
      `--config=${GC1_CONFIG}`,
      `--command=${SENTINEL_CMD}`,
    ];

    const variants = [
      { label: "A_current", args: baseArgs },
      {
        label: "B_ssh_T",
        args: [...baseArgs, "--ssh-flag=-T"],
      },
      {
        label: "C_ssh_T_q",
        args: [...baseArgs, "--ssh-flag=-T", "--ssh-flag=-q"],
      },
      {
        label: "D_ssh_tt",
        args: [...baseArgs, "--ssh-flag=-tt"],
      },
      {
        label: "E_via_transport",
        viaTransport: true,
      },
    ];

    for (const v of variants) {
      let result;
      if (v.viaTransport) {
        const t0 = Date.now();
        const r = await transport.executeCommand({
          workstationName: workstationName(),
          command: SENTINEL_CMD,
        });
        result = {
          meta: {
            label: v.label,
            executable: "gcloud (via GcpWorkstationTransport.executeCommand)",
            argv: ["gcloud", ...baseArgs],
            note: "uses runGcloud() as shipped",
          },
          exitCode: r.exitCode,
          stdoutText: r.stdout,
          stderrText: r.stderr,
          ms: Date.now() - t0,
        };
      } else {
        result = await spawnCapture("gcloud", v.args, v.label);
      }
      const row = {
        label: v.label,
        exitCode: result.exitCode,
        stdoutJson: JSON.stringify(result.stdoutText),
        stderrJson: JSON.stringify(result.stderrText),
        stdoutHas: String(result.stdoutText || "").includes("GC1_STDOUT_SENTINEL"),
        stderrHasStdoutSentinel: String(result.stderrText || "").includes(
          "GC1_STDOUT_SENTINEL",
        ),
        stderrHas: String(result.stderrText || "").includes("GC1_STDERR_SENTINEL"),
        stdoutHasStderrSentinel: String(result.stdoutText || "").includes(
          "GC1_STDERR_SENTINEL",
        ),
        ms: result.ms,
        meta: result.meta,
      };
      report.attempts.push(row);
      console.log("\n===", v.label, "===");
      console.log(JSON.stringify(row, null, 2));
    }

    // Also try health check via best raw variant for comparison
    const health = await spawnCapture(
      "gcloud",
      [
        "workstations",
        "ssh",
        GC1_PROBE_WORKSTATION,
        `--project=${GC1_PROJECT_ID}`,
        `--region=${GC1_REGION}`,
        `--cluster=${GC1_CLUSTER}`,
        `--config=${GC1_CONFIG}`,
        `--command=echo HEALTH_CHECK_OK`,
        "--ssh-flag=-T",
      ],
      "health_T",
    );
    report.health_T = {
      exitCode: health.exitCode,
      stdoutJson: JSON.stringify(health.stdoutText),
      stderrJson: JSON.stringify(health.stderrText),
    };
    console.log("\n=== health_T ===");
    console.log(JSON.stringify(report.health_T, null, 2));
  } finally {
    console.log("\n--- force-dispose ---");
    await manager.teardown();
    const left = await transport.getWorkstation(workstationName());
    console.log("probe after teardown:", left);
    report.cleanup = { probeAfterTeardown: left };
  }

  console.log("\n=== DIAGNOSTIC SUMMARY ===");
  console.log(JSON.stringify(report.attempts.map((a) => ({
    label: a.label,
    exit: a.exitCode,
    stdoutHas: a.stdoutHas,
    stderrHas: a.stderrHas,
    stdoutJson: a.stdoutJson.slice(0, 200),
    stderrJson: a.stderrJson.slice(0, 200),
  })), null, 2));
}

main().catch(async (e) => {
  console.error("DIAG FAIL", e);
  process.exit(1);
});
