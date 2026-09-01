/**
 * Compile-time contract tests for Phase 3A editing types.
 */

import type { ProjectConfig, ResolvedProjectConfig } from "../../src/config/index.js";
import type { RepositoryEntry, RepositoryEntryData } from "../../src/inventory/index.js";
import type {
  DeferredMutationAction,
  EditAuthorization,
  EditRecord,
  MutationAction,
  PreparedCreation,
  PreparedCreationData,
  PreparedMutation,
  PreparedMutationData,
} from "../../src/editing/index.js";
import * as editingPublic from "../../src/editing/index.js";

const sampleConfig = {} as ResolvedProjectConfig;
const sampleWorkspace = {} as import("../../src/domain/workspace.js").WorkspaceBoundary;
const sampleEntry = {} as RepositoryEntry;

// A. plain PreparedMutationData cannot satisfy PreparedMutation
// @ts-expect-error PreparedMutation requires opaque brand
const _plainPreparedMutation: PreparedMutation = {
  preparedId: "x",
  action: "MODIFY_EXISTING_FILE",
  target: sampleEntry,
  beforeFingerprint: { algorithm: "sha256", hex: "a", byteLength: 1 },
  beforeByteLength: 1,
  afterFingerprint: { algorithm: "sha256", hex: "b", byteLength: 1 },
  afterByteLength: 1,
  proposedBytes: new Uint8Array([1]),
  config: sampleConfig,
  workspace: sampleWorkspace,
};

// B. plain PreparedCreationData cannot satisfy PreparedCreation
// @ts-expect-error PreparedCreation requires opaque brand
const _plainPreparedCreation: PreparedCreation = {
  preparedId: "x",
  action: "CREATE_FILE",
  parent: sampleEntry,
  leafName: "a.ts",
  targetRelativePath: "a.ts",
  precondition: {
    kind: "NON_EXISTENT",
    parent: sampleEntry,
    leafName: "a.ts",
    targetRelativePath: "a.ts",
    observedAtMs: 0,
  },
  afterFingerprint: { algorithm: "sha256", hex: "b", byteLength: 1 },
  afterByteLength: 1,
  proposedBytes: new Uint8Array([1]),
  config: sampleConfig,
  workspace: sampleWorkspace,
};

// C. plain object cannot satisfy EditAuthorization
// @ts-expect-error EditAuthorization requires opaque brand
const _plainAuthorization: EditAuthorization = {
  authorizationId: "x",
  preparedRef: _plainPreparedMutation,
  action: "MODIFY_EXISTING_FILE",
  targetRelativePath: "a.ts",
  beforeFingerprint: null,
  afterFingerprint: { algorithm: "sha256", hex: "b", byteLength: 1 },
  afterByteLength: 1,
  issuedAtMs: 0,
};

// D. raw RepositoryEntryData cannot satisfy RepositoryEntry
// @ts-expect-error raw RepositoryEntryData is not assignable to RepositoryEntry
const _rawEntry: RepositoryEntry = {
  canonicalPath: "/tmp/x" as import("../../src/domain/workspace.js").CanonicalPath,
  relativePath: "x",
  lexicalKind: "FILE",
  physicalKind: "FILE",
  size: 1,
  mtimeMs: 1,
};

// E. plain ProjectConfig cannot satisfy ResolvedProjectConfig
// @ts-expect-error ProjectConfig lacks resolved brand
const _plainResolved: ResolvedProjectConfig = {
  source: { kind: "ABSENT" },
  restrictions: { deniedPaths: [], disabledActions: [] },
  unknownDirectives: [],
} satisfies ProjectConfig;

// F. creation and modification prepared types are not interchangeable
function acceptMutation(_value: PreparedMutation): void {}
function acceptCreation(_value: PreparedCreation): void {}
// @ts-expect-error PreparedCreation is not PreparedMutation
acceptMutation({} as PreparedCreation);
// @ts-expect-error PreparedMutation is not PreparedCreation
acceptCreation({} as PreparedMutation);

// G. deletion action is not representable in MutationAction
function acceptMutationAction(_action: MutationAction): void {}
// @ts-expect-error DELETE_FILE is deferred, not a MutationAction
acceptMutationAction("DELETE_FILE" satisfies DeferredMutationAction);

// H. directory creation action is not representable
// @ts-expect-error CREATE_DIRECTORY is deferred, not a MutationAction
acceptMutationAction("CREATE_DIRECTORY" satisfies DeferredMutationAction);

void editingPublic;
void _plainAuthorization;
void (_rawEntry as RepositoryEntryData);
void (_plainPreparedMutation as PreparedMutationData);
void (_plainPreparedCreation as PreparedCreationData);

const _recordShape: EditRecord = {
  kind: "EXISTING_FILE",
  target: sampleEntry,
  authorizationId: "auth",
  beforeFingerprint: { algorithm: "sha256", hex: "a", byteLength: 1 },
  expectedAfterFingerprint: { algorithm: "sha256", hex: "b", byteLength: 1 },
  observedAfterFingerprint: null,
  outcome: "REFUSED",
};
void _recordShape;
