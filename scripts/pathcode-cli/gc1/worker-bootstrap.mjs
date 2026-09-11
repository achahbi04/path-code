/**
 * GC1-c worker bootstrap — the ONLY dynamic-ish payload allowed on the SSH
 * remote-command string. Everything else travels via stdin protocol.
 *
 * Semantically: /usr/bin/node <verified-receipt.finalPath>
 */

import {
  encodeShellArg,
  encodeShellArgv,
  assertRemoteCommandString,
} from "./shell-encode.mjs";
import {
  DEFAULT_RUNTIME_ROOT_PREFIX,
  buildRuntimeRoot,
  assertPathUnderRuntimeRoot,
} from "./runtime-delivery.mjs";

/** Engineering Image contract — absolute Node (GC1-b). */
export const TRUSTED_REMOTE_NODE = "/usr/bin/node";

export const GC1_BOOTSTRAP_ERROR = Object.freeze({
  PATH_REFUSED: "GC1_REMOTE_RUNTIME_PATH_REFUSED",
  RECEIPT: "GC1_REMOTE_WORKER_RECEIPT_REFUSED",
  NODE: "GC1_REMOTE_NODE_REFUSED",
  PARSE: "GC1_REMOTE_BOOTSTRAP_PARSE_FAILED",
});

/**
 * @param {string} code
 * @param {string} message
 */
function namedError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

const HEX64 = "[a-f0-9]{64}";
const SESSION_SEG = "[a-zA-Z0-9._-]+";
const WORKER_BASENAME_RE = new RegExp(`^remote-worker-(${HEX64})\\.cjs$`, "i");
const WORKER_ABS_RE = new RegExp(
  `^${DEFAULT_RUNTIME_ROOT_PREFIX.replace(/\//g, "\\/")}\\/(${SESSION_SEG})\\/(remote-worker-${HEX64}\\.cjs)$`,
  "i",
);

/**
 * Restrictive grammar for published worker paths (not the generic shell encoder).
 * @param {string} workerRemotePath
 * @param {{ sessionId?: string, expectedSha256?: string, runtimeRoot?: string }} [opts]
 */
export function assertVerifiedWorkerPath(workerRemotePath, opts = {}) {
  if (typeof workerRemotePath !== "string" || !workerRemotePath) {
    throw namedError(GC1_BOOTSTRAP_ERROR.PATH_REFUSED, "worker path required");
  }
  if (workerRemotePath.includes("\0") || workerRemotePath.includes("..")) {
    throw namedError(GC1_BOOTSTRAP_ERROR.PATH_REFUSED, "worker path refused");
  }
  const m = workerRemotePath.match(WORKER_ABS_RE);
  if (!m) {
    throw namedError(
      GC1_BOOTSTRAP_ERROR.PATH_REFUSED,
      "worker path must match /tmp/pathcode-runtime/<session>/remote-worker-<sha256>.cjs",
    );
  }
  const sessionSeg = m[1];
  const base = m[2];
  const shaMatch = base.match(WORKER_BASENAME_RE);
  const sha = shaMatch ? shaMatch[1].toLowerCase() : null;
  if (!sha) {
    throw namedError(GC1_BOOTSTRAP_ERROR.PATH_REFUSED, "worker basename sha refused");
  }

  if (opts.sessionId != null) {
    const expectedRoot = buildRuntimeRoot(opts.sessionId);
    assertPathUnderRuntimeRoot(expectedRoot, workerRemotePath);
    if (!workerRemotePath.startsWith(`${expectedRoot}/`)) {
      throw namedError(
        GC1_BOOTSTRAP_ERROR.RECEIPT,
        "worker path session does not match current session",
      );
    }
  }
  if (opts.runtimeRoot != null) {
    assertPathUnderRuntimeRoot(opts.runtimeRoot, workerRemotePath);
  }
  if (opts.expectedSha256 != null) {
    const expected = String(opts.expectedSha256).toLowerCase();
    if (sha !== expected) {
      throw namedError(
        GC1_BOOTSTRAP_ERROR.RECEIPT,
        "worker path sha256 does not match receipt",
      );
    }
  }
  return { sessionSeg, sha256: sha, base };
}

/**
 * Bind an install receipt before bootstrap.
 * @param {object|null|undefined} receipt
 * @param {{ sessionId?: string, expectedSha256?: string, expectedVersion?: string }} opts
 */
export function assertWorkerInstallReceipt(receipt, opts = {}) {
  if (!receipt || typeof receipt !== "object") {
    throw namedError(GC1_BOOTSTRAP_ERROR.RECEIPT, "worker install receipt required");
  }
  if (receipt.published !== true && receipt.state !== "VERIFIED_PUBLISHED") {
    if (receipt.ok !== true || !receipt.remotePath) {
      throw namedError(
        GC1_BOOTSTRAP_ERROR.RECEIPT,
        "worker receipt not verified/published",
      );
    }
  }
  if (receipt.stagingPath && receipt.remotePath === receipt.stagingPath) {
    throw namedError(
      GC1_BOOTSTRAP_ERROR.RECEIPT,
      "staging path refused for bootstrap",
    );
  }
  if (String(receipt.remotePath || "").includes(".tmp")) {
    throw namedError(
      GC1_BOOTSTRAP_ERROR.RECEIPT,
      "temporary worker path refused for bootstrap",
    );
  }
  if (opts.expectedVersion && receipt.version && receipt.version !== opts.expectedVersion) {
    throw namedError(
      GC1_BOOTSTRAP_ERROR.RECEIPT,
      "worker receipt version mismatch",
    );
  }
  if (opts.expectedSha256 && receipt.sha256) {
    if (String(receipt.sha256).toLowerCase() !== String(opts.expectedSha256).toLowerCase()) {
      throw namedError(
        GC1_BOOTSTRAP_ERROR.RECEIPT,
        "worker receipt sha256 mismatch",
      );
    }
  }
  if (opts.sessionId && receipt.runtimeRoot) {
    const expectedRoot = buildRuntimeRoot(opts.sessionId);
    if (receipt.runtimeRoot !== expectedRoot) {
      throw namedError(
        GC1_BOOTSTRAP_ERROR.RECEIPT,
        "worker receipt runtimeRoot session mismatch",
      );
    }
  }
  assertVerifiedWorkerPath(receipt.remotePath, {
    sessionId: opts.sessionId,
    expectedSha256: opts.expectedSha256 || receipt.sha256,
    runtimeRoot: receipt.runtimeRoot,
  });
  return receipt;
}

/**
 * Encode the SSH remote-command bootstrap: trusted node + verified worker path.
 * @param {{ nodeExecutable?: string, workerRemotePath: string, sessionId?: string, expectedSha256?: string }} opts
 * @returns {string}
 */
export function encodeWorkerBootstrapCommand(opts) {
  const nodeExecutable = opts.nodeExecutable || TRUSTED_REMOTE_NODE;
  if (nodeExecutable !== TRUSTED_REMOTE_NODE) {
    throw namedError(
      GC1_BOOTSTRAP_ERROR.NODE,
      `bootstrap node must be ${TRUSTED_REMOTE_NODE}`,
    );
  }
  assertVerifiedWorkerPath(opts.workerRemotePath, {
    sessionId: opts.sessionId,
    expectedSha256: opts.expectedSha256,
  });
  return encodeShellArgv([nodeExecutable, opts.workerRemotePath]);
}

/**
 * Parse a previously encoded bootstrap command (mock / conformance).
 * @param {unknown} command
 * @returns {{ nodeExecutable: string, workerRemotePath: string } | null}
 */
export function parseWorkerBootstrapCommand(command) {
  const s = assertRemoteCommandString(command);
  // Exact encoded form: '/usr/bin/node' '/tmp/pathcode-runtime/.../remote-worker-….cjs'
  const re = new RegExp(
    `^${encodeShellArg(TRUSTED_REMOTE_NODE)} ('(?:\\\\'|[^'])*')$`,
  );
  const m = s.match(re);
  if (!m) return null;
  const quoted = m[1];
  // Decode POSIX single-quoted string.
  if (!quoted.startsWith("'") || !quoted.endsWith("'")) return null;
  const inner = quoted.slice(1, -1).replace(/'\\''/g, "'");
  try {
    assertVerifiedWorkerPath(inner);
  } catch {
    return null;
  }
  return { nodeExecutable: TRUSTED_REMOTE_NODE, workerRemotePath: inner };
}

/**
 * Structured descriptor kept distinct until the last moment.
 * @param {{ executable: string, argv: string[] }} descriptor
 * @returns {string} — ONLY for trusted host bootstrap; never for project cmds
 */
export function encodeTrustedRemoteDescriptor(descriptor) {
  if (!descriptor || typeof descriptor !== "object") {
    throw namedError(GC1_BOOTSTRAP_ERROR.PARSE, "descriptor required");
  }
  if (Array.isArray(descriptor)) {
    throw namedError(
      GC1_BOOTSTRAP_ERROR.PARSE,
      "descriptor must be {executable, argv[]} — not a bare array",
    );
  }
  const executable = descriptor.executable;
  const argv = descriptor.argv;
  if (typeof executable !== "string" || !Array.isArray(argv)) {
    throw namedError(
      GC1_BOOTSTRAP_ERROR.PARSE,
      "descriptor requires string executable and argv[]",
    );
  }
  // Refuse accidental `${[executable,...argv]}` / String(array) shapes upstream.
  return encodeShellArgv([executable, ...argv]);
}
