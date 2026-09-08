/**
 * Phase 5G — General Engineering Session V1.
 *
 * A natural-language task against a real Git repository the operator chose.
 * This module is a *host*: it composes owners that already exist (workspace,
 * inventory, Git, reader, snapshot, Gate 1 catalog, brain, mutation session,
 * validation, recovery) and adds nothing but sequencing and disclosure. There
 * is no second mutation architecture here, and no second Gate 2.
 *
 * Everything the operator is asked to approve, they are shown first:
 *   START   the budget and what a session may do at all
 *   SCOPE   the exact paths the model asked to edit and read
 *   APPLY   the exact bytes of the edit
 *   CHECK   the exact commands, including every npm hook and chain link
 *
 * Three invariants are worth stating plainly, because everything else follows:
 *
 *  - Recovery protection is REQUIRED. Not configurable, not downgradable. A
 *    General Session that cannot checkpoint does not write.
 *  - The checkpoint preimage is the final fresh observation taken immediately
 *    before READY — not the older observation the model planned against.
 *  - The model never mints authority. It proposes paths and bytes; ids for
 *    commands come from the host; every authorization is constructed after a
 *    human typed a challenge phrase.
 */

import { lstat } from "node:fs/promises";

import { COMPACT_NAME } from "./banner.mjs";
import {
  buildTrialChildEnvironment,
  trialChildEnvironmentExcludesSecrets,
} from "./child-env.mjs";
import {
  captureScopeFileFingerprints,
  verifyFinalCurrentness,
  recheckScopeCurrentness,
} from "./currentness.mjs";
import { ESCAPE_LEGEND, prefixUntrustedLines } from "./escape.mjs";
import { loadTrialOwners } from "./owners.mjs";
import { runGeneralSessionPreflight } from "./preflight.mjs";
import {
  MAX_TASK_TEXT_UTF8_BYTES,
  buildScopePlanRequest,
  projectInventoryRows,
  utf8Bytes,
} from "./scope-request.mjs";
import { summarizeValidationOutcome } from "./report.mjs";
import {
  acceptsApplyConfirmation,
  acceptsCheckConfirmation,
  acceptsScopeConfirmation,
  acceptsStartConsent,
  isInteractiveTty,
  newChallenge,
} from "./terminal.mjs";
import {
  discoverValidationCandidates,
  selectPlannedChecks,
} from "./validation-candidates.mjs";

/**
 * Recovery protection for a General Engineering Session.
 *
 * A literal, not an option. There is no code path in this module that opens a
 * mutation session with anything else, and the architecture test asserts it.
 */
export const GENERAL_SESSION_RECOVERY_PROTECTION = "REQUIRED";

/** §I model budget. Disclosed before START; no automatic retries anywhere. */
export const GENERAL_SESSION_MAX_PROVIDER_INVOCATIONS = 3;
/** Scope plans are small: paths and short reasons. */
export const GENERAL_SESSION_SCOPE_OUTPUT_TOKENS = 4_096;
/**
 * 5G-specific edit ceiling. A general engineering edit emits complete file
 * bodies, which 4096 tokens cannot carry for a real source file. This is the
 * hard cap — it equals the brain's own HARD_MAX_OUTPUT_TOKENS, so no larger
 * value is reachable from here.
 */
export const GENERAL_SESSION_EDIT_OUTPUT_TOKENS = 8_192;
/** One transport attempt per invocation: three total, zero retries. */
export const GENERAL_SESSION_TRANSPORT_ATTEMPTS = 3;
export const GENERAL_SESSION_CUMULATIVE_OUTPUT_TOKENS = 24_576;
export const GENERAL_SESSION_REQUEST_BODY_BYTES = 262_144;
export const GENERAL_SESSION_CUMULATIVE_REQUEST_BODY_BYTES = 786_432;
export const GENERAL_SESSION_BRAIN_TIMEOUT_MS = 120_000;
export const MAX_CREDENTIAL_UTF8_BYTES = 8_192;

export const TYPECHECK_CLAIM_ID = "defines-1";
export const TARGETED_CLAIM_ID = "behaves-1";

/**
 * @param {string} taskText
 */
export function isSlashCommand(taskText) {
  return typeof taskText === "string" && taskText.trimStart().startsWith("/");
}

/**
 * A non-slash line at the prompt is an engineering task. Bounded here so an
 * accidental paste of a whole file does not become a provider request.
 * @param {string} taskText
 */
export function validateTaskText(taskText) {
  if (typeof taskText !== "string") {
    return { ok: false, code: "TASK_INVALID", message: "Task text is required." };
  }
  const trimmed = taskText.trim();
  if (trimmed.length === 0) {
    return { ok: false, code: "TASK_INVALID", message: "Task text is required." };
  }
  if (isSlashCommand(trimmed)) {
    return {
      ok: false,
      code: "TASK_IS_COMMAND",
      message: "That looks like a command, not an engineering task.",
    };
  }
  if (utf8Bytes(trimmed) > MAX_TASK_TEXT_UTF8_BYTES) {
    return {
      ok: false,
      code: "TASK_TOO_LONG",
      message: `Task text exceeds ${MAX_TASK_TEXT_UTF8_BYTES} bytes. Describe the outcome, not the diff.`,
    };
  }
  return { ok: true, taskText: trimmed };
}

/**
 * The disclosure shown before START. Everything a session may do at all.
 * @param {{ modelId: string, projectRoot: string, gitBranch: string | null, headOid: string | null,
 *   storeRoot: string, stateSource: string, workingTree: any, candidates: Array<any>, planned: Array<any> }} input
 */
export function renderStartDisclosure(input) {
  const lines = [
    "",
    `${COMPACT_NAME} — General Engineering Session`,
    "",
    `  Project:      ${input.projectRoot}`,
    `  Branch:       ${input.gitBranch ?? "(none)"} @ ${input.headOid ?? "(unborn)"}`,
    `  Provider:     openai`,
    `  Model:        ${input.modelId}`,
    `  Model calls:  at most ${GENERAL_SESSION_MAX_PROVIDER_INVOCATIONS} (scope, edit, post-edit evidence); no automatic retries`,
    `  Output cap:   ${GENERAL_SESSION_SCOPE_OUTPUT_TOKENS} tokens for scope, ${GENERAL_SESSION_EDIT_OUTPUT_TOKENS} for the edit (hard cap)`,
    `  Recovery:     REQUIRED — a checkpoint is written before any file changes`,
    `  Store:        ${input.storeRoot} (${input.stateSource}, outside this project)`,
    `  Git writes:   none. No commit, stash, reset, clean or checkout, ever.`,
    `  Edits:        in place, after you approve the exact bytes; no auto-rollback`,
    `  Checks:       only the commands listed below, after a separate approval`,
    `  Permissions:  approved checks run with your ordinary OS permissions`,
  ];
  if (input.workingTree.clean) {
    lines.push("  Working tree: clean");
  } else {
    lines.push(
      `  Working tree: ${input.workingTree.modified.length} modified, ${input.workingTree.untracked.length} untracked, ${input.workingTree.unmerged.length} unmerged`,
    );
    lines.push(
      "                Your uncommitted work is left exactly as it is.",
    );
    for (const path of input.workingTree.modified.slice(0, 10)) {
      lines.push(`                  M ${path}`);
    }
    for (const path of input.workingTree.untracked.slice(0, 10)) {
      lines.push(`                  ? ${path}`);
    }
    for (const path of input.workingTree.unmerged.slice(0, 10)) {
      lines.push(`                  U ${path}`);
    }
  }
  lines.push("  Validation candidates discovered:");
  for (const candidate of input.candidates) {
    const planned = input.planned.includes(candidate) ? "runnable" : "disclosed only";
    lines.push(`    ${candidate.id} (${candidate.kind}, ${planned})`);
  }
  return `${lines.join("\n")}\n`;
}

/**
 * Render the approved-scope review. This is the list a human says yes to.
 * @param {any} approved
 * @param {string} planTaskSummary
 */
export function renderScopeReview(approved, planTaskSummary) {
  const lines = ["", "— Scope review (model proposal, checked against this repository) —", ""];
  lines.push("Task as the model understood it:");
  lines.push(prefixUntrustedLines(planTaskSummary));
  lines.push("");
  lines.push("Files it may edit (nothing else can be written):");
  for (const target of approved.editableTargets) {
    lines.push(`  ${target.changeKind === "CREATE_TEXT" ? "create" : "edit  "} ${target.relativePath}`);
    lines.push(`         reason: ${prefixUntrustedLines(target.reason).trim()}`);
  }
  lines.push("");
  lines.push(
    approved.contextPaths.length === 0
      ? "Files it may read for context: (none)"
      : "Files it may read for context:",
  );
  for (const context of approved.contextPaths) {
    lines.push(`  read   ${context.relativePath}`);
  }
  if (approved.assumptions.length > 0) {
    lines.push("");
    lines.push("Model assumptions (untrusted):");
    for (const note of approved.assumptions) {
      lines.push(`  ${prefixUntrustedLines(note).trim()}`);
    }
  }
  if (approved.limitations.length > 0) {
    lines.push("");
    lines.push("Model limitations (untrusted):");
    for (const note of approved.limitations) {
      lines.push(`  ${prefixUntrustedLines(note).trim()}`);
    }
  }
  lines.push("");
  lines.push(ESCAPE_LEGEND);
  lines.push("No file has been read for the model yet. Approving scope only opens these files.");
  return `${lines.join("\n")}\n`;
}

/**
 * Full command disclosure for the CHECK prompt: every process, every npm
 * lifecycle hook, every link of every statically expanded chain.
 * @param {Array<any>} planned
 * @param {any} preparedPlan
 */
export function renderValidationPlanReview(planned, preparedPlan) {
  const lines = ["", "— Validation plan review —", ""];
  lines.push(
    "IMPORTANT: approving this runs these commands on your machine, with your",
    "permissions, against your project. Path Code does not sandbox them. Read the",
    "expansion below: an npm script can run anything, including its own hooks.",
    "",
  );
  const byId = new Map(planned.map((candidate) => [candidate.id, candidate]));
  for (const check of preparedPlan.checks) {
    const prep = check.preparedProcess;
    const candidate = byId.get(check.id);
    lines.push(`Check ${check.id} (${check.kind}):`);
    lines.push(`  executable: ${prep.executable}`);
    lines.push(`  argv:       ${JSON.stringify(prep.argv)}`);
    lines.push(`  cwd:        ${prep.cwd}`);
    lines.push(`  timeoutMs:  ${prep.timeoutMs}`);
    lines.push(`  env names:  ${Object.keys(prep.envSnapshot).sort().join(", ")}`);
    lines.push(
      `  OPENAI_API_KEY in env: ${Object.prototype.hasOwnProperty.call(prep.envSnapshot, "OPENAI_API_KEY") ? "yes" : "no"}`,
    );
    if (candidate !== undefined && candidate.source === "NPM_SCRIPT") {
      lines.push("  this runs, in order:");
      for (const node of candidate.disclosure.chain) {
        const marker =
          node.phase === "pre"
            ? "pre-hook"
            : node.phase === "post"
              ? "post-hook"
              : node.via === null
                ? "script"
                : "chained";
        lines.push(
          `    ${"  ".repeat(node.depth)}[${marker}] ${node.name}: ${prefixUntrustedLines(node.body).trim()}`,
        );
      }
      if (candidate.disclosure.lifecycleHooks.length === 0) {
        lines.push("    (no pre/post lifecycle hooks defined for this script)");
      }
    }
    lines.push("");
  }
  lines.push(
    `Declared subject paths: ${preparedPlan.declaredObservations
      .map((o) => o.entry.relativePath)
      .join(", ")}`,
  );
  return `${lines.join("\n")}\n`;
}

/**
 * Read package.json through the workspace boundary, never by raw path.
 * @param {any} owners
 * @param {any} workspace
 * @param {any} config
 * @param {any} inventory
 */
async function readPackageJsonText(owners, workspace, config, inventory) {
  const found = inventory.observations.find(
    (item) => item.disposition === "ADMITTED" && item.relativePath === "package.json",
  );
  if (found === undefined) {
    return null;
  }
  const read = await owners.readRepositoryContent(found.entry, workspace, config);
  if (!read.ok || read.value.status !== "READ" || read.value.observation.kind !== "TEXT") {
    return null;
  }
  return read.value.observation.text;
}

/**
 * Earn Phase 2 observations for the approved paths ONLY.
 *
 * @param {any} owners
 * @param {{ workspace: any, config: any, inventory: any, approved: any }} input
 */
export async function earnApprovedScopeContext(owners, input) {
  const { workspace, config, inventory, approved } = input;

  const mapResult = await owners.buildRepositoryMap(workspace, inventory, config);
  if (!mapResult.ok) {
    return { ok: false, code: "METADATA_FAILED", message: mapResult.error.message };
  }
  const corpusResult = owners.buildRepositorySearchCorpus(inventory, mapResult.value);
  if (!corpusResult.ok) {
    return { ok: false, code: "SEARCH_FAILED", message: corpusResult.error.message };
  }

  /** @type {any[]} */
  const contentObservations = [];
  for (const item of mapResult.value.manifestObservations ?? []) {
    if (item && typeof item === "object" && "observation" in item) {
      contentObservations.push(item.observation);
    }
  }

  const entryStatIdentities = new Map();
  for (const item of inventory.observations) {
    if (item.disposition === "ADMITTED" && "entry" in item) {
      const stats = await lstat(item.entry.canonicalPath);
      entryStatIdentities.set(item.entry, { dev: stats.dev, ino: stats.ino });
    }
  }

  /** @type {Map<string, any>} */
  const observationByPath = new Map();
  const readPaths = [];
  for (const target of approved.editableTargets) {
    if (target.changeKind === "REPLACE_TEXT") {
      readPaths.push({ relativePath: target.relativePath, entry: target.entry });
    }
  }
  for (const context of approved.contextPaths) {
    readPaths.push({ relativePath: context.relativePath, entry: context.entry });
  }

  for (const item of readPaths) {
    if (observationByPath.has(item.relativePath)) {
      continue;
    }
    const read = await owners.readRepositoryContent(item.entry, workspace, config);
    if (!read.ok) {
      return {
        ok: false,
        code: "READ_FAILED",
        message: `${item.relativePath}: ${read.error.code}`,
      };
    }
    if (read.value.status !== "READ") {
      return {
        ok: false,
        code: "READ_REFUSED",
        message: `${item.relativePath} is not readable as text (${read.value.status})`,
      };
    }
    if (read.value.observation.kind !== "TEXT") {
      return {
        ok: false,
        code: "READ_NOT_TEXT",
        message: `${item.relativePath} is not UTF-8 text; Path Code only edits text`,
      };
    }
    // Manifest observations were already collected above. Reusing that exact
    // object matters: the mutation session admits observations by identity
    // against the snapshot, and a second read of the same bytes is a different
    // object.
    const existing = contentObservations.find(
      (o) => o.entry === read.value.observation.entry,
    );
    const observation = existing ?? read.value.observation;
    if (existing === undefined) {
      contentObservations.push(observation);
    }
    observationByPath.set(item.relativePath, observation);
  }

  const snapshotResult = owners.buildRepositorySnapshot({
    workspace,
    config,
    inventory,
    repositoryMap: mapResult.value,
    searchCorpus: corpusResult.value,
    contentObservations,
    entryStatIdentities,
  });
  if (!snapshotResult.ok) {
    return {
      ok: false,
      code: "SNAPSHOT_FAILED",
      message: snapshotResult.error.message,
    };
  }

  /** @type {any[]} */
  const permittedTargets = [];
  /** @type {any[]} */
  const catalogEntries = [];
  for (const target of approved.editableTargets) {
    if (target.changeKind === "REPLACE_TEXT") {
      const observation = observationByPath.get(target.relativePath);
      permittedTargets.push({
        kind: "REPLACE_TEXT",
        contentObservation: observation,
        entry: target.entry,
      });
      catalogEntries.push(target.entry);
    } else {
      permittedTargets.push({
        kind: "CREATE_TEXT",
        parentDirectory: target.parentEntry,
        leafName: target.leafName,
      });
      catalogEntries.push(target.parentEntry);
    }
  }
  for (const observation of contentObservations) {
    if (!catalogEntries.includes(observation.entry)) {
      catalogEntries.push(observation.entry);
    }
  }

  const catalogResult = owners.createReferenceCatalog({
    workspace,
    snapshot: snapshotResult.value,
    selection: { entries: catalogEntries, contentObservations },
  });
  if (!catalogResult.ok) {
    return {
      ok: false,
      code: "CATALOG_FAILED",
      message: catalogResult.error.message,
    };
  }

  const disclosedObservations = [...observationByPath.values()];
  // The post-edit EXECUTION claim must cite CONTENT evidence that exists both
  // before and after the edit. A replaced file is the honest subject; for a
  // create-only scope the first approved context file stands in, and the scope
  // admission below refuses the case where neither exists.
  const supporting = [];
  for (const target of approved.editableTargets) {
    if (target.changeKind === "REPLACE_TEXT") {
      const observation = observationByPath.get(target.relativePath);
      if (observation !== undefined) {
        supporting.push(observation);
        break;
      }
    }
  }
  if (supporting.length === 0 && approved.contextPaths.length > 0) {
    const first = observationByPath.get(approved.contextPaths[0].relativePath);
    if (first !== undefined) {
      supporting.push(first);
    }
  }
  if (supporting.length === 0) {
    owners.disposeReferenceCatalog(catalogResult.value);
    return {
      ok: false,
      code: "SCOPE_POST_EDIT_EVIDENCE_UNAVAILABLE",
      message:
        "the approved scope creates files but names no existing file to cite as post-edit evidence",
    };
  }

  return {
    ok: true,
    snapshot: snapshotResult.value,
    catalog: catalogResult.value,
    permittedTargets,
    disclosedObservations,
    supportingObservations: supporting,
    observationByPath,
  };
}

/**
 * Build the validation blueprint from checks the HOST discovered.
 * @param {Array<any>} planned
 * @param {Array<any>} supportingObservations
 */
export function buildValidationBlueprint(planned, supportingObservations) {
  const checks = planned.map((candidate) => ({
    id: candidate.id,
    kind: candidate.kind,
    request: candidate.request,
  }));
  const assignments = [];
  const typecheck = planned.find((c) => c.kind === "TYPECHECK");
  const targeted = planned.find((c) => c.kind === "TARGETED_TEST");
  if (typecheck !== undefined) {
    assignments.push({ claimId: TYPECHECK_CLAIM_ID, selectedCheckIds: [typecheck.id] });
  }
  if (targeted !== undefined) {
    assignments.push({ claimId: TARGETED_CLAIM_ID, selectedCheckIds: [targeted.id] });
  }

  const subjectPath = supportingObservations[0].entry.relativePath;
  const obligations = [];
  if (typecheck !== undefined) {
    obligations.push(
      `a DEFINES claim with claimId "${TYPECHECK_CLAIM_ID}" naming a symbol the edit defines, mapped to check ${typecheck.id}`,
    );
  }
  if (targeted !== undefined) {
    obligations.push(
      `a BEHAVES claim with claimId "${TARGETED_CLAIM_ID}" describing the scenario the edit changes, mapped to check ${targeted.id}`,
    );
  }

  return {
    checks,
    claimCheckAssignments: assignments,
    supportingObservations,
    postEditInstructionText:
      `The edit has been applied. Propose REASONING_PROPOSAL_JSON containing exactly ${obligations.length} EXECUTION claim(s) on the CONTENT evidence for ${subjectPath}: ${obligations.join("; ")}. Do not omit a required claim. Do not add other EXECUTION claims.`,
    postEditContextBlocks: [],
    maxBrainAttempts: 1,
  };
}

/**
 * Run one General Engineering Session.
 *
 * @param {any} prompt prompt session from terminal.mjs
 * @param {object} options
 */
export async function runGeneralEngineeringSession(prompt, options = {}) {
  const unicode = options.unicode !== false;
  const streams = options.streams;
  if (!options.allowNonTty && streams && !isInteractiveTty(streams)) {
    prompt.write(
      "A General Engineering Session requires a real interactive TTY for stdin and stdout.\n",
    );
    return { exitCode: 2, outcome: "NON_TTY_REFUSED" };
  }

  const task = validateTaskText(options.taskText);
  if (!task.ok) {
    prompt.write(`${task.message}\n`);
    return { exitCode: 2, outcome: task.code };
  }

  const modelId =
    typeof options.modelId === "string" && options.modelId.trim() !== ""
      ? options.modelId.trim()
      : null;
  if (modelId === null && options.brain === undefined) {
    prompt.write(
      "No model selected. Start with --model <id> or set PATHCODE_OPENAI_MODEL.\n",
    );
    return { exitCode: 2, outcome: "MODEL_REQUIRED" };
  }

  const owners = options.owners ?? (await loadTrialOwners(options.checkoutRoot));
  if (!owners.ok) {
    prompt.write(`${owners.message}\n`);
    return { exitCode: 2, outcome: owners.code };
  }

  // ── 1–3. Local preflight. No network, no credential, no provider. ────────
  prompt.write("Checking the working tree…\n");
  const preflight = await runGeneralSessionPreflight(owners, {
    projectRoot: options.projectRoot ?? process.cwd(),
    checkoutRoot: options.checkoutRoot ?? owners.root,
    ...(options.env === undefined ? {} : { env: options.env }),
    ...(options.platform === undefined ? {} : { platform: options.platform }),
    ...(options.home === undefined ? {} : { home: options.home }),
  });
  if (!preflight.ok) {
    prompt.write(`${preflight.message}\n`);
    return { exitCode: 2, outcome: preflight.code };
  }

  const childEnv = buildTrialChildEnvironment();
  if (!trialChildEnvironmentExcludesSecrets(childEnv)) {
    prompt.write("Refusing: the host child environment carried a provider secret.\n");
    return { exitCode: 1, outcome: "ENV_POLICY" };
  }

  // ── 11 (hoisted). Validation candidates. ─────────────────────────────────
  // Discovery is ordered before START deliberately: the mutation session binds
  // its validation blueprint at open, and a session that could never validate
  // must refuse before it spends a provider call, not after it has edited.
  const packageJsonText = await readPackageJsonText(
    owners,
    preflight.workspace,
    preflight.config,
    preflight.inventory,
  );
  const discovery = discoverValidationCandidates({
    projectRoot: preflight.projectRoot,
    packageJsonText,
    childEnv,
    ...(options.env === undefined ? {} : { env: options.env }),
    ...(options.npmCliJs === undefined ? {} : { npmCliJs: options.npmCliJs }),
  });
  const selection = selectPlannedChecks(discovery.candidates);
  if (selection.planned.length === 0) {
    prompt.write("\nVALIDATION_PLAN_NOT_AVAILABLE\n");
    prompt.write(
      "This project offers no check Path Code can turn into evidence: it found no\n" +
        "project-local TypeScript compiler and no admitted npm typecheck/test script.\n" +
        "Nothing was sent to the model and nothing was written.\n",
    );
    for (const refusal of discovery.refused) {
      prompt.write(`  refused ${refusal.id}: ${refusal.reasonCode} — ${refusal.detail}\n`);
    }
    return { exitCode: 2, outcome: "VALIDATION_PLAN_NOT_AVAILABLE" };
  }

  // ── 4. START. Nothing above touched the network; nothing below runs until
  //      this exact phrase is typed. ────────────────────────────────────────
  prompt.write(
    renderStartDisclosure({
      modelId: modelId ?? "(host-provided brain)",
      projectRoot: preflight.projectRoot,
      gitBranch: preflight.gitPosition.branch,
      headOid: preflight.gitPosition.headOid,
      storeRoot: preflight.recoveryStoreRoot,
      stateSource: preflight.stateDirectorySource,
      workingTree: preflight.workingTree,
      candidates: discovery.candidates,
      planned: selection.planned,
    }),
  );
  prompt.write(`\nYour task:\n${prefixUntrustedLines(task.taskText)}\n`);
  const startChallenge = options.startChallenge ?? newChallenge();
  prompt.write(
    `\nType exactly: START ${startChallenge}\n(empty / no / EOF cancels — no network)\n`,
  );
  const startLine = await prompt.askLine("start-consent", "> ");
  const startOk =
    typeof options.consentPredicate === "function"
      ? options.consentPredicate(startLine, startChallenge)
      : acceptsStartConsent(startLine, startChallenge);
  if (!startOk || prompt.isStopped()) {
    prompt.write("Cancelled before any model call. Nothing was read or written.\n");
    return { exitCode: 130, outcome: "START_DECLINED" };
  }

  // ── Credential, then adapter, then brain. ────────────────────────────────
  let brain = options.brain ?? null;
  let ownsBrain = false;
  if (brain === null) {
    let credential = options.credential ?? null;
    if (credential == null) {
      const fromEnv = (options.env ?? process.env).OPENAI_API_KEY;
      if (typeof fromEnv === "string" && fromEnv.length > 0) {
        credential = fromEnv;
      } else {
        const hidden = await prompt.askHiddenCredential(MAX_CREDENTIAL_UTF8_BYTES);
        if (!hidden.ok) {
          prompt.write("No credential acquired. Nothing was dispatched.\n");
          return { exitCode: 130, outcome: "CREDENTIAL_CANCELLED" };
        }
        credential = hidden.credential;
      }
    }
    const adapterResult = owners.createOpenAIAdapter(
      {
        modelId,
        compatibleWithStructuredOutputs: true,
        maxOutputTokensCeiling: GENERAL_SESSION_EDIT_OUTPUT_TOKENS,
      },
      credential,
      {
        maxTransportAttempts: GENERAL_SESSION_TRANSPORT_ATTEMPTS,
        maxOutputTokensPerAttempt: GENERAL_SESSION_EDIT_OUTPUT_TOKENS,
        cumulativeOutputTokens: GENERAL_SESSION_CUMULATIVE_OUTPUT_TOKENS,
        maxRequestBodyBytes: GENERAL_SESSION_REQUEST_BODY_BYTES,
        cumulativeRequestBodyBytes: GENERAL_SESSION_CUMULATIVE_REQUEST_BODY_BYTES,
      },
    );
    credential = null;
    if (!adapterResult.ok) {
      prompt.write(`Adapter configuration failed: ${adapterResult.error.code}\n`);
      return { exitCode: 1, outcome: "ADAPTER_CONFIG_FAILED" };
    }
    const brainResult = owners.createEngineeringBrain(adapterResult.value, {
      maxDispatches: GENERAL_SESSION_MAX_PROVIDER_INVOCATIONS,
      maxTimeoutMs: GENERAL_SESSION_BRAIN_TIMEOUT_MS,
      maxOutputTokens: GENERAL_SESSION_EDIT_OUTPUT_TOKENS,
    });
    if (!brainResult.ok) {
      prompt.write(`Brain configuration failed: ${brainResult.error.code}\n`);
      return { exitCode: 1, outcome: "BRAIN_CONFIG_FAILED" };
    }
    brain = brainResult.value;
    ownsBrain = true;
  }

  const finish = (result) => {
    if (ownsBrain) {
      brain.dispose();
    }
    return result;
  };

  // ── 5. Call #1 — scope plan over inventory and metadata only. ────────────
  prompt.write("\nAsking the model which files this task touches…\n");
  const isSensitive = (relativePath) => {
    const verdict = owners.classifyScopePathSensitivity(relativePath, {
      forbiddenRelativePrefixes: preflight.forbiddenRelativePrefixes,
    });
    return verdict.sensitive === true;
  };
  const inventoryProjection = projectInventoryRows(preflight.inventory, isSensitive);
  const scopeRequest = buildScopePlanRequest({
    correlationId: "general-session-scope",
    taskText: task.taskText,
    inventoryProjection,
    candidates: discovery.candidates,
    maxOutputTokens: GENERAL_SESSION_SCOPE_OUTPUT_TOKENS,
    timeoutMs: GENERAL_SESSION_BRAIN_TIMEOUT_MS,
    maxEditableTargets: owners.MAX_SCOPE_EDITABLE_TARGETS,
  });
  const scopeInvoke = await brain.invoke(scopeRequest);
  if (!scopeInvoke.ok) {
    prompt.write(`Scope call failed: ${scopeInvoke.error.code}\n`);
    prompt.write("No file was read for the model and nothing was written.\n");
    return finish({ exitCode: 1, outcome: "SCOPE_CALL_FAILED" });
  }

  // ── 6. Validate the untrusted plan, then ask a human. ────────────────────
  const parsed = owners.parseEngineeringScopePlan(scopeInvoke.value.response.text);
  if (!parsed.ok) {
    prompt.write(`Scope plan refused: ${parsed.error.code} — ${parsed.error.message}\n`);
    return finish({ exitCode: 1, outcome: parsed.error.code });
  }
  const admitted = owners.admitScopePlan(parsed.value, {
    inventory: preflight.inventory,
    admittedValidationCandidateIds: discovery.candidates.map((c) => c.id),
    policy: { forbiddenRelativePrefixes: preflight.forbiddenRelativePrefixes },
  });
  if (!admitted.ok) {
    prompt.write(`Scope plan refused: ${admitted.error.code} — ${admitted.error.message}\n`);
    return finish({ exitCode: 1, outcome: admitted.error.code });
  }
  const approved = admitted.value;

  prompt.write(renderScopeReview(approved, parsed.value.taskSummary));
  const scopeChallenge = options.scopeChallenge ?? newChallenge();
  prompt.write(
    `\nApprove THIS scope only by typing exactly: SCOPE ${scopeChallenge}\n`,
  );
  const scopeLine = await prompt.askLine("scope", "> ");
  const scopeOk =
    typeof options.scopePredicate === "function"
      ? options.scopePredicate(scopeLine, scopeChallenge)
      : acceptsScopeConfirmation(scopeLine, scopeChallenge);
  if (!scopeOk || prompt.isStopped()) {
    prompt.write("Scope declined. No file was read for the model; nothing was written.\n");
    return finish({ exitCode: 130, outcome: "SCOPE_DECLINED" });
  }

  // Baseline fingerprints at SCOPE approval (not yet disclosed to the provider).
  const scopeFingerprints = await captureScopeFileFingerprints(owners, {
    workspace: preflight.workspace,
    config: preflight.config,
    inventory: preflight.inventory,
    approved,
  });
  if (!scopeFingerprints.ok) {
    prompt.write(
      `Refusing after scope approval: ${scopeFingerprints.code} — ${scopeFingerprints.detail}\n`,
    );
    return finish({ exitCode: 1, outcome: scopeFingerprints.code });
  }

  if (typeof options.afterScopeApproval === "function") {
    await options.afterScopeApproval({
      projectRoot: preflight.projectRoot,
      approved,
    });
  }

  // ── 7. Recheck currentness, then read ONLY the approved paths. ───────────
  const scopeRecheck = await recheckScopeCurrentness(owners, {
    workspace: preflight.workspace,
    config: preflight.config,
    inventory: preflight.inventory,
    expectedGitPosition: preflight.gitPosition,
    expectedFingerprints: scopeFingerprints.fingerprints,
  });
  if (!scopeRecheck.ok) {
    prompt.write(`Refusing after scope approval: ${scopeRecheck.code} — ${scopeRecheck.detail}\n`);
    return finish({ exitCode: 1, outcome: scopeRecheck.code });
  }

  prompt.write("Reading the approved files…\n");
  const context = await earnApprovedScopeContext(owners, {
    workspace: preflight.workspace,
    config: preflight.config,
    inventory: preflight.inventory,
    approved,
  });
  if (!context.ok) {
    prompt.write(`Refused before the edit call: ${context.code} — ${context.message}\n`);
    return finish({ exitCode: 1, outcome: context.code });
  }

  const scopedSelection = selectPlannedChecks(
    discovery.candidates,
    approved.validationCandidateIds,
  );
  const plannedChecks =
    scopedSelection.planned.length > 0 ? scopedSelection.planned : selection.planned;

  // ── §C. The recovery store. A General Session that cannot checkpoint does
  //      not open at all. ────────────────────────────────────────────────────
  const storeResult = owners.createRecoveryStore({
    rootDirectory: preflight.recoveryStoreRoot,
  });
  if (!storeResult.ok) {
    owners.disposeReferenceCatalog(context.catalog);
    prompt.write(
      `Recovery store unavailable: ${storeResult.error.code} — ${storeResult.error.message}\n`,
    );
    return finish({ exitCode: 1, outcome: "RECOVERY_STORE_UNAVAILABLE" });
  }

  const sessionOpen = owners.openEngineeringMutationSession({
    workspace: preflight.workspace,
    snapshot: context.snapshot,
    catalog: context.catalog,
    brain,
    permittedTargets: context.permittedTargets,
    disclosedObservations: context.disclosedObservations,
    validationBlueprint: buildValidationBlueprint(
      plannedChecks,
      context.supportingObservations,
    ),
    editOutputTokenBudget: GENERAL_SESSION_EDIT_OUTPUT_TOKENS,
    // §C: a literal. There is no option, no variable and no downgrade path.
    recoveryProtection: GENERAL_SESSION_RECOVERY_PROTECTION,
    recoveryStore: storeResult.value,
  });
  if (!sessionOpen.ok) {
    owners.disposeReferenceCatalog(context.catalog);
    prompt.write(
      `Mutation session refused: ${sessionOpen.error.code} — ${sessionOpen.error.message}\n`,
    );
    return finish({ exitCode: 1, outcome: "SESSION_OPEN_FAILED" });
  }
  const session = sessionOpen.value;

  const closeSession = (result) => {
    session.close();
    owners.disposeReferenceCatalog(context.catalog);
    return finish(result);
  };

  // ── 8. Call #2 — the edit, with grounding, Gate 1 and an EditReview. ─────
  prompt.write("Asking the model for the edit…\n");
  const proposed = await session.propose({
    correlationId: "general-session-edit",
    instructionText: [
      task.taskText,
      "",
      "Change only the permitted targets. Preserve the public API unless the task",
      "explicitly asks otherwise. Emit each file's complete new text.",
    ].join("\n"),
  });
  if (!proposed.ok) {
    prompt.write(
      `Edit proposal refused: ${proposed.error.code} — ${proposed.error.message}\n`,
    );
    prompt.write("Nothing was written.\n");
    return closeSession({
      exitCode: 1,
      outcome: proposed.error.code,
      modelCalls: 2,
    });
  }
  const review = proposed.value;

  prompt.write("\n— Edit review (exact bytes) —\n");
  for (const item of review.view.order) {
    const before = context.observationByPath.get(item.relativePath);
    prompt.write(`\nTarget: ${item.relativePath} (${item.kind})\n`);
    if (item.kind === "REPLACE_TEXT" && before !== undefined) {
      prompt.write(`Before (${before.byteLength} bytes):\n`);
      prompt.write(`${prefixUntrustedLines(before.text)}\n`);
    } else {
      prompt.write("Before: file does not exist\n");
    }
    prompt.write(`After (${utf8Bytes(item.afterText)} bytes):\n`);
    prompt.write(`${prefixUntrustedLines(item.afterText)}\n`);
  }
  prompt.write(`${ESCAPE_LEGEND}\n`);
  prompt.write(
    "No check has run yet. The edit is applied in place; there is no automatic rollback,\n" +
      "but a recovery checkpoint is written first and /recover can restore these exact bytes.\n",
  );

  const applyChallenge = options.applyChallenge ?? newChallenge();
  prompt.write(`\nApprove THIS review only by typing exactly: APPLY ${applyChallenge}\n`);
  const applyLine = await prompt.askLine("apply", "> ");
  const applyOk =
    typeof options.applyPredicate === "function"
      ? options.applyPredicate(applyLine, applyChallenge)
      : acceptsApplyConfirmation(applyLine, applyChallenge);
  if (!applyOk || prompt.isStopped()) {
    prompt.write("Edit declined — zero authorizations constructed, nothing written.\n");
    return closeSession({
      exitCode: 130,
      outcome: "EDIT_DECLINED",
      modelCalls: 2,
    });
  }

  // ── 9. FINAL currentness → checkpoint → write, in that order. ────────────
  //      §18 / 5G-AI / 5G-AJ. The observations proven here are the ones the
  //      mutation session checkpoints from, because it re-reads the same bytes
  //      and refuses if they no longer match this prepared pre-state.
  prompt.write("Rechecking the working tree before writing…\n");
  const currentness = await verifyFinalCurrentness(owners, {
    projectRoot: preflight.projectRoot,
    expectedGitPosition: preflight.gitPosition,
    order: review.view.order,
  });
  if (!currentness.ok) {
    prompt.write(`\nMUTATION_STALE — ${currentness.detail}\n`);
    prompt.write(
      "Zero files were written. Re-run the task so the review matches what is on disk.\n",
    );
    return closeSession({
      exitCode: 1,
      outcome: "MUTATION_STALE",
      modelCalls: 2,
      staleDetail: currentness.detail,
    });
  }

  /** @type {any[]} */
  const pairs = [];
  for (const item of review.view.order) {
    const auth = await owners.authorizePreparedChange(
      item.prepared,
      owners.explicitEditApproval(),
      item.prepared.config,
    );
    if (!auth.ok) {
      prompt.write(`Edit authorization failed: ${auth.error.code}\n`);
      return closeSession({
        exitCode: 1,
        outcome: "EDIT_AUTH_FAILED",
        modelCalls: 2,
      });
    }
    pairs.push({ prepared: item.prepared, authorization: auth.value });
  }

  prompt.write("Writing the recovery checkpoint, then applying…\n");
  const applied = await session.apply(review, pairs);
  const checkpointId = session.describe().recoveryCheckpointId;
  if (!applied.ok) {
    prompt.write(`Apply failed: ${applied.error.code} — ${applied.error.message}\n`);
    if (checkpointId !== null) {
      prompt.write(`Recovery checkpoint: ${checkpointId}\n`);
      prompt.write(`Restore with: pathcode  then  /recover ${checkpointId}\n`);
    } else {
      prompt.write("No checkpoint was established, which means nothing was written.\n");
    }
    return closeSession({
      exitCode: 1,
      outcome: applied.error.code,
      checkpointId,
      modelCalls: 2,
    });
  }
  const validationReview = applied.value;

  // ── 10 + 12. Post-mutation re-observation happened inside apply; now the
  //      command disclosure and the CHECK prompt. ──────────────────────────
  prompt.write(`\nEdit applied. Recovery checkpoint: ${checkpointId}\n`);
  prompt.write(
    renderValidationPlanReview(plannedChecks, validationReview.view.preparedPlan),
  );
  prompt.write(
    `One model call remains, for post-edit evidence (call 3 of ${GENERAL_SESSION_MAX_PROVIDER_INVOCATIONS}).\n`,
  );
  prompt.write("Disposition: files edited; validation NOT yet established.\n");

  const checkChallenge = options.checkChallenge ?? newChallenge();
  prompt.write(`\nApprove THIS plan only by typing exactly: CHECK ${checkChallenge}\n`);
  const checkLine = await prompt.askLine("check", "> ");
  const checkOk =
    typeof options.checkPredicate === "function"
      ? options.checkPredicate(checkLine, checkChallenge)
      : acceptsCheckConfirmation(checkLine, checkChallenge);
  if (!checkOk || prompt.isStopped()) {
    prompt.write("\nEDIT APPLIED — VALIDATION NOT RUN\n");
    prompt.write("No process was started and no further model call was made.\n");
    prompt.write(`Recovery checkpoint: ${checkpointId}\n`);
    prompt.write(`Restore with: /recover ${checkpointId}\n`);
    owners.disposeReferenceCatalog(validationReview.view.postEditCatalog);
    return closeSession({
      exitCode: 130,
      outcome: "CHECK_DECLINED",
      checkpointId,
      modelCalls: 2,
    });
  }

  const approvals = new Map();
  for (const check of validationReview.view.preparedPlan.checks) {
    approvals.set(check.id, owners.explicitLocalProcessApproval());
  }
  const validationAuth = await owners.authorizeValidationPlan(
    validationReview.view.preparedPlan,
    approvals,
  );
  if (!validationAuth.ok) {
    prompt.write(`Validation authorization failed: ${validationAuth.error.code}\n`);
    owners.disposeReferenceCatalog(validationReview.view.postEditCatalog);
    return closeSession({
      exitCode: 1,
      outcome: "VALIDATION_AUTH_FAILED",
      checkpointId,
      modelCalls: 2,
    });
  }

  // ── 13. Call #3 — post-edit reasoning, EngineeringRun, Gate 2. ───────────
  prompt.write("Running the approved checks…\n");
  const outcome = await session.validate(validationReview, validationAuth.value);
  session.close();
  owners.disposeReferenceCatalog(validationReview.view.postEditCatalog);
  owners.disposeReferenceCatalog(context.catalog);

  if (!outcome.ok) {
    prompt.write(`Validation call failed: ${outcome.error.code}\n`);
    prompt.write(`Recovery checkpoint: ${checkpointId}\n`);
    prompt.write(`Restore with: /recover ${checkpointId}\n`);
    return finish({
      exitCode: 1,
      outcome: "VALIDATION_CALL_FAILED",
      checkpointId,
      modelCalls: 3,
    });
  }

  // ── 14. Report. No automatic recovery, no Git commit, ever. ──────────────
  const summary = summarizeValidationOutcome(outcome.value);
  const accepted =
    summary.label === "MUTATION_APPLIED_AND_CONFIGURED_VALIDATION_ACCEPTED";
  const lines = [
    "",
    `${COMPACT_NAME} — General Engineering Session`,
    "",
    accepted
      ? "EDIT APPLIED · CONFIGURED VALIDATION ACCEPTED"
      : summary.label,
    `  Project:      ${preflight.projectRoot}`,
    `  Files:        ${review.view.order.map((o) => o.relativePath).join(", ")}`,
    `  Typecheck:    ${summary.typecheck}`,
    `  Targeted:     ${summary.regression}`,
    `  Gate 2:       ${summary.gate2}`,
    `  Model calls:  3 / ${GENERAL_SESSION_MAX_PROVIDER_INVOCATIONS}`,
    `  Checkpoint:   ${checkpointId}`,
    "  Git commit:   none",
    "",
    `Restore the pre-edit bytes with:  /recover ${checkpointId}`,
    "Path Code will not recover on your behalf; that decision is yours.",
    "Scope: the declared inputs and approved checks — not whole-project correctness.",
    "",
  ];
  prompt.write(`${lines.join("\n")}`);
  void unicode;

  return finish({
    exitCode: accepted ? 0 : 1,
    outcome: summary.label,
    checkpointId,
    modelCalls: 3,
    validationOutcome: outcome.value,
    preparedEnvSnapshots: validationReview.view.preparedPlan.checks.map(
      (c) => c.preparedProcess.envSnapshot,
    ),
  });
}
