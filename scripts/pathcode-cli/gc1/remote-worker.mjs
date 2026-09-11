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

export const REMOTE_WORKER_VERSION = "gc1c-worker-v1";

/** Outside project-writable /home/user/workspace. */
export const WORKER_REMOTE_DIR = "/home/user/.pathcode-worker";

export const WORKER_SCRIPT_NAME = "worker.js";

export const WORKER_REMOTE_PATH = `${WORKER_REMOTE_DIR}/${WORKER_SCRIPT_NAME}`;

/** Default process output caps (bytes). */
export const WORKER_DEFAULT_MAX_STDOUT = 2 * 1024 * 1024;
export const WORKER_DEFAULT_MAX_STDERR = 2 * 1024 * 1024;

export { CREDENTIAL_CANARY_PATH_PATTERNS, isCredentialCanaryPath };

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
    const timer = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch (_) {}
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
        spawnError: String(err && err.message ? err.message : err),
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
    fail(null, "REQUEST_READ", String(e && e.message ? e.message : e));
    process.exitCode = 1;
    return;
  }
  const text = raw.toString("utf8").trim();
  let req;
  try {
    req = JSON.parse(text.split(/\r?\n/)[0] || "{}");
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
 * Upload host-owned worker script to WORKER_REMOTE_DIR.
 * @param {object} transport
 * @param {{ workstationName: string }} opts
 */
export async function installRemoteWorker(transport, opts) {
  const workstationName = opts.workstationName;
  if (!transport) throw new Error("installRemoteWorker requires transport");
  if (!workstationName) throw new Error("installRemoteWorker requires workstationName");

  if (typeof transport.writeRemoteFile === "function") {
    await transport.executeCommand?.({
      workstationName,
      command: ["mkdir", "-p", WORKER_REMOTE_DIR],
      argv: ["mkdir", "-p", WORKER_REMOTE_DIR],
    }).catch?.(() => undefined);
    // Prefer mkdir via argv form when supported.
    if (typeof transport.executeCommand === "function") {
      await transport.executeCommand({
        workstationName,
        command: `mkdir -p '${WORKER_REMOTE_DIR}'`,
        argv: ["mkdir", "-p", WORKER_REMOTE_DIR],
      });
    }
    await transport.writeRemoteFile({
      remotePath: WORKER_REMOTE_PATH,
      content: REMOTE_WORKER_SCRIPT_SOURCE,
      encoding: "utf8",
    });
  } else if (typeof transport.uploadTextFile === "function") {
    await transport.executeCommand({
      workstationName,
      command: `mkdir -p '${WORKER_REMOTE_DIR}'`,
      argv: ["mkdir", "-p", WORKER_REMOTE_DIR],
    });
    await transport.uploadTextFile({
      remotePath: WORKER_REMOTE_PATH,
      text: REMOTE_WORKER_SCRIPT_SOURCE,
    });
  } else {
    throw new Error("transport cannot install remote worker (no writeRemoteFile)");
  }

  // Mark worker installed for mock simulation.
  if (typeof transport.markWorkerInstalled === "function") {
    transport.markWorkerInstalled(WORKER_REMOTE_PATH);
  }

  return {
    ok: true,
    remotePath: WORKER_REMOTE_PATH,
    version: REMOTE_WORKER_VERSION,
    sha256: createHash("sha256").update(REMOTE_WORKER_SCRIPT_SOURCE).digest("hex"),
  };
}

/**
 * Invoke the remote worker with a JSON request. Protocol stdout is parsed;
 * project process output lives inside the JSON result for runProcess.
 *
 * @param {object} transport
 * @param {{ workstationName: string, request: object, timeoutMs?: number }} opts
 */
export async function invokeRemoteWorker(transport, opts) {
  const { workstationName, request } = opts;
  if (!transport) throw new Error("invokeRemoteWorker requires transport");
  if (!workstationName) throw new Error("invokeRemoteWorker requires workstationName");
  if (!request || typeof request !== "object") {
    throw new Error("invokeRemoteWorker requires request object");
  }

  const body = {
    v: REMOTE_WORKER_VERSION,
    id: request.id ?? `req-${Date.now()}`,
    ...request,
  };
  assertNoCredentialCanaries(body);

  // Preferred mock / in-process seam — keeps protocol messages off shell.
  if (typeof transport.invokeWorkerRequest === "function") {
    return transport.invokeWorkerRequest({ workstationName, request: body });
  }

  const argv = ["node", WORKER_REMOTE_PATH];
  const stdin = `${JSON.stringify(body)}\n`;
  const result = await transport.executeCommand({
    workstationName,
    command: argv,
    argv,
    stdin,
    timeoutMs: opts.timeoutMs,
  });

  const stdout = String(result.stdout || "");
  const line = stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.startsWith("{") && l.includes(`"v":"${REMOTE_WORKER_VERSION}"`));
  if (!line) {
    const err = new Error(
      `worker protocol response missing (exit=${result.exitCode}): ${result.stderr || stdout.slice(0, 200)}`,
    );
    err.code = "WORKER_PROTOCOL";
    throw err;
  }
  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch (e) {
    const err = new Error(`worker protocol JSON parse failed: ${e.message}`);
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
