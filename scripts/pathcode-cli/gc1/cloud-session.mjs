/**
 * Phase GC1-c — helpers for cloud drive integration into General Session.
 * Keeps general-session.mjs from absorbing all remote plumbing.
 */

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, relative } from "node:path";
import { randomUUID } from "node:crypto";

import {
  captureTaskSnapshot,
  materializeTaskWorkspace,
  verifySnapshotCurrentness,
  assertPrimaryUnchanged,
  writeSnapshotDiffArtifact,
  normalizeHydrationRelativePath,
} from "./task-snapshot.mjs";
import {
  createCloudEffectsBackend,
  loadEditingHostDependencies,
} from "./cloud-effects.mjs";
import { createTaskJournal } from "./task-journal.mjs";
import { createWorkstationLifecycleManager } from "./lifecycle.mjs";
import { createMockWorkstationTransport } from "./mock-transport.mjs";
import { DEFAULT_REMOTE_ROOT } from "./workspace-hydrator.mjs";
import { detectDependencyStrategy } from "./dependency-strategy.mjs";
import {
  GC1C_CONFIG,
  GC1C_PROBE_WORKSTATION,
  GC1C_IMAGE_DIGEST,
  GC1C_SESSION_BUDGET,
} from "./cloud-constants.mjs";
import { IMAGE_DIGEST_HISTORY } from "./engineering-image.mjs";
import { installRemoteWorker, invokeRemoteWorker } from "./remote-worker.mjs";
import { runRemoteCredentialBoundaryProof } from "./credential-boundary.mjs";
import { assertGc1cTransportConformance } from "./transport-conformance.mjs";
import { queryMachineCapabilities } from "./machine-capabilities.mjs";

/**
 * Index ADMITTED inventory paths → RepositoryEntry.
 * Production inventories expose `observations`; tolerate a legacy `entries` array.
 * @param {object} inventory
 * @returns {Map<string, object>}
 */
export function inventoryEntriesByPath(inventory) {
  const byPath = new Map();
  for (const obs of inventory?.observations ?? []) {
    if (obs?.disposition === "ADMITTED" && obs.entry?.relativePath) {
      byPath.set(obs.entry.relativePath, obs.entry);
    }
  }
  for (const entry of inventory?.entries ?? []) {
    if (entry?.relativePath) byPath.set(entry.relativePath, entry);
  }
  return byPath;
}

/**
 * Rebind approved scope inventory entries onto a task-workspace inventory.
 * Paths stay identical; entry object identity must match the active workspace.
 * @param {object} approved
 * @param {object} inventory
 */
export function remapApprovedScopeEntries(approved, inventory) {
  const byPath = inventoryEntriesByPath(inventory);
  const editableTargets = (approved.editableTargets ?? []).map((t) => {
    if (t.changeKind === "CREATE_TEXT") {
      const parentPath = t.parentEntry?.relativePath;
      const parentEntry = parentPath ? byPath.get(parentPath) : t.parentEntry;
      return { ...t, parentEntry: parentEntry ?? t.parentEntry };
    }
    const entry = byPath.get(t.relativePath);
    if (!entry) {
      const err = new Error(
        `task inventory missing editable path ${t.relativePath}`,
      );
      err.code = "TASK_INVENTORY_GAP";
      throw err;
    }
    return { ...t, entry };
  });
  const contextPaths = (approved.contextPaths ?? []).map((p) => {
    const entry = byPath.get(p.relativePath);
    if (!entry) {
      const err = new Error(
        `task inventory missing context path ${p.relativePath}`,
      );
      err.code = "TASK_INVENTORY_GAP";
      throw err;
    }
    return { ...p, entry };
  });
  /** @type {object} */
  const out = {
    ...approved,
    editableTargets,
    contextPaths,
  };
  if (approved.hydrationPaths) {
    out.hydrationPaths = approved.hydrationPaths.map((p) => {
      const rel = typeof p === "string" ? p : p.relativePath;
      const entry = byPath.get(rel);
      return entry ? { relativePath: rel, entry } : p;
    });
  }
  return out;
}

/**
 * Fixed basename allowlist for validation support files.
 * Host-deterministic only — never arbitrary inventory widening.
 * collectValidationSupportPaths MUST NOT add paths whose basename is outside this set.
 */
export const VALIDATION_SUPPORT_BASENAMES = Object.freeze([
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "tsconfig.json",
  "tsconfig.build.json",
  "vitest.config.ts",
  "vitest.config.js",
  "vitest.config.mjs",
]);

/**
 * Resolve H = approved.hydrationPaths ?? (E ∪ P ∪ required support files).
 * Ensures E⊆H and P⊆H.
 * When approved.hydrationPaths is already set (pre-disclosed), that exact list
 * is used — no silent support widening after human/policy disclosure.
 * @param {object} approved
 * @param {{ supportPaths?: string[] }} [extra]
 */
export function resolveHydrationPaths(approved, extra = {}) {
  const editable = (approved.editableTargets ?? []).map((t) => t.relativePath);
  const context = (approved.contextPaths ?? []).map((p) => p.relativePath);
  const support = [...(extra.supportPaths ?? [])];

  /** @type {string[]} */
  let hydration;
  if (Array.isArray(approved.hydrationPaths) && approved.hydrationPaths.length > 0) {
    hydration = approved.hydrationPaths.map((p) =>
      typeof p === "string" ? p : p.relativePath,
    );
  } else {
    hydration = [...new Set([...editable, ...context, ...support])];
  }

  const hSet = new Set(hydration);
  for (const p of editable) {
    if (!hSet.has(p)) {
      const err = new Error(`E path not in H: ${p}`);
      err.code = "E_NOT_SUBSET_H";
      throw err;
    }
  }
  for (const p of context) {
    if (!hSet.has(p)) {
      const err = new Error(`P path not in H: ${p}`);
      err.code = "P_NOT_SUBSET_H";
      throw err;
    }
  }

  // Normalize + refuse secrets/traversal.
  const normalized = [];
  for (const raw of hydration) {
    const n = normalizeHydrationRelativePath(raw);
    if (!n.ok) {
      const err = new Error(n.detail);
      err.code = n.code;
      throw err;
    }
    normalized.push(n.path);
  }
  return [...new Set(normalized)].sort();
}

/**
 * Compute the effective hydration set H for disclosure and later capture.
 *
 * When hydrationPaths is omitted: H = E ∪ P ∪ collectValidationSupportPaths(inventory).
 * Support is host-deterministic allowlist only (VALIDATION_SUPPORT_BASENAMES) —
 * plus optional test/spec sources when a TARGETED_TEST is already planned.
 * supportOnly = H \ (E ∪ P).
 *
 * @param {{ approved: object, inventory?: object, plannedCheckKinds?: string[] }} input
 * @returns {{ hydrationPaths: string[], editable: string[], context: string[], supportOnly: string[] }}
 */
export function computeEffectiveHydrationSet({
  approved,
  inventory,
  plannedCheckKinds,
}) {
  const editable = [
    ...new Set((approved.editableTargets ?? []).map((t) => t.relativePath)),
  ].sort();
  const context = [
    ...new Set((approved.contextPaths ?? []).map((p) => p.relativePath)),
  ].sort();
  const kinds = plannedCheckKinds ?? approved.plannedCheckKinds ?? [];
  const includeTestSources = Array.isArray(kinds)
    ? kinds.includes("TARGETED_TEST")
    : false;
  const supportPaths =
    Array.isArray(approved.hydrationPaths) && approved.hydrationPaths.length > 0
      ? []
      : collectValidationSupportPaths(inventory, { includeTestSources });
  const hydrationPaths = resolveHydrationPaths(approved, { supportPaths });
  const ep = new Set([...editable, ...context]);
  const supportOnly = hydrationPaths.filter((p) => !ep.has(p));
  return {
    hydrationPaths,
    editable,
    context,
    supportOnly,
  };
}

/**
 * Test helper: assert H equals mustInclude and excludes mustExclude.
 * @param {string[]|{ hydrationPaths: string[] }} h
 * @param {{ mustInclude?: string[], mustExclude?: string[] }} opts
 */
export function assertHydrationSetExact(h, opts = {}) {
  const paths = Array.isArray(h) ? h : h?.hydrationPaths;
  if (!Array.isArray(paths)) {
    const err = new Error("assertHydrationSetExact: missing hydrationPaths");
    err.code = "H_ASSERT_INVALID";
    throw err;
  }
  const set = new Set(paths);
  for (const p of opts.mustInclude ?? []) {
    if (!set.has(p)) {
      const err = new Error(`H missing required path: ${p}`);
      err.code = "H_MISSING";
      throw err;
    }
  }
  for (const p of opts.mustExclude ?? []) {
    if (set.has(p)) {
      const err = new Error(`H unexpectedly includes: ${p}`);
      err.code = "H_UNEXPECTED";
      throw err;
    }
  }
  return true;
}

/**
 * Deterministic test/spec suffixes admitted into H only when a TARGETED_TEST
 * check is already planned. Not editable/provider-visible by default.
 */
export const VALIDATION_SUPPORT_TEST_SUFFIXES = Object.freeze([
  ".test.ts",
  ".test.js",
  ".test.mts",
  ".test.cts",
  ".spec.ts",
  ".spec.js",
  ".spec.mts",
  ".spec.cts",
]);

/**
 * @param {string} rel
 * @returns {boolean}
 */
export function isValidationSupportTestPath(rel) {
  const base = String(rel).split("/").pop() || "";
  return VALIDATION_SUPPORT_TEST_SUFFIXES.some((suf) => base.endsWith(suf));
}

/**
 * Required support files commonly needed for validation (when present in inventory).
 *
 * CRITICAL: Basename allowlist (VALIDATION_SUPPORT_BASENAMES) always applies.
 * Test/spec sources are admitted only when includeTestSources is true because a
 * TARGETED_TEST check is already planned — still host-deterministic, never
 * arbitrary inventory widening.
 *
 * @param {object} inventory
 * @param {{ includeTestSources?: boolean }} [opts]
 */
export function collectValidationSupportPaths(inventory, opts = {}) {
  const names = new Set(VALIDATION_SUPPORT_BASENAMES);
  const includeTestSources = opts.includeTestSources === true;
  /** @type {string[]} */
  const out = [];
  const seen = new Set();
  const consider = (rel) => {
    if (!rel || seen.has(rel)) return;
    const base = rel.split("/").pop();
    if (names.has(base) || names.has(rel)) {
      seen.add(rel);
      out.push(rel);
      return;
    }
    if (includeTestSources && isValidationSupportTestPath(rel)) {
      seen.add(rel);
      out.push(rel);
    }
  };
  for (const obs of inventory?.observations ?? []) {
    consider(obs?.relativePath || obs?.entry?.relativePath || null);
  }
  for (const entry of inventory?.entries ?? inventory?.files ?? []) {
    const rel =
      typeof entry === "string"
        ? entry
        : entry?.relativePath || entry?.path || null;
    consider(rel);
  }
  // Post-condition: every emitted path must match basename allowlist OR
  // (when enabled) the deterministic test/spec suffix set.
  for (const rel of out) {
    const base = rel.split("/").pop();
    const okBasename = names.has(base) || names.has(rel);
    const okTest = includeTestSources && isValidationSupportTestPath(rel);
    if (!okBasename && !okTest) {
      const err = new Error(
        `collectValidationSupportPaths emitted non-allowlisted path: ${rel}`,
      );
      err.code = "SUPPORT_ALLOWLIST_VIOLATION";
      throw err;
    }
  }
  return out;
}

/**
 * Prepare cloud environment after scope approval.
 *
 * @param {object} input
 */
export async function prepareCloudTaskEnvironment(input) {
  const {
    owners,
    primaryRoot,
    approved,
    inventory,
    emit,
    prompt,
    options = {},
  } = input;

  // Prefer the exact pre-disclosed H (human/policy admission). Never silently
  // re-widen via collectValidationSupportPaths after disclosure.
  /** @type {string[]} */
  let hydrationPaths;
  if (
    Array.isArray(options.precomputedHydrationPaths) &&
    options.precomputedHydrationPaths.length > 0
  ) {
    hydrationPaths = resolveHydrationPaths({
      ...approved,
      hydrationPaths: options.precomputedHydrationPaths,
    });
  } else if (
    Array.isArray(approved.hydrationPaths) &&
    approved.hydrationPaths.length > 0
  ) {
    hydrationPaths = resolveHydrationPaths(approved);
  } else {
    hydrationPaths = resolveHydrationPaths(approved, {
      supportPaths: collectValidationSupportPaths(inventory),
    });
  }

  // Drift before capture refuses fresh admission.
  const preSnap = {
    manifest: {
      files: hydrationPaths.map((relativePath) => {
        // Will be filled by capture; here we only check existence via capture.
        return { relativePath };
      }),
    },
  };
  void preSnap;

  let snapshot;
  try {
    snapshot = await captureTaskSnapshot({
      projectRoot: primaryRoot,
      hydrationPaths,
    });
  } catch (e) {
    if (e.code === "SNAPSHOT_DRIFT") {
      return {
        ok: false,
        code: "SNAPSHOT_DRIFT",
        message: e.message,
      };
    }
    return {
      ok: false,
      code: e.code || "SNAPSHOT_FAILED",
      message: e.message,
    };
  }

  emit?.("session.environment.preparing", {
    config: GC1C_CONFIG,
    imageDigest: GC1C_IMAGE_DIGEST,
  });

  const journal = createTaskJournal({
    rootDir: options.journalRoot,
  });
  if (journal.hasCleanupPending()) {
    emit?.("session.cleanup.pending", {
      count: journal.listCleanupPending().length,
    });
    return {
      ok: false,
      code: "GC1C_CLEANUP_PENDING",
      message: "Cleanup pending from a prior task; refusing new billable acquire.",
    };
  }

  const taskId = randomUUID();
  journal.beginTask({
    taskId,
    snapshotId: snapshot.snapshotId,
    manifestDigest: snapshot.manifestDigest,
    imageDigest: GC1C_IMAGE_DIGEST,
  });

  // Mock is the default (no GCP). Live transport only when explicitly requested
  // AND GC1_LIVE_SMOKE=1 (same gate as GcpWorkstationTransport).
  let transport = options.cloudTransport ?? null;
  if (!transport) {
    if (options.skipLiveGcp !== false) {
      transport = createMockWorkstationTransport();
    } else if (process.env.GC1_LIVE_SMOKE === "1") {
      try {
        const { createGcpWorkstationTransport } = await import("./gcp-transport.mjs");
        transport = await createGcpWorkstationTransport();
      } catch (e) {
        return {
          ok: false,
          code: e.code || "GC1C_TRANSPORT_REQUIRED",
          message: e.message || "live GCP transport failed to construct",
        };
      }
    } else {
      return {
        ok: false,
        code: "GC1C_TRANSPORT_REQUIRED",
        message:
          "Cloud transport unavailable (live path requires GC1_LIVE_SMOKE=1; tests use skipLiveGcp/mock).",
      };
    }
  }

  if (transport.kind === "mock") {
    transport.seedCluster?.();
    transport.seedConfig?.(undefined, {
      idleTimeout: "900s",
      runningTimeout: "3600s",
    });
  }

  // Fail closed locally before billable GCP acquire when possible.
  try {
    assertGc1cTransportConformance(transport);
  } catch (e) {
    return {
      ok: false,
      code: e.code || "GC1_REMOTE_TRANSPORT_CAPABILITY_MISSING",
      message: e.message || "transport missing GC1-c runtime delivery capability",
    };
  }

  const lifecycle =
    options.cloudLifecycle ??
    createWorkstationLifecycleManager({
      transport,
      journal,
      sessionBudget: GC1C_SESSION_BUDGET,
      configId: GC1C_CONFIG,
      probeWorkstationId: GC1C_PROBE_WORKSTATION,
      deadlineMs: options.deadlineMs,
      pollIntervalMs: options.pollIntervalMs,
      executionReadyDeadlineMs: options.executionReadyDeadlineMs,
      executionReadyIntervalMs: options.executionReadyIntervalMs,
      executionReadyAttempts: options.executionReadyAttempts,
    });

  let workstation;
  try {
    lifecycle.installSignalHandlers?.();
    workstation = await lifecycle.acquireProbeWorkstation();
  } catch (e) {
    return {
      ok: false,
      code: e.code || "GC1C_ACQUIRE_FAILED",
      message: e.message,
    };
  }

  journal.appendEvent(taskId, "workstation.acquired", {
    workstationId: workstation.workstationId || workstation.name,
  });
  emit?.("session.workstation.ready", {
    workstationId: workstation.workstationId || workstation.name,
    region: "europe-west4",
  });

  // One-shot Engineering Computer probe after execution readiness.
  // Live / explicit inject only — mock unit paths skip unless capabilities provided.
  if (
    options.skipMachineCapabilities !== true &&
    (options.machineCapabilities || options.skipLiveGcp === false)
  ) {
    try {
      const caps =
        options.machineCapabilities ||
        (await queryMachineCapabilities(transport, {
          workstationName: workstation.name,
        }));
      emit?.("session.machine.capabilities", {
        workstationId: workstation.workstationId || workstation.name,
        lines: caps.lines,
        tools: Object.fromEntries(
          Object.entries(caps.tools || {}).map(([id, row]) => [
            id,
            { present: row.present, version: row.version },
          ]),
        ),
      });
    } catch {
      /* capability probe failure is non-fatal for the task path; MACHINE stays empty */
    }
  }

  const taskWorkspaceRoot =
    options.taskWorkspaceRoot ||
    mkdtempSync(join(tmpdir(), "pathcode-gc1c-task-"));

  await materializeTaskWorkspace(snapshot, taskWorkspaceRoot);

  // Task workspace must be a Git repo for existing currentness/inventory owners.
  // Deliberate snapshot — never copy Mac linked-worktree .git pointer.
  try {
    const { execSync } = await import("node:child_process");
    execSync("git init -q", { cwd: taskWorkspaceRoot });
    execSync('git config user.email "gc1c@pathcode.local"', {
      cwd: taskWorkspaceRoot,
    });
    execSync('git config user.name "gc1c"', { cwd: taskWorkspaceRoot });
    execSync("git add -A", { cwd: taskWorkspaceRoot });
    execSync('git commit -qm "gc1c task snapshot"', { cwd: taskWorkspaceRoot });
  } catch {
    /* inventory may still work without git for some hosts; currentness skips below */
  }

  emit?.("session.hydration", {
    files: hydrationPaths.length,
    snapshotId: snapshot.snapshotId,
  });

  const remoteRoot = options.remoteRoot || DEFAULT_REMOTE_ROOT;
  const workstationName = workstation.name;

  // Prefer exact H file list via worker publish (not full-repo hydrator).
  // Worker install runs after lifecycle execution-ready (acquireProbeWorkstation).
  let workerInstallReceipt;
  try {
    workerInstallReceipt = await installRemoteWorker(transport, {
      workstationName,
      sessionId: taskId,
      taskId,
    });
    journal.appendEvent(taskId, "worker.installed", {
      sha256: workerInstallReceipt.sha256,
      remotePath: workerInstallReceipt.remotePath,
      length: workerInstallReceipt.length,
      version: workerInstallReceipt.version,
      runtimeRoot: workerInstallReceipt.runtimeRoot,
    });
  } catch (e) {
    await safeTeardown(lifecycle, journal, taskId, workstation);
    return {
      ok: false,
      code: e.code || "GC1_REMOTE_RUNTIME_WRITE_FAILED",
      message: e.message || "remote worker install failed",
    };
  }

  // Credential boundary proof: after execution ready + worker install,
  // BEFORE dependency install / mutation readiness. Never prints values.
  const credProof = await runRemoteCredentialBoundaryProof(transport, {
    workstationName,
  });
  if (!credProof.ok) {
    await safeTeardown(lifecycle, journal, taskId, workstation);
    return {
      ok: false,
      code: "CREDENTIAL_BOUNDARY_VIOLATION",
      message: credProof.message || "remote credential boundary failed",
      violatedKey: credProof.violatedKey ?? null,
    };
  }

  for (const meta of snapshot.manifest.files) {
    const bytes = snapshot.payload.get(meta.relativePath);
    const response = await invokeRemoteWorker(transport, {
      workstationName,
      installReceipt: workerInstallReceipt,
      workerRemotePath: workerInstallReceipt.remotePath,
      expectedSha256: workerInstallReceipt.sha256,
      sessionId: taskId,
      taskId,
      request: {
        op: "writeFile",
        root: remoteRoot,
        path: meta.relativePath,
        bytesBase64: bytes.toString("base64"),
        mode: meta.mode,
      },
    });
    if (!response?.ok) {
      await safeTeardown(lifecycle, journal, taskId, workstation);
      return {
        ok: false,
        code: "GC1C_HYDRATION_INCOMPLETE",
        message: `failed to hydrate ${meta.relativePath}: ${response?.error?.message}`,
      };
    }
  }

  // Verify remote completeness for H.
  for (const meta of snapshot.manifest.files) {
    const st = await invokeRemoteWorker(transport, {
      workstationName,
      installReceipt: workerInstallReceipt,
      workerRemotePath: workerInstallReceipt.remotePath,
      expectedSha256: workerInstallReceipt.sha256,
      sessionId: taskId,
      taskId,
      request: { op: "stat", root: remoteRoot, path: meta.relativePath },
    });
    if (!st?.ok || !st.result?.isFile) {
      await safeTeardown(lifecycle, journal, taskId, workstation);
      return {
        ok: false,
        code: "GC1C_HYDRATION_INCOMPLETE",
        message: `incomplete hydration: missing ${meta.relativePath}`,
      };
    }
  }

  // Dependency install (disclosed strategy) — mock may no-op.
  const rootListing = snapshot.manifest.files.map((f) => f.relativePath);
  const strategy = detectDependencyStrategy(rootListing);
  prompt?.write?.(
    `Cloud dependency strategy: ${strategy.ecosystem} → ${strategy.installer} ${strategy.args.join(" ")} (${strategy.reason})\n`,
  );

  const cloudBackend = createCloudEffectsBackend({
    transport,
    workstationName,
    remoteRoot,
    taskWorkspaceRoot,
    localPrimaryRoot: primaryRoot,
    journal,
    taskId,
    sessionId: taskId,
    workerInstallReceipt,
    scriptedProcessResults: options.scriptedProcessResults,
  });

  // Rebuild workspace boundary against task workspace.
  const boundary = await owners.createWorkspaceBoundary(taskWorkspaceRoot);
  if (!boundary.ok) {
    await safeTeardown(lifecycle, journal, taskId, workstation);
    return {
      ok: false,
      code: "TASK_WORKSPACE_FAILED",
      message: boundary.error?.message || "createWorkspaceBoundary failed",
    };
  }
  const workspace = boundary.value;
  const configResult = await owners.loadProjectConfig(workspace);
  if (!configResult.ok) {
    await safeTeardown(lifecycle, journal, taskId, workstation);
    return {
      ok: false,
      code: "TASK_CONFIG_FAILED",
      message: configResult.error?.message || "loadProjectConfig failed",
    };
  }
  const inventoryResult = await owners.inventory(workspace, configResult.value);
  if (!inventoryResult.ok) {
    await safeTeardown(lifecycle, journal, taskId, workstation);
    return {
      ok: false,
      code: "TASK_INVENTORY_FAILED",
      message: inventoryResult.error?.message || "inventory failed",
    };
  }

  return {
    ok: true,
    taskId,
    snapshot,
    hydrationPaths,
    taskWorkspaceRoot,
    remoteRoot,
    transport,
    lifecycle,
    workstation,
    journal,
    cloudBackend,
    workspace,
    inventory: inventoryResult.value,
    config: configResult.value,
    strategy,
    configName: GC1C_CONFIG,
    imageDigest: GC1C_IMAGE_DIGEST,
  };
}

/**
 * Finalize cloud task: artifacts, dispose, verify primary unchanged.
 */
export async function finalizeCloudTask(ctx, outcome = {}) {
  const {
    primaryRoot,
    snapshot,
    taskWorkspaceRoot,
    lifecycle,
    journal,
    taskId,
    workstation,
    emit,
    options = {},
  } = ctx;

  const artifactsDir =
    options.artifactsDir ||
    join(journal.rootDir, "artifacts", taskId);
  mkdirSync(artifactsDir, { recursive: true });

  emit?.("session.artifacts.saving", { dir: artifactsDir });
  const diffPath = join(artifactsDir, "task.diff.txt");
  try {
    await writeSnapshotDiffArtifact(taskWorkspaceRoot, snapshot, diffPath);
  } catch {
    writeFileSync(diffPath, "# diff unavailable\n", "utf8");
  }
  writeFileSync(
    join(artifactsDir, "manifest.json"),
    `${JSON.stringify(snapshot.manifest, null, 2)}\n`,
    "utf8",
  );
  journal.appendEvent(taskId, "artifacts.saved", {
    artifacts: { diff: diffPath, dir: artifactsDir },
    disposition: outcome.disposition ?? null,
  });

  emit?.("session.cleanup", { workstationId: workstation?.workstationId });
  let cleanupOk = true;
  try {
    await lifecycle.teardown();
    // Verify absence.
    const still =
      typeof ctx.transport?.getWorkstation === "function"
        ? await ctx.transport.getWorkstation(workstation.name)
        : null;
    if (still && still.state && still.state !== "DELETED") {
      cleanupOk = false;
    } else {
      emit?.("session.workstation.disposed", {
        workstationId: workstation?.workstationId || workstation?.name,
      });
    }
  } catch (e) {
    cleanupOk = false;
    journal.appendEvent(taskId, "cleanup.error", { message: e.message });
  }

  if (!cleanupOk) {
    journal.markCleanupPending(taskId, {
      resourceIds: [workstation?.name || workstation?.workstationId].filter(Boolean),
      detail: "dispose did not verify absence",
    });
    emit?.("session.cleanup.pending", {
      workstationId: workstation?.workstationId || workstation?.name,
    });
  } else {
    journal.markCleanupVerified(taskId);
  }

  try {
    assertPrimaryUnchanged(primaryRoot, snapshot);
  } catch (e) {
    return { ok: false, code: e.code, message: e.message, artifactsDir, cleanupOk };
  }

  return { ok: true, artifactsDir, cleanupOk, journal };
}

async function safeTeardown(lifecycle, journal, taskId, workstation) {
  try {
    await lifecycle.teardown();
    journal.markCleanupVerified(taskId);
  } catch {
    journal.markCleanupPending(taskId, {
      resourceIds: [workstation?.name].filter(Boolean),
    });
  }
}

/**
 * Remap host-discovered validation candidate requests onto the PATH-owned
 * task workspace. Only `cwd` is rebound: argv may still name primary-local
 * tooling (e.g. stub tsc under primary node_modules) for prepare/identity;
 * cloud-effects remaps those absolute paths onto the remote root at run time.
 *
 * @param {Array<object>} candidates
 * @param {{ primaryRoot: string, taskWorkspaceRoot: string }} roots
 */
export function remapValidationCandidatesForTaskWorkspace(candidates, roots) {
  const primary = resolve(String(roots.primaryRoot));
  const task = resolve(String(roots.taskWorkspaceRoot));
  return candidates.map((candidate) => {
    const req = candidate.request;
    if (!req || typeof req !== "object") return candidate;
    const cwd = resolve(String(req.cwd ?? primary));
    let nextCwd = cwd;
    if (cwd === primary || cwd.startsWith(`${primary}/`)) {
      const rel = relative(primary, cwd).replace(/\\/g, "/");
      nextCwd = rel === "" ? task : join(task, ...rel.split("/"));
    }
    return {
      ...candidate,
      request: {
        ...req,
        cwd: nextCwd,
      },
    };
  });
}

export {
  captureTaskSnapshot,
  materializeTaskWorkspace,
  verifySnapshotCurrentness,
  loadEditingHostDependencies,
  createCloudEffectsBackend,
  createTaskJournal,
  GC1C_CONFIG,
  GC1C_IMAGE_DIGEST,
  IMAGE_DIGEST_HISTORY,
};
