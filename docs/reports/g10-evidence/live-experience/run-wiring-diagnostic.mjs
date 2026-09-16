/**
 * Live wiring diagnostic — dirty→BLOCKED UI + gateway event path.
 */
import { createEmptyStudioState, applyStudioEvent } from "../../../../scripts/path-studio/state.mjs";
import { buildMinimalLivingLines } from "../../../../scripts/pathcode-cli/inline-studio.mjs";
import { createGatewayRuntime } from "../../../../scripts/pathcode-cli/gateway/runtime.mjs";
import {
  resolvePathPackageRoot,
  resolvePathRuntimeRoot,
} from "../../../../scripts/pathcode-cli/paths.mjs";
import { mkdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const outDir = dirname(fileURLToPath(import.meta.url));
mkdirSync(outDir, { recursive: true });

/** @type {Array<Record<string, unknown>>} */
const checks = [];

{
  const state = createEmptyStudioState();
  state.product.ag1 = true;
  state.product.projectName = "nordic-rain-pathcode-live";
  applyStudioEvent(state, {
    type: "session.task.received",
    mode: "ag1",
    preview: "Inspect architecture and run native checks",
  });
  applyStudioEvent(state, {
    type: "session.capability.preparing",
    detail: "Admitting project and preparing environment",
  });
  // Auth remains a genuine BLOCKED condition — not dirty/detached Git state.
  applyStudioEvent(state, {
    type: "session.terminal",
    disposition: "AG1_AUTH_REQUIRED",
    summary: "PATH needs Antigravity authentication before engineering can start.",
  });
  const strip = buildMinimalLivingLines(state, { rows: 30, columns: 100 })
    .join("\n")
    .replace(/\u001b\[[0-9;]*m/g, "");
  writeFileSync(join(outDir, "blocked-auth-preview.txt"), strip);
  checks.push({
    id: "auth_shows_blocked_not_done",
    ok:
      strip.startsWith("PATH ● Code") &&
      /BLOCKED/.test(strip) &&
      /authentication|Authenticate/i.test(strip) &&
      !/■ DONE|● DONE|· DONE/.test(strip),
  });
}

{
  const proj = mkdtempSync(join(tmpdir(), "path-wire-"));
  spawnSync("git", ["init"], { cwd: proj });
  spawnSync("git", ["config", "user.email", "t@t"], { cwd: proj });
  spawnSync("git", ["config", "user.name", "t"], { cwd: proj });
  writeFileSync(join(proj, "readme.md"), "ok\n");
  spawnSync("git", ["add", "."], { cwd: proj });
  spawnSync("git", ["commit", "-m", "init"], { cwd: proj });
  const porc = spawnSync("git", ["status", "--porcelain"], {
    cwd: proj,
    encoding: "utf8",
  }).stdout.trim();
  const packageRoot = resolvePathPackageRoot();
  const runtimeRoot = resolvePathRuntimeRoot({ packageRoot });
  process.env.PATHCODE_GATEWAY_FAKE_ENGINE = "1";
  const rt = createGatewayRuntime({ packageRoot, runtimeRoot });
  await rt.bindProject({ cwd: proj });
  /** @type {string[]} */
  const events = [];
  rt.onEvent((env) => {
    if (typeof env?.event?.type === "string") events.push(env.event.type);
  });
  const started = await rt.startTask({ objective: "demo task for wiring" });
  await rt.awaitTask(started.taskId);
  const snap = rt.snapshotTask(started.taskId);
  writeFileSync(
    join(outDir, "gateway-fake-wire.json"),
    JSON.stringify({ porc, started, snap, events }, null, 2),
  );
  checks.push({
    id: "fake_engine_emits_stream_events",
    ok:
      events.includes("session.task.received") &&
      events.includes("session.capability.preparing") &&
      events.includes("session.engineering.result") &&
      snap.status === "completed",
    events,
    status: snap.status,
    porcelain: porc,
  });
  delete process.env.PATHCODE_GATEWAY_FAKE_ENGINE;
}

{
  const nordic = "/Users/achahbi/Projects/nordic-rain-pathcode-live";
  const st = spawnSync("git", ["status", "--porcelain"], {
    cwd: nordic,
    encoding: "utf8",
  });
  const dirty = (st.stdout || "").trim().length > 0;
  checks.push({
    id: "nordic_rain_dirty_detected",
    ok: true,
    dirty,
    porcelain: (st.stdout || "").trim().split("\n").slice(0, 10),
    note: dirty
      ? "Operator must commit/stash before PATH can engineer this checkout"
      : "Checkout is clean — live engineering can proceed",
  });
}

const pass = checks.every((c) => c.ok);
writeFileSync(
  join(outDir, "wiring-diagnostic.json"),
  JSON.stringify({ pass, at: new Date().toISOString(), checks }, null, 2),
);
console.log(JSON.stringify({ pass, checks }, null, 2));
process.exit(pass ? 0 : 1);
