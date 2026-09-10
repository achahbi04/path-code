#!/usr/bin/env node
/**
 * GC1-c live cancellation probe — host-admitted deterministic command.
 * NOT a live model success claim. Requires GC1_LIVE_SMOKE=1 --confirm-cloud.
 * One billable workstation under pathcode-gc1b-config-v4; force-dispose; keep cluster.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  GC1_CLUSTER,
  GC1_PROJECT_ID,
  GC1_REGION,
  GC1_RUNTIME_SA,
  GC1_CONTROL_SA,
  clusterName,
} from "./pathcode-cli/gc1/constants.mjs";
import {
  GC1C_CONFIG,
  GC1C_IMAGE_DIGEST,
  GC1C_SESSION_BUDGET,
} from "./pathcode-cli/gc1/cloud-constants.mjs";
import { createTaskJournal } from "./pathcode-cli/gc1/task-journal.mjs";
import { pinnedImageReference } from "./pathcode-cli/gc1/engineering-image.mjs";
import { executeViaControlSaTunnel } from "./pathcode-cli/gc1/remote-exec.mjs";

const ARTIFACT_DIR = join(tmpdir(), `gc1c-cancel-${Date.now()}`);
const PROBE_ID = `pathcode-gc1c-cancel-${Date.now().toString(36).slice(-6)}`;

function ms(t0) {
  return Date.now() - t0;
}

async function main() {
  if (process.env.GC1_LIVE_SMOKE !== "1" || !process.argv.includes("--confirm-cloud")) {
    console.log("REFUSED: need GC1_LIVE_SMOKE=1 and --confirm-cloud");
    process.exit(2);
  }

  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const journal = createTaskJournal({ rootDir: join(ARTIFACT_DIR, "journal") });
  const task = journal.beginTask({
    label: "gc1c-live-cancel-probe",
    imageDigest: GC1C_IMAGE_DIGEST,
    config: GC1C_CONFIG,
  });

  const cfgParent = clusterName();
  const cfgName = `${cfgParent}/workstationConfigs/${GC1C_CONFIG}`;
  const wsName = `${cfgName}/workstations/${PROBE_ID}`;

  /** @type {Record<string, unknown>} */
  const record = {
    probe: "gc1c-live-cancel",
    note: "host-admitted deterministic probe — not live model success",
    budgetMax: GC1C_SESSION_BUDGET,
    sessionsThisProbe: 1,
    config: GC1C_CONFIG,
    image: pinnedImageReference({ digest: GC1C_IMAGE_DIGEST }),
    cluster: GC1_CLUSTER,
    controlSa: GC1_CONTROL_SA,
    runtimeSa: GC1_RUNTIME_SA,
    probeId: PROBE_ID,
    startedAt: new Date().toISOString(),
    stages: {},
  };
  console.log(JSON.stringify(record, null, 2));

  const { createGcpWorkstationTransport } = await import(
    "./pathcode-cli/gc1/gcp-transport.mjs"
  );
  const transport = await createGcpWorkstationTransport();
  const t0 = Date.now();

  try {
    const cfg = await transport.getConfig(cfgName);
    if (!cfg) {
      throw new Error(`Missing frozen config ${cfgName}; refusing to create`);
    }
    const existingImage = cfg.body?.container?.image || "";
    const desired = pinnedImageReference({ digest: GC1C_IMAGE_DIGEST });
    if (existingImage !== desired) {
      throw new Error(`Config image mismatch existing=${existingImage} desired=${desired}`);
    }
    record.stages.configOk = true;

    const acquireStart = Date.now();
    let ws = await transport.getWorkstation(wsName);
    if (!ws) {
      ws = await transport.createWorkstation(cfgName, PROBE_ID, {
        displayName: PROBE_ID,
        labels: { "pathcode-gc1": "c-cancel" },
      });
    }
    await transport.startWorkstation(wsName);
    for (;;) {
      const cur = await transport.getWorkstation(wsName);
      if (cur?.state === "STATE_RUNNING") {
        record.stages.lifecycleReadyMs = ms(acquireStart);
        ws = cur;
        break;
      }
      if (ms(acquireStart) > 240_000) {
        throw new Error("timeout waiting for STATE_RUNNING");
      }
      await new Promise((r) => setTimeout(r, 3000));
    }

    // Dual-stage readiness via Control-SA tunnel.
    const readyStart = Date.now();
    let ready = false;
    for (let i = 0; i < 8; i += 1) {
      const health = await executeViaControlSaTunnel({
        workstationId: PROBE_ID,
        config: GC1C_CONFIG,
        cluster: GC1_CLUSTER,
        command: "echo HEALTH_CHECK_OK",
      });
      if (health.exitCode === 0 && health.stdout.includes("HEALTH_CHECK_OK")) {
        ready = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
    if (!ready) throw new Error("GC1_EXECUTION_NOT_READY");
    record.stages.executionReadyMs = ms(readyStart);
    journal.appendEvent(task.taskId, "environment.ready", { workstationId: PROBE_ID });

    // Host-admitted cancel: coreutils `timeout` kills sleep — honest cancelled disposition.
    journal.appendEvent(task.taskId, "dispatch.intent", {
      kind: "cancel-probe",
      command: "timeout 5s sleep 60",
    });
    const cancelStart = Date.now();
    const cancelResult = await executeViaControlSaTunnel({
      workstationId: PROBE_ID,
      config: GC1C_CONFIG,
      cluster: GC1_CLUSTER,
      command: "timeout 5s sleep 60; echo CANCEL_PROBE_DONE_EC:$?",
    });
    record.stages.cancelProbeMs = ms(cancelStart);
    record.cancelResult = {
      exitCode: cancelResult.exitCode,
      stdout: String(cancelResult.stdout || "").trim(),
      stderrBytes: Buffer.byteLength(cancelResult.stderr || ""),
      timedOutLikely: /CANCEL_PROBE_DONE_EC:(124|143|137)/.test(
        String(cancelResult.stdout || ""),
      ),
      stderrTail: String(cancelResult.stderr || "").slice(-200),
    };
    journal.appendEvent(task.taskId, "cancel.outcome", record.cancelResult);
    console.log("CANCEL_PROBE_RESULT", JSON.stringify(record.cancelResult));
  } catch (e) {
    record.error = { message: e.message, code: e.code || null };
    console.error("PROBE_ERROR", e.message);
  } finally {
    const cleanupStart = Date.now();
    try {
      try {
        await transport.stopWorkstation(wsName);
      } catch {
        /* best-effort */
      }
      try {
        await transport.deleteWorkstation(wsName);
      } catch {
        /* best-effort */
      }
      // Verify absence
      let absent = false;
      for (let i = 0; i < 20; i += 1) {
        const cur = await transport.getWorkstation(wsName);
        if (!cur || cur.state === "DELETED" || cur.state === "STATE_DELETED") {
          absent = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      const listed =
        (await transport.listWorkstations?.(cfgName)) ||
        (await transport.listWorkstations?.(cfgParent)) ||
        [];
      const remaining = (Array.isArray(listed) ? listed : []).filter((w) => {
        const id = w.workstationId || String(w.name || "").split("/").pop();
        return id === PROBE_ID;
      });
      record.cleanup = {
        ms: ms(cleanupStart),
        verifiedAbsent: absent && remaining.length === 0,
        remainingIds: remaining.map((w) => w.workstationId || w.name),
        clusterPreserved: true,
        cluster: GC1_CLUSTER,
      };
      if (record.cleanup.verifiedAbsent) {
        journal.markCleanupVerified(task.taskId, { resourceIds: [] });
      } else {
        journal.markCleanupPending(task.taskId, {
          resourceIds: [PROBE_ID],
          detail: "probe workstation not verified absent",
        });
      }
    } catch (e) {
      record.cleanup = {
        ms: ms(cleanupStart),
        error: e.message,
        verifiedAbsent: false,
        clusterPreserved: true,
      };
      journal.markCleanupPending(task.taskId, {
        resourceIds: [PROBE_ID],
        detail: e.message,
      });
    }
    record.totalMs = ms(t0);
    record.finishedAt = new Date().toISOString();
    const out = join(ARTIFACT_DIR, "cancel-probe.json");
    writeFileSync(out, JSON.stringify(record, null, 2));
    console.log("ARTIFACT", out);
    console.log(JSON.stringify(record, null, 2));
    if (record.error || !record.cleanup?.verifiedAbsent) process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
