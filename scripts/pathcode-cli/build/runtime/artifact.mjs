/**
 * Detect BuildArtifact from filesystem / manifests (reality wins over prompt).
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * @param {string} root
 * @param {string} name
 */
function readJsonSafe(root, name) {
  const p = join(root, name);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

/**
 * @param {string} root
 * @param {string[]} names
 */
function firstExisting(root, names) {
  for (const n of names) {
    const p = join(root, n);
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * @param {string} projectRoot
 * @param {{ outcomeHint?: string }} [opts]
 */
export function detectBuildArtifact(projectRoot, opts = {}) {
  const root = resolve(String(projectRoot || ""));
  /** @type {import('../types.mjs').BuildArtifact} */
  const artifact = {
    bindingId: "",
    projectRoot: root,
    kind: "unknown",
    framework: null,
    packageManager: null,
    startCommand: null,
    devCommand: null,
    testCommands: [],
    buildCommand: null,
    preview: {
      capability: "none",
      mode: "none",
      url: null,
      port: null,
      status: "idle",
    },
    runtime: {
      status: "idle",
      processId: null,
      startedAt: null,
      health: null,
    },
    detectedAt: new Date().toISOString(),
    signals: [],
  };

  if (!root || !existsSync(root) || !statSync(root).isDirectory()) {
    artifact.signals.push("missing_root");
    return artifact;
  }

  const pkg = readJsonSafe(root, "package.json");
  const hasIndexHtml = existsSync(join(root, "index.html"));
  /** @type {string | null} */
  let staticServeRoot = null;
  if (hasIndexHtml) {
    staticServeRoot = ".";
  } else {
    const nested = [
      ["public", "public/index.html"],
      ["dist", "dist/index.html"],
      ["build", "build/index.html"],
      ["out", "out/index.html"],
      ["docs", "docs/index.html"],
    ];
    for (const [dir, rel] of nested) {
      if (existsSync(join(root, rel))) {
        staticServeRoot = dir;
        break;
      }
    }
  }
  const hasStaticHtml = Boolean(staticServeRoot);
  const hasVite = Boolean(
    firstExisting(root, [
      "vite.config.ts",
      "vite.config.js",
      "vite.config.mjs",
      "vite.config.cjs",
    ]),
  );
  const hasNext = Boolean(
    firstExisting(root, ["next.config.js", "next.config.mjs", "next.config.ts"]),
  );
  const hasAstro = Boolean(
    firstExisting(root, ["astro.config.mjs", "astro.config.ts", "astro.config.js"]),
  );
  const hasCompose = Boolean(
    firstExisting(root, ["docker-compose.yml", "docker-compose.yaml", "compose.yml"]),
  );
  const hasGo = existsSync(join(root, "go.mod"));
  const hasCargo = existsSync(join(root, "Cargo.toml"));
  const hasPy = Boolean(
    firstExisting(root, ["pyproject.toml", "requirements.txt", "manage.py"]),
  );

  if (existsSync(join(root, "pnpm-lock.yaml"))) artifact.packageManager = "pnpm";
  else if (existsSync(join(root, "yarn.lock"))) artifact.packageManager = "yarn";
  else if (existsSync(join(root, "bun.lockb")) || existsSync(join(root, "bun.lock"))) {
    artifact.packageManager = "bun";
  } else if (pkg) artifact.packageManager = "npm";

  const scripts = pkg?.scripts && typeof pkg.scripts === "object" ? pkg.scripts : {};
  if (typeof scripts.test === "string") artifact.testCommands.push("test");
  if (typeof scripts.check === "string") artifact.testCommands.push("check");
  if (typeof scripts.build === "string") artifact.buildCommand = "build";
  if (typeof scripts.dev === "string") artifact.devCommand = "dev";
  if (typeof scripts.start === "string") artifact.startCommand = "start";

  const deps = {
    ...(pkg?.dependencies || {}),
    ...(pkg?.devDependencies || {}),
  };

  if (hasNext || deps.next) {
    artifact.kind = "web";
    artifact.framework = "next";
    artifact.preview.capability = "web";
    artifact.preview.mode = "dev_server";
    artifact.signals.push("next");
  } else if (hasAstro || deps.astro) {
    artifact.kind = "web";
    artifact.framework = "astro";
    artifact.preview.capability = "web";
    artifact.preview.mode = "dev_server";
    artifact.signals.push("astro");
  } else if (hasVite || deps.vite || deps["@vitejs/plugin-react"]) {
    artifact.kind = "web";
    artifact.framework = "vite";
    artifact.preview.capability = "web";
    artifact.preview.mode = "dev_server";
    artifact.signals.push("vite");
  } else if (hasIndexHtml || hasStaticHtml) {
    // Prefer static HTML preview over fragile Express starters that ignore PORT.
    artifact.kind = "web";
    artifact.framework = "static";
    artifact.preview.capability = "web";
    artifact.preview.mode = "static";
    artifact.signals.push(
      hasIndexHtml ? "static_index_html" : `static_${staticServeRoot}_index_html`,
    );
    artifact.staticRoot = staticServeRoot || ".";
  } else if (pkg && (artifact.devCommand || artifact.startCommand) && (deps.react || deps.vue || deps.svelte)) {
    artifact.kind = "web";
    artifact.framework = deps.react ? "react" : "node-web";
    artifact.preview.capability = "web";
    artifact.preview.mode = "dev_server";
    artifact.signals.push("node_web_scripts");
  } else if (pkg?.bin || (scripts.start && /\bcli\b|commander|yargs/i.test(JSON.stringify(deps)))) {
    artifact.kind = "cli";
    artifact.preview.capability = "cli";
    artifact.preview.mode = "terminal";
    artifact.signals.push("cli_package");
  } else if (hasCompose) {
    artifact.kind = "multi_service";
    artifact.preview.capability = "service";
    artifact.preview.mode = "health";
    artifact.signals.push("compose");
  } else if (hasGo || hasCargo || hasPy) {
    artifact.kind = hasPy && existsSync(join(root, "manage.py")) ? "web" : "service";
    artifact.preview.capability = artifact.kind === "web" ? "web" : "service";
    artifact.preview.mode = "health";
    artifact.signals.push(hasGo ? "go" : hasCargo ? "cargo" : "python");
  } else if (pkg) {
    artifact.kind = "unknown";
    artifact.signals.push("package_json_only");
    if (artifact.startCommand || artifact.devCommand) {
      artifact.preview.capability = "web";
      artifact.preview.mode = "dev_server";
    }
  }

  // Outcome hint only when FS is ambiguous
  if (artifact.kind === "unknown" && opts.outcomeHint) {
    const hint = String(opts.outcomeHint).toLowerCase();
    if (/website|web\s*app|landing|html/.test(hint)) {
      artifact.kind = "web";
      artifact.signals.push("outcome_hint_web");
    }
  }

  // Empty / early project: still unknown until engineer establishes tree
  try {
    const top = readdirSync(root).filter((n) => n !== ".git");
    if (top.length === 0) artifact.signals.push("empty_tree");
  } catch {
    /* ignore */
  }

  return artifact;
}

/**
 * Resolve argv for starting preview from an artifact.
 * @param {ReturnType<typeof detectBuildArtifact>} artifact
 * @param {{ port: number }} opts
 */
export function resolveArtifactStartPlan(artifact, opts) {
  const pm = artifact.packageManager || "npm";
  const run = (script) => {
    if (pm === "pnpm") return { cmd: "pnpm", args: ["run", script] };
    if (pm === "yarn") return { cmd: "yarn", args: [script] };
    if (pm === "bun") return { cmd: "bun", args: ["run", script] };
    return { cmd: "npm", args: ["run", script] };
  };

  if (artifact.preview.mode === "static" || (artifact.framework === "static" && !artifact.startCommand && !artifact.devCommand)) {
    const staticRel =
      typeof artifact.staticRoot === "string" && artifact.staticRoot
        ? artifact.staticRoot
        : ".";
    return {
      kind: "static",
      port: opts.port,
      cwd:
        staticRel === "."
          ? artifact.projectRoot
          : join(artifact.projectRoot, staticRel),
      cmd: null,
      args: [],
      env: {},
      staticRoot: staticRel,
    };
  }

  // Prefer PATH-owned static preview when a static index exists — many generated
  // Express starters hardcode :3000 and ignore PORT, which breaks Build runtime.
  if (
    typeof artifact.staticRoot === "string" &&
    artifact.staticRoot &&
    existsSync(
      join(
        artifact.projectRoot,
        artifact.staticRoot === "." ? "index.html" : join(artifact.staticRoot, "index.html"),
      ),
    )
  ) {
    const staticRel = artifact.staticRoot;
    return {
      kind: "static",
      port: opts.port,
      cwd:
        staticRel === "."
          ? artifact.projectRoot
          : join(artifact.projectRoot, staticRel),
      cmd: null,
      args: [],
      env: {},
      staticRoot: staticRel,
      reason: "prefer_static_over_port_fragile_start",
    };
  }

  const script =
    artifact.devCommand ||
    (artifact.framework === "next" ? "dev" : null) ||
    artifact.startCommand ||
    null;

  if (script) {
    const r = run(script);
    return {
      kind: "spawn",
      port: opts.port,
      cwd: artifact.projectRoot,
      cmd: r.cmd,
      args: r.args,
      env: {
        PORT: String(opts.port),
        HOST: "127.0.0.1",
        HOSTNAME: "127.0.0.1",
      },
      script,
    };
  }

  if (artifact.kind === "web" && (
    existsSync(join(artifact.projectRoot, "index.html")) ||
    existsSync(join(artifact.projectRoot, "public", "index.html"))
  )) {
    const cwd = existsSync(join(artifact.projectRoot, "index.html"))
      ? artifact.projectRoot
      : join(artifact.projectRoot, "public");
    return {
      kind: "static",
      port: opts.port,
      cwd,
      cmd: null,
      args: [],
      env: {},
      staticRoot: cwd === artifact.projectRoot ? "." : "public",
    };
  }

  return {
    kind: "none",
    port: opts.port,
    cwd: artifact.projectRoot,
    cmd: null,
    args: [],
    env: {},
    reason: "no_start_plan",
  };
}
