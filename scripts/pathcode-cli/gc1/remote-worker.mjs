/**
 * Phase GC1-c — thin versioned remote worker protocol.
 *
 * NOT a model/policy authority. Host-owned worker script only; never
 * interpolate model text into shell. Protocol messages stay separate from
 * project stdout/stderr produced by runProcess.
 */

import { createHash } from "node:crypto";
import {
  CREDENTIAL_CANARY_PATH_PATTERNS,
  isCredentialCanaryPath,
} from "./task-snapshot.mjs";
import {
  assertTransportRuntimeDeliveryCapability,
  buildRuntimeRoot,
  DEFAULT_RUNTIME_ROOT_PREFIX,
  deliverVerifiedHostRuntimeFile,
  sha256Hex,
} from "./runtime-delivery.mjs";
import {
  assertRemoteCommandString,
  looksLikeArrayCommaCoercion,
} from "./shell-encode.mjs";
import {
  TRUSTED_REMOTE_NODE,
  encodeWorkerBootstrapCommand,
  assertWorkerInstallReceipt,
  assertVerifiedWorkerPath,
} from "./worker-bootstrap.mjs";

export const REMOTE_WORKER_VERSION = "gc1c-worker-v1";

/**
 * Legacy host worker dir (pre GC1-c verified runtime delivery).
 * Install now uses /tmp/pathcode-runtime/<sessionId>/ via runtime-delivery.
 * Kept for compatibility / docs only.
 */
export const WORKER_REMOTE_DIR = "/home/user/.pathcode-worker";

export const WORKER_SCRIPT_NAME = "worker.js";

export const WORKER_REMOTE_PATH = `${WORKER_REMOTE_DIR}/${WORKER_SCRIPT_NAME}`;

/** Default process output caps (bytes). */
export const WORKER_DEFAULT_MAX_STDOUT = 2 * 1024 * 1024;
export const WORKER_DEFAULT_MAX_STDERR = 2 * 1024 * 1024;

export { CREDENTIAL_CANARY_PATH_PATTERNS, isCredentialCanaryPath };

/** @type {object|null} */
let lastInstallReceipt = null;

/**
 * @returns {object|null}
 */
export function getLastRemoteWorkerInstallReceipt() {
  return lastInstallReceipt ? { ...lastInstallReceipt } : null;
}

/**
 * @internal test helper
 */
export function _resetLastRemoteWorkerInstallReceiptForTests() {
  lastInstallReceipt = null;
}

/**
 * Reviewed host-owned worker source. No template interpolation of model text.
 * Implements JSON-lines request/response over stdin/stdout.
 */
export const REMOTE_WORKER_SCRIPT_SOURCE = String.raw`"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const VERSION = "gc1c-worker-v1";

function reply(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

function fail(id, code, message) {
  reply({ v: VERSION, id: id || null, ok: false, error: { code, message } });
}

function readAllStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    process.stdin.on("data", (c) => {
      total += c.length;
      if (total > 32 * 1024 * 1024) {
        reject(new Error("request too large"));
        return;
      }
      chunks.push(c);
    });
    process.stdin.on("end", () => resolve(Buffer.concat(chunks)));
    process.stdin.on("error", reject);
  });
}

function confine(root, rel) {
  if (typeof rel !== "string" || rel.length === 0) throw Object.assign(new Error("bad path"), { code: "BAD_PATH" });
  if (rel.includes("\0") || path.isAbsolute(rel) || rel.split(/[\\\\/]/).includes("..")) {
    throw Object.assign(new Error("path escape"), { code: "PATH_ESCAPE" });
  }
  const abs = path.resolve(root, rel);
  const rootReal = path.resolve(root);
  if (abs !== rootReal && !abs.startsWith(rootReal + path.sep)) {
    throw Object.assign(new Error("path escape"), { code: "PATH_ESCAPE" });
  }
  return abs;
}

async function runProcess(req) {
  const executable = req.executable;
  const argv = Array.isArray(req.argv) ? req.argv.map(String) : [];
  const cwd = typeof req.cwd === "string" ? req.cwd : process.cwd();
  const env = req.env && typeof req.env === "object" ? { ...req.env } : {};
  const timeoutMs = Number(req.timeoutMs) > 0 ? Number(req.timeoutMs) : 120000;
  const maxStdout = Number(req.maxStdoutBytes) > 0 ? Number(req.maxStdoutBytes) : 2097152;
  const maxStderr = Number(req.maxStderrBytes) > 0 ? Number(req.maxStderrBytes) : 2097152;
  if (typeof executable !== "string" || !path.isAbsolute(executable)) {
    throw Object.assign(new Error("executable must be absolute"), { code: "BAD_EXECUTABLE" });
  }
  return new Promise((resolve) => {
    const startedAtMs = Date.now();
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let stdoutTrunc = false;
    let stderrTrunc = false;
    let settled = false;
    let exitCode = null;
    let signal = null;
    let closed = false;
    let stdoutEnded = false;
    let stderrEnded = false;
    const child = spawn(executable, argv, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    const finish = (payload) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(payload);
    };
    const settleOk = () => {
      if (!(closed && stdoutEnded && stderrEnded)) return;
      finish({
        exitCode: typeof exitCode === "number" ? exitCode : null,
        signal: signal || null,
        stdout: stdout.toString("utf8"),
        stderr: stderr.toString("utf8"),
        stdoutTruncated: stdoutTrunc,
        stderrTruncated: stderrTrunc,
        stdoutComplete: true,
        stderrComplete: true,
        timedOut: false,
        startedAtMs,
        finishedAtMs: Date.now(),
        pid: child.pid ?? null,
        shell: false,
      });
    };
    const timer = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch (_) {}
      finish({
        exitCode: null,
        signal: "SIGKILL",
        stdout: stdout.toString("utf8"),
        stderr: stderr.toString("utf8"),
        stdoutTruncated: stdoutTrunc,
        stderrTruncated: stderrTrunc,
        stdoutComplete: stdoutEnded,
        stderrComplete: stderrEnded,
        timedOut: true,
        startedAtMs,
        finishedAtMs: Date.now(),
        pid: child.pid ?? null,
        shell: false,
      });
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      if (stdout.length >= maxStdout) {
        stdoutTrunc = true;
        return;
      }
      const room = maxStdout - stdout.length;
      const take = chunk.length > room ? chunk.subarray(0, room) : chunk;
      stdout = Buffer.concat([stdout, take]);
      if (chunk.length > room) stdoutTrunc = true;
    });
    child.stderr.on("data", (chunk) => {
      if (stderr.length >= maxStderr) {
        stderrTrunc = true;
        return;
      }
      const room = maxStderr - stderr.length;
      const take = chunk.length > room ? chunk.subarray(0, room) : chunk;
      stderr = Buffer.concat([stderr, take]);
      if (chunk.length > room) stderrTrunc = true;
    });
    child.stdout.on("end", () => { stdoutEnded = true; settleOk(); });
    child.stderr.on("end", () => { stderrEnded = true; settleOk(); });
    child.on("error", (err) => {
      stdoutEnded = true;
      stderrEnded = true;
      closed = true;
      finish({
        exitCode: null,
        signal: null,
        stdout: stdout.toString("utf8"),
        stderr: stderr.toString("utf8"),
        stdoutTruncated: stdoutTrunc,
        stderrTruncated: stderrTrunc,
        stdoutComplete: true,
        stderrComplete: true,
        timedOut: false,
        spawnError: String(err && err.message ? err.message : err),
        startedAtMs,
        finishedAtMs: Date.now(),
        pid: null,
        shell: false,
      });
    });
    child.on("close", (code, sig) => {
      closed = true;
      exitCode = typeof code === "number" ? code : null;
      signal = sig || null;
      if (child.stdout && child.stdout.readableEnded) stdoutEnded = true;
      if (child.stderr && child.stderr.readableEnded) stderrEnded = true;
      settleOk();
      const t = setTimeout(() => {
        stdoutEnded = true;
        stderrEnded = true;
        settleOk();
      }, 100);
      if (t && typeof t.unref === "function") t.unref();
    });
  });
}

async function dispatch(req) {
  const op = req.op;
  const root = typeof req.root === "string" ? req.root : "/home/user/workspace";
  if (op === "ping") {
    return { pong: true, version: VERSION, pid: process.pid };
  }
  if (op === "readFile") {
    const abs = confine(root, req.path);
    const buf = fs.readFileSync(abs);
    return {
      path: req.path,
      bytesBase64: buf.toString("base64"),
      byteLength: buf.length,
      sha256: require("node:crypto").createHash("sha256").update(buf).digest("hex"),
    };
  }
  if (op === "writeFile") {
    const abs = confine(root, req.path);
    const buf = Buffer.from(String(req.bytesBase64 || ""), "base64");
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    const tmp = abs + ".gc1c-tmp-" + process.pid;
    fs.writeFileSync(tmp, buf, { mode: req.mode || 0o644 });
    fs.renameSync(tmp, abs);
    return { path: req.path, byteLength: buf.length };
  }
  if (op === "rename") {
    const from = confine(root, req.from);
    const to = confine(root, req.to);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.renameSync(from, to);
    return { from: req.from, to: req.to };
  }
  if (op === "unlink") {
    const abs = confine(root, req.path);
    fs.unlinkSync(abs);
    return { path: req.path };
  }
  if (op === "stat") {
    const abs = confine(root, req.path);
    const st = fs.lstatSync(abs);
    return {
      path: req.path,
      isFile: st.isFile(),
      isDirectory: st.isDirectory(),
      isSymbolicLink: st.isSymbolicLink(),
      size: st.size,
      mode: st.mode,
    };
  }
  if (op === "listDir") {
    const abs = confine(root, req.path || ".");
    const entries = fs.readdirSync(abs, { withFileTypes: true }).map((d) => ({
      name: d.name,
      isFile: d.isFile(),
      isDirectory: d.isDirectory(),
      isSymbolicLink: d.isSymbolicLink(),
    }));
    return { path: req.path || ".", entries };
  }
  if (op === "runProcess") {
    return await runProcess(req);
  }
  throw Object.assign(new Error("unknown op"), { code: "UNKNOWN_OP" });
}

(async () => {
  let raw;
  try {
    raw = await readAllStdin();
  } catch (e) {
    const msg = String(e && e.message ? e.message : e);
    const code = /too large/i.test(msg) ? "REQUEST_TOO_LARGE" : "REQUEST_INCOMPLETE";
    fail(null, code, msg);
    process.exitCode = 1;
    return;
  }
  const text = raw.toString("utf8");
  if (!text.trim()) {
    fail(null, "REQUEST_INCOMPLETE", "empty stdin request");
    process.exitCode = 1;
    return;
  }
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length !== 1) {
    fail(null, "REQUEST_MULTIPLEX", "GC1-c V1 accepts exactly one JSON request document");
    process.exitCode = 1;
    return;
  }
  let req;
  try {
    req = JSON.parse(lines[0]);
  } catch (e) {
    fail(null, "REQUEST_JSON", String(e && e.message ? e.message : e));
    process.exitCode = 1;
    return;
  }
  if (!req || typeof req !== "object" || req.v !== VERSION) {
    fail(req && req.id, "VERSION", "unsupported worker version");
    process.exitCode = 2;
    return;
  }
  try {
    const result = await dispatch(req);
    reply({ v: VERSION, id: req.id || null, ok: true, result });
  } catch (e) {
    fail(req.id, e && e.code ? e.code : "WORKER_ERROR", String(e && e.message ? e.message : e));
    process.exitCode = 1;
  }
})();
`;

/**
 * In-process worker dispatch for mock transports / unit tests.
 * Mirrors REMOTE_WORKER_SCRIPT_SOURCE semantics against a Map filesystem
 * (and real spawn for runProcess when opts.allowSpawn is true).
 *
 * @param {object} request
 * @param {{
 *   remoteFs?: Map<string, Buffer>,
 *   allowSpawn?: boolean,
 *   scriptedProcess?: object,
 * }} [opts]
 */
export async function dispatchWorkerRequest(request, opts = {}) {
  assertNoCredentialCanaries(request);
  if (!request || request.v !== REMOTE_WORKER_VERSION) {
    return {
      v: REMOTE_WORKER_VERSION,
      id: request?.id ?? null,
      ok: false,
      error: { code: "VERSION", message: "unsupported worker version" },
    };
  }
  const remoteFs = opts.remoteFs ?? new Map();
  const root = typeof request.root === "string" ? request.root : "/home/user/workspace";
  const id = request.id ?? null;
  try {
    const result = await dispatchInMemory(request, { remoteFs, root, opts });
    return { v: REMOTE_WORKER_VERSION, id, ok: true, result };
  } catch (e) {
    return {
      v: REMOTE_WORKER_VERSION,
      id,
      ok: false,
      error: {
        code: e?.code || "WORKER_ERROR",
        message: String(e?.message || e),
      },
    };
  }
}

async function dispatchInMemory(req, { remoteFs, root, opts }) {
  const op = req.op;
  if (op === "ping") {
    return { pong: true, version: REMOTE_WORKER_VERSION, pid: process.pid };
  }
  if (op === "readFile") {
    const abs = confineRemote(root, req.path);
    const buf = remoteFs.get(abs);
    if (!buf) {
      const err = new Error(`ENOENT: ${req.path}`);
      err.code = "ENOENT";
      throw err;
    }
    return {
      path: req.path,
      bytesBase64: buf.toString("base64"),
      byteLength: buf.length,
      sha256: createHash("sha256").update(buf).digest("hex"),
    };
  }
  if (op === "writeFile") {
    const abs = confineRemote(root, req.path);
    const buf = Buffer.from(String(req.bytesBase64 || ""), "base64");
    remoteFs.set(abs, buf);
    return { path: req.path, byteLength: buf.length };
  }
  if (op === "rename") {
    const from = confineRemote(root, req.from);
    const to = confineRemote(root, req.to);
    const buf = remoteFs.get(from);
    if (!buf) {
      const err = new Error(`ENOENT: ${req.from}`);
      err.code = "ENOENT";
      throw err;
    }
    remoteFs.set(to, buf);
    remoteFs.delete(from);
    return { from: req.from, to: req.to };
  }
  if (op === "unlink") {
    const abs = confineRemote(root, req.path);
    if (!remoteFs.has(abs)) {
      const err = new Error(`ENOENT: ${req.path}`);
      err.code = "ENOENT";
      throw err;
    }
    remoteFs.delete(abs);
    return { path: req.path };
  }
  if (op === "stat") {
    const abs = confineRemote(root, req.path);
    if (!remoteFs.has(abs)) {
      // Directory presence: any key under prefix.
      const prefix = abs.endsWith("/") ? abs : `${abs}/`;
      const hasDir = [...remoteFs.keys()].some((k) => k.startsWith(prefix));
      if (!hasDir && abs !== root) {
        const err = new Error(`ENOENT: ${req.path}`);
        err.code = "ENOENT";
        throw err;
      }
      return {
        path: req.path,
        isFile: false,
        isDirectory: true,
        isSymbolicLink: false,
        size: 0,
        mode: 0o755,
      };
    }
    const buf = remoteFs.get(abs);
    return {
      path: req.path,
      isFile: true,
      isDirectory: false,
      isSymbolicLink: false,
      size: buf.length,
      mode: 0o644,
    };
  }
  if (op === "listDir") {
    const abs = confineRemote(root, req.path || ".");
    const prefix = abs.endsWith("/") ? abs : `${abs}/`;
    /** @type {Map<string, object>} */
    const kids = new Map();
    for (const key of remoteFs.keys()) {
      if (!key.startsWith(prefix) && key !== abs) continue;
      if (key === abs) continue;
      const rest = key.slice(prefix.length);
      const name = rest.split("/")[0];
      if (!name) continue;
      const isFile = rest === name;
      kids.set(name, {
        name,
        isFile,
        isDirectory: !isFile,
        isSymbolicLink: false,
      });
    }
    return { path: req.path || ".", entries: [...kids.values()] };
  }
  if (op === "runProcess") {
    if (opts.scriptedProcess) {
      return { ...opts.scriptedProcess };
    }
    if (opts.allowSpawn === true) {
      return await spawnLocalProcess(req);
    }
    // Default mock: deterministic sentinel-capable stub.
    return {
      exitCode: typeof req._mockExitCode === "number" ? req._mockExitCode : 0,
      signal: req._mockSignal ?? null,
      stdout: typeof req._mockStdout === "string" ? req._mockStdout : "",
      stderr: typeof req._mockStderr === "string" ? req._mockStderr : "",
      stdoutTruncated: req._mockStdoutTruncated === true,
      stderrTruncated: req._mockStderrTruncated === true,
      timedOut: req._mockTimedOut === true,
      startedAtMs: Date.now(),
      finishedAtMs: Date.now(),
      pid: 4242,
    };
  }
  const err = new Error("unknown op");
  err.code = "UNKNOWN_OP";
  throw err;
}

function confineRemote(root, rel) {
  if (typeof rel !== "string" || rel.length === 0) {
    const err = new Error("bad path");
    err.code = "BAD_PATH";
    throw err;
  }
  if (rel.includes("\0") || rel.startsWith("/") || rel.split("/").includes("..")) {
    const err = new Error("path escape");
    err.code = "PATH_ESCAPE";
    throw err;
  }
  const cleaned = rel.replace(/^\/+/, "");
  return `${String(root).replace(/\/+$/, "")}/${cleaned}`;
}

async function spawnLocalProcess(req) {
  const { spawn } = await import("node:child_process");
  const path = await import("node:path");
  const executable = req.executable;
  const argv = Array.isArray(req.argv) ? req.argv.map(String) : [];
  if (typeof executable !== "string" || !path.isAbsolute(executable)) {
    const err = new Error("executable must be absolute");
    err.code = "BAD_EXECUTABLE";
    throw err;
  }
  const maxStdout = Number(req.maxStdoutBytes) > 0 ? Number(req.maxStdoutBytes) : WORKER_DEFAULT_MAX_STDOUT;
  const maxStderr = Number(req.maxStderrBytes) > 0 ? Number(req.maxStderrBytes) : WORKER_DEFAULT_MAX_STDERR;
  const timeoutMs = Number(req.timeoutMs) > 0 ? Number(req.timeoutMs) : 120_000;
  return new Promise((resolve) => {
    const startedAtMs = Date.now();
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let stdoutTrunc = false;
    let stderrTrunc = false;
    let settled = false;
    const child = spawn(executable, argv, {
      cwd: req.cwd,
      env: req.env && typeof req.env === "object" ? { ...req.env } : {},
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    const finish = (payload) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(payload);
    };
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      finish({
        exitCode: null,
        signal: "SIGKILL",
        stdout: stdout.toString("utf8"),
        stderr: stderr.toString("utf8"),
        stdoutTruncated: stdoutTrunc,
        stderrTruncated: stderrTrunc,
        timedOut: true,
        startedAtMs,
        finishedAtMs: Date.now(),
        pid: child.pid ?? null,
      });
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      if (stdout.length >= maxStdout) {
        stdoutTrunc = true;
        return;
      }
      const room = maxStdout - stdout.length;
      const take = chunk.length > room ? chunk.subarray(0, room) : chunk;
      stdout = Buffer.concat([stdout, take]);
      if (chunk.length > room) stdoutTrunc = true;
    });
    child.stderr.on("data", (chunk) => {
      if (stderr.length >= maxStderr) {
        stderrTrunc = true;
        return;
      }
      const room = maxStderr - stderr.length;
      const take = chunk.length > room ? chunk.subarray(0, room) : chunk;
      stderr = Buffer.concat([stderr, take]);
      if (chunk.length > room) stderrTrunc = true;
    });
    child.on("error", (err) => {
      finish({
        exitCode: null,
        signal: null,
        stdout: stdout.toString("utf8"),
        stderr: stderr.toString("utf8"),
        stdoutTruncated: stdoutTrunc,
        stderrTruncated: stderrTrunc,
        timedOut: false,
        spawnError: String(err.message || err),
        startedAtMs,
        finishedAtMs: Date.now(),
        pid: null,
      });
    });
    child.on("close", (code, signal) => {
      finish({
        exitCode: typeof code === "number" ? code : null,
        signal: signal || null,
        stdout: stdout.toString("utf8"),
        stderr: stderr.toString("utf8"),
        stdoutTruncated: stdoutTrunc,
        stderrTruncated: stderrTrunc,
        timedOut: false,
        startedAtMs,
        finishedAtMs: Date.now(),
        pid: child.pid ?? null,
      });
    });
  });
}

/**
 * Recursively refuse credential canary strings in any serialized request field.
 * @param {unknown} value
 */
export function assertNoCredentialCanaries(value, pathHint = "$") {
  if (typeof value === "string") {
    for (const re of CREDENTIAL_CANARY_PATH_PATTERNS) {
      if (
        re.test(value) ||
        value.includes("GC1_CANARY_SECRET") ||
        value.includes("PATHCODE_GC1C_SECRET_CANARY")
      ) {
        const err = new Error(`credential canary present in ${pathHint}`);
        err.code = "CREDENTIAL_CANARY";
        throw err;
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoCredentialCanaries(v, `${pathHint}[${i}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      assertNoCredentialCanaries(k, `${pathHint}.${k}`);
      assertNoCredentialCanaries(v, `${pathHint}.${k}`);
    }
  }
}

/**
 * Upload host-owned worker script via verified host-runtime delivery.
 * Uses executeCommand+stdin exclusively (same path for mock and GCP).
 * Runtime root: /tmp/pathcode-runtime/<sessionId>/ — NOT project workspace.
 *
 * Legacy WORKER_REMOTE_DIR / WORKER_REMOTE_PATH remain exported for
 * compatibility docs; install no longer writes there.
 *
 * @param {object} transport
 * @param {{ workstationName: string, sessionId?: string, taskId?: string }} opts
 */
export async function installRemoteWorker(transport, opts) {
  const workstationName = opts?.workstationName;
  if (!transport) throw new Error("installRemoteWorker requires transport");
  if (!workstationName) throw new Error("installRemoteWorker requires workstationName");

  assertTransportRuntimeDeliveryCapability(transport);

  const sessionId = opts.sessionId || opts.taskId || "default";
  const runtimeRoot = buildRuntimeRoot(sessionId);
  const bytes = Buffer.from(REMOTE_WORKER_SCRIPT_SOURCE, "utf8");
  const sha256 = sha256Hex(bytes);
  const finalBaseName = `remote-worker-${sha256}.cjs`;

  const receipt = await deliverVerifiedHostRuntimeFile({
    transport,
    workstationName,
    runtimeRoot,
    bytes,
    finalBaseName,
    mode: "0500",
  });

  // Mark worker installed for mock simulation (must not overwrite verified bytes).
  if (typeof transport.markWorkerInstalled === "function") {
    transport.markWorkerInstalled(receipt.remotePath);
  }

  lastInstallReceipt = {
    ok: true,
    remotePath: receipt.remotePath,
    runtimeRoot: receipt.runtimeRoot,
    version: REMOTE_WORKER_VERSION,
    sha256: receipt.sha256,
    length: receipt.length,
    published: receipt.published === true,
    state: "VERIFIED_PUBLISHED",
    sessionId,
    stagingPath: receipt.stagingPath,
    byteLength: receipt.length,
    workerVersion: REMOTE_WORKER_VERSION,
  };
  return { ...lastInstallReceipt };
}

/**
 * Invoke the remote worker with a JSON request over stdin.
 *
 * SSH remote-command string contains ONLY:
 *   /usr/bin/node <verified-receipt.finalPath>
 * Dynamic descriptor fields travel exclusively via stdin protocol.
 *
 * NEVER pass an argv array as `command` — Array.toString() yields
 * `node,/tmp/...` (live WORKER_PROTOCOL exit=127).
 *
 * @param {object} transport
 * @param {{
 *   workstationName: string,
 *   request: object,
 *   timeoutMs?: number,
 *   workerRemotePath?: string,
 *   expectedSha256?: string,
 *   runtimeRootPrefix?: string,
 *   sessionId?: string,
 *   taskId?: string,
 *   installReceipt?: object,
 *   allowInProcessWorker?: boolean,
 * }} opts
 */
export async function invokeRemoteWorker(transport, opts) {
  const { workstationName, request } = opts;
  if (!transport) throw new Error("invokeRemoteWorker requires transport");
  if (!workstationName) throw new Error("invokeRemoteWorker requires workstationName");
  if (!request || typeof request !== "object") {
    throw new Error("invokeRemoteWorker requires request object");
  }

  const receipt =
    opts.installReceipt ||
    (opts.workerRemotePath || opts.expectedSha256
      ? {
          ok: true,
          published: true,
          remotePath: opts.workerRemotePath || lastInstallReceipt?.remotePath,
          sha256: opts.expectedSha256 || lastInstallReceipt?.sha256,
          version: lastInstallReceipt?.version || REMOTE_WORKER_VERSION,
          runtimeRoot:
            lastInstallReceipt?.runtimeRoot ||
            (opts.sessionId ? buildRuntimeRoot(opts.sessionId) : undefined),
          length: lastInstallReceipt?.length,
        }
      : lastInstallReceipt);

  const sessionId = opts.sessionId || opts.taskId || undefined;
  assertWorkerInstallReceipt(receipt, {
    sessionId,
    expectedSha256: opts.expectedSha256 || receipt?.sha256,
    expectedVersion: REMOTE_WORKER_VERSION,
  });

  const workerRemotePath = receipt.remotePath;
  assertVerifiedWorkerPath(workerRemotePath, {
    sessionId,
    expectedSha256: receipt.sha256,
    runtimeRoot: receipt.runtimeRoot,
  });

  const invocationId = request.id ?? `req-${Date.now()}`;
  const body = {
    v: REMOTE_WORKER_VERSION,
    id: invocationId,
    sessionId: sessionId || request.sessionId || null,
    taskId: opts.taskId || request.taskId || sessionId || null,
    ...request,
    id: invocationId,
    v: REMOTE_WORKER_VERSION,
  };
  assertNoCredentialCanaries(body);

  // In-process seam is OPT-IN only (unit helpers). Acceptance path always
  // traverses executeCommand + encoded bootstrap + stdin (mock and GCP).
  if (
    opts.allowInProcessWorker === true &&
    typeof transport.invokeWorkerRequest === "function"
  ) {
    return transport.invokeWorkerRequest({ workstationName, request: body });
  }

  const bootstrapCommand = encodeWorkerBootstrapCommand({
    nodeExecutable: TRUSTED_REMOTE_NODE,
    workerRemotePath,
    sessionId,
    expectedSha256: receipt.sha256,
  });
  assertRemoteCommandString(bootstrapCommand);
  if (looksLikeArrayCommaCoercion(bootstrapCommand)) {
    const err = new Error(
      "bootstrap command looks like Array.toString coercion (node,/path)",
    );
    err.code = "WORKER_PROTOCOL";
    throw err;
  }

  const stdin = Buffer.from(`${JSON.stringify(body)}\n`, "utf8");
  const result = await transport.executeCommand({
    workstationName,
    command: bootstrapCommand,
    stdin,
    timeoutMs: opts.timeoutMs,
  });

  return parseWorkerProtocolResponse(result, {
    expectedVersion: REMOTE_WORKER_VERSION,
    expectedId: invocationId,
    expectedSessionId: body.sessionId,
    expectedTaskId: body.taskId,
  });
}

/**
 * Strict outer-protocol parse. Project stdout spoof JSON cannot become the response.
 * @param {{ exitCode?: number, stdout?: string, stderr?: string }} result
 * @param {{ expectedVersion: string, expectedId: string, expectedSessionId?: string|null, expectedTaskId?: string|null }} expect
 */
export function parseWorkerProtocolResponse(result, expect) {
  const stdout = String(result.stdout || "");
  const lines = stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const protocolLines = lines.filter((l) => {
    if (!l.startsWith("{")) return false;
    try {
      const o = JSON.parse(l);
      return (
        o &&
        typeof o === "object" &&
        o.v === expect.expectedVersion &&
        o.id === expect.expectedId
      );
    } catch {
      return false;
    }
  });

  if (protocolLines.length === 0) {
    const err = new Error(
      `worker protocol response missing (exit=${result.exitCode}): ${String(result.stderr || stdout).slice(0, 200)}`,
    );
    err.code = "WORKER_PROTOCOL";
    throw err;
  }
  if (protocolLines.length > 1) {
    const err = new Error("duplicate worker protocol terminal envelopes");
    err.code = "WORKER_PROTOCOL";
    throw err;
  }

  let parsed;
  try {
    parsed = JSON.parse(protocolLines[0]);
  } catch (e) {
    const err = new Error(`worker protocol JSON parse failed: ${e.message}`);
    err.code = "WORKER_PROTOCOL";
    throw err;
  }

  if (parsed.v !== expect.expectedVersion) {
    const err = new Error("worker protocol version mismatch");
    err.code = "WORKER_PROTOCOL";
    throw err;
  }
  if (parsed.id !== expect.expectedId) {
    const err = new Error("worker protocol invocationId mismatch");
    err.code = "WORKER_PROTOCOL";
    throw err;
  }
  // Optional binding when worker echoes session/task (forward-compatible).
  if (
    expect.expectedSessionId != null &&
    parsed.sessionId != null &&
    parsed.sessionId !== expect.expectedSessionId
  ) {
    const err = new Error("worker protocol sessionId mismatch");
    err.code = "WORKER_PROTOCOL";
    throw err;
  }
  if (
    expect.expectedTaskId != null &&
    parsed.taskId != null &&
    parsed.taskId !== expect.expectedTaskId
  ) {
    const err = new Error("worker protocol taskId mismatch");
    err.code = "WORKER_PROTOCOL";
    throw err;
  }
  return parsed;
}

/**
 * Map a worker runProcess result into ProcessObservation-compatible shape.
 * @param {object} result worker runProcess result
 * @param {{ startedAtMs?: number }} [requestMeta]
 */
export function toProcessObservation(result, requestMeta = {}) {
  const startedAtMs = result.startedAtMs ?? requestMeta.startedAtMs ?? Date.now();
  const finishedAtMs = result.finishedAtMs ?? Date.now();
  const timedOut = result.timedOut === true;
  const overflow =
    result.stdoutTruncated === true || result.stderrTruncated === true;
  const exitCode = typeof result.exitCode === "number" ? result.exitCode : null;
  const signal = result.signal ?? null;
  const spawnError =
    typeof result.spawnError === "string" ? result.spawnError : null;

  let outcome = "EXITED";
  if (spawnError) outcome = "SPAWN_FAILED";
  else if (timedOut) outcome = "TIMED_OUT";
  else if (overflow) outcome = "OUTPUT_OVERFLOW";
  else if (signal) outcome = "SIGNALED";
  else if (exitCode !== null) outcome = "EXITED";
  else outcome = "SPAWN_FAILED";

  const mkStream = (text, truncated) => {
    const t = typeof text === "string" ? text : "";
    const capturedBytes = Buffer.byteLength(t, "utf8");
    return Object.freeze({
      capturedBytes,
      truncated: truncated === true,
      discardedAfterLimitBytes: 0,
      complete: truncated !== true,
      streamError: null,
      text: t,
    });
  };

  return Object.freeze({
    outcome,
    pid: typeof result.pid === "number" ? result.pid : null,
    exitCode,
    signal,
    timedOut,
    overflow,
    terminationRequested: timedOut,
    terminationObserved: timedOut || signal != null,
    startedAtMs,
    finishedAtMs,
    durationMs: Math.max(0, finishedAtMs - startedAtMs),
    stdout: mkStream(result.stdout, result.stdoutTruncated),
    stderr: mkStream(result.stderr, result.stderrTruncated),
    spawnError,
    cleanup: Object.freeze({
      terminationRequested: timedOut,
      terminationObserved: timedOut || signal != null,
      terminationNotConfirmed: false,
      descendantMayRemainAlive: false,
      signalsAttempted: timedOut ? Object.freeze(["SIGKILL"]) : Object.freeze([]),
    }),
  });
}
