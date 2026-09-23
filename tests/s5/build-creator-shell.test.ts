import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createBuildRecordSkeleton,
  listBuildRecords,
  readBuildRecord,
  writeBuildRecord,
} from "../../scripts/pathcode-cli/build/index.mjs";
import { projectEngineeringTimeline } from "../../scripts/pathcode-cli/build/surface/engineering-timeline.mjs";
import { previewTransition } from "../../scripts/pathcode-cli/build/surface/public/view-revision.js";
import { projectBuildForSurface } from "../../scripts/pathcode-cli/build/surface/product-view.mjs";
import {
  creatorConversation,
  criteriaProjection,
  criteriaSummary,
  deriveDisplayTitle,
  displayTitleFor,
  hasActiveEngineering,
  isArchived,
  isCreatorProject,
  isCreatorProjectRoot,
} from "../../scripts/pathcode-cli/build/surface/project-library.mjs";
import { exportAuthoritativeProject } from "../../scripts/pathcode-cli/build/surface/project-export.mjs";
import {
  connectLocalRemote,
  disconnectRepository,
  inspectRepository,
  pushAdoptedRevision,
  setAdoptedSync,
  syncAdoptedRevisionIfEnabled,
} from "../../scripts/pathcode-cli/build/surface/repository.mjs";

const gitEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: "PATH Build",
  GIT_AUTHOR_EMAIL: "path-build@localhost",
  GIT_COMMITTER_NAME: "PATH Build",
  GIT_COMMITTER_EMAIL: "path-build@localhost",
  GIT_TERMINAL_PROMPT: "0",
};

function git(cwd: string, args: string[]) {
  return spawnSync("git", args, { cwd, encoding: "utf8", env: gitEnv });
}

describe("PATH Builder creator shell", () => {
  it("names the ICE outcome as a human title and keeps technical identity stable", () => {
    expect(
      deriveDisplayTitle(
        "Build an ICE  in case of emergency website that define the app ICE when you cannot speak",
      ),
    ).toBe("ICE in case of emergency website");
    expect(
      deriveDisplayTitle("Build an ICE  in case of emergency website that define the app"),
    ).not.toBe("ICE — In Case of Emergency");
    expect(
      deriveDisplayTitle("Build a polished public website for ICE — In Case of Emergency. Explain what ICE is"),
    ).toBe("ICE — In Case of Emergency");
    expect(
      deriveDisplayTitle("Build a website that tells about ICE in case of emergency app and how to use it"),
    ).not.toBe("Website");
    expect(deriveDisplayTitle("homepage for medical")).toBe("Medical homepage");
    expect(
      displayTitleFor({
        displayTitle: null,
        intent: { outcome: "Build an ICE in case of emergency website that explains the product" },
        productBrief: { summary: "Static ICE (In Case of Emergency) marketing website" },
      }),
    ).toBe("ICE — In Case of Emergency");
    expect(criteriaProjection([
      { status: "PROVEN", required: true },
      { status: "UNKNOWN", required: true, statement: "CTA" },
    ], { live: true }).split).toBe(true);
    expect(criteriaProjection([
      { status: "PROVEN", required: true },
      { status: "PROVEN", required: true },
    ], { live: false }).split).toBe(false);
    const dir = mkdtempSync(join(tmpdir(), "path-library-"));
    const runtimeRoot = join(dir, "rt");
    const projectRoot = join(dir, "ice");
    mkdirSync(projectRoot, { recursive: true });
    const record = createBuildRecordSkeleton({
      outcome: "Build an ICE in case of emergency website",
      buildId: "dcca5ffb-f748-4778-bc91-876ac8ae0176",
    });
    record.projectBindings = [{ projectRoot, bindingId: "b", originKind: "build-created" }];
    record.productBranch = "path-build/dcca5ffb";
    record.loop.status = "complete";
    writeBuildRecord(runtimeRoot, record);
    record.displayTitle = "ICE meeting";
    writeBuildRecord(runtimeRoot, record);
    const stored = readBuildRecord(runtimeRoot, record.buildId);
    expect(stored?.displayTitle).toBe("ICE meeting");
    expect(stored).toBeTruthy();
    if (!stored) return;
    expect(isArchived(stored)).toBe(false);
    stored.archivedAt = "2026-09-23T00:00:00.000Z";
    writeBuildRecord(runtimeRoot, stored);
    expect(isArchived(readBuildRecord(runtimeRoot, record.buildId))).toBe(true);
    expect(stored?.projectBindings?.[0]?.projectRoot).toBe(projectRoot);
    expect(stored?.productBranch).toBe("path-build/dcca5ffb");
    expect(stored?.buildId).toBe(record.buildId);
    rmSync(dir, { recursive: true, force: true });
  });

  it("shows PATH Builds projects and hides temp and home roots", () => {
    expect(isCreatorProjectRoot(join(homedir(), "PATH Builds", "ice"))).toBe(true);
    expect(isCreatorProjectRoot(join(tmpdir(), "path-build-accept"))).toBe(false);
    expect(isCreatorProjectRoot("/private/tmp/path-s5-empty")).toBe(false);
    expect(isCreatorProjectRoot(homedir())).toBe(false);
    const visible = { projectBindings: [{ projectRoot: join(homedir(), "PATH Builds", "site") }] };
    const hidden = { projectBindings: [{ projectRoot: join(tmpdir(), "scratch") }] };
    expect(isCreatorProject(visible)).toBe(true);
    expect(isCreatorProject(hidden)).toBe(false);
    expect(criteriaSummary([
      { status: "PROVEN", required: true },
      { status: "UNKNOWN", required: true },
    ])).toEqual({ met: 1, failed: 0, pending: 1, total: 2 });
  });

  it("keeps every project when another is created and restores each after a new reader", () => {
    const dir = mkdtempSync(join(tmpdir(), "path-library-restart-"));
    const runtimeRoot = join(dir, "rt");
    const first = createBuildRecordSkeleton({ outcome: "First bakery", buildId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" });
    first.loop.status = "complete";
    first.projectBindings = [{ projectRoot: join(dir, "a"), bindingId: "a", originKind: "build-created" }];
    const second = createBuildRecordSkeleton({ outcome: "Second clinic", buildId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" });
    second.loop.status = "paused";
    second.projectBindings = [{ projectRoot: join(dir, "b"), bindingId: "b", originKind: "build-created" }];
    writeBuildRecord(runtimeRoot, first);
    writeBuildRecord(runtimeRoot, second);
    const third = createBuildRecordSkeleton({ outcome: "Third notes" });
    writeBuildRecord(runtimeRoot, third);
    const ids = listBuildRecords(runtimeRoot).map((row) => row.buildId).sort();
    expect(ids).toEqual([first.buildId, second.buildId, third.buildId].sort());
    expect(readBuildRecord(runtimeRoot, first.buildId)?.intent.outcome).toBe("First bakery");
    expect(readBuildRecord(runtimeRoot, second.buildId)?.loop.status).toBe("paused");
    rmSync(dir, { recursive: true, force: true });
  });

  it("shows understanding only as a live phase and hides the placeholder card", () => {
    const hidden = creatorConversation([
      { role: "user", text: "Polish the homepage" },
      { role: "assistant", text: "Understanding that request before engineering…" },
    ]);
    expect(hidden.map((row) => row.text)).toEqual(["Polish the homepage"]);
    const understanding = projectBuildForSurface(
      {
        buildId: "b",
        intent: { outcome: "site", outcomeRevision: 2 },
        loop: { status: "running" },
        conversation: [{ role: "user", text: "Polish the homepage", status: "preparing", kind: "change" }],
        children: [{ kind: "brief", taskId: "t", dispatchState: "dispatched" }],
      },
      {},
    );
    expect(understanding.creatorPhase).toBe("understanding");
    expect(understanding.conversation?.some((row) => /Understanding that request/.test(row.text || ""))).toBe(
      false,
    );
    const engineering = projectBuildForSurface(
      {
        buildId: "b",
        intent: { outcome: "site", outcomeRevision: 2 },
        loop: { status: "running" },
        children: [{ kind: "engineer", taskId: "t", dispatchState: "dispatched" }],
      },
      {},
    );
    expect(engineering.creatorPhase).toBe("engineering");
    expect(hasActiveEngineering(engineering) || hasActiveEngineering({
      loop: { status: "running" },
      children: [{ kind: "engineer", dispatchState: "dispatched" }],
    })).toBe(true);
    expect(hasActiveEngineering({ loop: { status: "complete" }, children: [] })).toBe(false);
  });

  it("renders PATH engineering lines, collapses lifecycle copies, and places adoption in time", () => {
    const timeline = projectEngineeringTimeline(
      {
        buildId: "b",
        children: [
          { kind: "engineer", taskId: "task-a", provider: "cursor", dispatchState: "consumed" },
          { kind: "engineer", taskId: "task-b", provider: "cursor", dispatchState: "consumed" },
        ],
      },
      {
        projectRoot: "/proj",
        traces: [
          {
            taskId: "task-a",
            lines: [
              { t: "2026-09-22T10:00:00.000Z", type: "session.capability.preparing" },
              { t: "2026-09-22T10:00:00.100Z", type: "session.capability.preparing" },
              { t: "2026-09-22T10:00:00.200Z", type: "session.capability.preparing" },
              {
                t: "2026-09-22T10:00:01.000Z",
                type: "session.engineering.tool",
                tool: "edit",
                path: "/proj/package.json",
                engine: "cursor",
              },
              {
                t: "2026-09-22T10:00:01.100Z",
                type: "session.engineering.tool",
                tool: "edit",
                path: "/proj/styles.css",
                engine: "cursor",
              },
              {
                t: "2026-09-22T10:00:01.200Z",
                type: "session.engineering.tool",
                tool: "edit",
                path: "/proj/package.json",
                engine: "cursor",
                meta: { ok: true },
              },
              {
                t: "2026-09-22T10:00:04.000Z",
                type: "session.engineering.tool",
                tool: "run_command",
                command: "npm test",
                engine: "cursor",
                meta: { ok: true },
              },
              {
                t: "2026-09-22T10:00:09.000Z",
                type: "session.engineering.tool",
                tool: "run_command",
                command: "npm test",
                engine: "cursor",
                meta: { ok: true },
              },
            ],
          },
          {
            taskId: "task-b",
            lines: [
              {
                t: "2026-09-22T11:00:00.000Z",
                type: "session.engineering.tool",
                tool: "read_file",
                path: "/proj/index.html",
                engine: "cursor",
              },
            ],
          },
        ],
        events: [
          {
            id: 4,
            type: "adoption.completed",
            at: "2026-09-22T10:30:00.000Z",
            data: { adoptedSha: "abc123def456" },
          },
          {
            id: 9,
            type: "engine.decision",
            at: "2026-09-22T10:00:00.500Z",
            data: { fallback: true, selected: "copilot", preferred: "cursor", taskId: "task-a", reason: "cursor unavailable" },
          },
        ],
      },
    );
    const summaries = timeline.entries.map((entry) => entry.summary);
    expect(summaries.some((line) => line.startsWith("CURSOR"))).toBe(false);
    expect(summaries).toContain("INSPECT project ×3");
    expect(summaries.filter((line) => line.startsWith("EDIT package.json"))).toHaveLength(1);
    expect(summaries.filter((line) => line.startsWith("EDIT styles.css"))).toHaveLength(1);
    expect(summaries.filter((line) => line.includes("TEST passed"))).toHaveLength(2);
    expect(summaries).toContain("PATH switched engineering route and continued.");
    const adoptAt = summaries.findIndex((line) => line.includes("ADOPT abc123def456"));
    const laterRead = summaries.findIndex((line) => line.includes("READ index.html"));
    expect(adoptAt).toBeGreaterThan(-1);
    expect(laterRead).toBeGreaterThan(adoptAt);
    expect(timeline.entries.find((entry) => entry.kind === "file_edit")?.engine).toBe("cursor");
  });

  it("exports the authoritative tree and refuses a tracked secret", () => {
    const dir = mkdtempSync(join(tmpdir(), "path-export-"));
    const project = join(dir, "site");
    mkdirSync(project);
    git(project, ["init"]);
    writeFileSync(join(project, "index.html"), "<h1>ICE</h1>\n");
    writeFileSync(join(project, "styles.css"), "body{}\n");
    mkdirSync(join(project, "node_modules"));
    writeFileSync(join(project, "node_modules", "left.txt"), "nope\n");
    git(project, ["add", "index.html", "styles.css"]);
    git(project, ["add", "-f", "node_modules/left.txt"]);
    git(project, ["commit", "-m", "site"]);
    const sha = git(project, ["rev-parse", "HEAD"]).stdout.trim();
    const exported = exportAuthoritativeProject({
      projectRoot: project,
      sha,
      title: "ICE — In Case of Emergency",
    });
    expect(exported.ok).toBe(true);
    expect(exported.files).toEqual(["index.html", "styles.css"]);
    expect(exported.filename).toBe(`ice-in-case-of-emergency-${sha.slice(0, 8)}.zip`);
    writeFileSync(join(project, ".env"), "TOKEN=secret\n");
    git(project, ["add", ".env"]);
    git(project, ["commit", "-m", "secret"]);
    const secretSha = git(project, ["rev-parse", "HEAD"]).stdout.trim();
    const refused = exportAuthoritativeProject({ projectRoot: project, sha: secretSha, title: "ICE" });
    expect(refused.ok).toBe(false);
    expect(refused.code).toBe("SECRET_EXPORT_REFUSED");
    rmSync(dir, { recursive: true, force: true });
  });

  it("syncs only an adopted revision to a local bare remote and leaves the product on failure", () => {
    const dir = mkdtempSync(join(tmpdir(), "path-repo-"));
    const project = join(dir, "site");
    const bare = join(dir, "remote.git");
    mkdirSync(project);
    mkdirSync(bare);
    git(project, ["init"]);
    git(bare, ["init", "--bare"]);
    writeFileSync(join(project, "index.html"), "<h1>Bakery</h1>\n");
    git(project, ["add", "index.html"]);
    git(project, ["commit", "-m", "origin"]);
    const origin = git(project, ["rev-parse", "HEAD"]).stdout.trim();
    writeFileSync(join(project, "index.html"), "<h1>Rose</h1>\n");
    git(project, ["add", "index.html"]);
    git(project, ["commit", "-m", "adopted"]);
    const adopted = git(project, ["rev-parse", "HEAD"]).stdout.trim();
    const record = {
      authoritativeSha: adopted,
      productBranch: "path-build/demo",
      repository: { syncAdopted: false },
    };
    expect(inspectRepository(project, record).state).toBe("local");
    expect(syncAdoptedRevisionIfEnabled(record, project).skipped).toBe(true);
    expect(connectLocalRemote(record, project, bare).ok).toBe(true);
    expect(inspectRepository(project, record).validated).toBe(true);
    const blocked = pushAdoptedRevision(record, project, origin);
    expect(blocked.ok).toBe(false);
    expect(blocked.code).toBe("UNADOPTED_SHA");
    setAdoptedSync(record, project, true);
    const synced = syncAdoptedRevisionIfEnabled(record, project);
    expect(synced.ok).toBe(true);
    const remoteTip = git(bare, ["rev-parse", "path-build/demo"]).stdout.trim();
    expect(remoteTip).toBe(adopted);
    expect(git(project, ["rev-parse", "HEAD"]).stdout.trim()).toBe(adopted);
    const missing = join(dir, "missing.git");
    git(project, ["remote", "set-url", "origin", missing]);
    const failed = pushAdoptedRevision(record, project, adopted);
    expect(failed.ok).toBe(false);
    expect(git(project, ["rev-parse", "HEAD"]).stdout.trim()).toBe(adopted);
    expect(existsSync(join(project, "index.html"))).toBe(true);
    git(project, ["remote", "set-url", "origin", bare]);
    expect(disconnectRepository(record, project, false).code).toBe("CONFIRM_REQUIRED");
    expect(disconnectRepository(record, project, true).ok).toBe(true);
    expect(git(project, ["remote"]).stdout).not.toContain("origin");
    expect(existsSync(bare)).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  it("treats a user stop as paused and keeps a real failure", () => {
    const stopped = projectEngineeringTimeline(
      { buildId: "b", children: [] },
      {
        traces: [
          {
            taskId: "t",
            lines: [
              { type: "session.cancelled" },
              { type: "gateway.task.finished", meta: { status: "cancelled" } },
            ],
          },
        ],
        events: [{ type: "build.paused", at: "2026-09-23T10:00:00.000Z", data: {} }],
      },
    );
    expect(stopped.entries.some((entry) => entry.summary === "STOPPED by user")).toBe(true);
    expect(stopped.entries.some((entry) => entry.summary.startsWith("FAILURE"))).toBe(false);
    const failed = projectEngineeringTimeline(
      { buildId: "b", children: [] },
      {
        traces: [
          {
            taskId: "t",
            lines: [{ type: "gateway.task.finished", meta: { status: "failed" } }],
          },
        ],
        events: [],
      },
    );
    expect(failed.entries.some((entry) => entry.kind === "task_failed")).toBe(true);
    expect(failed.entries.some((entry) => entry.summary.startsWith("FAILURE"))).toBe(true);

    const userPause = projectBuildForSurface(
      {
        buildId: "b",
        loop: { status: "paused" },
        intent: { outcome: "site", outcomeRevision: 1 },
        conversation: [{ role: "user", text: "start again", status: "queued" }],
        children: [{ kind: "engineer", classification: "CANCELLED", dispatchState: "consumed" }],
      },
      {},
    );
    expect(userPause.progressLabel).toBe("Paused");
    expect(userPause.headline).toBe("Paused");
    expect(userPause.queuedRequest).toBe("start again");
    expect(userPause.canResume).toBe(true);

    const failedThenPaused = projectBuildForSurface(
      {
        buildId: "b",
        loop: { status: "paused" },
        intent: { outcome: "site", outcomeRevision: 1 },
        children: [{ kind: "engineer", classification: "FAILED", dispatchState: "consumed" }],
      },
      {},
    );
    expect(failedThenPaused.headline).toBe("Failed — paused");
  });

  it("keeps the last good preview until the next revision is ready", () => {
    const preparing = previewTransition({
      heldSrc: "/embed/?rev=aaa",
      nextReady: false,
      nextSrc: "",
      preparing: true,
    });
    expect(preparing).toEqual({
      action: "hold",
      src: "/embed/?rev=aaa",
      notice: "New revision preparing…",
    });
    const ready = previewTransition({
      heldSrc: "/embed/?rev=aaa",
      nextReady: true,
      nextSrc: "/embed/?rev=bbb",
    });
    expect(ready.action).toBe("swap");
    expect(ready.src).toBe("/embed/?rev=bbb");
    expect(ready.notice).toBe("");
    const failed = previewTransition({
      heldSrc: "/embed/?rev=aaa",
      nextReady: false,
      nextFailed: true,
    });
    expect(failed.notice).toBe("Preview update failed");
    expect(failed.src).toBe("/embed/?rev=aaa");
    const first = previewTransition({ nextReady: false, preparing: true });
    expect(first.action).toBe("empty");
  });
});
