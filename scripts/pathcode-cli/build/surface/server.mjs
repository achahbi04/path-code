/**
 * PATH Build — localhost visual builder surface.
 * Drives createBuildController over Gateway + product runtime/preview.
 */

import { createServer } from "node:http";
import {
  readFileSync,
  existsSync,
  mkdirSync,
  statSync,
} from "node:fs";
import { dirname, join, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";

import {
  readBuildRecord,
  findLatestActiveBuild,
  listBuildRecords,
  appendPendingConversation,
  readPendingConversations,
  appendBuildEvent,
} from "../index.mjs";
import { projectBuildForSurface } from "./product-view.mjs";
import { classifyConversationMessage } from "../conversation.mjs";
import { detectBuildArtifact } from "../runtime/artifact.mjs";
import {
  proxyPreviewHttp,
  proxyPreviewWs,
} from "../runtime/proxy.mjs";
import { launchPathCodeInTerminal } from "./handoff.mjs";
import { ensureBuildCoordinator } from "../coordinator/ensure.mjs";
import { sanitizeBuildEventValue } from "../events.mjs";
import { readTaskCheckpoint } from "../../ag10/task-checkpoint.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(HERE, "public");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
};

/**
 * @param {string} outcome
 */
function slugifyOutcome(outcome) {
  const base = String(outcome || "product")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36);
  return base || "product";
}

/**
 * @param {import('node:http').IncomingMessage} req
 */
function readJsonBody(req) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw.trim()) {
        resolveBody({});
        return;
      }
      try {
        resolveBody(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {object} body
 */
function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(data);
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {string} filePath
 */
function sendFile(res, filePath) {
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    res.writeHead(404).end("Not found");
    return;
  }
  const ext = extname(filePath);
  const type = MIME[ext] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-cache" });
  res.end(readFileSync(filePath));
}

/**
 * @param {{
 *   packageRoot: string,
 *   runtimeRoot: string,
 *   host?: string,
 *   port?: number,
 *   openBrowser?: boolean,
 *   preferredEngine?: string | null,
 *   fakeMode?: boolean,
 *   autoLoop?: boolean,
 * }} options
 */
export async function startPathBuildSurface(options) {
  const packageRoot = options.packageRoot;
  const runtimeRoot = options.runtimeRoot;
  const host = options.host || "127.0.0.1";
  const preferredEngine =
    typeof options.preferredEngine === "string" && options.preferredEngine.trim()
      ? options.preferredEngine.trim()
      : process.env.PATHCODE_PREFERRED_ENGINE || null;
  const fakeMode =
    options.fakeMode === true ||
    process.env.PATHCODE_BUILD_FAKE === "1" ||
    process.env.PATHCODE_GATEWAY_FAKE_ENGINE === "1";
  const autoLoop = options.autoLoop !== false;

  const coordinatorHandle = await ensureBuildCoordinator({
    packageRoot,
    runtimeRoot,
    fakeMode,
    preferredEngine,
  });
  const coordinator = coordinatorHandle.client;
  const syncRuntimeForBuild = (buildId) => coordinator.syncRuntime(buildId);
  const ensureLoop = (buildId) => coordinator.ensureLoop(buildId);

  /**
   * @param {string} [buildId]
   */
  async function viewFor(buildId) {
    let id = buildId || "";
    if (!id) {
      const latest =
        findLatestActiveBuild(runtimeRoot) ||
        listBuildRecords(runtimeRoot)[0] ||
        null;
      id = latest?.buildId || "";
    }
    const stored = id ? readBuildRecord(runtimeRoot, id) : null;
    const pending = id ? readPendingConversations(runtimeRoot, id) : [];
    const build =
      stored && pending.length
        ? {
            ...stored,
            conversation: [
              ...(Array.isArray(stored.conversation)
                ? stored.conversation
                : []),
              ...pending.filter(
                (msg) =>
                  !stored.conversation?.some(
                    (existing) => existing.id && existing.id === msg.id,
                  ),
              ),
            ],
          }
        : stored;
    const root = build?.projectBindings?.[0]?.projectRoot || null;
    const artifact =
      root && existsSync(root)
        ? detectBuildArtifact(root, { outcomeHint: build?.intent?.outcome })
        : null;
    const state = id
      ? await coordinator.getRuntime(id)
      : { runtime: null, preview: null };
    const eventState = id
      ? await coordinator.getBuildEvents(id, { afterId: 0, limit: 1_000 })
      : { events: [] };
    const lastChild = [...(build?.children || [])]
      .reverse()
      .find((child) => child?.taskId);
    const checkpoint = lastChild
      ? readTaskCheckpoint(runtimeRoot, lastChild.taskId)
      : null;
    /** @type {{ files?: string[], summary?: string, commands?: string[] } | null} */
    let diff = null;
    if (root && existsSync(join(root, ".git")) && build?.authoritativeSha) {
      const shown = spawnSync(
        "git",
        ["show", "--stat", "--oneline", "-1", build.authoritativeSha],
        {
          cwd: root,
          encoding: "utf8",
          timeout: 8_000,
          env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
        },
      );
      if (shown.status === 0) {
        diff = {
          summary: String(shown.stdout || "").slice(0, 2_000),
          files: checkpoint?.changedFiles || [],
        };
      }
    }
    const worktreePath =
      typeof checkpoint?.worktreePath === "string" ? checkpoint.worktreePath : "";
    /** @type {string[]} */
    let worktreeFiles = [];
    if (worktreePath && existsSync(join(worktreePath, ".git"))) {
      const porcelain = spawnSync(
        "git",
        ["status", "--porcelain"],
        {
          cwd: worktreePath,
          encoding: "utf8",
          timeout: 5_000,
          env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
        },
      );
      if (porcelain.status === 0) {
        worktreeFiles = String(porcelain.stdout || "")
          .split("\n")
          .map((line) => line.slice(3).trim())
          .filter(Boolean)
          .slice(0, 24);
        if (!diff) diff = { files: worktreeFiles, summary: "" };
        else if (!diff.files?.length) diff.files = worktreeFiles;
      }
    }
    const view = projectBuildForSurface(build, {
      preview: state.preview,
      runtime: state.runtime,
      artifact,
      events: eventState.events || [],
      checkpoint,
      diff,
      worktreeFiles,
    });
    const coordinatorStatus = id ? await coordinator.status() : { loops: [] };
    return {
      ...view,
      loopRunning: Boolean(
        coordinatorStatus.loops?.some((loop) => loop.buildId === id),
      ),
      fakeMode,
      preferredEngine: preferredEngine || null,
    };
  }

  /**
   * @param {string} buildId
   */
  function assertBuildRoot(buildId) {
    const build = readBuildRecord(runtimeRoot, buildId);
    if (!build) return { ok: false, code: "BUILD_NOT_FOUND" };
    const binding = build.projectBindings?.[0];
    if (!binding?.projectRoot) {
      return { ok: false, code: "NO_PROJECT_ROOT", build };
    }
    return { ok: true, build, binding, projectRoot: binding.projectRoot };
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${host}`);
    const path = url.pathname;
    const method = req.method || "GET";

    try {
      // Preview proxy (same-origin embed)
      const previewMatch = path.match(/^\/preview\/([^/]+)(?:\/(.*))?$/);
      if (previewMatch && (method === "GET" || method === "HEAD" || method === "POST")) {
        const buildId = decodeURIComponent(previewMatch[1]);
        const runtimeState = await coordinator.getRuntime(buildId);
        const targetUrl =
          runtimeState.runtime?.url || runtimeState.preview?.url;
        if (!targetUrl) {
          sendJson(res, 503, {
            ok: false,
            code: "PREVIEW_UNAVAILABLE",
            message: "Product runtime is not ready yet.",
          });
          return;
        }
        const stripPrefix = `/preview/${encodeURIComponent(buildId)}`;
        const buildRec = readBuildRecord(runtimeRoot, buildId);
        proxyPreviewHttp(req, res, {
          targetUrl,
          buildId,
          stripPrefix,
          authoritativeSha: buildRec?.authoritativeSha || null,
        });
        return;
      }

      if (method === "GET" && (path === "/" || path === "/index.html")) {
        sendFile(res, join(PUBLIC_DIR, "index.html"));
        return;
      }
      if (method === "GET" && path.startsWith("/assets/")) {
        const rel = path.slice("/assets/".length).replace(/\.\./g, "");
        sendFile(res, join(PUBLIC_DIR, rel));
        return;
      }

      if (method === "GET" && path === "/api/health") {
        sendJson(res, 200, {
          ok: true,
          product: "path-build",
          fakeMode,
          preferredEngine,
          runtimeRoot,
        });
        return;
      }

      if (method === "GET" && path === "/api/builds/latest") {
        sendJson(res, 200, await viewFor());
        return;
      }

      if (method === "GET" && path === "/api/builds") {
        const rows = listBuildRecords(runtimeRoot).slice(0, 20);
        sendJson(res, 200, {
          ok: true,
          builds: rows.map((b) => ({
            buildId: b.buildId,
            status: b.loop?.status,
            outcome: b.intent?.outcome,
            projectRoot: b.projectBindings?.[0]?.projectRoot || null,
            originKind: b.originKind || b.projectBindings?.[0]?.originKind || null,
            updatedAt: b.updatedAt,
          })),
        });
        return;
      }

      const buildMatch = path.match(/^\/api\/builds\/([^/]+)(?:\/([^/]+)(?:\/([^/]+))?)?$/);
      if (buildMatch) {
        const buildId = decodeURIComponent(buildMatch[1]);
        const action = buildMatch[2] || "";
        const sub = buildMatch[3] || "";

        if (method === "GET" && !action) {
          const build = readBuildRecord(runtimeRoot, buildId);
          if (!build) {
            sendJson(res, 404, { ok: false, code: "BUILD_NOT_FOUND" });
            return;
          }
          sendJson(res, 200, await viewFor(buildId));
          return;
        }

        if (method === "GET" && action === "events") {
          const headerCursor = Number(req.headers["last-event-id"] || 0);
          const queryCursor = Number(url.searchParams.get("cursor") || 0);
          let cursor = Math.max(
            0,
            Number.isFinite(queryCursor) ? queryCursor : 0,
            Number.isFinite(headerCursor) ? headerCursor : 0,
          );
          res.writeHead(200, {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
          });
          let pushing = false;
          const push = async () => {
            if (pushing) return;
            pushing = true;
            try {
              const replay = await coordinator.getBuildEvents(buildId, {
                afterId: cursor,
                limit: 250,
              });
              for (const event of replay.events || []) {
                const payload = JSON.stringify({
                  event,
                  view: sanitizeBuildEventValue(await viewFor(buildId)),
                });
                res.write(`id: ${event.id}\n`);
                res.write(`event: build\n`);
                res.write(`data: ${payload}\n\n`);
                cursor = event.id;
              }
              // Snapshot is bootstrap/fallback only when no durable event exists.
              if (cursor === 0 && (replay.events || []).length === 0) {
                res.write(
                  `event: snapshot\ndata: ${JSON.stringify({
                    view: sanitizeBuildEventValue(await viewFor(buildId)),
                    fallback: true,
                  })}\n\n`,
                );
              }
            } finally {
              pushing = false;
            }
          };
          await push();
          const timer = setInterval(() => {
            void push().catch((error) => {
              // Coordinator restart is an expected S4 recovery condition.
              // Keep the client connection honest without crashing the
              // surface; EventSource will reconnect after this stream closes.
              try {
                res.write(
                  `event: backend-unavailable\ndata: ${JSON.stringify({
                    code: error?.code || "COORDINATOR_UNAVAILABLE",
                    message:
                      error instanceof Error ? error.message : String(error),
                  })}\n\n`,
                );
                res.end();
              } catch {
                /* connection already closed */
              }
              clearInterval(timer);
            });
          }, 250);
          const heartbeat = setInterval(() => res.write(": keepalive\n\n"), 15_000);
          req.on("close", () => {
            clearInterval(timer);
            clearInterval(heartbeat);
          });
          return;
        }

        if (method === "POST" && action === "tick") {
          const step = await coordinator.tickBuild(buildId);
          if (step.ok) await syncRuntimeForBuild(buildId);
          sendJson(res, step.ok ? 200 : 400, {
            ...step,
            view: await viewFor(buildId),
          });
          return;
        }

        if (method === "POST" && action === "message") {
          const body = await readJsonBody(req);
          const text = String(body.message || "").trim();
          if (!text) {
            sendJson(res, 400, { ok: false, code: "MESSAGE_REQUIRED" });
            return;
          }
          const current = readBuildRecord(runtimeRoot, buildId);
          if (!current) {
            sendJson(res, 404, { ok: false, code: "BUILD_NOT_FOUND" });
            return;
          }
          const classified = classifyConversationMessage(text, {
            hasSelection: Boolean(body.element),
          });
          const message = {
            id: `msg-${randomUUID().slice(0, 8)}`,
            role: "user",
            text,
            at: new Date().toISOString(),
            kind: classified.kind,
            element: body.element || undefined,
            status: "queued",
          };
          appendPendingConversation(runtimeRoot, buildId, message);
          appendBuildEvent(runtimeRoot, buildId, "conversation.queued", {
            messageId: message.id,
            kind: classified.kind,
            status: "queued",
          });
          sendJson(res, 200, {
            ok: true,
            queued: true,
            classified,
            message,
            view: await viewFor(buildId),
          });
          void coordinator
            .messageBuild(buildId, {
              message: text,
              element: body.element || null,
            })
            .then((applied) => {
              if (applied?.ok) return ensureLoop(buildId);
              return applied;
            })
            .catch(() => {});
          return;
        }

        if (
          method === "POST" &&
          (action === "stop" || action === "resume" || action === "recover")
        ) {
          const controlled =
            action === "stop"
              ? await coordinator.stopBuild(buildId)
              : action === "recover"
                ? await coordinator.recoverBuild(buildId)
                : await coordinator.resumeBuild(buildId);
          sendJson(res, controlled.ok ? 200 : 400, {
            ...controlled,
            view: await viewFor(buildId),
          });
          return;
        }

        if (method === "POST" && action === "steer") {
          // Back-compat — prefer /message
          const body = await readJsonBody(req);
          const text = String(body.text || body.message || "").trim();
          const applied = await coordinator.messageBuild(buildId, {
            message: text,
            element: body.element || null,
          });
          if (applied.ok) {
            await ensureLoop(buildId);
          }
          sendJson(res, applied.ok ? 200 : 400, {
            ...applied,
            view: await viewFor(buildId),
          });
          return;
        }

        // Runtime APIs
        if (action === "runtime") {
          const gate = assertBuildRoot(buildId);
          if (!gate.ok) {
            sendJson(res, 404, gate);
            return;
          }

          if (method === "GET" && !sub) {
            sendJson(res, 200, await coordinator.getRuntime(buildId));
            return;
          }

          if (method === "POST" && sub === "start") {
            const started = await coordinator.startRuntime(buildId);
            sendJson(res, started.ok ? 200 : 400, {
              ...started,
              view: await viewFor(buildId),
            });
            return;
          }

          if (method === "POST" && sub === "restart") {
            const started = await coordinator.restartRuntime(buildId);
            sendJson(res, started.ok ? 200 : 400, {
              ...started,
              view: await viewFor(buildId),
            });
            return;
          }

          if (method === "POST" && sub === "evidence") {
            const captured =
              await coordinator.captureRuntimeEvidence(buildId);
            sendJson(res, captured.ok ? 200 : 400, captured);
            return;
          }

          if (method === "DELETE" && !sub) {
            const stopped = await coordinator.stopRuntime(buildId);
            sendJson(res, 200, { ...stopped, view: await viewFor(buildId) });
            return;
          }
        }
      }

      if (method === "POST" && path === "/api/open-folder") {
        const body = await readJsonBody(req);
        let dir =
          typeof body.path === "string" && body.path.trim()
            ? resolve(body.path.trim())
            : "";
        // Prefer authoritative build binding when buildId provided
        if (typeof body.buildId === "string" && body.buildId.trim()) {
          const gate = assertBuildRoot(body.buildId.trim());
          if (gate.ok) dir = gate.projectRoot;
        }
        if (!dir || !existsSync(dir)) {
          sendJson(res, 400, {
            ok: false,
            code: "PATH_REQUIRED",
            message: "No Build project folder to open.",
          });
          return;
        }
        try {
          const child = spawn("open", [dir], {
            detached: true,
            stdio: "ignore",
          });
          child.unref();
          sendJson(res, 200, {
            ok: true,
            path: dir,
            launched: true,
            pid: child.pid || null,
          });
        } catch (err) {
          sendJson(res, 500, {
            ok: false,
            code: "OPEN_FOLDER_FAILED",
            message: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }

      if (method === "POST" && path === "/api/open-code") {
        const body = await readJsonBody(req);
        const gate =
          typeof body.buildId === "string" && body.buildId.trim()
            ? assertBuildRoot(body.buildId.trim())
            : null;
        const dir = gate?.ok
          ? gate.projectRoot
          : typeof body.path === "string"
            ? resolve(body.path)
            : "";
        if (!dir || !existsSync(dir)) {
          sendJson(res, 400, {
            ok: false,
            code: "PATH_REQUIRED",
            message: "No Build project to open in PATH Code.",
          });
          return;
        }
        const launcher = join(packageRoot, "scripts", "pathcode.mjs");
        if (!existsSync(launcher)) {
          sendJson(res, 500, {
            ok: false,
            code: "PATHCODE_LAUNCHER_MISSING",
            message: `PATH Code launcher not found at ${launcher}`,
          });
          return;
        }
        try {
          const launched = await launchPathCodeInTerminal({
            projectRoot: dir,
            nodePath: process.execPath,
            launcherPath: launcher,
            env: process.env,
          });
          if (!launched.ok) {
            sendJson(res, 500, launched);
            return;
          }
          sendJson(res, 200, {
            ok: true,
            path: dir,
            launched: true,
            method: launched.method,
            pid: launched.pid || null,
          });
        } catch (err) {
          sendJson(res, 500, {
            ok: false,
            code: "OPEN_CODE_FAILED",
            message: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }

      if (method === "POST" && path === "/api/builds") {
        const body = await readJsonBody(req);
        const outcome = String(body.outcome || "").trim();
        if (!outcome) {
          sendJson(res, 400, {
            ok: false,
            code: "OUTCOME_REQUIRED",
            message: "Describe what you want to build.",
          });
          return;
        }

        const originKind =
          body.originKind === "existing-project"
            ? "existing-project"
            : "build-created";

        let targetDir =
          typeof body.targetDir === "string" && body.targetDir.trim()
            ? resolve(body.targetDir.trim())
            : "";
        if (!targetDir) {
          const root = join(homedir(), "PATH Builds");
          mkdirSync(root, { recursive: true });
          targetDir = join(
            root,
            `${slugifyOutcome(outcome)}-${randomUUID().slice(0, 6)}`,
          );
        }
        mkdirSync(targetDir, { recursive: true });

        const started = await coordinator.startBuild(outcome, {
          targetDir,
          originKind,
          autoRun: autoLoop,
          // Criteria come from product brief inside startBuild.
        });
        if (!started.ok) {
          sendJson(res, 400, started);
          return;
        }

        // Hard invariant for build-created (canonicalize for macOS /var vs /private/var)
        const { realpathSync } = await import("node:fs");
        const canon = (p) => {
          try {
            return realpathSync(p);
          } catch {
            return resolve(p);
          }
        };
        if (
          originKind === "build-created" &&
          canon(started.projectRoot) !== canon(targetDir)
        ) {
          sendJson(res, 500, {
            ok: false,
            code: "BINDING_ROOT_MISMATCH",
            message: `Bound ${started.projectRoot} != target ${targetDir}`,
          });
          return;
        }

        // Defer loop so HTTP response returns immediately (tests + UX).
        if (autoLoop) {
          setImmediate(() => {
            void ensureLoop(started.build.buildId).catch((err) => {
              console.error(
                "[path-build] ensureLoop failed",
                started.build.buildId,
                err,
              );
            });
          });
        }
        sendJson(res, 200, {
          ok: true,
          buildId: started.build.buildId,
          projectRoot: started.projectRoot,
          originKind,
          view: await viewFor(started.build.buildId),
        });
        return;
      }

      res.writeHead(404).end("Not found");
    } catch (err) {
      if (res.headersSent) {
        try {
          res.end();
        } catch {
          /* connection already closed */
        }
        return;
      }
      sendJson(res, 500, {
        ok: false,
        code: "SURFACE_ERROR",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  server.on("upgrade", (req, socket, head) => {
    void (async () => {
      try {
        const url = new URL(req.url || "/", `http://${host}`);
        const previewMatch = url.pathname.match(/^\/preview\/([^/]+)/);
        if (!previewMatch) {
          socket.destroy();
          return;
        }
        const buildId = decodeURIComponent(previewMatch[1]);
        const runtimeState = await coordinator.getRuntime(buildId);
        const targetUrl =
          runtimeState.runtime?.url || runtimeState.preview?.url;
        if (!targetUrl) {
          socket.destroy();
          return;
        }
        proxyPreviewWs(req, socket, head, { targetUrl });
      } catch {
        try {
          socket.destroy();
        } catch {
          /* ignore */
        }
      }
    })();
  });

  const preferred =
    typeof options.port === "number" && options.port > 0
      ? options.port
      : Number(process.env.PATHCODE_BUILD_PORT || 7788) || 7788;

  const port = await new Promise((resolvePort, reject) => {
    const tryListen = (p) => {
      const onError = (err) => {
        server.off("listening", onListening);
        if (err && err.code === "EADDRINUSE" && p !== 0) {
          tryListen(0);
          return;
        }
        reject(err);
      };
      const onListening = () => {
        server.off("error", onError);
        const addr = server.address();
        resolvePort(typeof addr === "object" && addr ? addr.port : p);
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(p, host);
    };
    tryListen(preferred);
  });

  const url = `http://${host}:${port}/`;
  if (options.openBrowser !== false && process.env.PATHCODE_BUILD_NO_OPEN !== "1") {
    try {
      spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    } catch {
      // operator can open manually
    }
  }

  return {
    url,
    host,
    port,
    server,
    runtimeRoot,
    fakeMode,
    coordinator,
    stop: async () => {
      await new Promise((resolveStop) => {
        server.close(() => resolveStop());
      });
      // Fake coordinators are test/proof hosts and must not leak detached
      // processes. Real coordinators deliberately outlive browser surfaces.
      if (fakeMode) {
        try {
          await coordinator.shutdown();
        } catch {
          // it may already be stopping
        }
      }
      coordinator.close();
    },
  };
}
