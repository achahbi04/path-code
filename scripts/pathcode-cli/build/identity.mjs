/**
 * Running-code identity for PATH Build processes.
 *
 * Captured when this module is first evaluated, so it describes the code a
 * process actually loaded — not whatever the checkout holds when asked.
 * Long-lived coordinator and Gateway processes never reload modules, so the
 * two can diverge; `assessServingIdentity` reports exactly that divergence.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readPathPackageVersion } from "../paths.mjs";

const LOADED_ROOT = canonical(resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", ".."));
const CODE_PATHS = ["scripts", "package.json"];
const CURRENT_TTL_MS = 1_000;

function canonical(path) {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

function git(root, args) {
  try {
    return execFileSync("git", ["-C", root, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5_000,
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

/**
 * Commit and uncommitted-change fingerprint of the runtime code under
 * `packageRoot`. A package root that is not itself a git top level (an npm
 * install, possibly nested in a creator's repository) reports no commit.
 *
 * @param {string} packageRoot
 */
export function readCheckoutState(packageRoot) {
  const root = canonical(packageRoot);
  const top = git(root, ["rev-parse", "--show-toplevel"])?.trim();
  if (!top || canonical(top) !== root) {
    return { source: "package", sha: null, dirty: null, changeFingerprint: null };
  }
  const sha = git(root, ["rev-parse", "HEAD"])?.trim() || null;
  const status = git(root, ["status", "--porcelain", "--", ...CODE_PATHS]) ?? "";
  const diff = git(root, ["diff", "HEAD", "--", ...CODE_PATHS]) ?? "";
  const dirty = status.trim().length > 0;
  return {
    source: "git",
    sha,
    dirty,
    changeFingerprint: dirty
      ? createHash("sha256").update(status).update(diff).digest("hex").slice(0, 16)
      : null,
  };
}

const LOADED = Object.freeze({
  packageRoot: LOADED_ROOT,
  version: readPathPackageVersion(LOADED_ROOT),
  loadedAt: new Date().toISOString(),
  processStartedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
  ...readCheckoutState(LOADED_ROOT),
});

/**
 * @param {string} role
 */
export function loadedCodeIdentity(role) {
  return { role, pid: process.pid, ...LOADED };
}

/** @type {Map<string, { at: number, state: ReturnType<typeof readCheckoutState> }>} */
const currentCache = new Map();

/**
 * @param {string} packageRoot
 */
export function currentCheckoutState(packageRoot) {
  const root = canonical(packageRoot);
  const hit = currentCache.get(root);
  if (hit && Date.now() - hit.at < CURRENT_TTL_MS) return hit.state;
  const state = readCheckoutState(root);
  currentCache.set(root, { at: Date.now(), state });
  return state;
}

/**
 * @param {{ sha?: string | null, dirty?: boolean | null } | null | undefined} identity
 */
export function formatCodeLabel(identity) {
  if (!identity) return "unknown";
  if (!identity.sha) return identity.version ? `${identity.version} (package)` : "unknown";
  return `${identity.sha.slice(0, 7)}${identity.dirty ? "+uncommitted" : ""}`;
}

/**
 * True only when `identity` is the code this checkout would load right now.
 * A missing identity is never reusable — that process predates reporting.
 *
 * @param {any} identity
 * @param {string} [packageRoot]
 */
export function identityMatchesCurrentCheckout(identity, packageRoot) {
  if (!identity || typeof identity !== "object" || !identity.sha) return false;
  const root = packageRoot || identity.packageRoot;
  if (!root) return false;
  if (identity.packageRoot && canonical(identity.packageRoot) !== canonical(root)) {
    return false;
  }
  const current = currentCheckoutState(root);
  if (!current.sha || current.sha !== identity.sha) return false;
  return (current.changeFingerprint || null) === (identity.changeFingerprint || null);
}

const ROLE_NAMES = {
  surface: "Builder",
  coordinator: "Engineering coordinator",
  gateway: "Engine gateway",
};

/**
 * @param {string} role
 * @param {any} identity
 * @param {{ pid?: number | null }} [known]
 */
function assessProcess(role, identity, known = {}) {
  const name = ROLE_NAMES[role] || role;
  if (!identity || typeof identity !== "object") {
    return {
      role,
      identity: null,
      pid: known.pid ?? null,
      stale: true,
      exact: false,
      reasons: ["identity_unreported"],
      warning: `${name}${known.pid ? ` (pid ${known.pid})` : ""} does not report its code, so it predates identity reporting. Restart it before testing.`,
    };
  }
  const reasons = [];
  let current = null;
  if (identity.sha) {
    current = currentCheckoutState(identity.packageRoot);
    if (current.sha && current.sha !== identity.sha) reasons.push("checkout_moved");
    else if ((current.changeFingerprint || null) !== (identity.changeFingerprint || null)) {
      reasons.push("checkout_changed");
    }
  }
  const exact = Boolean(identity.sha) && identity.dirty === false;
  const stale = reasons.length > 0;
  let warning = null;
  if (reasons.includes("checkout_moved")) {
    warning = `${name} (pid ${identity.pid}) is running ${formatCodeLabel(identity)}, but the checkout is now ${formatCodeLabel(current)}. It is serving stale code; restart it before testing.`;
  } else if (reasons.includes("checkout_changed")) {
    warning = `${name} (pid ${identity.pid}) loaded ${formatCodeLabel(identity)}, and the code has changed on disk since. It is serving stale code; restart it before testing.`;
  } else if (identity.sha && identity.dirty) {
    warning = `${name} (pid ${identity.pid}) loaded uncommitted changes on top of ${identity.sha.slice(0, 7)}; a run cannot be attributed to an exact commit.`;
  }
  return { role, identity, pid: identity.pid ?? known.pid ?? null, current, stale, exact, reasons, warning };
}

/**
 * @param {{
 *   surface: any,
 *   coordinator: any,
 *   coordinatorPid?: number | null,
 *   gateway: any,
 *   gatewayExpected?: boolean,
 * }} input
 */
export function assessServingIdentity(input) {
  const processes = [
    assessProcess("surface", input.surface),
    assessProcess("coordinator", input.coordinator, { pid: input.coordinatorPid }),
  ];
  if (input.gatewayExpected !== false) processes.push(assessProcess("gateway", input.gateway));
  const roots = new Set(
    processes.map((p) => p.identity?.packageRoot).filter((root) => typeof root === "string"),
  );
  const warnings = processes.map((p) => p.warning).filter(Boolean);
  if (roots.size > 1) {
    warnings.push(
      `PATH Build processes are running code from different installs: ${[...roots].join(", ")}.`,
    );
  }
  const surface = processes[0].identity;
  return {
    version: surface?.version || null,
    sha: surface?.sha || null,
    label: formatCodeLabel(surface),
    processes: processes.map(({ role, identity, pid, current, stale, exact, reasons }) => ({
      role,
      pid,
      version: identity?.version || null,
      sha: identity?.sha || null,
      dirty: identity?.dirty ?? null,
      label: formatCodeLabel(identity),
      packageRoot: identity?.packageRoot || null,
      processStartedAt: identity?.processStartedAt || null,
      currentSha: current?.sha || null,
      stale,
      exact,
      reasons,
    })),
    stale: processes.some((p) => p.stale) || roots.size > 1,
    exact: processes.every((p) => p.exact) && roots.size <= 1,
    warnings,
  };
}
