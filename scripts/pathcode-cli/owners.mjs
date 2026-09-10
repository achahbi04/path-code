/**
 * Lazy load of built Path Code owners from the checkout dist/ tree.
 * Paths are fixed relative to the launcher checkout (import.meta.url), not cwd.
 */

import { distHref, resolveCheckoutRoot, resolveRuntimePrerequisites } from "./paths.mjs";

/**
 * @param {string} [root]
 */
export async function loadTrialOwners(root = resolveCheckoutRoot()) {
  const prereq = resolveRuntimePrerequisites(root);
  if (!prereq.ok) {
    return prereq;
  }

  const [
    openai,
    brain,
    mutation,
    editing,
    execution,
    validation,
    workspace,
    config,
    inventoryMod,
    metadata,
    reader,
    search,
    snapshot,
    catalogMod,
    reasoningBounds,
    git,
    recovery,
    scope,
  ] = await Promise.all([
    import(distHref("adapters/openai/index.js", root)),
    import(distHref("brain/index.js", root)),
    import(distHref("orchestrator/mutation/index.js", root)),
    import(distHref("editing/index.js", root)),
    import(distHref("execution/index.js", root)),
    import(distHref("validation/index.js", root)),
    import(distHref("workspace/index.js", root)),
    import(distHref("config/index.js", root)),
    import(distHref("inventory/index.js", root)),
    import(distHref("metadata/index.js", root)),
    import(distHref("reader/index.js", root)),
    import(distHref("search/corpus.js", root)),
    import(distHref("snapshot/index.js", root)),
    import(distHref("reasoning/catalog.js", root)),
    import(distHref("reasoning/bounds.js", root)),
    import(distHref("git/index.js", root)),
    import(distHref("recovery/index.js", root)),
    import(distHref("scope/index.js", root)),
  ]);

  return {
    ok: true,
    root,
    tscJs: prereq.tscJs,
    createOpenAIAdapter: openai.createOpenAIAdapter,
    createEngineeringBrain: brain.createEngineeringBrain,
    openEngineeringMutationSession: mutation.openEngineeringMutationSession,
    authorizePreparedChange: editing.authorizePreparedChange,
    explicitEditApproval: editing.explicitEditApproval,
    explicitLocalProcessApproval: execution.explicitLocalProcessApproval,
    authorizeValidationPlan: validation.authorizeValidationPlan,
    createWorkspaceBoundary: workspace.createWorkspaceBoundary,
    loadProjectConfig: config.loadProjectConfig,
    inventory: inventoryMod.inventory,
    buildRepositoryMap: metadata.buildRepositoryMap,
    readRepositoryContent: reader.readRepositoryContent,
    buildRepositorySearchCorpus: search.buildRepositorySearchCorpus,
    buildRepositorySnapshot: snapshot.buildRepositorySnapshot,
    createReferenceCatalog: catalogMod.createReferenceCatalog,
    describeReferenceCatalog: catalogMod.describeReferenceCatalog,
    disposeReferenceCatalog: catalogMod.disposeReferenceCatalog,
    MAX_CATALOG_RECORDS: reasoningBounds.MAX_CATALOG_RECORDS,

    // Phase 5G — Git is read-only here. Discovery and the state baseline are
    // the only Git owners a General Session may reach, and neither writes.
    discoverGitRepository: git.discoverGitRepository,
    collectGitStateBaseline: git.collectGitStateBaseline,

    // Phase 6A recovery floor. The General Session always uses these; /recover
    // uses them without any provider involvement at all.
    createRecoveryStore: recovery.createRecoveryStore,
    loadCheckpoint: recovery.loadCheckpoint,
    prepareRecoveryReview: recovery.prepareRecoveryReview,
    authorizeRecoveryReview: recovery.authorizeRecoveryReview,
    explicitRecoveryApproval: recovery.explicitRecoveryApproval,
    executeRecovery: recovery.executeRecovery,

    // Phase GC1-c — ALS process observation binder for remote validation.
    runWithProcessObservationRunner: execution.runWithProcessObservationRunner,

    // Phase 5G scope contracts. Semantics live in core; the CLI only sequences.
    parseEngineeringScopePlan: scope.parseEngineeringScopePlan,
    admitScopePlan: scope.admitScopePlan,
    classifyScopePathSensitivity: scope.classifyScopePathSensitivity,
    normalizeRepositoryRelativePath: scope.normalizeRepositoryRelativePath,
    MAX_SCOPE_EDITABLE_TARGETS: scope.MAX_SCOPE_EDITABLE_TARGETS,
    MAX_SCOPE_CONTEXT_PATHS: scope.MAX_SCOPE_CONTEXT_PATHS,
  };
}
