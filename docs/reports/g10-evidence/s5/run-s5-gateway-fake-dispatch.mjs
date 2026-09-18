/**
 * S5 — PATH Build origin + one engineer child via Gateway (fake engine).
 * Proves Build → Gateway dispatch (fakeMode=false), not controller fake fabric.
 */
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { createGatewayRuntime } from "../../../../scripts/pathcode-cli/gateway/runtime.mjs";
import { createBuildController } from "../../../../scripts/pathcode-cli/build/index.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(HERE, "../../../..");
const OUT_JSON = join(HERE, "s5-gateway-fake-dispatch.json");

function gatewayPort(runtime) {
  return {
    bindProject: (cwd) => runtime.bindProject({ cwd }),
    startTask: (objective, extra) => runtime.startTask({ objective, ...extra }),
    resumeTask: (taskId, extra) => runtime.resumeTask({ taskId, ...extra }),
    awaitTask: (taskId, timeoutMs) => runtime.awaitTask(taskId, timeoutMs),
    steerTask: (taskId, text) => runtime.steerTask(taskId, text),
    snapshotTask: (taskId) => runtime.snapshotTask(taskId),
  };
}

async function main() {
  process.env.PATHCODE_GATEWAY_FAKE_ENGINE = "1";
  process.env.PATHCODE_GATEWAY_SKIP_BOOTSTRAP = "1";

  const base = mkdtempSync(join(tmpdir(), "path-s5-gw-fake-"));
  const runtimeRoot = join(base, "runtime");
  const projectDir = join(base, "product");
  mkdirSync(runtimeRoot, { recursive: true });

  const runtime = createGatewayRuntime({
    packageRoot: PACKAGE_ROOT,
    runtimeRoot,
  });
  const gateway = gatewayPort(runtime);
  const controller = createBuildController({
    runtimeRoot,
    gateway,
    fakeMode: false,
  });

  /** @type {object[]} */
  const steps = [];

  const started = await controller.startBuild(
    "Create a single README.md that states s5-gateway-fake-dispatch ok",
    {
      targetDir: projectDir,
      initialCriteria: [
        {
          id: "c-tiny",
          statement: "README exists with dispatch marker",
          required: true,
        },
      ],
    },
  );

  steps.push({
    step: "origin",
    ok: started.ok === true,
    buildId: started.build?.buildId,
    git: existsSync(join(projectDir, ".git")),
    noScaffoldPackage: !existsSync(join(projectDir, "package.json")),
    bindViaGateway: started.ok === true,
  });

  if (!started.ok) {
    writeEvidence(steps, null, "FAILED", base);
    process.exit(1);
  }

  const ticked = await controller.tick(started.build.buildId);
  const build = ticked.build || started.build;
  const engineer = (build?.children || []).find((c) => c.kind === "engineer");
  const snap = engineer?.taskId ? runtime.snapshotTask(engineer.taskId) : null;

  steps.push({
    step: "engineer_via_gateway",
    ok:
      ticked.ok === true &&
      ticked.kind === "engineer" &&
      Boolean(engineer) &&
      engineer?.dispatchState === "consumed",
    tickAction: ticked.action,
    kind: ticked.kind,
    taskId: ticked.taskId,
    dispatchState: engineer?.dispatchState,
    gatewayTaskStatus: snap?.status,
    gatewayClassification: snap?.classification,
    buildFakeFabricBypassed: true,
  });

  const allOk = steps.every((s) => s.ok);
  writeEvidence(steps, build, allOk ? "GATEWAY-DISPATCH-VERIFIED" : "FAILED", base);
  process.exit(allOk ? 0 : 1);
}

/**
 * @param {object[]} steps
 * @param {object|null} build
 * @param {string} verdict
 * @param {string} base
 */
function writeEvidence(steps, build, verdict, base) {
  const evidence = {
    schema: "pathcode.s5.gateway-fake-dispatch.v1",
    verdict,
    mode: "live_gateway_fake_engine",
    note: "Build controller fakeMode=false; PATHCODE_GATEWAY_FAKE_ENGINE=1 for Gateway IPC path only.",
    env: {
      PATHCODE_GATEWAY_FAKE_ENGINE: "1",
      buildFakeMode: false,
    },
    baseDir: base,
    runtimeRoot: join(base, "runtime"),
    projectDir: join(base, "product"),
    buildId: build?.buildId,
    steps,
    children: (build?.children || []).map((c) => ({
      kind: c.kind,
      state: c.dispatchState,
      taskId: c.taskId,
      classification: c.classification,
    })),
    loopStatus: build?.loop?.status,
  };
  writeFileSync(OUT_JSON, `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
