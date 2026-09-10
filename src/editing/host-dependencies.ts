/**
 * Host-facing FS dependency seams for remote workspace effects.
 *
 * Not re-exported from the editing barrel — public-authority-surface forbids
 * WithDependencies / AtomicReplaceFsOps / productionAtomic* on that surface.
 * Hosts import this module (or the underlying files) directly from dist.
 */

export {
  replaceExistingFileWithDependencies,
  type ReplaceExistingFileWithDependenciesOptions,
} from "./replace-existing-file.js";

export {
  createFileWithDependencies,
  type CreateFileWithDependenciesOptions,
} from "./create-file.js";

export { executeMultiFilePlanWithDependencies } from "./multi-file-execute.js";

export type {
  ExecuteMultiFilePlanWithDependenciesOptions,
  MultiFileTargetOperations,
} from "./multi-file-types.js";

export type {
  AtomicReplaceFsOps,
  AtomicCreateFsOps,
} from "./atomic-fs.js";
