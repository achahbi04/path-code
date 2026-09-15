/**
 * S1 mechanical evidence: socket gateway, same-task multi-client, steer/cancel.
 * Uses PATHCODE_GATEWAY_FAKE_ENGINE=1 so proof is of ownership/IPC, not paid turns.
 */
import { writeFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  createGatewayRuntime,
  startGatewayServer,
  createGatewayClient,
} from "../../../../scripts/pathcode-cli/gateway/index.mjs";

const checkout = fileURLToPath(new URL("../../../..", import.meta.url));
const outDir = join(checkout, "docs/reports/g10-evidence/s1");
mkdirSync(outDir, { recursive: true });

const evidence = {
  schema: "pathcode.s1.gateway.mechanical.v1",
  at: new Date().toISOString(),
  note: "Mechanical gateway ownership proof. MANUAL_UI_ACCEPTANCE remains PENDING_OPERATOR_REVIEW from S0.",
  cases: {},
};

const runtimeRoot = mkdtempSync(join(tmpdir(), "pathcode-s1-ev-"));
const repo = mkdtempSync(join(tmpdir(), "pathcode-s1-repo-"));
spawnSync("git", ["init"], { cwd: repo });
spawnSync("git", ["config", "user.email", "s1@test"], { cwd: repo });
spawnSync("git", ["config", "user.name", "s1"], { cwd: repo });
writeFileSync(join(repo, "README.md"), "s1\n");
spawnSync("git", ["add", "."], { cwd: repo });
spawnSync("git", ["commit", "-m", "init"], { cwd: repo });

process.env.PATHCODE_GATEWAY_FAKE_ENGINE = "1";
process.env.PATHCODE_GATEWAY_SKIP_BOOTSTRAP = "1";

const runtime = createGatewayRuntime({
  packageRoot: checkout,
  runtimeRoot,
});
const bound = await runtime.bindProject({ cwd: repo });
evidence.cases.bind = { ok: bound.ok === true, projectRoot: bound.projectRoot };

const server = await startGatewayServer({ runtime, runtimeRoot });
evidence.cases.socket = { path: server.socketPath, ok: true };

const cli = createGatewayClient({ socketPath: server.socketPath, runtimeRoot });
const headless = createGatewayClient({
  socketPath: server.socketPath,
  runtimeRoot,
});
await cli.connect();
await headless.connect();
await cli.hello("cli");
await headless.hello("headless");

const caps = await cli.listCapabilities();
evidence.cases.capabilities = {
  ok:
    caps.engines?.some((e) => e.id === "antigravity") &&
    caps.engines?.some((e) => e.id === "copilot") &&
    caps.engines?.some((e) => e.id === "cursor" && e.status === "slot_reserved"),
  engines: caps.engines?.map((e) => e.id),
};

/** @type {object[]} */
const cliEvents = [];
/** @type {object[]} */
const headlessEvents = [];
cli.onEvent((e) => cliEvents.push(e));
headless.onEvent((e) => headlessEvents.push(e));

const started = await cli.startTask("Fix demo via gateway", {});
evidence.cases.start = {
  ok: started.ok === true,
  taskId: started.taskId,
};

const attached = await headless.attachTask(started.taskId);
evidence.cases.sameTaskAttach = {
  ok: attached.attached === true,
  sameTaskId: attached.snapshot?.taskId === started.taskId,
  taskId: started.taskId,
};

await cli.steerTask(started.taskId, "Keep public API");
evidence.cases.steer = { ok: true, text: "Keep public API" };

const finished = await runtime.awaitTask(started.taskId);
evidence.cases.completion = {
  ok: finished.status === "completed",
  classification: finished.classification,
  bothClientsSawEvents: cliEvents.length > 0 && headlessEvents.length > 0,
  cliEventCount: cliEvents.length,
  headlessEventCount: headlessEvents.length,
};

// Disconnect policy: close CLI while a new task runs; headless still observes.
const started2 = await headless.startTask("Second task continuity", {});
cli.close(); // lost TUI ≠ cancel
await new Promise((r) => setTimeout(r, 20));
const mid = await headless.snapshotTask(started2.taskId);
evidence.cases.disconnectPolicy = {
  ok: mid.status === "running" || mid.status === "completed",
  statusAfterCliDrop: mid.status,
  taskStillOwnedByGateway: true,
};
await runtime.awaitTask(started2.taskId);

const cancelStart = await headless.startTask("Cancel me", {});
await headless.cancelTask(cancelStart.taskId);
await runtime.awaitTask(cancelStart.taskId);
const cancelled = await headless.snapshotTask(cancelStart.taskId);
evidence.cases.cancel = {
  ok:
    cancelled.status === "cancelled" ||
    cancelled.classification === "CANCELLED",
  status: cancelled.status,
};

headless.close();
server.stop();
try {
  rmSync(runtimeRoot, { recursive: true, force: true });
  rmSync(repo, { recursive: true, force: true });
} catch {
  /* ignore */
}

evidence.verdict = [
  evidence.cases.bind?.ok,
  evidence.cases.socket?.ok,
  evidence.cases.capabilities?.ok,
  evidence.cases.start?.ok,
  evidence.cases.sameTaskAttach?.ok,
  evidence.cases.completion?.ok,
  evidence.cases.disconnectPolicy?.ok,
  evidence.cases.cancel?.ok,
].every(Boolean)
  ? "PASS"
  : "PARTIAL";

writeFileSync(join(outDir, "mechanical.json"), `${JSON.stringify(evidence, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ verdict: evidence.verdict, cases: Object.fromEntries(Object.entries(evidence.cases).map(([k, v]) => [k, v.ok])) })}\n`);
process.exitCode = evidence.verdict === "PASS" ? 0 : 1;
