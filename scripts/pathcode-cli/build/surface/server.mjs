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
import { spawn } from "node:child_process";

import { createGatewayRuntime } from "../../gateway/runtime.mjs";
import {
  createBuildController,
  readBuildRecord,
  findLatestActiveBuild,
  listBuildRecords,
} from "../index.mjs";
import { projectBuildForSurface } from "./product-view.mjs";
import { createBuildRuntimeManager } from "../runtime/manager.mjs";
import { detectBuildArtifact } from "../runtime/artifact.mjs";
import {
  proxyPreviewHttp,
  proxyPreviewWs,
} from "../runtime/proxy.mjs";
import { captureBrowserEvidence } from "../runtime/browser-evidence.mjs";
import { deriveProductBrief } from "../brief.mjs";
import { launchPathCodeInTerminal } from "./handoff.mjs";

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

  const gatewayRuntime = createGatewayRuntime({
    packageRoot,
    runtimeRoot,
  });

  const runtimeManager = createBuildRuntimeManager({ runtimeRoot });

  /** @type {ReturnType<typeof createBuildController>} */
  const controller = createBuildController({
    runtimeRoot,
    preferredEngine,
    fakeMode,
    gateway: {
      bindProject: (cwd) =>
        gatewayRuntime.bindProject({
          cwd: typeof cwd === "string" ? cwd : cwd?.cwd,
        }),
      startTask: (objective, extra) =>
        gatewayRuntime.startTask({ objective, ...extra }),
      resumeTask: (taskId, extra) =>
        gatewayRuntime.resumeTask({ taskId, ...extra }),
      awaitTask: (taskId, timeoutMs) =>
        gatewayRuntime.awaitTask(taskId, timeoutMs),
      steerTask: (taskId, text) => gatewayRuntime.steerTask(taskId, text),
      snapshotTask: (taskId) => gatewayRuntime.snapshotTask(taskId),
      cancelTask: (taskId) => gatewayRuntime.cancelTask(taskId),
    },
  });

  /** @type {Map<string, { promise: Promise<unknown>, startedAt: string }>} */
  const loops = new Map();
  /** @type {string | null} */
  let surfaceBaseUrl = null;

  /**
   * Keep product runtime + browser evidence aligned with authoritative Build revision.
   * @param {string} buildId
   */
  async function syncRuntimeForBuild(buildId) {
    const gate = assertBuildRoot(buildId);
    if (!gate.ok) return gate;
    const build = gate.build;
    const root = gate.projectRoot;
    const artifact = detectBuildArtifact(root, {
      outcomeHint: build.intent?.outcome,
    });
    if (artifact.preview.capability !== "web") {
      controller.patchRuntimeState?.(buildId, {
        previewUrl: null,
        runtimeHealth: "n/a",
        clearRuntimeRefresh: true,
      });
      return { ok: true, skipped: true, reason: "non_web" };
    }
    if ((artifact.signals || []).includes("empty_tree")) {
      // No product yet — clear refresh so the Build loop can dispatch the first engineer.
      controller.patchRuntimeState?.(buildId, {
        previewUrl: null,
        runtimeHealth: "awaiting_product",
        clearRuntimeRefresh: true,
      });
      return { ok: true, skipped: true, reason: "empty_tree" };
    }

    const force = Boolean(build.loop?.pendingRuntimeRefresh);
    const started = force
      ? await runtimeManager.refresh(buildId, root, {
          bindingId: gate.binding.bindingId,
          outcomeHint: build.intent?.outcome,
        })
      : await runtimeManager.start(buildId, root, {
          bindingId: gate.binding.bindingId,
          outcomeHint: build.intent?.outcome,
        });

    if (!started.ok) {
      controller.patchRuntimeState?.(buildId, {
        previewUrl: null,
        runtimeHealth: "failed",
        clearRuntimeRefresh: true,
      });
      return started;
    }

    const preview = runtimeManager.getPreviewDescriptor(buildId);
    const directUrl = started.runtime?.url || preview?.url || null;
    const embedUrl =
      surfaceBaseUrl && preview?.embedPath
        ? new URL(preview.embedPath, surfaceBaseUrl).toString()
        : null;
    const evidence = await captureBrowserEvidence({
      url: embedUrl || directUrl,
      buildId,
      runtimeRoot,
      authoritativeSha: build.authoritativeSha || null,
      intentRevision: build.intent?.outcomeRevision ?? null,
      bindingId: gate.binding.bindingId,
      expectText: String(build.intent?.outcome || "")
        .split(/\s+/)
        .filter((w) => w.length > 3)
        .slice(0, 8),
    });
    evidence.authoritativeSha = build.authoritativeSha || null;

    controller.patchRuntimeState?.(buildId, {
      previewUrl: directUrl,
      runtimeHealth: started.runtime?.status === "ready" ? "ok" : "down",
      browserEvidence: evidence,
      clearRuntimeRefresh: true,
      authoritativeSha: build.authoritativeSha || null,
    });

    return { ok: true, runtime: started.runtime, evidence, preview };
  }

  function ensureLoop(buildId, opts = {}) {
    if (loops.has(buildId)) return;
    const startedAt = new Date().toISOString();
    const promise = controller
      .runUntilDone(buildId, {
        maxSteps: 48,
        syncRuntime: (id) => syncRuntimeForBuild(id),
      })
      .then(async (result) => {
        if (opts.autoPreview !== false) {
          await syncRuntimeForBuild(buildId);
        }
        if (result && result.ok === false) {
          console.error("[path-build] runUntilDone failed", buildId, result);
        }
        return result;
      })
      .catch((err) => {
        console.error("[path-build] runUntilDone threw", buildId, err);
        return {
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        };
      })
      .finally(() => {
        // Allow a later conversation steer / recovery to start a new loop.
        const cur = loops.get(buildId);
        if (cur && cur.promise === promise) loops.delete(buildId);
      });
    loops.set(buildId, { promise, startedAt });
  }

  /**
   * @param {string} buildId
   */
  async function maybeStartPreview(buildId) {
    const build = readBuildRecord(runtimeRoot, buildId);
    const root = build?.projectBindings?.[0]?.projectRoot;
    if (!root || !existsSync(root)) return null;
    const artifact = detectBuildArtifact(root, {
      outcomeHint: build?.intent?.outcome,
    });
    if (artifact.preview.capability !== "web") return null;
    // Need some product files before starting
    if ((artifact.signals || []).includes("empty_tree")) return null;
    try {
      return await runtimeManager.start(buildId, root, {
        bindingId: build.projectBindings[0].bindingId,
        outcomeHint: build.intent?.outcome,
      });
    } catch {
      return null;
    }
  }

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
    const build = id ? readBuildRecord(runtimeRoot, id) : null;
    const root = build?.projectBindings?.[0]?.projectRoot || null;
    const artifact =
      root && existsSync(root)
        ? detectBuildArtifact(root, { outcomeHint: build?.intent?.outcome })
        : null;
    const inspected = id ? await runtimeManager.inspect(id) : { runtime: null };
    let preview = id ? runtimeManager.getPreviewDescriptor(id) : null;

    // Opportunistic preview / revision sync
    if (
      id &&
      root &&
      artifact?.preview?.capability === "web" &&
      !(artifact.signals || []).includes("empty_tree")
    ) {
      const needs =
        build?.loop?.pendingRuntimeRefresh ||
        !inspected.runtime ||
        inspected.runtime.status === "stopped" ||
        inspected.runtime.status === "stale" ||
        inspected.runtime.status === "idle" ||
        inspected.runtime.status === "unavailable";
      if (needs) {
        void syncRuntimeForBuild(id);
      }
    }

    preview = id ? runtimeManager.getPreviewDescriptor(id) : preview;
    const view = projectBuildForSurface(build, {
      preview,
      runtime: inspected.runtime,
      artifact,
    });
    const loop = id ? loops.get(id) : null;
    return {
      ...view,
      loopRunning: Boolean(loop),
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
        const live = runtimeManager.getLiveTarget(buildId);
        const desc = runtimeManager.getPreviewDescriptor(buildId);
        const targetUrl = live?.url || desc?.url;
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
          res.writeHead(200, {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          });
          const push = async () => {
            const payload = JSON.stringify(await viewFor(buildId));
            res.write(`data: ${payload}\n\n`);
          };
          await push();
          const timer = setInterval(() => {
            void push();
          }, 1200);
          req.on("close", () => clearInterval(timer));
          return;
        }

        if (method === "POST" && action === "tick") {
          const step = await controller.tick(buildId);
          if (step.ok) await syncRuntimeForBuild(buildId);
          sendJson(res, step.ok ? 200 : 400, {
            ...step,
            view: await viewFor(buildId),
          });
          return;
        }

        if (method === "POST" && action === "message") {
          const body = await readJsonBody(req);
          const applied = await controller.applyConversation(buildId, {
            message: String(body.message || ""),
            element: body.element || null,
          });
          if (applied.ok) {
            loops.delete(buildId);
            ensureLoop(buildId);
          }
          sendJson(res, applied.ok ? 200 : 400, {
            ...applied,
            view: await viewFor(buildId),
          });
          return;
        }

        if (method === "POST" && action === "steer") {
          // Back-compat — prefer /message
          const body = await readJsonBody(req);
          const text = String(body.text || body.message || "").trim();
          const applied = await controller.applyConversation(buildId, {
            message: text,
            element: body.element || null,
          });
          if (applied.ok) {
            loops.delete(buildId);
            ensureLoop(buildId);
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
            const inspected = await runtimeManager.inspect(buildId);
            sendJson(res, 200, {
              ok: true,
              runtime: inspected.runtime,
              preview: runtimeManager.getPreviewDescriptor(buildId),
              artifact: detectBuildArtifact(gate.projectRoot, {
                outcomeHint: gate.build.intent?.outcome,
              }),
            });
            return;
          }

          if (method === "POST" && sub === "start") {
            const started = await runtimeManager.start(
              buildId,
              gate.projectRoot,
              {
                bindingId: gate.binding.bindingId,
                outcomeHint: gate.build.intent?.outcome,
                forceRestart: false,
              },
            );
            sendJson(res, started.ok ? 200 : 400, {
              ...started,
              view: await viewFor(buildId),
            });
            return;
          }

          if (method === "POST" && sub === "restart") {
            const started = await runtimeManager.refresh(
              buildId,
              gate.projectRoot,
              {
                bindingId: gate.binding.bindingId,
                outcomeHint: gate.build.intent?.outcome,
              },
            );
            sendJson(res, started.ok ? 200 : 400, {
              ...started,
              view: await viewFor(buildId),
            });
            return;
          }

          if (method === "POST" && sub === "evidence") {
            const preview = runtimeManager.getPreviewDescriptor(buildId);
            if (!preview?.url) {
              sendJson(res, 400, {
                ok: false,
                code: "NO_PREVIEW_URL",
              });
              return;
            }
            const brief = gate.build.productBrief || deriveProductBrief(gate.build.intent?.outcome || "");
            const expectText = (brief.acceptanceCriteria || [])
              .map((c) => c.statement)
              .slice(0, 6);
            // Prefer short product tokens from outcome
            const tokens = String(gate.build.intent?.outcome || "")
              .split(/\s+/)
              .filter((w) => w.length > 3)
              .slice(0, 8);
            const evidence = await captureBrowserEvidence({
              url: preview.url,
              buildId,
              runtimeRoot,
              expectText: [...tokens, ...expectText].slice(0, 10),
            });
            sendJson(res, 200, { ok: evidence.ok, evidence });
            return;
          }

          if (method === "DELETE" && !sub) {
            const stopped = await runtimeManager.stop(buildId);
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

        const started = await controller.startBuild(outcome, {
          targetDir,
          originKind,
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
            try {
              ensureLoop(started.build.buildId, { autoPreview: true });
            } catch (err) {
              console.error(
                "[path-build] ensureLoop failed",
                started.build.buildId,
                err,
              );
            }
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
      sendJson(res, 500, {
        ok: false,
        code: "SURFACE_ERROR",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  server.on("upgrade", (req, socket, head) => {
    try {
      const url = new URL(req.url || "/", `http://${host}`);
      const previewMatch = url.pathname.match(/^\/preview\/([^/]+)/);
      if (!previewMatch) {
        socket.destroy();
        return;
      }
      const buildId = decodeURIComponent(previewMatch[1]);
      const live = runtimeManager.getLiveTarget(buildId);
      const targetUrl = live?.url;
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
  surfaceBaseUrl = url;
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
    runtimeManager,
    stop: async () => {
      await runtimeManager.stopAll();
      await new Promise((resolveStop) => {
        server.close(() => resolveStop());
      });
    },
  };
}
