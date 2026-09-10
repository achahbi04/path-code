#!/usr/bin/env node
/**
 * GC1-b live engineering proof — warm cluster, custom image, hydrate, toolchain, cleanup.
 * GC1_LIVE_SMOKE=1 --confirm-cloud required. Does NOT delete the cluster.
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  GC1_CLUSTER,
  GC1_CONTROL_SA,
  GC1_PROJECT_ID,
  GC1_REGION,
  GC1_RUNTIME_SA,
  clusterName,
  configName,
  workstationName,
} from "./pathcode-cli/gc1/constants.mjs";
import { createWorkstationLifecycleManager } from "./pathcode-cli/gc1/lifecycle.mjs";
import {
  DEFAULT_IMAGE_TAG,
  IMAGE_DIGEST_HISTORY,
  buildConfigContainerPin,
  engineeringImageRepositoryPath,
  pinnedImageReference,
} from "./pathcode-cli/gc1/engineering-image.mjs";
import { createWorkspaceHydrator, DEFAULT_REMOTE_ROOT } from "./pathcode-cli/gc1/workspace-hydrator.mjs";
import { detectDependencyStrategy } from "./pathcode-cli/gc1/dependency-strategy.mjs";
import { getCacheEnvHints } from "./pathcode-cli/gc1/cache-strategy.mjs";

const GC1B_CONFIG = "pathcode-gc1b-config-v4";
const GC1B_PROBE = "pathcode-gc1b-probe";
/** Prefer env; fall back to frozen gc1b-v4 digest. Never reuse v2/v3 pins. */
const IMAGE_DIGEST =
  process.env.GC1B_IMAGE_DIGEST || IMAGE_DIGEST_HISTORY["gc1b-v4"] || "";

const TOOL_CHECKS = [
  ["git", "git --version"],
  ["node", "node --version"],
  ["npm", "npm --version"],
  ["pnpm", "pnpm --version"],
  ["yarn", "yarn --version"],
  ["bun", "bun --version"],
  ["python3", "python3 --version"],
  ["pip", "pip --version || pip3 --version"],
  ["uv", "uv --version"],
  ["pipx", "pipx --version"],
  ["java", "java --version"],
  ["mvn", "mvn --version"],
  ["gradle", "gradle --version"],
  ["go", "go version"],
  ["rustc", "rustc --version"],
  ["cargo", "cargo --version"],
  ["rustfmt", "rustfmt --version"],
  ["clippy", "cargo clippy --version"],
  ["gcc", "gcc --version"],
  ["g++", "g++ --version"],
  ["rg", "rg --version"],
  ["fd", "fd --version || fdfind --version"],
  ["jq", "jq --version"],
  ["git-lfs", "git-lfs --version"],
];

function ms(t0) {
  return Date.now() - t0;
}

async function main() {
  if (process.env.GC1_LIVE_SMOKE !== "1" || !process.argv.includes("--confirm-cloud")) {
    console.log("REFUSED: need GC1_LIVE_SMOKE=1 and --confirm-cloud");
    process.exit(2);
  }
  if (!IMAGE_DIGEST || !IMAGE_DIGEST.startsWith("sha256:")) {
    console.error("REFUSED: set GC1B_IMAGE_DIGEST=sha256:… (gc1b-v3 digest; never reuse v2)");
    process.exit(2);
  }
  if (IMAGE_DIGEST.includes("7cdbbce2a60a77728b21fc2c55da4f24af18e5fd2d8aa48bdccc9dcdc9a9015a")) {
    console.error("REFUSED: gc1b-v2 digest is retired (CONTAINER_START_FAILED / no users found)");
    process.exit(2);
  }
  if (IMAGE_DIGEST.includes("077bd0639241bbc649b110cb0a910a5e1d46337b2f88ec978536a4649a694868")) {
    console.error("REFUSED: gc1b-v3 digest is retired (Go/Rust user-env PATH incomplete)");
    process.exit(2);
  }

  const report = {
    image: {
      repository: engineeringImageRepositoryPath(),
      tag: DEFAULT_IMAGE_TAG,
      digest: IMAGE_DIGEST,
      pinned: pinnedImageReference({ digest: IMAGE_DIGEST }),
    },
    tools: {},
    hydration: null,
    dependency: null,
    cache: getCacheEnvHints(),
    remote: {},
    cleanup: {},
  };

  const { createGcpWorkstationTransport } = await import(
    "./pathcode-cli/gc1/gcp-transport.mjs"
  );
  const transport = await createGcpWorkstationTransport();

  // Patch name helpers for GC1-b resources by using explicit names in API calls.
  const manager = createWorkstationLifecycleManager({
    transport,
    deadlineMs: 900_000,
    pollIntervalMs: 5000,
    executionReadyAttempts: 8,
    executionReadyIntervalMs: 3000,
  });
  manager.installSignalHandlers();

  const cfgParent = clusterName();
  const cfgName = `${cfgParent}/workstationConfigs/${GC1B_CONFIG}`;
  const wsName = `${cfgName}/workstations/${GC1B_PROBE}`;

  try {
    console.log("GC1-b live proof AUTHORIZED");
    console.log(" image", report.image.pinned);
    await manager.reconcileStartup();

    const desiredBody = buildConfigContainerPin({ digest: IMAGE_DIGEST });
    const desiredImage = desiredBody.container.image;
    let cfg = await transport.getConfig(cfgName);
    if (!cfg) {
      console.log(" creating GC1-b config with pinned digest image");
      cfg = await transport.createConfig(cfgParent, GC1B_CONFIG, desiredBody);
      report.configCreated = true;
    } else {
      report.configCreated = false;
      const existingImage = cfg.body?.container?.image || "";
      if (existingImage !== desiredImage) {
        throw new Error(
          `GC1-b config image mismatch: existing=${existingImage} desired=${desiredImage} (create a new config id; do not mutate v2 evidence)`,
        );
      }
      console.log(" reusing GC1-b config", cfgName);
    }
    report.configBodyImage =
      cfg.body?.container?.image || desiredImage;

    // Ensure workstation exists under GC1-b config
    let ws = await transport.getWorkstation(wsName);
    if (!ws) {
      ws = await transport.createWorkstation(cfgName, GC1B_PROBE, {
        displayName: GC1B_PROBE,
        labels: { "pathcode-gc1": "b-probe" },
      });
    }
    await transport.startWorkstation(wsName);
    // Wait running
    const tRun0 = Date.now();
    for (;;) {
      const cur = await transport.getWorkstation(wsName);
      if (cur?.state === "STATE_RUNNING") {
        report.lifecycleReadyMs = ms(tRun0);
        break;
      }
      if (ms(tRun0) > 600_000) throw new Error("GC1b workstation not RUNNING");
      await new Promise((r) => setTimeout(r, 5000));
    }
    console.log("LIFECYCLE READY", report.lifecycleReadyMs, "ms");

    // Execution ready via transport
    const tReady0 = Date.now();
    let ready = null;
    for (let i = 0; i < 8; i++) {
      const r = await transport.executeCommand({
        workstationName: wsName,
        command: "echo HEALTH_CHECK_OK",
      });
      const out = String(r.stdout || "").replace(/\r\n/g, "\n").replace(/\n+$/u, "");
      if (r.exitCode === 0 && out === "HEALTH_CHECK_OK") {
        ready = r;
        break;
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
    if (!ready) throw new Error("GC1b EXECUTION_NOT_READY");
    report.executionReadyMs = ms(tReady0);
    report.healthCheck = "HEALTH_CHECK_OK";
    console.log("EXECUTION READY", report.executionReadyMs, "ms");

    // Prove image identity remotely if possible
    const imgProbe = await transport.executeCommand({
      workstationName: wsName,
      command: "cat /etc/os-release | head -5; which node; node --version",
    });
    report.imageBootProbe = {
      exitCode: imgProbe.exitCode,
      stdout: imgProbe.stdout.slice(0, 500),
      stderr: imgProbe.stderr.slice(0, 200),
    };

    // Hydrate
    const hydrator = createWorkspaceHydrator({
      transport,
      localRoot: process.cwd(),
      remoteRoot: DEFAULT_REMOTE_ROOT,
      workstationName: wsName,
    });
    const hydration = await hydrator.hydrate();
    report.hydration = hydration;
    console.log("HYDRATION", hydration.durationMs, "ms", hydration.filesTransferred, "files", hydration.bytes, "bytes");

    // Default cwd + file presence via hydrator.run
    const pwd = await hydrator.run(
      "pwd && test -f package.json && test -d tests && ls package-lock.json package.json | tr '\\n' ' '",
    );
    report.remote.pwd = {
      exitCode: pwd.exitCode,
      stdout: pwd.stdout,
      stderr: pwd.stderr,
    };
    console.log("PWD", JSON.stringify(report.remote.pwd));
    if (pwd.exitCode !== 0 || !String(pwd.stdout).includes(DEFAULT_REMOTE_ROOT)) {
      throw new Error(`workspace cwd proof failed: ${JSON.stringify(report.remote.pwd)}`);
    }

    // Dependency strategy from local lockfiles — install before project command
    report.dependency = detectDependencyStrategy(["package-lock.json", "package.json"]);
    const installCmd = [report.dependency.installer, ...report.dependency.args].join(" ");
    console.log("DEPENDENCY", installCmd, report.dependency.reason);
    const tDep0 = Date.now();
    const depInstall = await hydrator.run(installCmd);
    report.dependency.install = {
      command: installCmd,
      exitCode: depInstall.exitCode,
      stdout: String(depInstall.stdout || "").slice(0, 1500),
      stderr: String(depInstall.stderr || "").slice(0, 1500),
      durationMs: ms(tDep0),
    };
    console.log("DEPENDENCY_INSTALL exit", depInstall.exitCode, "ms", report.dependency.install.durationMs);
    if (depInstall.exitCode !== 0) {
      throw new Error(`dependency install failed: ${depInstall.stderr || depInstall.stdout}`);
    }

    // Toolchain proofs in small SSH batches (4 tools) with per-tool timeouts.
    // One giant nested bash -lc previously hung the Control-SA tunnel.
    console.error("TOOL_BATCH start", TOOL_CHECKS.length);
    const tTools0 = Date.now();
    for (let i = 0; i < TOOL_CHECKS.length; i += 4) {
      const chunk = TOOL_CHECKS.slice(i, i + 4);
      const lines = chunk.map(([name, cmd]) => {
        const safeCmd = cmd.replace(/'/g, `'\"'\"'`);
        return [
          `printf '__TOOL__ ${name}\\n'`,
          `out=$(timeout 60 bash -c '${safeCmd}' 2>&1)`,
          `ec=$?`,
          `printf '__EC__ %s\\n' "$ec"`,
          `printf '%s\\n' "$out" | head -c 400`,
          `printf '\\n__END__ ${name}\\n'`,
        ].join("; ");
      });
      const script = ["set +e", ...lines, "exit 0"].join("; ");
      console.error("TOOL_CHUNK", i, "-", i + chunk.length - 1);
      const raw = await hydrator.run(script);
      const text = String(raw.stdout || "");
      for (const [name, cmd] of chunk) {
        const marker = `__TOOL__ ${name}`;
        const end = `__END__ ${name}`;
        const a = text.indexOf(marker);
        const b = text.indexOf(end, a >= 0 ? a : 0);
        let exitCode = 1;
        let stdout = raw.stderr || "missing from chunk";
        if (a >= 0 && b > a) {
          const block = text.slice(a, b);
          const ecMatch = block.match(/__EC__ (\d+)/);
          exitCode = ecMatch ? Number(ecMatch[1]) : 1;
          stdout = block.replace(/^[\s\S]*?__EC__ \d+\n/, "").trim();
        }
        report.tools[name] = {
          command: cmd,
          exitCode,
          stdout: String(stdout).slice(0, 400),
          stderr: "",
          ok: exitCode === 0,
        };
        console.error(
          "TOOL",
          name,
          exitCode === 0 ? "OK" : "FAIL",
          String(stdout).split("\n")[0],
        );
      }
    }
    console.error("TOOL_BATCH done", ms(tTools0), "ms");

    // Real PATH project command from hydrated workspace
    console.error("PROJECT_CMD start");
    const projectCmd = await hydrator.run("npm run typecheck");
    report.projectCommand = {
      command: "npm run typecheck",
      exitCode: projectCmd.exitCode,
      stdout: projectCmd.stdout.slice(0, 2000),
      stderr: projectCmd.stderr.slice(0, 1000),
    };
    console.error("PROJECT_CMD exit", projectCmd.exitCode);
    if (projectCmd.exitCode !== 0) {
      throw new Error(
        `project command failed exit=${projectCmd.exitCode}: ${projectCmd.stderr || projectCmd.stdout}`,
      );
    }

    // Prove durable toolchain paths for workstation user (not /root/.cargo).
    // Avoid `bash -lc` here — Workstations login profiles have hung the tunnel.
    console.error("USER_ENV start");
    const userEnv = await hydrator.run(
      "printf 'USER=%s\\n' \"$(id -un)\"; printf 'HOME=%s\\n' \"$HOME\"; printf 'PATH=%s\\n' \"$PATH\"; command -v rustc; command -v cargo; command -v go; command -v node; rustc --version; go version; test -x /usr/local/bin/rustc; test -x /usr/local/bin/go; test -x /usr/local/bin/cargo; echo USER_ENV_OK",
    );
    report.userEnv = {
      exitCode: userEnv.exitCode,
      stdout: String(userEnv.stdout || "").slice(0, 1500),
      stderr: String(userEnv.stderr || "").slice(0, 400),
    };
    console.error("USER_ENV", report.userEnv.stdout.split("\n").slice(0, 12).join(" | "));
    if (
      userEnv.exitCode !== 0 ||
      !String(userEnv.stdout).includes("USER_ENV_OK") ||
      /\/root\/\.cargo/.test(String(userEnv.stdout)) ||
      !String(userEnv.stdout).includes("/usr/local/bin/rustc") ||
      !String(userEnv.stdout).includes("/usr/local/bin/go")
    ) {
      throw new Error(`workstation user-env proof failed: ${JSON.stringify(report.userEnv)}`);
    }

    // Sentinel I/O still intact
    console.error("SENTINEL start");
    const sentinel = await transport.executeCommand({
      workstationName: wsName,
      command: "printf 'GC1_STDOUT_SENTINEL\\n'; printf 'GC1_STDERR_SENTINEL\\n' >&2; exit 17",
    });
    report.sentinel = {
      exitCode: sentinel.exitCode,
      stdout: sentinel.stdout,
      stderr: sentinel.stderr,
    };
    if (
      sentinel.exitCode !== 17 ||
      !String(sentinel.stdout).includes("GC1_STDOUT_SENTINEL") ||
      !String(sentinel.stderr).includes("GC1_STDERR_SENTINEL")
    ) {
      throw new Error(`sentinel I/O proof failed: ${JSON.stringify(report.sentinel)}`);
    }
    console.error("SENTINEL ok");
  } finally {
    // Force-dispose GC1-b probe only; keep warm cluster.
    try {
      if (typeof transport.closeTunnelSession === "function") {
        await transport.closeTunnelSession();
      }
    } catch {
      /* best-effort */
    }
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
    // Await + verify cleanup
    const tClean0 = Date.now();
    let left = await transport.getWorkstation(wsName);
    while (left && ms(tClean0) < 120_000) {
      await new Promise((r) => setTimeout(r, 3000));
      left = await transport.getWorkstation(wsName);
    }
    report.cleanup = {
      probeAfterTeardown: left,
      clusterPreserved: true,
      cleanupWaitMs: ms(tClean0),
      verifiedAbsent: left == null,
    };
    console.log("cleanup", report.cleanup);
    writeFileSync("/tmp/gc1b-live-report.json", JSON.stringify(report, null, 2));
    console.log("wrote /tmp/gc1b-live-report.json");
  }

  const missingTools = Object.entries(report.tools)
    .filter(([, v]) => !v.ok)
    .map(([k]) => k);
  if (missingTools.length) {
    console.error("MISSING_TOOLS", missingTools.join(","));
    process.exitCode = 1;
  } else if (report.cleanup.probeAfterTeardown) {
    console.error("PROBE_LEAK");
    process.exitCode = 1;
  } else {
    console.log("GC1-b live proof PASS");
  }
}

main().catch((e) => {
  console.error("GC1-b FAIL", e);
  process.exit(1);
});
