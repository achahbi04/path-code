/**
 * Phase 5G — local preflight and its refusals (§B steps 1–3, §D, §E, §H).
 *
 * 5G-F  preflight composes workspace, inventory and the Git owners offline
 * 5G-G  a directory that is not a Git working tree is refused
 * 5G-H  a detached HEAD is refused
 * 5G-I  a half-finished merge/rebase/cherry-pick/revert/bisect is refused
 * 5G-J  the Path Code runtime checkout is refused as a target (§H)
 * 5G-K  a recovery store that would land inside the project is refused (§D)
 * 5G-L  a dirty tree is disclosed, never acted on
 * 5G-W  PATHCODE_STATE_DIR overrides, and must be absolute
 * 5G-X  platform default state directories
 * 5G-Y  sensitive paths: Git state, dependency trees, runtime sources
 * 5G-Z  sensitive paths: the .env family and private key material
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { classifyScopePathSensitivity } from "../../src/scope/index.js";
import {
  CHECKOUT_ROOT,
  cleanupTrackedRoots,
  git,
  importHost,
  loadOwners,
  provisionProject,
  writeFile,
} from "./helpers.js";

afterAll(() => {
  cleanupTrackedRoots();
});

async function preflight(
  projectRoot: string,
  env: Record<string, string | undefined>,
) {
  const owners = await loadOwners();
  const { runGeneralSessionPreflight } = await importHost("preflight.mjs");
  return runGeneralSessionPreflight(owners, {
    projectRoot,
    checkoutRoot: CHECKOUT_ROOT,
    env,
  });
}

describe("5G-F: preflight composes the read-only owners", () => {
  it("5G-F: reports the project root, Git position, inventory and store root", async () => {
    const fixture = provisionProject();
    const result = await preflight(fixture.projectRoot, fixture.env);

    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(result.projectRoot).toBe(fixture.projectRoot);
    expect(result.gitRoot).toBe(fixture.projectRoot);
    expect(result.gitPosition.kind).toBe("GIT_REPOSITORY");
    expect(result.gitPosition.branch).toBe("main");
    expect(typeof result.gitPosition.headOid).toBe("string");
    expect(result.inventory.observations.length).toBeGreaterThan(0);
    expect(result.recoveryStoreRoot.startsWith(fixture.storeRoot)).toBe(true);
    expect(result.stateDirectorySource).toBe("PATHCODE_STATE_DIR");
    expect(result.workingTree.clean).toBe(true);
    expect(result.forbiddenRelativePrefixes).toEqual([]);
  });

  it("5G-F: the preflight module never shells out to git", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(
      join(CHECKOUT_ROOT, "scripts/pathcode-cli/preflight.mjs"),
      "utf8",
    );
    expect(source).not.toMatch(/child_process|spawnSync|spawn\(|execFileSync/);
  });
});

describe("5G-G / 5G-H / 5G-I: Git states a session refuses", () => {
  it("5G-G: refuses a directory that is not a Git working tree", async () => {
    const fixture = provisionProject({ git: false });
    const result = await preflight(fixture.projectRoot, fixture.env);
    expect(result.ok).toBe(false);
    expect(result.code).toBe("GENERAL_SESSION_NOT_A_GIT_REPOSITORY");
  });

  it("5G-H: refuses a detached HEAD", async () => {
    const fixture = provisionProject();
    const head = git(fixture.projectRoot, ["rev-parse", "HEAD"]).trim();
    git(fixture.projectRoot, ["checkout", "--quiet", "--detach", head]);
    const result = await preflight(fixture.projectRoot, fixture.env);
    expect(result.ok).toBe(false);
    expect(result.code).toBe("GENERAL_SESSION_DETACHED_HEAD");
  });

  it("5G-I: refuses every in-progress multi-step operation marker", async () => {
    const { GIT_IN_PROGRESS_MARKERS, detectGitOperationInProgress } =
      await importHost("preflight.mjs");
    expect(GIT_IN_PROGRESS_MARKERS.length).toBeGreaterThanOrEqual(6);

    for (const entry of GIT_IN_PROGRESS_MARKERS) {
      const fixture = provisionProject();
      const marker = join(fixture.projectRoot, ".git", entry.marker);
      if (entry.marker.startsWith("rebase-")) {
        mkdirSync(marker, { recursive: true });
      } else {
        writeFileSync(marker, "marker\n", "utf8");
      }
      const detected = detectGitOperationInProgress(
        join(fixture.projectRoot, ".git"),
      );
      expect(detected?.code).toBe(entry.code);

      const result = await preflight(fixture.projectRoot, fixture.env);
      expect(result.ok, entry.marker).toBe(false);
      expect(result.code).toBe("GENERAL_SESSION_GIT_OPERATION_IN_PROGRESS");
      expect(result.message).toContain(entry.code);
    }
  });

  it("5G-I: resolves a gitdir: pointer file, so linked worktrees are covered", async () => {
    const { resolveGitDirectory } = await importHost("preflight.mjs");
    const fixture = provisionProject();
    expect(resolveGitDirectory(fixture.projectRoot)).toBe(
      join(fixture.projectRoot, ".git"),
    );

    const pointerHome = provisionProject({ git: false });
    const realGitDir = join(pointerHome.projectRoot, "real-git-dir");
    mkdirSync(realGitDir, { recursive: true });
    writeFileSync(
      join(pointerHome.projectRoot, ".git"),
      `gitdir: ${realGitDir}\n`,
      "utf8",
    );
    expect(resolveGitDirectory(pointerHome.projectRoot)).toBe(realGitDir);
  });
});

describe("5G-J: the runtime checkout is never a target", () => {
  it("5G-J: refuses when the project root is this Path Code checkout", async () => {
    const fixture = provisionProject();
    const result = await preflight(CHECKOUT_ROOT, fixture.env);
    expect(result.ok).toBe(false);
    expect(result.code).toBe("SELF_WORKSPACE_MUTATION_NOT_SUPPORTED");
  });

  it("5G-J: refuses a directory inside this checkout, and forbids nested runtime sources", async () => {
    const { classifySelfWorkspace } = await importHost("preflight.mjs");

    expect(classifySelfWorkspace(CHECKOUT_ROOT, CHECKOUT_ROOT).kind).toBe("SELF");
    expect(
      classifySelfWorkspace(join(CHECKOUT_ROOT, "src"), CHECKOUT_ROOT).kind,
    ).toBe("SELF");

    const fixture = provisionProject();
    const nested = classifySelfWorkspace(
      fixture.projectRoot,
      join(fixture.projectRoot, "vendor/path-code"),
    );
    expect(nested.kind).toBe("NESTED_RUNTIME");
    expect(nested.relativePrefix).toBe("vendor/path-code");
    expect(classifySelfWorkspace(fixture.projectRoot, CHECKOUT_ROOT).kind).toBe(
      "SEPARATE",
    );
  });
});

describe("5G-K / 5G-W / 5G-X: the state directory and the store root", () => {
  it("5G-K: refuses a recovery store that would resolve inside the project", async () => {
    const fixture = provisionProject();
    const result = await preflight(fixture.projectRoot, {
      ...fixture.env,
      PATHCODE_STATE_DIR: join(fixture.projectRoot, ".pathcode"),
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("RECOVERY_STORE_INSIDE_PROJECT");
  });

  it("5G-K: refuses a store root that contains the project", async () => {
    const { resolveRecoveryStoreRoot } = await importHost("state-dir.mjs");
    const fixture = provisionProject();
    // A project checked out beneath the store: restoring it would mean the
    // store rewriting the tree it lives in.
    const nestedProject = join(fixture.storeRoot, "recovery", "nested-project");
    mkdirSync(nestedProject, { recursive: true });
    const contains = resolveRecoveryStoreRoot({
      stateDirectory: fixture.storeRoot,
      projectRoot: nestedProject,
    });
    expect(contains.ok).toBe(false);
    expect(contains.code).toBe("RECOVERY_STORE_CONTAINS_PROJECT");

    const outside = resolveRecoveryStoreRoot({
      stateDirectory: fixture.storeRoot,
      projectRoot: fixture.projectRoot,
    });
    expect(outside.ok).toBe(true);
    expect(outside.root).toBe(join(fixture.storeRoot, "recovery"));
  });

  it("5G-W: PATHCODE_STATE_DIR overrides the platform default and must be absolute", async () => {
    const { resolveStateDirectory } = await importHost("state-dir.mjs");

    const override = resolveStateDirectory({
      env: { PATHCODE_STATE_DIR: "/tmp/pathcode-state" },
      platform: "darwin",
      home: "/Users/example",
    });
    expect(override.ok).toBe(true);
    expect(override.directory).toBe("/tmp/pathcode-state");
    expect(override.source).toBe("PATHCODE_STATE_DIR");

    const relative = resolveStateDirectory({
      env: { PATHCODE_STATE_DIR: "relative/state" },
      platform: "darwin",
      home: "/Users/example",
    });
    expect(relative.ok).toBe(false);
    expect(relative.code).toBe("STATE_DIRECTORY_NOT_ABSOLUTE");
  });

  it("5G-X: resolves the documented default for each platform", async () => {
    const { resolveStateDirectory } = await importHost("state-dir.mjs");

    const mac = resolveStateDirectory({
      env: {},
      platform: "darwin",
      home: "/Users/example",
    });
    expect(mac.directory).toBe(
      "/Users/example/Library/Application Support/PATH Code",
    );
    expect(mac.source).toBe("PLATFORM_DEFAULT");

    const xdg = resolveStateDirectory({
      env: { XDG_STATE_HOME: "/home/example/.local/state" },
      platform: "linux",
      home: "/home/example",
    });
    expect(xdg.directory).toBe("/home/example/.local/state/pathcode");

    const linuxFallback = resolveStateDirectory({
      env: {},
      platform: "linux",
      home: "/home/example",
    });
    expect(linuxFallback.directory).toBe("/home/example/.local/state/pathcode");

    const windows = resolveStateDirectory({
      env: { LOCALAPPDATA: "/C:/Users/example/AppData/Local" },
      platform: "win32",
    });
    expect(windows.ok).toBe(true);
    expect(windows.directory).toContain("PATH Code");

    const windowsMissing = resolveStateDirectory({ env: {}, platform: "win32" });
    expect(windowsMissing.ok).toBe(false);
    expect(windowsMissing.code).toBe("STATE_DIRECTORY_UNAVAILABLE");

    const noHome = resolveStateDirectory({
      env: {},
      platform: "linux",
      home: "not-absolute",
    });
    expect(noHome.ok).toBe(false);
    expect(noHome.code).toBe("STATE_DIRECTORY_UNAVAILABLE");
  });
});

describe("5G-L: a dirty tree is disclosed and left alone", () => {
  it("5G-L: reports modified and untracked paths without touching them", async () => {
    const fixture = provisionProject();
    writeFile(fixture.projectRoot, "src/answer.ts", "export const x = 1;\n");
    writeFile(fixture.projectRoot, "notes.txt", "scratch\n");

    const result = await preflight(fixture.projectRoot, fixture.env);
    expect(result.ok).toBe(true);
    expect(result.workingTree.clean).toBe(false);
    expect(result.workingTree.modified).toContain("src/answer.ts");
    expect(result.workingTree.untracked).toContain("notes.txt");

    // Nothing was stashed, reset or cleaned: the operator's edits survive.
    const status = git(fixture.projectRoot, ["status", "--porcelain"]);
    expect(status).toContain("src/answer.ts");
    expect(status).toContain("notes.txt");
  });

  it("5G-L: no general-session host module carries a destructive Git verb", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const hostDirectory = join(CHECKOUT_ROOT, "scripts/pathcode-cli");
    const destructive =
      /\b(git\s+(stash|reset|clean|checkout|commit|revert|rebase|merge|push|cherry-pick))\b/;
    for (const file of readdirSync(hostDirectory)) {
      if (!file.endsWith(".mjs")) continue;
      const source = readFileSync(join(hostDirectory, file), "utf8");
      expect(source, file).not.toMatch(destructive);
    }
  });
});

describe("5G-Y / 5G-Z: the sensitive-path policy", () => {
  it("5G-Y: refuses Git state, dependency trees and host-forbidden prefixes", () => {
    const refusals: Array<[string, string]> = [
      [".git", "GIT_ADMINISTRATIVE"],
      [".git/config", "GIT_ADMINISTRATIVE"],
      ["packages/app/.git/HEAD", "GIT_ADMINISTRATIVE"],
      ["node_modules/left-pad/index.js", "DEPENDENCY_TREE"],
      ["packages/app/node_modules/x", "DEPENDENCY_TREE"],
      ["/etc/passwd", "PATH_NOT_REPOSITORY_RELATIVE"],
      ["../outside", "PATH_NOT_REPOSITORY_RELATIVE"],
      ["C:/Windows/system32", "PATH_NOT_REPOSITORY_RELATIVE"],
      ["src/\0evil.ts", "PATH_NOT_REPOSITORY_RELATIVE"],
    ];
    for (const [path, reasonCode] of refusals) {
      const verdict = classifyScopePathSensitivity(path);
      expect(verdict.sensitive, path).toBe(true);
      if (!verdict.sensitive) continue;
      expect(verdict.reasonCode, path).toBe(reasonCode);
    }

    const runtime = classifyScopePathSensitivity("vendor/path-code/src/index.ts", {
      forbiddenRelativePrefixes: ["vendor/path-code"],
    });
    expect(runtime.sensitive).toBe(true);
    if (runtime.sensitive) {
      expect(runtime.reasonCode).toBe("PATH_CODE_RUNTIME_SOURCE");
    }

    const store = classifyScopePathSensitivity(".pathcode/recovery/x.json", {
      recoveryStoreRelativePrefix: ".pathcode/recovery",
    });
    expect(store.sensitive).toBe(true);
    if (store.sensitive) expect(store.reasonCode).toBe("RECOVERY_STORE");
  });

  it("5G-Z: refuses the .env family and key material, but admits .env.example", () => {
    for (const path of [
      ".env",
      ".env.local",
      ".env.production",
      "apps/api/.env.test",
    ]) {
      const verdict = classifyScopePathSensitivity(path);
      expect(verdict.sensitive, path).toBe(true);
      if (verdict.sensitive) expect(verdict.reasonCode).toBe("ENVIRONMENT_SECRET");
    }

    for (const path of [
      "id_rsa",
      "keys/id_ed25519",
      "certs/server.pem",
      "certs/server.key",
      "secrets/bundle.p12",
      "secrets/store.jks",
      ".ssh/config",
    ]) {
      const verdict = classifyScopePathSensitivity(path);
      expect(verdict.sensitive, path).toBe(true);
      if (verdict.sensitive) expect(verdict.reasonCode).toBe("PRIVATE_KEY_MATERIAL");
    }

    for (const path of [".env.example", "src/answer.ts", "docs/env.md"]) {
      const verdict = classifyScopePathSensitivity(path);
      expect(verdict.sensitive, path).toBe(false);
    }

    // Normalization happens before classification, so an evasive spelling of a
    // refused path is still refused.
    const normalized = classifyScopePathSensitivity("./src/./.././.env");
    expect(normalized.sensitive).toBe(true);
  });
});
