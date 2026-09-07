#!/usr/bin/env node
/**
 * Operator-only user-local installer for the pathcode launcher.
 * Creates ~/.local/bin/pathcode → this checkout's scripts/pathcode.mjs.
 * Never sudo, never npm registry, never shell rc edits, never overwrite collisions.
 *
 * Cursor / implementers must NOT run --install against the real HOME.
 * Canonical tests use a disposable test home.
 */

import {
  lstat,
  mkdir,
  readlink,
  symlink,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  resolveCheckoutRoot,
  resolveRuntimePrerequisites,
} from "./pathcode-cli/paths.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENTRY = join(HERE, "pathcode.mjs");

/**
 * @param {{ home?: string, argv?: string[] }} [options]
 */
export async function runInstallPathcodeLocal(options = {}) {
  const argv = options.argv ?? process.argv.slice(2);
  const home = options.home ?? process.env.HOME ?? homedir();
  const mode = argv.includes("--install")
    ? "install"
    : argv.includes("--check")
      ? "check"
      : "usage";

  if (mode === "usage") {
    process.stdout.write(`Usage:
  node scripts/install-pathcode-local.mjs --check
  node scripts/install-pathcode-local.mjs --install

Creates only ~/.local/bin/pathcode as a user-local symlink to this checkout.
Does not modify shell startup files, PATH, credentials, or other commands.
This is a development link, not an immutable installed release.
`);
    return 2;
  }

  const root = resolveCheckoutRoot();
  const prereq = resolveRuntimePrerequisites(root);
  if (!prereq.ok) {
    process.stderr.write(`${prereq.message}\n`);
    return 2;
  }

  const binDir = join(home, ".local", "bin");
  const linkPath = join(binDir, "pathcode");
  const target = resolve(ENTRY);

  let existing = null;
  try {
    existing = await lstat(linkPath);
  } catch (err) {
    if (err && err.code !== "ENOENT") {
      process.stderr.write(`Cannot inspect ${linkPath}: ${err.code}\n`);
      return 1;
    }
  }

  if (mode === "check") {
    if (!existing) {
      process.stdout.write(`NOT_INSTALLED expected_target=${target}\n`);
      return 1;
    }
    if (!existing.isSymbolicLink()) {
      process.stdout.write(`COLLISION non-symlink at ${linkPath}\n`);
      return 1;
    }
    const current = await readlink(linkPath);
    const resolved = resolve(dirname(linkPath), current);
    if (resolved === target) {
      process.stdout.write(`OK link=${linkPath} target=${target}\n`);
      return 0;
    }
    process.stdout.write(
      `MISMATCH link=${linkPath} current=${resolved} expected=${target}\n`,
    );
    return 1;
  }

  // --install
  if (existing) {
    if (!existing.isSymbolicLink()) {
      process.stderr.write(
        `Refusing to overwrite existing non-symlink at ${linkPath}\n`,
      );
      return 1;
    }
    let current;
    try {
      current = await readlink(linkPath);
    } catch {
      process.stderr.write(
        `Refusing dangling or unreadable symlink at ${linkPath}\n`,
      );
      return 1;
    }
    const resolved = resolve(dirname(linkPath), current);
    if (resolved === target) {
      process.stdout.write(
        `IDEMPOTENT already linked:\n  ${linkPath} -> ${target}\n`,
      );
      process.stdout.write(
        "Development link to this worktree (not an immutable release).\n",
      );
      remindPath(binDir);
      return 0;
    }
    process.stderr.write(
      `Refusing to overwrite different symlink at ${linkPath} -> ${resolved}\n`,
    );
    return 1;
  }

  try {
    await mkdir(binDir, { recursive: true });
  } catch (err) {
    process.stderr.write(`Cannot create ${binDir}: ${err && err.code}\n`);
    return 1;
  }

  // Ensure binDir is a directory (mkdir recursive won't replace a file).
  let binStat;
  try {
    binStat = await lstat(binDir);
  } catch (err) {
    process.stderr.write(`Cannot stat ${binDir}\n`);
    return 1;
  }
  if (!binStat.isDirectory()) {
    process.stderr.write(`Refusing: ${binDir} is not a directory\n`);
    return 1;
  }

  try {
    await symlink(target, linkPath);
  } catch (err) {
    process.stderr.write(`Symlink failed: ${err && err.code}\n`);
    return 1;
  }

  process.stdout.write(`Installed:\n  ${linkPath} -> ${target}\n`);
  process.stdout.write(
    "Development link to this worktree (not an immutable release).\n",
  );
  remindPath(binDir);
  return 0;
}

function remindPath(binDir) {
  const pathEnv = process.env.PATH ?? "";
  const parts = pathEnv.split(":");
  if (!parts.includes(binDir)) {
    process.stdout.write(
      `\n${binDir} is not on this shell's PATH.\n` +
        `For this shell only:\n  export PATH="${binDir}:$PATH"\n` +
        `Persistent PATH editing is your separate choice; this installer does not edit shell startup files.\n`,
    );
  }
}

const isDirect =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isDirect) {
  runInstallPathcodeLocal()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err) => {
      process.stderr.write(`${err && err.message ? err.message : err}\n`);
      process.exitCode = 1;
    });
}
