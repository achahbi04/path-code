/**
 * G9 cold-start prepare harness — records acquired tools for one project.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { prepareEngineeringEnvironment } from "../../../scripts/pathcode-cli/ag9/prepare.mjs";

const checkout = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const label = process.argv[2];
const projectRoot = resolve(process.argv[3]);
const outFile = resolve(process.argv[4]);
const runtimeRoot =
  process.env.PATHCODE_RUNTIME_ROOT ||
  resolve(checkout, "docs/reports/g9-evidence/runtime-cold");
const startServices = process.argv.includes("--services");
const taskText = process.env.G9_TASK_TEXT || "";

mkdirSync(resolve(outFile, ".."), { recursive: true });
process.env.PATHCODE_RUNTIME_ROOT = runtimeRoot;

const events = [];
const prepared = await prepareEngineeringEnvironment({
  projectRoot,
  runtimeRoot,
  taskText,
  startServices,
  emit: (e) => events.push({ ...e, at: Date.now() }),
});

function which(bin, env) {
  const r = spawnSync("which", [bin], {
    encoding: "utf8",
    env: env || process.env,
    timeout: 5_000,
  });
  return r.status === 0 ? (r.stdout || "").trim().split("\n")[0] : null;
}

const toolEnv = prepared.toolEnv || {};
const acquired = {
  cargo: which("cargo", toolEnv),
  rustc: which("rustc", toolEnv),
  "rust-analyzer": which("rust-analyzer", toolEnv),
  java: which("java", toolEnv),
  mvn: which("mvn", toolEnv),
  jdtls: which("jdtls", toolEnv),
  go: which("go", toolEnv),
  gopls: which("gopls", toolEnv),
  python3: which("python3", toolEnv),
  pyright: which("pyright", toolEnv),
  node: which("node", toolEnv),
  clangd: which("clangd", toolEnv),
  mise: which("mise", toolEnv),
};

const record = {
  label,
  capturedAt: new Date().toISOString(),
  projectRoot,
  runtimeRoot,
  pathPrepend: prepared.pathPrepend,
  provision: {
    briefLines: prepared.provision?.briefLines || [],
    ready: (prepared.provision?.ready || []).map((r) => ({
      id: r.id,
      status: r.status,
      executable: r.executable,
    })),
    failed: (prepared.provision?.failed || []).map((r) => ({
      id: r.id,
      status: r.status,
      error: r.error,
    })),
  },
  languageServers: prepared.languageServers,
  scip: prepared.scip,
  mcpServersExtra: prepared.mcpServersExtra,
  services: prepared.services,
  acquired,
  events: events.slice(0, 80),
  capabilityBrief: prepared.capabilityBrief,
  copilotHome: prepared.copilot?.copilotHome || null,
};

writeFileSync(outFile, `${JSON.stringify(record, null, 2)}\n`, "utf8");
console.log(
  JSON.stringify(
    {
      label,
      ok:
        (record.provision.failed || []).length === 0 ||
        (record.provision.ready || []).length > 0,
      ready: (record.provision.ready || []).map((r) => r.id),
      failed: (record.provision.failed || []).map((r) => r.id),
      acquired,
      outFile,
    },
    null,
    2,
  ),
);
