#!/usr/bin/env node
/**
 * Phase GC1-a — operator live smoke against real europe-west4 Workstations.
 *
 * ONLY code path that constructs GcpWorkstationTransport.
 *
 * Prerequisites:
 *   - ADC available locally (gcloud auth application-default login)
 *   - roles/iam.serviceAccountTokenCreator on Control SA
 *   - GC1_LIVE_SMOKE=1
 *   - --confirm-cloud
 *
 * Never runs in CI / canonical suite. No JSON key.
 *
 * Usage:
 *   GC1_LIVE_SMOKE=1 node scripts/gc1-live-smoke.mjs --confirm-cloud
 *   GC1_LIVE_SMOKE=1 node scripts/gc1-live-smoke.mjs --confirm-cloud --teardown-cluster
 */

import {
  GC1_CLUSTER,
  GC1_CLUSTER_TEARDOWN_COMMAND,
  GC1_CONFIG,
  GC1_CONTROL_SA,
  GC1_COST_FENCES,
  GC1_PROBE_WORKSTATION,
  GC1_PROJECT_ID,
  GC1_REGION,
  GC1_RUNTIME_SA,
} from "./pathcode-cli/gc1/constants.mjs";
import { createWorkstationLifecycleManager } from "./pathcode-cli/gc1/lifecycle.mjs";

function printPrerequisites() {
  console.log(`GC1 live smoke — REFUSED (no GCP calls made)

Prerequisites:
  1. process.env.GC1_LIVE_SMOKE === "1"
  2. Pass --confirm-cloud
  3. Local ADC (gcloud auth application-default login)
  4. Impersonation: your user has roles/iam.serviceAccountTokenCreator
     on ${GC1_CONTROL_SA}
  5. Control SA has workstations.admin + serviceUsageConsumer;
     Control SA has iam.serviceAccountUser on Runtime SA
  6. No SA JSON key is used or required

Verified infra:
  project=${GC1_PROJECT_ID}
  region=${GC1_REGION} (LOCKED)
  cluster=${GC1_CLUSTER}
  config=${GC1_CONFIG}
  probe=${GC1_PROBE_WORKSTATION}
  controlSA=${GC1_CONTROL_SA}
  runtimeSA=${GC1_RUNTIME_SA}
  costFences=poolSize:${GC1_COST_FENCES.poolSize} idle:${GC1_COST_FENCES.idleTimeout} run:${GC1_COST_FENCES.runningTimeout}

COST MODEL (both surfaces):
  • CLUSTER (${GC1_CLUSTER}) bills HOURLY while it exists, independent of any workstation.
  • WORKSTATION (${GC1_PROBE_WORKSTATION}) bills WHILE RUNNING (this smoke's per-task cost).

Authorized command:
  GC1_LIVE_SMOKE=1 node scripts/gc1-live-smoke.mjs --confirm-cloud

Optional cluster teardown (stops standing cluster charge — separate from probe teardown):
  GC1_LIVE_SMOKE=1 node scripts/gc1-live-smoke.mjs --confirm-cloud --teardown-cluster
  or: ${GC1_CLUSTER_TEARDOWN_COMMAND}
`);
}

function ms(t0) {
  return Date.now() - t0;
}

async function main() {
  const args = process.argv.slice(2);
  const confirm = args.includes("--confirm-cloud");
  const teardownCluster = args.includes("--teardown-cluster");
  const live = process.env.GC1_LIVE_SMOKE === "1";

  if (!live || !confirm) {
    printPrerequisites();
    process.exit(live && !confirm ? 2 : 0);
  }

  // Dynamic import — GcpWorkstationTransport never loads without this gate.
  const { createGcpWorkstationTransport } = await import(
    "./pathcode-cli/gc1/gcp-transport.mjs"
  );

  console.log("GC1 live smoke — AUTHORIZED");
  console.log(`  project=${GC1_PROJECT_ID} region=${GC1_REGION}`);
  console.log(`  impersonating Control SA: ${GC1_CONTROL_SA}`);
  console.log(
    "  NOTE: Cluster bills hourly while it exists, independent of any workstation.",
  );

  const tAuth0 = Date.now();
  const transport = await createGcpWorkstationTransport();
  console.log(`  auth (impersonated ADC): ${ms(tAuth0)}ms`);

  const manager = createWorkstationLifecycleManager({
    transport,
    deadlineMs: 600_000,
    pollIntervalMs: 3000,
  });
  manager.installSignalHandlers();

  const timings = {
    reconcileMs: 0,
    ensureMs: 0,
    provisionMs: 0,
    readyMs: 0,
    roundTripMs: 0,
    teardownMs: 0,
  };

  try {
    const tRec0 = Date.now();
    const rec = await manager.reconcileStartup();
    timings.reconcileMs = ms(tRec0);
    console.log(
      `  reconcileStartup: reclaimed=${JSON.stringify(rec.reclaimed)} (${timings.reconcileMs}ms)`,
    );

    if (teardownCluster) {
      console.log("  --teardown-cluster: deleting long-lived cluster (standing charge ends)");
      const { clusterName, configName } = await import(
        "./pathcode-cli/gc1/constants.mjs"
      );
      try {
        const cfg = await transport.getConfig(configName());
        if (cfg) await transport.deleteConfig(cfg.name);
      } catch (e) {
        console.log(`  config delete note: ${e.message}`);
      }
      try {
        await transport.deleteCluster(clusterName());
        console.log("  cluster deleted.");
      } catch (e) {
        console.log(`  cluster delete note: ${e.message}`);
      }
      await manager.teardown();
      process.exit(0);
    }

    const tEns0 = Date.now();
    const ensured = await manager.ensureClusterAndConfig();
    timings.ensureMs = ms(tEns0);
    if (ensured.createdCluster) {
      console.log(
        "  *** CREATED cluster pathcode-gc1-cluster — standing HOURLY charge now active ***",
      );
    } else {
      console.log(
        "  cluster already exists — standing HOURLY charge already active",
      );
    }
    if (ensured.createdConfig) {
      console.log(
        `  created config with fences poolSize=${GC1_COST_FENCES.poolSize} idle=${GC1_COST_FENCES.idleTimeout} run=${GC1_COST_FENCES.runningTimeout}`,
      );
    }
    console.log(`  ensureClusterAndConfig: ${timings.ensureMs}ms`);
    console.log(`  workstation Runtime SA: ${ensured.runtimeServiceAccount}`);
    console.log(
      `  Control SA (${ensured.controlServiceAccount}) is NOT attached to the workstation`,
    );

    const tProv0 = Date.now();
    const lifecycle = await manager.startProbeWorkstation();
    timings.provisionMs = ms(tProv0);
    timings.readyMs = timings.provisionMs;
    console.log(
      `  LIFECYCLE READY (STATE_RUNNING): ${lifecycle.state} (${timings.provisionMs}ms)`,
    );

    const tRt0 = Date.now();
    const ready = await manager.verifyExecutionReadiness(lifecycle);
    timings.roundTripMs = ms(tRt0);
    console.log(
      `  EXECUTION READY (echo HEALTH_CHECK_OK): ${ready.healthCheck} (${timings.roundTripMs}ms)`,
    );

    const tTd0 = Date.now();
    await manager.teardown();
    timings.teardownMs = ms(tTd0);
    console.log(`  teardown (probe only): ${timings.teardownMs}ms`);

    console.log("\n--- timings ---");
    console.log(JSON.stringify(timings, null, 2));
    console.log("\n--- cost note ---");
    console.log(
      `STANDING: cluster ${GC1_CLUSTER} continues to bill hourly while it exists.`,
    );
    console.log(
      `INCURRED: workstation ${GC1_PROBE_WORKSTATION} runtime for this smoke (~${timings.provisionMs + timings.roundTripMs}ms wall while running path).`,
    );
    console.log(
      `To stop the standing cluster charge:\n  ${GC1_CLUSTER_TEARDOWN_COMMAND}`,
    );
    console.log(
      "  or: GC1_LIVE_SMOKE=1 node scripts/gc1-live-smoke.mjs --confirm-cloud --teardown-cluster",
    );
    console.log("\nGC1 live smoke PASS");
  } catch (err) {
    console.error(`GC1 live smoke FAIL: ${err.message}`);
    try {
      await manager.teardown();
    } catch {
      /* ignore */
    }
    process.exitCode = 1;
  }
}

main();
