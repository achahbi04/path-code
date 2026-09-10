/**
 * Phase GC1-b — Cloud Workstations image contract (GC1B-G).
 *
 * Catches "USER user" / build-time /home assumptions before live GCP boot.
 * Validates Dockerfile text + optional image-config / workstation-config bodies.
 */

/** Upstream Google Workstations headless base — pinned for GC1-b reproducibility. */
export const WORKSTATIONS_BASE = Object.freeze({
  repository:
    "us-central1-docker.pkg.dev/cloud-workstations-images/predefined/base",
  /** Human label only — never the reproducibility authority. */
  floatingTag: "latest",
  /** Frozen upstream digest discovered for GC1-b v3. */
  digest: "sha256:50086f15b59f375ccc755659bd1b0c2e38347af4c6d739fff6fda8941fb19c38",
  entrypoint: "/google/scripts/entrypoint.sh",
  startupDir: "/etc/workstation-startup.d",
  addUserScript: "/etc/workstation-startup.d/010_add-user.sh",
  sshScript: "/etc/workstation-startup.d/020_start-sshd.sh",
});

export function workstationsBasePinnedReference(
  base = WORKSTATIONS_BASE,
) {
  return `${base.repository}@${base.digest}`;
}

/**
 * Expected OCI image config after extending the Workstations base.
 * Used by GC1B-G without requiring a local Docker daemon.
 *
 * @typedef {{
 *   User?: string|null,
 *   Entrypoint?: string[]|null,
 *   Cmd?: string[]|null,
 *   WorkingDir?: string|null,
 *   Env?: string[],
 *   presentPaths?: string[],
 * }} ImageConfigLike
 */

/**
 * @param {string} dockerfileText
 * @returns {{
 *   fromLines: string[],
 *   entrypointLines: string[],
 *   userLines: string[],
 *   workdirLines: string[],
 *   createsHomeUser: boolean,
 *   usesRootCargoHome: boolean,
 * }}
 */
export function parseDockerfileContractSurface(dockerfileText) {
  const rawLines = String(dockerfileText || "").split(/\r?\n/);
  const lines = rawLines
    .map((l) => l.replace(/#.*$/, "").trim())
    .filter(Boolean);
  // Instruction-bearing text only (comments stripped) for home/cargo heuristics.
  const codeOnly = lines.join("\n");

  const fromLines = lines.filter((l) => /^FROM\b/i.test(l));
  const entrypointLines = lines.filter((l) => /^ENTRYPOINT\b/i.test(l));
  const userLines = lines.filter((l) => /^USER\b/i.test(l));
  const workdirLines = lines.filter((l) => /^WORKDIR\b/i.test(l));

  return {
    fromLines,
    entrypointLines,
    userLines,
    workdirLines,
    createsHomeUser: /mkdir\s+(-p\s+)?\/home\/user\b/i.test(codeOnly),
    usesRootCargoHome: /\/root\/\.cargo\b/.test(codeOnly),
  };
}

/**
 * Assert Engineering Image Dockerfile + optional runtime config obey the
 * Cloud Workstations contract.
 *
 * @param {{
 *   dockerfileText: string,
 *   imageConfig?: ImageConfigLike,
 *   workstationConfigBody?: { container?: Record<string, unknown> },
 *   base?: typeof WORKSTATIONS_BASE,
 * }} input
 */
export function assertWorkstationsImageContract(input) {
  const base = input.base || WORKSTATIONS_BASE;
  const errors = [];
  const surface = parseDockerfileContractSurface(input.dockerfileText || "");

  // A — base provenance (digest-pinned FROM)
  const fromBlob = surface.fromLines.join("\n");
  if (!fromBlob.includes("cloud-workstations-images/predefined/base")) {
    errors.push("FROM must extend Workstations predefined/base");
  }
  if (!fromBlob.includes(base.digest) && !fromBlob.includes("${WORKSTATIONS_BASE_DIGEST}")) {
    errors.push(`FROM must pin Workstations base digest ${base.digest}`);
  }
  if (/predefined\/code-oss/i.test(fromBlob)) {
    errors.push("GC1-b must not use code-oss IDE base; use predefined/base");
  }

  // B — ENTRYPOINT preserved (do not override in Dockerfile)
  if (surface.entrypointLines.length > 0) {
    const ok = surface.entrypointLines.every((l) =>
      l.includes(base.entrypoint),
    );
    if (!ok) {
      errors.push(
        `ENTRYPOINT override must preserve ${base.entrypoint} (or omit ENTRYPOINT to inherit)`,
      );
    }
  }

  // D — final USER must not be a runtime-created account
  const lastUser = surface.userLines.length
    ? surface.userLines[surface.userLines.length - 1]
    : null;
  if (lastUser && !/\bUSER\s+root\b/i.test(lastUser) && !/\bUSER\s+0\b/i.test(lastUser)) {
    errors.push(
      `final USER must be root (or unset); got "${lastUser}" — runtime user is created by ${base.addUserScript}`,
    );
  }

  // H — no WORKDIR under /home (persistent home mounts dynamically)
  for (const w of surface.workdirLines) {
    if (/\/home\//i.test(w)) {
      errors.push(`WORKDIR must not assume /home at build time: ${w}`);
    }
  }

  // I — build-time /home/user is not runtime authority
  if (surface.createsHomeUser) {
    errors.push(
      "Do not mkdir /home/user as correctness; persistent home is mounted at runtime",
    );
  }

  // User-env: no /root/.cargo reliance
  if (surface.usesRootCargoHome) {
    errors.push("Rust/cargo must not live under /root/.cargo");
  }

  // User-env: durable Go shim + rustup wrappers (Workstations rewrites PATH)
  const df = String(input.dockerfileText || "");
  if (!/ln\s+-sf\s+\/usr\/local\/go\/bin\/go\s+\/usr\/local\/bin\/go/.test(df)) {
    errors.push("Dockerfile must shim go into /usr/local/bin (Workstations PATH rewrite)");
  }
  if (!/\/etc\/profile\.d\/zz-pathcode-toolchains\.sh/.test(df)) {
    errors.push("Dockerfile must install /etc/profile.d/zz-pathcode-toolchains.sh");
  }
  if (!/RUSTUP_HOME=\/usr\/local\/rustup/.test(df) || !/CARGO_HOME=\/usr\/local\/cargo/.test(df)) {
    errors.push("Dockerfile must set durable RUSTUP_HOME/CARGO_HOME under /usr/local");
  }

  const cfg = input.imageConfig;
  if (cfg) {
    const user = cfg.User == null || cfg.User === "" ? null : String(cfg.User);
    if (user && user !== "root" && user !== "0") {
      errors.push(
        `image config User="${user}" incompatible with Workstations runtime user creation`,
      );
    }
    const ep = cfg.Entrypoint;
    if (!ep || !ep.length || ep[0] !== base.entrypoint) {
      errors.push(`image Entrypoint must be [${base.entrypoint}]`);
    }
    if (cfg.WorkingDir && String(cfg.WorkingDir).startsWith("/home/")) {
      errors.push(`image WorkingDir must not be under /home (got ${cfg.WorkingDir})`);
    }
    const present = cfg.presentPaths || [];
    for (const p of [
      base.entrypoint,
      base.startupDir,
      base.addUserScript,
      base.sshScript,
    ]) {
      if (present.length && !present.includes(p)) {
        errors.push(`required Workstations path missing from image: ${p}`);
      }
    }
    const envJoined = (cfg.Env || []).join("\n");
    if (/\/root\/\.cargo/.test(envJoined)) {
      errors.push("image Env must not rely on /root/.cargo");
    }
  }

  const body = input.workstationConfigBody;
  if (body?.container) {
    const c = body.container;
    if (c.runAsUser != null && Number(c.runAsUser) !== 0) {
      errors.push(
        `workstation config container.runAsUser=${c.runAsUser} conflicts with runtime user lifecycle`,
      );
    }
    if (c.command != null || c.args != null) {
      // Overriding command can bypass entrypoint startup scripts — refuse for GC1-b.
      errors.push(
        "workstation config must not set container.command/args (would bypass Workstations entrypoint)",
      );
    }
    if (c.workingDir && String(c.workingDir).startsWith("/home/")) {
      errors.push(
        "workstation config workingDir must not assume build-time /home authority",
      );
    }
  }

  if (errors.length) {
    const err = new Error(
      `GC1B-G Workstations image contract failed:\n- ${errors.join("\n- ")}`,
    );
    err.code = "GC1B_IMAGE_CONTRACT";
    err.errors = errors;
    throw err;
  }

  return {
    ok: true,
    base: workstationsBasePinnedReference(base),
    entrypoint: base.entrypoint,
    startupDir: base.startupDir,
  };
}

/**
 * Expected durable toolchain path prefixes for the workstation user (not /root).
 */
export const DURABLE_TOOLCHAIN_PATH_PREFIXES = Object.freeze([
  "/usr/local/go/bin",
  "/usr/local/cargo/bin",
  "/usr/local/bin",
]);

/**
 * @param {string} pathEnv
 */
export function assertDurableToolchainPathEnv(pathEnv) {
  const parts = String(pathEnv || "").split(":").filter(Boolean);
  const missing = DURABLE_TOOLCHAIN_PATH_PREFIXES.filter(
    (p) => !parts.includes(p),
  );
  if (missing.length) {
    const err = new Error(
      `durable toolchain PATH missing: ${missing.join(", ")}`,
    );
    err.code = "GC1B_USER_ENV_PATH";
    throw err;
  }
  if (parts.some((p) => p.startsWith("/root/"))) {
    const err = new Error("PATH must not include /root/* toolchain locations");
    err.code = "GC1B_USER_ENV_PATH";
    throw err;
  }
  return true;
}
