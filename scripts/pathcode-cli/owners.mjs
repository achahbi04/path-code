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
  };
}
