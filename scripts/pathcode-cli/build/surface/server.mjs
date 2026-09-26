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
  rmSync,
} from "node:fs";
import { dirname, join, extname, resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";

import {
  readBuildRecord,
  writeBuildRecord,
  listBuildRecords,
  selectSurfaceBuildId,
  appendPendingConversation,
  readPendingConversations,
  appendBuildEvent,
} from "../index.mjs";
import { syncConversationLifecycle } from "../controller.mjs";
import { projectBuildForSurface } from "./product-view.mjs";
import { displayTitleFor, isCreatorProject, libraryRow } from "./project-library.mjs";
import {
  exportAuthoritativeProject,
  readExportBytes,
} from "./project-export.mjs";
import {
  connectGitHubRepository,
  connectLocalRemote,
  disconnectRepository,
  inspectRepository,
  pushAdoptedRevision,
  setAdoptedSync,
} from "./repository.mjs";
import { classifyConversationMessage } from "../conversation.mjs";
import { detectBuildArtifact } from "../runtime/artifact.mjs";
import {
  proxyPreviewHttp,
  proxyPreviewWs,
} from "../runtime/proxy.mjs";
import { launchPathCodeInTerminal } from "./handoff.mjs";
import { ensureBuildCoordinator } from "../coordinator/ensure.mjs";
import { resolveCandidatePreviewRoot } from "../candidate.mjs";
import { assessServingIdentity, loadedCodeIdentity } from "../identity.mjs";
import { sanitizeBuildEventValue, surfaceViewSanitizeLimits } from "../events.mjs";
import { readTaskCheckpoint } from "../../ag10/task-checkpoint.mjs";
import { readTaskTrace } from "../../task-trace.mjs";
import {
  closeHttpServerBounded,
  terminateOwnedPid,
  withTimeout,
} from "../shutdown.mjs";
import {
  resolveBuildCoordinatorPidPath,
} from "../coordinator/server.mjs";
import { readGatewayPid } from "../../gateway/ensure.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(HERE, "public");

function engineFromCheckpoint(checkpoint) {
  const turns = Array.isArray(checkpoint?.engineTurns) ? checkpoint.engineTurns : [];
  const primary = turns.find((turn) => turn && turn.role === "primary" && turn.engine);
  if (primary) return primary.engine;
  const latest = String(checkpoint?.latestEngineTurn || checkpoint?.inFlightEngine || "");
  const match = latest.match(/(?:^|:)(cursor|copilot|antigravity)$/i);
  if (match) return match[1].toLowerCase();
  const selected = String(checkpoint?.engineSelection?.selected || "");
  if (/^(cursor|copilot|antigravity)$/.test(selected)) return selected;
  return null;
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
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
  const fakeMode = options.fakeMode === true;
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
  /** @type {Set<string>} */
  const previewOpenAttempts = new Set();
  const surfaceIdentity = loadedCodeIdentity("surface");
  /** @type {Set<string>} */
  const identityAnnounced = new Set();
  /** @type {{ at: number, value: any } | null} */
  let servingCache = null;

  /**
   * @param {string} [buildId]
   */
  async function viewFor(buildId) {
    let id = buildId || "";
    if (!id) {
      id = selectSurfaceBuildId(listBuildRecords(runtimeRoot)) || "";
    }
    let stored = id ? readBuildRecord(runtimeRoot, id) : null;
    // Heal durable conversation truth on every surface read so orphan QUEUED
    // cards (corrected re-sends) become superseded without requiring a recover.
    if (stored) {
      const before = (stored.conversation || [])
        .map((message) => `${message.id}:${message.status}`)
        .join("|");
      syncConversationLifecycle(stored);
      const after = (stored.conversation || [])
        .map((message) => `${message.id}:${message.status}`)
        .join("|");
      if (before !== after) {
        writeBuildRecord(runtimeRoot, stored);
        stored = readBuildRecord(runtimeRoot, id) || stored;
      }
    }
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
    const currentRevision = build?.intent?.outcomeRevision;
    const currentChildren = (build?.children || []).filter(
      (child) =>
        child?.taskId &&
        (currentRevision == null || child.intentRevision === currentRevision),
    );
    const tracedChildren = currentChildren.length
      ? currentChildren
      : (build?.children || []).filter((child) => child?.taskId).slice(-4);
    const traces = tracedChildren.map((child) => ({
      taskId: child.taskId,
      lines: readTaskTrace(child.taskId, runtimeRoot, 200).lines || [],
      engine: engineFromCheckpoint(readTaskCheckpoint(runtimeRoot, child.taskId)),
    }));
    const traceLines = traces.length ? traces[traces.length - 1].lines : [];
    /** @type {{ files?: string[], summary?: string, commands?: string[] } | null} */
    let diff = null;
    /** @type {{ sha?: string, files?: string[], summary?: string } | null} */
    let revisionDiff = null;
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
        const names = spawnSync(
          "git",
          ["show", "--name-only", "--pretty=format:", build.authoritativeSha],
          {
            cwd: root,
            encoding: "utf8",
            timeout: 8_000,
            env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
          },
        );
        revisionDiff = {
          sha: build.authoritativeSha,
          summary: String(shown.stdout || "").slice(0, 2_000),
          files:
            names.status === 0
              ? String(names.stdout || "")
                  .split("\n")
                  .map((line) => line.trim())
                  .filter(Boolean)
                  .slice(0, 40)
              : [],
        };
      }
    }
    const worktreePath =
      typeof checkpoint?.worktreePath === "string" ? checkpoint.worktreePath : "";
    /** @type {string[]} */
    let worktreeFiles = [];
    if (
      build?.loop?.status !== "complete" &&
      worktreePath &&
      existsSync(join(worktreePath, ".git"))
    ) {
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
      }
    }
    const view = projectBuildForSurface(build, {
      preview: state.preview,
      runtime: state.runtime,
      artifact,
      events: eventState.events || [],
      checkpoint,
      diff,
      revisionDiff,
      worktreeFiles,
      traceLines,
      traces,
    });
    const coordinatorStatus = id ? await coordinator.status() : { loops: [] };
    const serving = await servingIdentity();
    if (id && stored && !identityAnnounced.has(id)) {
      identityAnnounced.add(id);
      appendBuildEvent(runtimeRoot, id, "surface.identity", {
        surface: surfaceIdentity,
        processes: serving.processes,
        stale: serving.stale,
        exact: serving.exact,
      });
    }
    return {
      ...view,
      loopRunning: Boolean(
        coordinatorStatus.loops?.some((loop) => loop.buildId === id),
      ),
      fakeMode,
      preferredEngine: preferredEngine || null,
      serving,
    };
  }

  async function servingIdentity() {
    if (servingCache && Date.now() - servingCache.at < 1_000) return servingCache.value;
    let hello = null;
    try {
      hello = await coordinator.hello("surface");
    } catch {
      hello = null;
    }
    const value = {
      ...assessServingIdentity({
        surface: surfaceIdentity,
        coordinator: hello?.identity,
        coordinatorPid: hello?.pid ?? null,
        gateway: hello?.gatewayIdentity,
        gatewayExpected: hello ? !hello.fakeMode : true,
      }),
      coordinatorReused: coordinatorHandle.started !== true,
    };
    servingCache = { at: Date.now(), value };
    return value;
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
      const candidateMatch = path.match(/^\/preview-candidate\/([^/]+)(?:\/(.*))?$/);
      if (candidateMatch && (method === "GET" || method === "HEAD")) {
        const buildId = decodeURIComponent(candidateMatch[1]);
        const build = readBuildRecord(runtimeRoot, buildId);
        const candidate = build?.pendingCandidate;
        if (!build || candidate?.status !== "pending") {
          sendJson(res, 404, { ok: false, code: "NO_PENDING_CANDIDATE" });
          return;
        }
        const rooted = resolveCandidatePreviewRoot({
          runtimeRoot,
          buildId,
          projectRoot: build.projectBindings?.[0]?.projectRoot || null,
          candidate,
        });
        if (!rooted.ok) {
          sendJson(res, 503, rooted);
          return;
        }
        let rel = `/${candidateMatch[2] || ""}`;
        if (rel === "/" || rel === "") rel = "/index.html";
        const filePath = resolve(rooted.root, `.${rel}`);
        const relCheck = relative(resolve(rooted.root), filePath);
        if (relCheck.startsWith("..") || relCheck.includes(`..${sep}`)) {
          res.writeHead(403).end("Forbidden");
          return;
        }
        sendFile(res, filePath);
        return;
      }

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
      if (method === "GET" && (path === "/live" || path === "/live.html")) {
        sendFile(res, join(PUBLIC_DIR, "live.html"));
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

      if (method === "GET" && path === "/api/identity") {
        sendJson(res, 200, { ok: true, ...(await servingIdentity()) });
        return;
      }

      if (method === "GET" && path === "/api/builds/latest") {
        sendJson(res, 200, await viewFor());
        return;
      }

      if (method === "GET" && path === "/api/builds") {
        const rows = listBuildRecords(runtimeRoot)
          .filter((build) => isCreatorProject(build))
          .slice()
          .sort((a, b) => {
            const rowA = libraryRow(a);
            const rowB = libraryRow(b);
            const atA = rowA.activityAt || a.createdAt || "";
            const atB = rowB.activityAt || b.createdAt || "";
            return String(atB).localeCompare(String(atA));
          })
          .slice(0, 200);
        sendJson(res, 200, {
          ok: true,
          builds: rows.map((b) => {
            const row = libraryRow(b);
            return {
            ...row,
            status: b.loop?.status,
            creatorStatus: row.status,
            outcome: b.intent?.outcome,
            projectRoot: b.projectBindings?.[0]?.projectRoot || null,
            originKind: b.originKind || b.projectBindings?.[0]?.originKind || null,
            // Keep persistence clock separate from rail activity clock.
            updatedAt: b.updatedAt,
            activityAt: row.activityAt,
          };
          }),
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
          const openKey = `${buildId}:${build.authoritativeSha || ""}`;
          const root = build.projectBindings?.[0]?.projectRoot || null;
          if (
            build.authoritativeSha &&
            build.loop?.status !== "running" &&
            build.loop?.status !== "awaiting_review" &&
            !previewOpenAttempts.has(openKey) &&
            root &&
            existsSync(root) &&
            detectBuildArtifact(root, { outcomeHint: build.intent?.outcome })
              ?.preview?.capability === "web"
          ) {
            const current = await coordinator.getRuntime(buildId);
            const live =
              current?.runtime?.status === "ready" ||
              current?.preview?.status === "ready";
            if (!live) {
              // Once per revision per surface process: a preview that fails to
              // start must not be restarted on every poll; Refresh retries.
              previewOpenAttempts.add(openKey);
              await coordinator.startRuntime(buildId);
            }
          }
          sendJson(res, 200, await viewFor(buildId));
          return;
        }

        if (method === "POST" && action === "title") {
          const build = readBuildRecord(runtimeRoot, buildId);
          if (!build) {
            sendJson(res, 404, { ok: false, code: "BUILD_NOT_FOUND" });
            return;
          }
          const body = await readJsonBody(req);
          const title = String(body.displayTitle || "").trim().slice(0, 80);
          if (!title) {
            sendJson(res, 400, { ok: false, code: "TITLE_REQUIRED" });
            return;
          }
          build.displayTitle = title;
          writeBuildRecord(runtimeRoot, build);
          sendJson(res, 200, { ok: true, displayTitle: title, view: await viewFor(buildId) });
          return;
        }

        if (method === "POST" && (action === "archive" || action === "restore")) {
          const build = readBuildRecord(runtimeRoot, buildId);
          if (!build) {
            sendJson(res, 404, { ok: false, code: "BUILD_NOT_FOUND" });
            return;
          }
          if (action === "archive") build.archivedAt = new Date().toISOString();
          else delete build.archivedAt;
          writeBuildRecord(runtimeRoot, build);
          sendJson(res, 200, { ok: true, archived: action === "archive", view: await viewFor(buildId) });
          return;
        }

        if (method === "GET" && action === "export") {
          const build = readBuildRecord(runtimeRoot, buildId);
          const root = build?.projectBindings?.[0]?.projectRoot;
          if (!build || !root) {
            sendJson(res, 404, { ok: false, code: "BUILD_NOT_FOUND" });
            return;
          }
          const exported = exportAuthoritativeProject({
            projectRoot: root,
            sha: build.authoritativeSha,
            title: displayTitleFor(build),
          });
          if (!exported.ok) {
            sendJson(res, 400, exported);
            return;
          }
          const bytes = readExportBytes(exported.zipPath);
          rmSync(exported.directory, { recursive: true, force: true });
          res.writeHead(200, {
            "Content-Type": "application/zip",
            "Content-Disposition": `attachment; filename="${exported.filename}"`,
            "Content-Length": bytes.length,
            "Cache-Control": "no-store",
          });
          res.end(bytes);
          return;
        }

        if (method === "GET" && action === "repository") {
          const build = readBuildRecord(runtimeRoot, buildId);
          const root = build?.projectBindings?.[0]?.projectRoot;
          if (!build || !root) {
            sendJson(res, 404, { ok: false, code: "BUILD_NOT_FOUND" });
            return;
          }
          sendJson(res, 200, { ok: true, repository: inspectRepository(root, build) });
          return;
        }

        if (method === "POST" && action === "repository") {
          const build = readBuildRecord(runtimeRoot, buildId);
          const root = build?.projectBindings?.[0]?.projectRoot;
          if (!build || !root) {
            sendJson(res, 404, { ok: false, code: "BUILD_NOT_FOUND" });
            return;
          }
          const body = await readJsonBody(req);
          const op = String(body.action || "");
          let result;
          if (op === "connect-local") result = connectLocalRemote(build, root, body.remoteUrl);
          else if (op === "connect-github") {
            result = connectGitHubRepository(build, root, {
              name: body.name,
              visibility: body.visibility,
            });
          } else if (op === "sync-mode") result = setAdoptedSync(build, root, body.enabled === true);
          else if (op === "sync") result = pushAdoptedRevision(build, root, build.authoritativeSha);
          else if (op === "disconnect") result = disconnectRepository(build, root, body.confirm === true);
          else result = { ok: false, code: "REPOSITORY_ACTION_REQUIRED" };
          if (result.ok) writeBuildRecord(runtimeRoot, build);
          sendJson(res, result.ok ? 200 : 400, { ...result, view: await viewFor(buildId) });
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
          let lastSentRevision = -1;
          const push = async () => {
            if (pushing) return;
            pushing = true;
            try {
              const replay = await coordinator.getBuildEvents(buildId, {
                afterId: cursor,
                limit: 250,
              });
              for (const event of replay.events || []) {
                const view = sanitizeBuildEventValue(await viewFor(buildId), 0, surfaceViewSanitizeLimits());
                const payload = JSON.stringify({
                  event,
                  view,
                  viewRevision: view?.viewRevision ?? null,
                });
                res.write(`id: ${event.id}\n`);
                res.write(`event: build\n`);
                res.write(`data: ${payload}\n\n`);
                cursor = event.id;
                if (Number.isFinite(view?.viewRevision)) {
                  lastSentRevision = view.viewRevision;
                }
              }
              // Always converge on the current view. A reconnect that is
              // already at the latest Build event id would otherwise wait
              // forever for the next event, and task-trace progress does not
              // itself append a Build event.
              const view = sanitizeBuildEventValue(await viewFor(buildId), 0, surfaceViewSanitizeLimits());
              const revision = Number(view?.viewRevision);
              if (!Number.isFinite(revision) || revision !== lastSentRevision) {
                res.write(
                  `event: snapshot\ndata: ${JSON.stringify({
                    view,
                    viewRevision: Number.isFinite(revision) ? revision : 0,
                  })}\n\n`,
                );
                if (Number.isFinite(revision)) lastSentRevision = revision;
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

        if (method === "POST" && (action === "apply" || action === "discard")) {
          const decided =
            action === "apply"
              ? await coordinator.applyCandidate(buildId)
              : await coordinator.discardCandidate(buildId);
          sendJson(res, decided.ok ? 200 : 400, {
            ...decided,
            view: await viewFor(buildId),
          });
          return;
        }

        if (
          method === "POST" &&
          (action === "stop" ||
            action === "pause" ||
            action === "resume" ||
            action === "recover")
        ) {
          const controlled =
            action === "stop"
              ? await coordinator.stopBuild(buildId)
              : action === "pause"
                ? await coordinator.pauseBuild(buildId)
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
    identity: () => servingIdentity(),
    /**
     * @param {{ teardownOwned?: boolean }} [opts]
     * Operator Ctrl-C must pass teardownOwned:true so coordinator, Gateway,
     * and Build runtimes do not outlive the surface.
     */
    stop: async (opts = {}) => {
      const teardownOwned = opts.teardownOwned === true || fakeMode === true;
      await closeHttpServerBounded(server, 2_000);
      if (teardownOwned) {
        let coordinatorPid = null;
        try {
          const raw = readFileSync(
            resolveBuildCoordinatorPidPath(runtimeRoot),
            "utf8",
          );
          coordinatorPid = Number(String(raw).split("\n")[0]);
        } catch {
          coordinatorPid = null;
        }
        const gatewayPidBefore = readGatewayPid(runtimeRoot);
        try {
          await withTimeout(coordinator.shutdown(), 3_000, null);
        } catch {
          // shutdown RPC may already be racing process exit
        }
        try {
          coordinator.close();
        } catch {
          // ignore
        }
        await terminateOwnedPid(coordinatorPid, { termMs: 3_000, killMs: 2_000 });
        await terminateOwnedPid(gatewayPidBefore ?? readGatewayPid(runtimeRoot), {
          termMs: 3_000,
          killMs: 2_000,
        });
      } else {
        try {
          coordinator.close();
        } catch {
          // ignore
        }
      }
    },
  };
}
