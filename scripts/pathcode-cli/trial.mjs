/**
 * Trial 1 orchestration — compose existing owners; host-only approvals after prompts.
 */

import { lstat } from "node:fs/promises";
import { join } from "node:path";

import {
  acceptsApplyConfirmation,
  acceptsCheckConfirmation,
  acceptsStartConsent,
  isInteractiveTty,
  newChallenge,
} from "./terminal.mjs";
import {
  MUTATION_RELATIVE_PATH,
  TRIAL_ID,
  provisionMultiply01Workspace,
  SEED_CALCULATOR_SOURCE,
} from "./fixture-store.mjs";
import {
  buildTrialChildEnvironment,
  trialChildEnvironmentExcludesSecrets,
} from "./child-env.mjs";
import { loadTrialOwners } from "./owners.mjs";
import { ESCAPE_LEGEND, prefixUntrustedLines } from "./escape.mjs";
import { renderTrialReport, summarizeValidationOutcome } from "./report.mjs";
import { COMPACT_NAME } from "./banner.mjs";

export const TRIAL_CHECK_TIMEOUT_MS = 15_000;
export const TRIAL_BRAIN_TIMEOUT_MS = 90_000;
export const TRIAL_MAX_DISPATCHES = 2;
export const TRIAL_TRANSPORT_ATTEMPTS = 2;
export const TRIAL_OUTPUT_TOKENS_PER_CALL = 4_096;
export const TRIAL_CUMULATIVE_OUTPUT_TOKENS = 8_192;
export const TRIAL_REQUEST_BODY_BYTES = 131_072;
export const TRIAL_CUMULATIVE_REQUEST_BODY_BYTES = 262_144;
export const MAX_CREDENTIAL_UTF8_BYTES = 8_192;
export const BEHAVES_CLAIM_ID = "behaves-multiply-01";
export const TYPECHECK_CHECK_ID = "typecheck";
export const TARGETED_CHECK_ID = "targeted";

/**
 * Resolve model id from argv/env/prompt policy.
 * @param {{ modelFlag?: string | null, envModel?: string | null }} input
 */
export function resolveModelSelection(input) {
  const flag =
    typeof input.modelFlag === "string" && input.modelFlag.trim() !== ""
      ? input.modelFlag.trim()
      : null;
  const env =
    typeof input.envModel === "string" && input.envModel.trim() !== ""
      ? input.envModel.trim()
      : null;
  if (flag && env && flag !== env) {
    return {
      ok: false,
      code: "MODEL_CONFLICT",
      message:
        "Conflicting model settings: --model and PATHCODE_OPENAI_MODEL disagree.",
    };
  }
  const modelId = flag ?? env;
  if (!modelId) {
    return { ok: false, code: "MODEL_REQUIRED", message: "Model id required." };
  }
  return { ok: true, modelId };
}

/**
 * Check ABSENT-default vs explicit denials for network/secret/edit/check actions.
 * @param {any} resolvedConfig
 */
export function inspectTrialActionPolicy(resolvedConfig) {
  const disabled = new Set(resolvedConfig?.restrictions?.disabledActions ?? []);
  const denied = [];
  for (const action of [
    "NETWORK_ACCESS",
    "SECRET_ACCESS",
    "EDIT",
    "EXECUTE_PROCESS",
    "TYPECHECK",
    "TARGETED_TEST",
  ]) {
    if (disabled.has(action)) {
      denied.push(action);
    }
  }
  return {
    sourceKind: resolvedConfig?.source?.kind ?? "UNKNOWN",
    denied,
    allowed: denied.length === 0,
  };
}

/**
 * @param {any} owners
 * @param {string} root
 * @param {string} tscJs
 */
export async function earnPhase2Context(owners, root, tscJs) {
  const boundary = await owners.createWorkspaceBoundary(root);
  if (!boundary.ok) {
    return { ok: false, code: boundary.error.code, message: boundary.error.message };
  }
  const workspace = boundary.value;
  const loaded = await owners.loadProjectConfig(workspace);
  if (!loaded.ok) {
    return { ok: false, code: loaded.error.code, message: loaded.error.message };
  }
  const config = loaded.value;
  const policy = inspectTrialActionPolicy(config);
  if (!policy.allowed) {
    return {
      ok: false,
      code: "ACTION_DISABLED",
      message: `Configured denial: ${policy.denied.join(", ")}`,
      policy,
    };
  }

  const inv = await owners.inventory(workspace, config);
  if (!inv.ok) {
    return { ok: false, code: inv.error.code, message: inv.error.message };
  }
  const mapResult = await owners.buildRepositoryMap(workspace, inv.value, config);
  if (!mapResult.ok) {
    return { ok: false, code: mapResult.error.code, message: mapResult.error.message };
  }
  const corpusResult = owners.buildRepositorySearchCorpus(inv.value, mapResult.value);
  if (!corpusResult.ok) {
    return {
      ok: false,
      code: corpusResult.error.code,
      message: corpusResult.error.message,
    };
  }

  const contentPaths = [
    MUTATION_RELATIVE_PATH,
    "package.json",
    "tsconfig.json",
    "tests/calculator.test.cjs",
  ];
  const contentObservations = [];
  // Bind manifest evidence ContentObservations required by snapshot builders.
  for (const item of mapResult.value.manifestObservations ?? []) {
    if (item && typeof item === "object" && "observation" in item) {
      contentObservations.push(item.observation);
    }
  }
  /** @type {Map<any, { dev: number, ino: number }>} */
  const entryStatIdentities = new Map();

  for (const item of inv.value.observations) {
    if (item.disposition === "ADMITTED" && "entry" in item) {
      const stats = await lstat(item.entry.canonicalPath);
      entryStatIdentities.set(item.entry, { dev: stats.dev, ino: stats.ino });
    }
  }

  for (const rel of contentPaths) {
    const obs = inv.value.observations.find(
      (o) => o.disposition === "ADMITTED" && o.relativePath === rel,
    );
    if (!obs || obs.disposition !== "ADMITTED") {
      return { ok: false, code: "MISSING_ENTRY", message: `missing ${rel}` };
    }
    const read = await owners.readRepositoryContent(obs.entry, workspace, config);
    if (!read.ok || read.value.status !== "READ") {
      return { ok: false, code: "READ_FAILED", message: `failed reading ${rel}` };
    }
    if (!contentObservations.some((c) => c.entry === read.value.observation.entry)) {
      contentObservations.push(read.value.observation);
    }
  }

  const snapshotResult = owners.buildRepositorySnapshot({
    workspace,
    config,
    inventory: inv.value,
    repositoryMap: mapResult.value,
    searchCorpus: corpusResult.value,
    contentObservations,
    entryStatIdentities,
  });
  if (!snapshotResult.ok) {
    return {
      ok: false,
      code: snapshotResult.error.code,
      message: snapshotResult.error.message,
    };
  }

  const sourceObs = contentObservations.find(
    (o) => o.entry.relativePath === MUTATION_RELATIVE_PATH,
  );
  if (!sourceObs) {
    return { ok: false, code: "MISSING_SOURCE", message: "calculator observation missing" };
  }

  const srcDirObs = inv.value.observations.find(
    (o) =>
      (o.disposition === "ADMITTED" || o.disposition === "DESCENDED") &&
      o.relativePath === "src" &&
      "entry" in o &&
      o.entry.physicalKind === "DIRECTORY",
  );
  if (!srcDirObs || !("entry" in srcDirObs)) {
    return { ok: false, code: "MISSING_SRC_DIR", message: "src directory missing" };
  }

  const catalogEntries = [srcDirObs.entry, sourceObs.entry];
  for (const o of contentObservations) {
    if (!catalogEntries.includes(o.entry)) {
      catalogEntries.push(o.entry);
    }
  }

  const catalogResult = owners.createReferenceCatalog({
    workspace,
    snapshot: snapshotResult.value,
    selection: {
      entries: catalogEntries,
      contentObservations,
    },
  });
  if (!catalogResult.ok) {
    return {
      ok: false,
      code: catalogResult.error.code,
      message: catalogResult.error.message,
    };
  }
  const described = owners.describeReferenceCatalog(catalogResult.value);
  if (!described.ok) {
    return {
      ok: false,
      code: described.error.code,
      message: described.error.message,
    };
  }

  const childEnv = buildTrialChildEnvironment();
  if (!trialChildEnvironmentExcludesSecrets(childEnv)) {
    return {
      ok: false,
      code: "ENV_POLICY",
      message: "Host child environment unexpectedly contained secrets",
    };
  }

  const typecheckRequest = {
    executable: process.execPath,
    argv: [tscJs, "-p", join(root, "tsconfig.json")],
    cwd: root,
    env: childEnv,
    timeoutMs: TRIAL_CHECK_TIMEOUT_MS,
  };
  const targetedRequest = {
    executable: process.execPath,
    argv: [join(root, "tests", "calculator.test.cjs")],
    cwd: root,
    env: childEnv,
    timeoutMs: TRIAL_CHECK_TIMEOUT_MS,
  };

  return {
    ok: true,
    workspace,
    config,
    policy,
    inventory: inv.value,
    snapshot: snapshotResult.value,
    catalog: catalogResult.value,
    descriptors: described.value,
    sourceObservation: sourceObs,
    sourceEntry: sourceObs.entry,
    // All seed files disclosed; supporting subject is the mutation target (M28 pattern).
    // Overlapping unchanged paths in BOTH arrays would duplicate on reobservation.
    disclosedObservations: contentObservations.filter((o) =>
      contentPaths.includes(o.entry.relativePath),
    ),
    supportingObservations: [sourceObs],
    typecheckRequest,
    targetedRequest,
    childEnv,
    beforeText: sourceObs.kind === "TEXT" ? sourceObs.text : SEED_CALCULATOR_SOURCE,
  };
}

/**
 * @param {import('./terminal.mjs').createPromptSession extends Function ? any : never} prompt
 * @param {object} options
 */
export async function runMultiply01Trial(prompt, options = {}) {
  const unicode = options.unicode !== false;
  const streams = options.streams;
  if (!options.allowNonTty && streams && !isInteractiveTty(streams)) {
    prompt.write(
      "Live Trial 1 requires a real interactive TTY for stdin and stdout.\n",
    );
    return { exitCode: 2, outcome: "NON_TTY_REFUSED" };
  }

  const platform = process.platform;
  if (platform !== "darwin" && platform !== "linux") {
    prompt.write(
      `Trial 1 execution supports macOS and Linux only (detected ${platform}).\n`,
    );
    return { exitCode: 2, outcome: "UNSUPPORTED_PLATFORM" };
  }

  let modelId = options.modelId ?? null;
  if (!modelId) {
    const resolved = resolveModelSelection({
      modelFlag: options.modelFlag ?? null,
      envModel: options.envModel ?? process.env.PATHCODE_OPENAI_MODEL ?? null,
    });
    if (!resolved.ok) {
      if (resolved.code === "MODEL_REQUIRED") {
        const answered = await prompt.askLine(
          "model",
          "Model id (OpenAI Responses): ",
        );
        if (answered == null || answered.trim() === "") {
          prompt.write("No model selected. Trial cancelled.\n");
          return { exitCode: 130, outcome: "MODEL_CANCELLED" };
        }
        modelId = answered.trim();
      } else {
        prompt.write(`${resolved.message}\n`);
        return { exitCode: 2, outcome: resolved.code };
      }
    } else {
      modelId = resolved.modelId;
    }
  }

  // Consent BEFORE provisioning / credential / network.
  const startChallenge = options.startChallenge ?? newChallenge();
  prompt.write(`\n${COMPACT_NAME} — Trial 1 disclosure\n\n`);
  prompt.write(`  Trial:        ${TRIAL_ID}\n`);
  prompt.write(`  Provider:     openai\n`);
  prompt.write(`  Model:        ${modelId}\n`);
  prompt.write(
    "  Workspace:    NEW synthetic directory under the system temp area\n",
  );
  prompt.write(
    "                (no existing Nordic Rain project is read or edited)\n",
  );
  prompt.write(
    "  Task:         fix multiply(a, b) to return the product; preserve export API\n",
  );
  prompt.write(
    "  Files:        package.json, tsconfig.json, src/calculator.ts, tests/calculator.test.cjs\n",
  );
  prompt.write(
    "  Budgets:      up to 2 model invocations; 4096 output tokens/call; no retries\n",
  );
  prompt.write(
    "  Checks:       TYPECHECK (emit .trial-build) + TARGETED_TEST after separate review\n",
  );
  prompt.write(
    "  Permissions:  model-written code runs with ordinary OS permissions (not a sandbox)\n",
  );
  prompt.write(
    "  Edits:        in-place; retained on failure; no Git commit; no auto-rollback\n",
  );
  prompt.write(
    "  Charges:      account charges may occur; local limits are not a dollar ceiling\n",
  );
  prompt.write(
    `\nType exactly: START ${startChallenge}\n(empty / no / EOF cancels — no network)\n`,
  );

  const startLine = await prompt.askLine("start-consent", "> ");
  const consentOk =
    typeof options.consentPredicate === "function"
      ? options.consentPredicate(startLine, startChallenge)
      : acceptsStartConsent(startLine, startChallenge);
  if (!consentOk) {
    prompt.write("Trial cancelled before provisioning or credential access.\n");
    return { exitCode: 130, outcome: "START_DECLINED" };
  }
  if (prompt.isStopped()) {
    return { exitCode: 130, outcome: "STOPPED" };
  }

  prompt.write("Preparing fixture…\n");
  const provisioned =
    options.preProvisioned ?? (await provisionMultiply01Workspace());
  if (!provisioned.ok) {
    prompt.write(`Fixture provisioning failed: ${provisioned.code}\n`);
    return { exitCode: 1, outcome: "PROVISION_FAILED", detail: provisioned };
  }
  const trialRoot = provisioned.root;

  const owners = options.owners ?? (await loadTrialOwners(options.checkoutRoot));
  if (!owners.ok) {
    prompt.write(`${owners.message}\n`);
    prompt.write(`Workspace retained: ${trialRoot}\n`);
    return { exitCode: 2, outcome: owners.code, workspaceRoot: trialRoot };
  }

  prompt.write("Earning Phase 2 observations…\n");
  const phase2 = await earnPhase2Context(owners, trialRoot, owners.tscJs);
  if (!phase2.ok) {
    prompt.write(`Phase 2 setup refused: ${phase2.code}\n`);
    prompt.write(`Workspace retained: ${trialRoot}\n`);
    return {
      exitCode: 1,
      outcome: "PHASE2_REFUSED",
      workspaceRoot: trialRoot,
      detail: phase2,
    };
  }

  // Credential AFTER consent + policy, before adapter dispatch.
  let credential = options.credential ?? null;
  if (credential == null) {
    const fromEnv = process.env.OPENAI_API_KEY;
    if (typeof fromEnv === "string" && fromEnv.length > 0) {
      credential = fromEnv;
    } else {
      const hidden = await prompt.askHiddenCredential(MAX_CREDENTIAL_UTF8_BYTES);
      if (!hidden.ok) {
        prompt.write("No credential acquired. Trial ended without dispatch.\n");
        prompt.write(`Workspace retained: ${trialRoot}\n`);
        return {
          exitCode: 130,
          outcome: "CREDENTIAL_CANCELLED",
          workspaceRoot: trialRoot,
        };
      }
      credential = hidden.credential;
    }
  }
  if (prompt.isStopped()) {
    prompt.write(`Workspace retained: ${trialRoot}\n`);
    return { exitCode: 130, outcome: "STOPPED", workspaceRoot: trialRoot };
  }

  const adapterResult = owners.createOpenAIAdapter(
    {
      modelId,
      compatibleWithStructuredOutputs: true,
      maxOutputTokensCeiling: TRIAL_OUTPUT_TOKENS_PER_CALL,
    },
    credential,
    {
      maxTransportAttempts: TRIAL_TRANSPORT_ATTEMPTS,
      maxOutputTokensPerAttempt: TRIAL_OUTPUT_TOKENS_PER_CALL,
      cumulativeOutputTokens: TRIAL_CUMULATIVE_OUTPUT_TOKENS,
      maxRequestBodyBytes: TRIAL_REQUEST_BODY_BYTES,
      cumulativeRequestBodyBytes: TRIAL_CUMULATIVE_REQUEST_BODY_BYTES,
    },
  );
  credential = null; // drop host binding; adapter already captured value

  if (!adapterResult.ok) {
    prompt.write(`Adapter configuration failed: ${adapterResult.error.code}\n`);
    prompt.write(`Workspace retained: ${trialRoot}\n`);
    return {
      exitCode: 1,
      outcome: "ADAPTER_CONFIG_FAILED",
      workspaceRoot: trialRoot,
    };
  }

  const brainResult = owners.createEngineeringBrain(adapterResult.value, {
    maxDispatches: TRIAL_MAX_DISPATCHES,
    maxTimeoutMs: TRIAL_BRAIN_TIMEOUT_MS,
    maxOutputTokens: TRIAL_OUTPUT_TOKENS_PER_CALL,
  });
  if (!brainResult.ok) {
    prompt.write(`Brain configuration failed: ${brainResult.error.code}\n`);
    prompt.write(`Workspace retained: ${trialRoot}\n`);
    return {
      exitCode: 1,
      outcome: "BRAIN_CONFIG_FAILED",
      workspaceRoot: trialRoot,
    };
  }
  const brain = brainResult.value;

  const sessionOpen = owners.openEngineeringMutationSession({
    workspace: phase2.workspace,
    snapshot: phase2.snapshot,
    catalog: phase2.catalog,
    brain,
    permittedTargets: [
      {
        kind: "REPLACE_TEXT",
        contentObservation: phase2.sourceObservation,
        entry: phase2.sourceEntry,
      },
    ],
    disclosedObservations: phase2.disclosedObservations,
    validationBlueprint: {
      checks: [
        {
          id: TYPECHECK_CHECK_ID,
          kind: "TYPECHECK",
          request: phase2.typecheckRequest,
        },
        {
          id: TARGETED_CHECK_ID,
          kind: "TARGETED_TEST",
          request: phase2.targetedRequest,
        },
      ],
      claimCheckAssignments: [
        {
          claimId: BEHAVES_CLAIM_ID,
          selectedCheckIds: [TARGETED_CHECK_ID],
        },
      ],
      supportingObservations: phase2.supportingObservations,
      postEditInstructionText:
        `After the edit, propose REASONING_PROPOSAL_JSON with BEHAVES claimId "${BEHAVES_CLAIM_ID}" for multiply product behavior on the CONTENT evidence for ${MUTATION_RELATIVE_PATH}. Both configured checks (${TYPECHECK_CHECK_ID}, ${TARGETED_CHECK_ID}) must still pass.`,
      postEditContextBlocks: [
        {
          blockId: "post-trial-instruction",
          role: "REFERENCE_MATERIAL",
          text: `Trial ${TRIAL_ID}: validate multiply returns the product. Claim ${BEHAVES_CLAIM_ID} maps to check ${TARGETED_CHECK_ID}. TYPECHECK emits .trial-build.`,
          referenceHandles: [],
        },
      ],
      maxBrainAttempts: 1,
    },
  });

  if (!sessionOpen.ok) {
    prompt.write(`Session open failed: ${sessionOpen.error.code}\n`);
    prompt.write(`Workspace retained: ${trialRoot}\n`);
    brain.dispose();
    return {
      exitCode: 1,
      outcome: "SESSION_OPEN_FAILED",
      workspaceRoot: trialRoot,
    };
  }
  const session = sessionOpen.value;

  prompt.write("Requesting edit…\n");
  const proposed = await session.propose({
    correlationId: `trial-${TRIAL_ID}-propose`,
    instructionText:
      `In ${MUTATION_RELATIVE_PATH}, fix multiply(a, b) so it returns the numeric product a * b while preserving the exported TypeScript signature. Do not modify tests, tsconfig, or package.json.`,
  });

  if (!proposed.ok) {
    prompt.write(
      `Edit proposal refused: ${proposed.error.code}\n`,
    );
    prompt.write(
      renderTrialReport({
        unicode,
        label: "PROPOSAL_REFUSED",
        workspaceRoot: trialRoot,
        modelCalls: "1 / 2 (proposal failed)",
        note: proposed.error.message,
      }),
    );
    session.close();
    brain.dispose();
    return {
      exitCode: 1,
      outcome: "PROPOSAL_REFUSED",
      workspaceRoot: trialRoot,
      error: proposed.error,
    };
  }

  const review = proposed.value;
  const order = review.view.order;
  if (order.length !== 1 || order[0].relativePath !== MUTATION_RELATIVE_PATH) {
    prompt.write("Unexpected mutation target in review; refusing.\n");
    session.close();
    brain.dispose();
    return {
      exitCode: 1,
      outcome: "UNEXPECTED_TARGET",
      workspaceRoot: trialRoot,
    };
  }

  prompt.write("\n— Edit review (exact bytes) —\n");
  prompt.write(`Target: ${MUTATION_RELATIVE_PATH} (REPLACE_TEXT)\n`);
  prompt.write(
    `Before (${Buffer.byteLength(phase2.beforeText, "utf8")} bytes):\n`,
  );
  prompt.write(`${prefixUntrustedLines(phase2.beforeText)}\n`);
  prompt.write(
    `After (${Buffer.byteLength(order[0].afterText, "utf8")} bytes):\n`,
  );
  prompt.write(`${prefixUntrustedLines(order[0].afterText)}\n`);
  prompt.write(`${ESCAPE_LEGEND}\n`);
  prompt.write(
    "Checks have NOT run yet. In-place edit; no automatic rollback.\n",
  );

  const applyChallenge = options.applyChallenge ?? newChallenge();
  prompt.write(
    `\nApprove THIS review only by typing exactly: APPLY ${applyChallenge}\n`,
  );
  const applyLine = await prompt.askLine("apply", "> ");
  const applyOk =
    typeof options.applyPredicate === "function"
      ? options.applyPredicate(applyLine, applyChallenge)
      : acceptsApplyConfirmation(applyLine, applyChallenge);

  if (!applyOk || prompt.isStopped()) {
    prompt.write("Edit declined — zero authorization constructions; no mutation.\n");
    prompt.write(
      renderTrialReport({
        unicode,
        label: "EDIT DECLINED — NO DISPATCH",
        workspaceRoot: trialRoot,
        sourcePath: MUTATION_RELATIVE_PATH,
        modelCalls: "1 / 2",
        mutationDisposition: "NOT_DISPATCHED",
      }),
    );
    session.close();
    brain.dispose();
    return {
      exitCode: 130,
      outcome: "EDIT_DECLINED",
      workspaceRoot: trialRoot,
      review,
    };
  }

  // Host-only authorization mint AFTER prompt.
  /** @type {any[]} */
  const pairs = [];
  for (const item of order) {
    const auth = await owners.authorizePreparedChange(
      item.prepared,
      owners.explicitEditApproval(),
      item.prepared.config,
    );
    if (!auth.ok) {
      prompt.write(`Edit authorization failed: ${auth.error.code}\n`);
      session.close();
      brain.dispose();
      return {
        exitCode: 1,
        outcome: "EDIT_AUTH_FAILED",
        workspaceRoot: trialRoot,
      };
    }
    pairs.push({ prepared: item.prepared, authorization: auth.value });
  }

  prompt.write("Applying…\n");
  const applied = await session.apply(review, pairs);
  if (!applied.ok) {
    prompt.write(`Apply failed: ${applied.error.code}\n`);
    prompt.write(`Workspace retained: ${trialRoot}\n`);
    session.close();
    brain.dispose();
    return {
      exitCode: 1,
      outcome: "APPLY_FAILED",
      workspaceRoot: trialRoot,
      error: applied.error,
    };
  }

  const validationReview = applied.value;
  prompt.write("Re-observed. Validation pending…\n");
  prompt.write("\n— Validation plan review —\n");
  const plan = validationReview.view.preparedPlan;
  const declaredPaths = plan.declaredObservations.map(
    (o) => o.entry.relativePath,
  );
  prompt.write(`Declared subject paths: ${declaredPaths.join(", ")}\n`);
  for (const check of plan.checks) {
    const prep = check.preparedProcess;
    prompt.write(`\nCheck ${check.id} (${check.kind}):\n`);
    prompt.write(`  executable: ${prep.executable}\n`);
    prompt.write(`  argv: ${JSON.stringify(prep.argv)}\n`);
    prompt.write(`  cwd: ${prep.cwd}\n`);
    prompt.write(`  timeoutMs: ${prep.timeoutMs}\n`);
    prompt.write(
      `  env names: ${Object.keys(prep.envSnapshot).sort().join(", ")}\n`,
    );
    prompt.write(
      `  OPENAI_API_KEY in env: ${Object.prototype.hasOwnProperty.call(prep.envSnapshot, "OPENAI_API_KEY") ? "yes" : "no"}\n`,
    );
    if (check.kind === "TYPECHECK") {
      prompt.write("  note: TYPECHECK emits .trial-build (not no-emit)\n");
    }
    if (check.kind === "TARGETED_TEST") {
      prompt.write("  note: TARGETED_TEST runs fixed Node regression script\n");
    }
  }
  prompt.write(
    "\nRemaining one model call for post-edit reasoning (covered by START consent).\n",
  );
  prompt.write("Disposition: source edited; validation NOT yet established.\n");

  const checkChallenge = options.checkChallenge ?? newChallenge();
  prompt.write(
    `\nApprove THIS plan only by typing exactly: CHECK ${checkChallenge}\n`,
  );
  const checkLine = await prompt.askLine("check", "> ");
  const checkOk =
    typeof options.checkPredicate === "function"
      ? options.checkPredicate(checkLine, checkChallenge)
      : acceptsCheckConfirmation(checkLine, checkChallenge);

  if (!checkOk || prompt.isStopped()) {
    prompt.write("EDIT APPLIED — VALIDATION NOT RUN\n");
    prompt.write(
      renderTrialReport({
        unicode,
        label: "EDIT APPLIED — VALIDATION NOT RUN",
        workspaceRoot: trialRoot,
        sourcePath: MUTATION_RELATIVE_PATH,
        modelCalls: "1 / 2",
        mutationDisposition: "ALL_APPLIED",
        note: "Bytes retained on disk; no second model call; no process started.",
      }),
    );
    session.close();
    brain.dispose();
    owners.disposeReferenceCatalog(validationReview.view.postEditCatalog);
    return {
      exitCode: 130,
      outcome: "CHECK_DECLINED",
      workspaceRoot: trialRoot,
      validationReview,
    };
  }

  const approvalMap = new Map();
  for (const check of plan.checks) {
    approvalMap.set(check.id, owners.explicitLocalProcessApproval());
  }
  const valAuth = await owners.authorizeValidationPlan(plan, approvalMap);
  if (!valAuth.ok) {
    prompt.write(`Validation authorization failed: ${valAuth.error.code}\n`);
    session.close();
    brain.dispose();
    owners.disposeReferenceCatalog(validationReview.view.postEditCatalog);
    return {
      exitCode: 1,
      outcome: "VALIDATION_AUTH_FAILED",
      workspaceRoot: trialRoot,
    };
  }

  prompt.write("Running validation…\n");
  const outcome = await session.validate(validationReview, valAuth.value);
  session.close();
  brain.dispose();
  owners.disposeReferenceCatalog(validationReview.view.postEditCatalog);

  if (!outcome.ok) {
    prompt.write(`Validation call failed: ${outcome.error.code}\n`);
    prompt.write(
      renderTrialReport({
        unicode,
        label: "VALIDATION_CALL_FAILED",
        workspaceRoot: trialRoot,
        sourcePath: MUTATION_RELATIVE_PATH,
        modelCalls: "up to 2 / 2",
      }),
    );
    return {
      exitCode: 1,
      outcome: "VALIDATION_CALL_FAILED",
      workspaceRoot: trialRoot,
      error: outcome.error,
    };
  }

  const summary = summarizeValidationOutcome(outcome.value);
  const success =
    summary.label === "MUTATION_APPLIED_AND_CONFIGURED_VALIDATION_ACCEPTED";
  prompt.write(
    renderTrialReport({
      unicode,
      label: success
        ? "EDIT APPLIED · CONFIGURED VALIDATION ACCEPTED"
        : summary.label,
      workspaceRoot: trialRoot,
      sourcePath: MUTATION_RELATIVE_PATH,
      typecheck: summary.typecheck,
      regression: summary.regression,
      gate2: summary.gate2,
      modelCalls: "2 / 2",
      mutationDisposition: outcome.value.record?.mutationDisposition ?? null,
    }),
  );

  return {
    exitCode: success ? 0 : 1,
    outcome: summary.label,
    workspaceRoot: trialRoot,
    validationOutcome: outcome.value,
    childEnv: phase2.childEnv,
    preparedEnvSnapshots: plan.checks.map((c) => c.preparedProcess.envSnapshot),
  };
}

export { SEED_CALCULATOR_SOURCE, acceptsStartConsent, acceptsApplyConfirmation };
