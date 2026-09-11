/**
 * Phase GC1-c — verified host-runtime file delivery.
 *
 * PATH-owned runtime infrastructure only (remote worker). NOT a project-source
 * mutation path. Bytes travel via executeCommand stdin (cat > tmp); never
 * shell-interpolated. Integrity (length + sha256) required before publish.
 */

import { createHash, randomBytes } from "node:crypto";

export const DEFAULT_RUNTIME_ROOT_PREFIX = "/tmp/pathcode-runtime";

export const GC1_RUNTIME_DELIVERY_ERROR = Object.freeze({
  CAPABILITY_MISSING: "GC1_REMOTE_TRANSPORT_CAPABILITY_MISSING",
  WRITE_FAILED: "GC1_REMOTE_RUNTIME_WRITE_FAILED",
  LENGTH_MISMATCH: "GC1_REMOTE_RUNTIME_LENGTH_MISMATCH",
  INTEGRITY_MISMATCH: "GC1_REMOTE_RUNTIME_INTEGRITY_MISMATCH",
  PUBLISH_FAILED: "GC1_REMOTE_RUNTIME_PUBLISH_FAILED",
  PATH_REFUSED: "GC1_REMOTE_RUNTIME_PATH_REFUSED",
});

const DEFAULT_SECRET_CANARIES = Object.freeze([
  "OPENAI_API_KEY",
  "PATHCODE_OPENAI_API_KEY",
  "PATHCODE_LIVE_OPENAI",
  "PATHCODE_GC1C_SECRET_CANARY",
  "sk-live-",
  "Bearer ",
]);

/**
 * Posix shell single-quote (copy of hydrator discipline; no circular import).
 * @param {string} s
 */
export function shQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

/**
 * @param {string} code
 * @param {string} message
 */
function namedError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

/**
 * Sanitize session id for a single path segment under the runtime prefix.
 * @param {string} sessionId
 */
export function safeRuntimeSessionSegment(sessionId) {
  const raw = String(sessionId ?? "default");
  const cleaned = raw.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^\.+/, "");
  const segment = cleaned.slice(0, 128) || "default";
  if (segment === "." || segment === ".." || segment.includes("/")) {
    return "default";
  }
  return segment;
}

/**
 * @param {string} [sessionId]
 * @returns {string}
 */
export function buildRuntimeRoot(sessionId = "default") {
  return `${DEFAULT_RUNTIME_ROOT_PREFIX}/${safeRuntimeSessionSegment(sessionId)}`;
}

/**
 * Refuse unsafe relative path components for runtime destinations.
 * @param {unknown} rel
 * @returns {string}
 */
export function assertRuntimeRelativePath(rel) {
  if (rel == null || typeof rel !== "string" || rel.length === 0) {
    throw namedError(
      GC1_RUNTIME_DELIVERY_ERROR.PATH_REFUSED,
      "runtime relative path refused: null/empty",
    );
  }
  if (rel.includes("\0")) {
    throw namedError(
      GC1_RUNTIME_DELIVERY_ERROR.PATH_REFUSED,
      "runtime relative path refused: null byte",
    );
  }
  if (rel.startsWith("/") || /^[A-Za-z]:[\\/]/.test(rel)) {
    throw namedError(
      GC1_RUNTIME_DELIVERY_ERROR.PATH_REFUSED,
      "runtime relative path refused: absolute",
    );
  }
  const parts = rel.split(/[/\\]/);
  if (parts.some((p) => p === ".." || p === "")) {
    throw namedError(
      GC1_RUNTIME_DELIVERY_ERROR.PATH_REFUSED,
      "runtime relative path refused: traversal or empty segment",
    );
  }
  if (
    parts.includes(".git") ||
    rel === ".git" ||
    rel.startsWith(".git/") ||
    rel.includes("/.git/")
  ) {
    throw namedError(
      GC1_RUNTIME_DELIVERY_ERROR.PATH_REFUSED,
      "runtime relative path refused: .git",
    );
  }
  const lower = rel.toLowerCase();
  if (
    lower.includes("workspace") ||
    lower.startsWith("src/") ||
    lower.startsWith("home/") ||
    lower.includes("/src/") ||
    lower.includes("node_modules") ||
    lower.includes("recovery")
  ) {
    throw namedError(
      GC1_RUNTIME_DELIVERY_ERROR.PATH_REFUSED,
      "runtime relative path refused: project/recovery surface",
    );
  }
  return parts.join("/");
}

/**
 * Ensure absolute path is strictly under runtimeRoot (no escape).
 * @param {string} runtimeRoot
 * @param {string} absPath
 */
export function assertPathUnderRuntimeRoot(runtimeRoot, absPath) {
  const root = String(runtimeRoot).replace(/\/+$/, "");
  const p = String(absPath);
  if (!root.startsWith(DEFAULT_RUNTIME_ROOT_PREFIX)) {
    throw namedError(
      GC1_RUNTIME_DELIVERY_ERROR.PATH_REFUSED,
      "runtime root prefix refused",
    );
  }
  if (p.includes("\0") || p.split("/").includes("..")) {
    throw namedError(
      GC1_RUNTIME_DELIVERY_ERROR.PATH_REFUSED,
      "runtime absolute path refused: traversal",
    );
  }
  if (p !== root && !p.startsWith(`${root}/`)) {
    throw namedError(
      GC1_RUNTIME_DELIVERY_ERROR.PATH_REFUSED,
      "runtime path refused: outside runtime root",
    );
  }
  // Refuse hydrated project workspace and home workspace paths.
  if (
    p.startsWith("/home/user/workspace") ||
    p.includes("/.git/") ||
    p.endsWith("/.git")
  ) {
    throw namedError(
      GC1_RUNTIME_DELIVERY_ERROR.PATH_REFUSED,
      "runtime path refused: project/.git surface",
    );
  }
  return p;
}

/**
 * Shared GC1-c delivery capability: executeCommand (stdin write path).
 * Does NOT require writeRemoteFile — production GCP has only the tunnel.
 * @param {object} transport
 */
export function assertTransportRuntimeDeliveryCapability(transport) {
  if (!transport || typeof transport.executeCommand !== "function") {
    throw namedError(
      GC1_RUNTIME_DELIVERY_ERROR.CAPABILITY_MISSING,
      "transport missing executeCommand required for host-runtime delivery",
    );
  }
}

/**
 * @param {Buffer|Uint8Array|string} buf
 * @returns {string}
 */
export function sha256Hex(buf) {
  const b = Buffer.isBuffer(buf)
    ? buf
    : typeof buf === "string"
      ? Buffer.from(buf, "utf8")
      : Buffer.from(buf);
  return createHash("sha256").update(b).digest("hex");
}

/**
 * Ensure secret canaries are absent from delivery metadata surfaces.
 * Never logs the canary values themselves beyond the name check.
 * @param {Record<string, unknown>} surfaces
 * @param {string[]} [canaries]
 */
export function assertNoSecretsInDeliverySurfaces(
  surfaces,
  canaries = DEFAULT_SECRET_CANARIES,
) {
  for (const [name, value] of Object.entries(surfaces || {})) {
    if (value == null) continue;
    let text;
    try {
      text =
        typeof value === "string"
          ? value
          : Buffer.isBuffer(value)
            ? value.toString("utf8")
            : JSON.stringify(value);
    } catch {
      text = String(value);
    }
    for (const canary of canaries) {
      if (canary && text.includes(canary)) {
        throw namedError(
          GC1_RUNTIME_DELIVERY_ERROR.WRITE_FAILED,
          `secret canary present in delivery surface: ${name}`,
        );
      }
    }
  }
}

/**
 * Best-effort remote rm of staging path (never throws).
 * @param {object} transport
 * @param {string} workstationName
 * @param {string} stagingPath
 */
async function bestEffortRm(transport, workstationName, stagingPath) {
  try {
    await transport.executeCommand({
      workstationName,
      command: `rm -f ${shQuote(stagingPath)}`,
    });
  } catch {
    /* ignore */
  }
}

/**
 * Parse first integer from `wc -c` stdout.
 * @param {string} stdout
 */
export function parseWcBytes(stdout) {
  const m = String(stdout || "").trim().match(/^(\d+)/);
  if (!m) return null;
  return Number(m[1]);
}

/**
 * Parse hex digest from sha256sum / shasum -a 256 stdout.
 * @param {string} stdout
 */
export function parseSha256Sum(stdout) {
  const m = String(stdout || "")
    .trim()
    .match(/^([a-fA-F0-9]{64})\b/);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Deliver exact bytes to a PATH-owned runtime path with length+sha256 verify
 * before atomic publish. Never executes the file.
 *
 * @param {{
 *   transport: object,
 *   workstationName: string,
 *   runtimeRoot: string,
 *   bytes: Buffer|Uint8Array|string,
 *   finalBaseName?: string,
 *   mode?: string,
 *   _testHooks?: {
 *     afterWrite?: (ctx: object) => Promise<void>|void,
 *     corruptRemoteHash?: boolean,
 *     dropBytes?: number,
 *     earlyExit?: boolean,
 *     failPublish?: boolean,
 *     nonzeroWriter?: boolean,
 *   },
 * }} opts
 */
export async function deliverVerifiedHostRuntimeFile(opts) {
  const transport = opts?.transport;
  const workstationName = opts?.workstationName;
  assertTransportRuntimeDeliveryCapability(transport);
  if (!workstationName) {
    throw namedError(
      GC1_RUNTIME_DELIVERY_ERROR.WRITE_FAILED,
      "deliverVerifiedHostRuntimeFile requires workstationName",
    );
  }

  const runtimeRoot = String(opts.runtimeRoot || "").replace(/\/+$/, "");
  if (!runtimeRoot) {
    throw namedError(
      GC1_RUNTIME_DELIVERY_ERROR.PATH_REFUSED,
      "runtimeRoot required",
    );
  }
  assertPathUnderRuntimeRoot(runtimeRoot, runtimeRoot);

  const bytes = Buffer.isBuffer(opts.bytes)
    ? opts.bytes
    : typeof opts.bytes === "string"
      ? Buffer.from(opts.bytes, "utf8")
      : Buffer.from(opts.bytes ?? []);

  const localLength = bytes.length;
  const localSha256 = sha256Hex(bytes);
  const mode = opts.mode || "0500";

  let finalBaseName;
  if (opts.finalBaseName != null && opts.finalBaseName !== "") {
    finalBaseName = assertRuntimeRelativePath(opts.finalBaseName);
    if (finalBaseName.includes("/")) {
      throw namedError(
        GC1_RUNTIME_DELIVERY_ERROR.PATH_REFUSED,
        "finalBaseName must be a single path segment",
      );
    }
  } else {
    finalBaseName = `remote-worker-${localSha256}.cjs`;
  }

  const remotePath = `${runtimeRoot}/${finalBaseName}`;
  assertPathUnderRuntimeRoot(runtimeRoot, remotePath);

  const nonce = randomBytes(8).toString("hex");
  const stagingPath = `${runtimeRoot}/.remote-worker.${nonce}.tmp`;
  assertPathUnderRuntimeRoot(runtimeRoot, stagingPath);

  const hooks = opts._testHooks || null;

  assertNoSecretsInDeliverySurfaces({
    runtimeRoot,
    remotePath,
    stagingPath,
    finalBaseName,
    mode,
  });

  // 1–2. mkdir -p runtimeRoot; chmod 0700
  const mkdirResult = await transport.executeCommand({
    workstationName,
    command: `mkdir -p ${shQuote(runtimeRoot)}`,
  });
  if (!mkdirResult || mkdirResult.exitCode !== 0) {
    throw namedError(
      GC1_RUNTIME_DELIVERY_ERROR.WRITE_FAILED,
      "runtime root mkdir failed",
    );
  }
  const chmodDir = await transport.executeCommand({
    workstationName,
    command: `chmod 0700 ${shQuote(runtimeRoot)}`,
  });
  if (!chmodDir || chmodDir.exitCode !== 0) {
    throw namedError(
      GC1_RUNTIME_DELIVERY_ERROR.WRITE_FAILED,
      "runtime root chmod failed",
    );
  }

  // 3–4. Stream exact bytes via cat > staging (NO PTY; content on stdin only).
  if (hooks?.earlyExit === true) {
    await bestEffortRm(transport, workstationName, stagingPath);
    throw namedError(
      GC1_RUNTIME_DELIVERY_ERROR.WRITE_FAILED,
      "remote writer exited early before stdin completion",
    );
  }

  const writeResult = await transport.executeCommand({
    workstationName,
    command: `cat > ${shQuote(stagingPath)}`,
    stdin: bytes,
  });

  if (hooks?.nonzeroWriter === true || !writeResult || writeResult.exitCode !== 0) {
    await bestEffortRm(transport, workstationName, stagingPath);
    throw namedError(
      GC1_RUNTIME_DELIVERY_ERROR.WRITE_FAILED,
      "remote runtime write failed",
    );
  }

  if (typeof hooks?.afterWrite === "function") {
    await hooks.afterWrite({
      transport,
      workstationName,
      stagingPath,
      remotePath,
      runtimeRoot,
      localLength,
      localSha256,
    });
  }

  if (typeof hooks?.dropBytes === "number" && hooks.dropBytes > 0) {
    // Deterministic truncation without GCP: rewrite shorter content via cat.
    const truncated = bytes.subarray(0, Math.max(0, bytes.length - hooks.dropBytes));
    await transport.executeCommand({
      workstationName,
      command: `cat > ${shQuote(stagingPath)}`,
      stdin: truncated,
    });
  }

  // 5. Remote length + digest (prefer sha256sum, fall back to shasum -a 256).
  const wcResult = await transport.executeCommand({
    workstationName,
    command: `wc -c ${shQuote(stagingPath)}`,
  });
  if (!wcResult || wcResult.exitCode !== 0) {
    await bestEffortRm(transport, workstationName, stagingPath);
    throw namedError(
      GC1_RUNTIME_DELIVERY_ERROR.WRITE_FAILED,
      "remote wc failed after write",
    );
  }
  let remoteLength = parseWcBytes(wcResult.stdout);
  if (remoteLength == null) {
    await bestEffortRm(transport, workstationName, stagingPath);
    throw namedError(
      GC1_RUNTIME_DELIVERY_ERROR.WRITE_FAILED,
      "remote wc parse failed",
    );
  }

  let hashResult = await transport.executeCommand({
    workstationName,
    command: `sha256sum ${shQuote(stagingPath)}`,
  });
  if (!hashResult || hashResult.exitCode !== 0) {
    hashResult = await transport.executeCommand({
      workstationName,
      command: `shasum -a 256 ${shQuote(stagingPath)}`,
    });
  }
  if (!hashResult || hashResult.exitCode !== 0) {
    await bestEffortRm(transport, workstationName, stagingPath);
    throw namedError(
      GC1_RUNTIME_DELIVERY_ERROR.WRITE_FAILED,
      "remote sha256 failed after write",
    );
  }
  let remoteSha256 = parseSha256Sum(hashResult.stdout);
  if (!remoteSha256) {
    await bestEffortRm(transport, workstationName, stagingPath);
    throw namedError(
      GC1_RUNTIME_DELIVERY_ERROR.WRITE_FAILED,
      "remote sha256 parse failed",
    );
  }

  if (hooks?.corruptRemoteHash === true) {
    // Flip one nibble for deterministic integrity mismatch without GCP.
    const flipped = remoteSha256[0] === "a" ? "b" : "a";
    remoteSha256 = `${flipped}${remoteSha256.slice(1)}`;
  }

  // 6. Compare — length first, then digest.
  if (remoteLength !== localLength) {
    await bestEffortRm(transport, workstationName, stagingPath);
    throw namedError(
      GC1_RUNTIME_DELIVERY_ERROR.LENGTH_MISMATCH,
      `runtime length mismatch local=${localLength} remote=${remoteLength}`,
    );
  }
  if (remoteSha256 !== localSha256) {
    await bestEffortRm(transport, workstationName, stagingPath);
    throw namedError(
      GC1_RUNTIME_DELIVERY_ERROR.INTEGRITY_MISMATCH,
      "runtime sha256 mismatch",
    );
  }

  // 7. chmod + atomic mv publish. Never execute staging or final here.
  const chmodFile = await transport.executeCommand({
    workstationName,
    command: `chmod ${shQuote(mode)} ${shQuote(stagingPath)}`,
  });
  if (!chmodFile || chmodFile.exitCode !== 0) {
    await bestEffortRm(transport, workstationName, stagingPath);
    throw namedError(
      GC1_RUNTIME_DELIVERY_ERROR.PUBLISH_FAILED,
      "runtime chmod before publish failed",
    );
  }

  if (hooks?.failPublish === true) {
    await bestEffortRm(transport, workstationName, stagingPath);
    throw namedError(
      GC1_RUNTIME_DELIVERY_ERROR.PUBLISH_FAILED,
      "runtime publish failed",
    );
  }

  const mvResult = await transport.executeCommand({
    workstationName,
    command: `mv -f ${shQuote(stagingPath)} ${shQuote(remotePath)}`,
  });
  if (!mvResult || mvResult.exitCode !== 0) {
    await bestEffortRm(transport, workstationName, stagingPath);
    throw namedError(
      GC1_RUNTIME_DELIVERY_ERROR.PUBLISH_FAILED,
      "runtime publish (mv) failed",
    );
  }

  // Confirm staging gone / final present when transport supports test.
  await transport.executeCommand({
    workstationName,
    command: `test ! -e ${shQuote(stagingPath)} && test -f ${shQuote(remotePath)}`,
  }).catch?.(() => undefined);

  const receipt = {
    ok: true,
    runtimeRoot,
    remotePath,
    length: localLength,
    sha256: localSha256,
    stagingPath,
    published: true,
    mode,
  };

  assertNoSecretsInDeliverySurfaces({
    receiptRemotePath: receipt.remotePath,
    receiptSha256: receipt.sha256,
    receiptRuntimeRoot: receipt.runtimeRoot,
  });

  return receipt;
}
