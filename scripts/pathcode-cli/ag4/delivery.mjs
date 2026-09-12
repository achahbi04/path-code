/**
 * AG4 — post-VERIFIED publication orchestration (PATH shell, not engine).
 */

import {
  assertGithubCliReady,
  assertWritePermission,
  resolveGithubRemoteTarget,
} from "./remote.mjs";
import { publishVerifiedResult } from "./publish.mjs";

/**
 * One-shot y/N publication decision.
 * @param {{
 *   prompt: any,
 *   emit?: (type: string, fields?: Record<string, unknown>) => void,
 *   remoteLabel: string,
 *   baseBranch: string,
 *   taskBranch: string,
 *   cardsOwnProgress?: boolean,
 * }} opts
 * @returns {Promise<"approve"|"decline"|"cancel">}
 */
export async function requestPublicationApproval(opts) {
  const emit = typeof opts.emit === "function" ? opts.emit : () => {};
  const approvalFields = {
    remote: opts.remoteLabel,
    baseBranch: opts.baseBranch,
    taskBranch: opts.taskBranch,
    status: "pending",
  };

  if (typeof opts.prompt.askPublicationDecision === "function") {
    return opts.prompt.askPublicationDecision({
      remote: opts.remoteLabel,
      baseBranch: opts.baseBranch,
      taskBranch: opts.taskBranch,
      // Living TUI already shows the approval copy from session.delivery.approval.
      showPrompt: opts.cardsOwnProgress !== true,
      // Emit only after the one-shot key listener is armed (avoid lost y/n).
      onListening: () => {
        emit("session.delivery.approval", approvalFields);
      },
    });
  }

  // Fallback: line prompt after TUI (tests / non-TTY).
  emit("session.delivery.approval", approvalFields);
  const line = await opts.prompt.askLine(
    "ag4-publish",
    `Publish verified work to GitHub and create a pull request? [y/N] `,
  );
  if (line == null) return "cancel";
  const t = String(line).trim().toLowerCase();
  if (t === "y" || t === "yes") return "approve";
  return "decline";
}

/**
 * @param {{
 *   projectRoot: string,
 *   prompt: any,
 *   emit?: (type: string, fields?: Record<string, unknown>) => void,
 *   sessionResult: {
 *     classification?: string,
 *     advancesSession?: boolean,
 *     taskBranch?: string,
 *     commitSha?: string,
 *     changedFiles?: string[],
 *     validation?: any,
 *   },
 *   issueNumber?: number | null,
 *   issueTitle?: string | null,
 *   cardsOwnProgress?: boolean,
 *   signal?: AbortSignal,
 * }} opts
 */
export async function runGithubDeliveryAfterVerified(opts) {
  const emit = typeof opts.emit === "function" ? opts.emit : () => {};
  const sr = opts.sessionResult || {};
  if (sr.classification !== "VERIFIED" || !sr.advancesSession) {
    return { ok: true, skipped: true, reason: "not_verified" };
  }
  if (!sr.taskBranch || !sr.commitSha) {
    return { ok: true, skipped: true, reason: "missing_git_result" };
  }

  emit("session.delivery.phase", { phase: "Preparing GitHub delivery" });

  const ready = assertGithubCliReady(opts.projectRoot);
  if (!ready.ok) {
    emit("session.delivery.result", { status: ready.code, message: ready.message });
    return ready;
  }

  emit("session.delivery.phase", { phase: "Resolving remote" });
  const target = resolveGithubRemoteTarget(opts.projectRoot);
  if (!target.ok) {
    emit("session.delivery.result", { status: target.code, message: target.message });
    return target;
  }

  emit("session.delivery.phase", { phase: "Checking remote permission" });
  const perm = assertWritePermission(target);
  if (!perm.ok) {
    emit("session.delivery.result", { status: perm.code, message: perm.message });
    return perm;
  }

  const remoteLabel = `${target.remoteName} → ${target.nameWithOwner}`;
  const decision = await requestPublicationApproval({
    prompt: opts.prompt,
    emit,
    remoteLabel,
    baseBranch: target.baseBranch,
    taskBranch: sr.taskBranch,
    cardsOwnProgress: opts.cardsOwnProgress === true,
  });

  if (decision === "cancel") {
    emit("session.delivery.result", { status: "CANCELLED" });
    return { ok: false, code: "CANCELLED", message: "Publication cancelled." };
  }
  if (decision !== "approve") {
    emit("session.delivery.result", { status: "DECLINED" });
    return { ok: true, declined: true };
  }

  emit("session.delivery.phase", { phase: "Publishing verified branch" });
  if (opts.signal?.aborted) {
    return { ok: false, code: "CANCELLED", message: "Publication cancelled." };
  }

  emit("session.delivery.phase", { phase: "Verifying remote commit" });
  const published = publishVerifiedResult({
    projectRoot: opts.projectRoot,
    target: {
      remoteName: target.remoteName,
      nameWithOwner: target.nameWithOwner,
      baseBranch: target.baseBranch,
    },
    taskBranch: sr.taskBranch,
    verifiedCommitSha: sr.commitSha,
    issueNumber: opts.issueNumber ?? null,
    issueTitle: opts.issueTitle ?? null,
    changedFiles: sr.changedFiles,
    validation: sr.validation,
    classification: "VERIFIED",
    signal: opts.signal,
  });

  if (!published.ok) {
    emit("session.delivery.result", {
      status: published.code,
      message: published.message,
      push: published.push || null,
      remoteBranchOk: Boolean(published.push?.ok),
      prOk: false,
    });
    return published;
  }

  emit("session.delivery.phase", { phase: "Creating pull request" });
  emit("session.delivery.phase", { phase: "Pull request created" });
  emit("session.delivery.result", {
    status: "PUBLISHED",
    remote: remoteLabel,
    baseBranch: target.baseBranch,
    taskBranch: sr.taskBranch,
    commitSha: sr.commitSha,
    remoteBranchOk: true,
    prOk: true,
    prNumber: published.pr?.pr?.number ?? published.pr?.number ?? null,
    prUrl: published.pr?.pr?.url ?? published.pr?.url ?? null,
  });

  return {
    ok: true,
    published: true,
    target,
    push: published.push,
    pr: published.pr?.pr || published.pr,
  };
}

/**
 * Format durable GitHub lines for the final summary.
 * @param {any} delivery
 */
export function formatDeliverySummary(delivery) {
  if (!delivery || delivery.skipped || delivery.declined) {
    if (delivery?.declined) {
      return ["", "GitHub", "Publication declined — local VERIFIED result kept."];
    }
    return [];
  }
  if (!delivery.ok) {
    const lines = ["", "GitHub", `Delivery: ${delivery.code || "FAILED"}`];
    if (delivery.message) lines.push(String(delivery.message).slice(0, 200));
    if (delivery.push?.ok) {
      lines.push(`Remote branch published: ${delivery.push.branch || ""}`);
      lines.push(`Remote commit: ${delivery.push.remoteCommitSha || ""}`);
    }
    return lines;
  }
  const lines = ["", "GitHub"];
  if (delivery.target) {
    lines.push(`${delivery.target.remoteName} → ${delivery.target.nameWithOwner}`);
  }
  const pr = delivery.pr;
  if (pr?.number) lines.push(`PR #${pr.number}`);
  if (pr?.url) lines.push(pr.url);
  return lines;
}
