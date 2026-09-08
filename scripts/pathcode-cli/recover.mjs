/**
 * Phase 5G `/recover <checkpoint-id>`.
 *
 * Restoring is a separate, human-authorized act. No provider is contacted, no
 * credential is read, and no Git command runs. The checkpoint is loaded from
 * the durable store, every entry's disposition is shown, and only after the
 * operator types the RESTORE challenge is a RecoveryAuthorization minted.
 *
 * Because the store lives outside the project and the checkpoint id is the
 * only input, this works in a fresh process days later — which is the point.
 */

import { COMPACT_NAME } from "./banner.mjs";
import { loadTrialOwners } from "./owners.mjs";
import { acceptsRestoreConfirmation, newChallenge } from "./terminal.mjs";
import { containsPath, resolveRecoveryStoreRoot, resolveStateDirectory } from "./state-dir.mjs";

/** Checkpoint ids are store-local names; refuse anything path-like up front. */
const CHECKPOINT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/**
 * @param {string} value
 */
export function isWellFormedCheckpointId(value) {
  return typeof value === "string" && CHECKPOINT_ID.test(value) && value !== ".." && value !== ".";
}

/**
 * Parse `/recover <checkpoint-id>`.
 * @param {string} line
 */
export function parseRecoverCommand(line) {
  const match = /^\/recover(?:\s+(\S+))?\s*$/.exec(String(line ?? "").trim());
  if (match === null) {
    return { ok: false, code: "NOT_RECOVER_COMMAND" };
  }
  const id = match[1];
  if (id === undefined) {
    return {
      ok: false,
      code: "CHECKPOINT_ID_REQUIRED",
      message: "Usage: /recover <checkpoint-id>",
    };
  }
  if (!isWellFormedCheckpointId(id)) {
    return {
      ok: false,
      code: "CHECKPOINT_ID_MALFORMED",
      message: "That is not a checkpoint id. Ids look like: mc-1a2b3c4d5e6f",
    };
  }
  return { ok: true, checkpointId: id };
}

/**
 * @param {any} review RecoveryReview
 */
export function renderRecoveryReview(review) {
  const lines = ["", "— Recovery review —", ""];
  for (const entry of review.view.entries) {
    lines.push(`  ${entry.disposition.padEnd(24)} ${entry.relativePath}`);
    lines.push(`  ${" ".repeat(24)} action: ${entry.proposedAction.kind}`);
    if (entry.disposition !== "ELIGIBLE_RESTORE" && entry.detail) {
      lines.push(`  ${" ".repeat(24)} reason: ${entry.detail}`);
    }
  }
  lines.push("");
  lines.push(
    "Only ELIGIBLE_RESTORE entries are restored. Anything else is reported and left alone.",
  );
  lines.push("Restoring overwrites the current bytes of those files with the checkpointed bytes.");
  lines.push("Path Code does not commit, stash or otherwise touch Git.");
  return `${lines.join("\n")}\n`;
}

/**
 * Run one `/recover` flow.
 *
 * @param {any} prompt
 * @param {{
 *   checkpointId: string,
 *   projectRoot?: string,
 *   checkoutRoot?: string,
 *   owners?: any,
 *   env?: Record<string, string | undefined>,
 *   platform?: string,
 *   home?: string,
 *   restoreChallenge?: string,
 *   restorePredicate?: Function,
 * }} options
 */
export async function runRecoverCommand(prompt, options) {
  if (!isWellFormedCheckpointId(options.checkpointId)) {
    prompt.write("That is not a checkpoint id.\n");
    return { exitCode: 2, outcome: "CHECKPOINT_ID_MALFORMED" };
  }

  const owners = options.owners ?? (await loadTrialOwners(options.checkoutRoot));
  if (!owners.ok) {
    prompt.write(`${owners.message}\n`);
    return { exitCode: 2, outcome: owners.code };
  }

  const projectRoot = options.projectRoot ?? process.cwd();
  const stateDirectory = resolveStateDirectory({
    ...(options.env === undefined ? {} : { env: options.env }),
    ...(options.platform === undefined ? {} : { platform: options.platform }),
    ...(options.home === undefined ? {} : { home: options.home }),
  });
  if (!stateDirectory.ok) {
    prompt.write(`${stateDirectory.message}\n`);
    return { exitCode: 2, outcome: stateDirectory.code };
  }
  const storeRoot = resolveRecoveryStoreRoot({
    stateDirectory: stateDirectory.directory,
    projectRoot,
  });
  if (!storeRoot.ok) {
    prompt.write(`${storeRoot.message}\n`);
    return { exitCode: 2, outcome: storeRoot.code };
  }
  if (containsPath(projectRoot, storeRoot.root)) {
    // Defensive: resolveRecoveryStoreRoot already refuses this.
    prompt.write("Refusing: the recovery store resolves inside the project.\n");
    return { exitCode: 2, outcome: "RECOVERY_STORE_INSIDE_PROJECT" };
  }

  const boundary = await owners.createWorkspaceBoundary(projectRoot);
  if (!boundary.ok) {
    prompt.write(`Workspace unavailable: ${boundary.error.message}\n`);
    return { exitCode: 2, outcome: "WORKSPACE_UNAVAILABLE" };
  }
  const workspace = boundary.value;
  const loaded = await owners.loadProjectConfig(workspace);
  if (!loaded.ok) {
    prompt.write(`Project configuration unavailable: ${loaded.error.message}\n`);
    return { exitCode: 2, outcome: "CONFIG_UNAVAILABLE" };
  }
  const config = loaded.value;

  const storeResult = owners.createRecoveryStore({ rootDirectory: storeRoot.root });
  if (!storeResult.ok) {
    prompt.write(`Recovery store unavailable: ${storeResult.error.message}\n`);
    return { exitCode: 2, outcome: "RECOVERY_STORE_UNAVAILABLE" };
  }

  const checkpoint = await owners.loadCheckpoint(storeResult.value, options.checkpointId);
  if (!checkpoint.ok) {
    prompt.write(
      `Checkpoint ${options.checkpointId} could not be loaded: ${checkpoint.error.code}\n`,
    );
    prompt.write(`Store: ${storeRoot.root}\n`);
    return { exitCode: 1, outcome: checkpoint.error.code };
  }

  const review = await owners.prepareRecoveryReview(checkpoint.value, workspace, config);
  if (!review.ok) {
    prompt.write(`Recovery review refused: ${review.error.code} — ${review.error.message}\n`);
    return { exitCode: 1, outcome: review.error.code };
  }

  prompt.write(`\n${COMPACT_NAME} — checkpoint ${options.checkpointId}\n`);
  prompt.write(`  Project:   ${projectRoot}\n`);
  prompt.write(`  Store:     ${storeRoot.root}\n`);
  prompt.write(renderRecoveryReview(review.value));

  const eligible = review.value.view.entries.filter(
    (entry) => entry.disposition === "ELIGIBLE_RESTORE",
  );
  if (eligible.length === 0) {
    prompt.write("Nothing is eligible to restore. No authorization was constructed.\n");
    return { exitCode: 1, outcome: "NOTHING_ELIGIBLE" };
  }

  const challenge = options.restoreChallenge ?? newChallenge();
  prompt.write(
    `\nRestore THESE ${eligible.length} entr${eligible.length === 1 ? "y" : "ies"} by typing exactly: RESTORE ${challenge}\n`,
  );
  const line = await prompt.askLine("restore", "> ");
  const approved =
    typeof options.restorePredicate === "function"
      ? options.restorePredicate(line, challenge)
      : acceptsRestoreConfirmation(line, challenge);
  if (!approved || prompt.isStopped()) {
    prompt.write("Recovery declined. Nothing was restored.\n");
    return { exitCode: 130, outcome: "RESTORE_DECLINED" };
  }

  // Authorization is minted only here, after the phrase, over exactly the
  // entries that were displayed.
  const authorization = owners.authorizeRecoveryReview(
    review.value,
    eligible.map((entry) => entry.entryId),
    owners.explicitRecoveryApproval(),
  );
  if (!authorization.ok) {
    prompt.write(`Recovery authorization refused: ${authorization.error.code}\n`);
    return { exitCode: 1, outcome: "RECOVERY_AUTH_FAILED" };
  }

  const executed = await owners.executeRecovery(
    authorization.value,
    review.value,
    workspace,
    config,
  );
  if (!executed.ok) {
    prompt.write(`Recovery failed: ${executed.error.code} — ${executed.error.message}\n`);
    return { exitCode: 1, outcome: "RECOVERY_FAILED" };
  }

  const record = executed.value;
  prompt.write(`\n${record.disposition}\n`);
  for (const entry of record.entries) {
    prompt.write(`  ${entry.disposition.padEnd(24)} ${entry.relativePath}\n`);
  }
  prompt.write("No Git command was run and no model was contacted.\n");
  return {
    exitCode: record.disposition === "RECOVERY_COMPLETE" ? 0 : 1,
    outcome: record.disposition,
    record,
  };
}
