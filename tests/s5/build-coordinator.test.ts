import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  createBuildCoordinatorClient,
  appendBuildEvent,
  appendPendingConversation,
  readBuildEvents,
  readBuildRecord,
  readPendingConversations,
  startBuildCoordinatorServer,
  writeBuildRecord,
} from "../../scripts/pathcode-cli/build/index.mjs";
import { resolvePathPackageRoot } from "../../scripts/pathcode-cli/paths.mjs";

describe("PATH Build durable coordinator", () => {
  let runtimeRoot = "";
  let server: Awaited<ReturnType<typeof startBuildCoordinatorServer>> | null =
    null;
  let client: ReturnType<typeof createBuildCoordinatorClient> | null = null;

  afterEach(async () => {
    client?.close();
    client = null;
    if (server) {
      await server.stop();
      server = null;
    }
    if (runtimeRoot) {
      rmSync(runtimeRoot, { recursive: true, force: true });
      runtimeRoot = "";
    }
  });

  async function startCoordinator() {
    server = await startBuildCoordinatorServer({
      runtimeRoot,
      packageRoot: resolvePathPackageRoot(),
      fakeMode: true,
    });
    client = createBuildCoordinatorClient({
      runtimeRoot,
      socketPath: server.socketPath,
    });
    await client.connect();
    return client;
  }

  it("persists monotonic sanitized events and replays after a cursor", () => {
    runtimeRoot = mkdtempSync(join(tmpdir(), "path-build-events-"));
    const first = appendBuildEvent(runtimeRoot, "b1", "intent.revised", {
      intentRevision: 2,
      apiToken: "do-not-leak",
    });
    const second = appendBuildEvent(runtimeRoot, "b1", "runtime.updated", {
      runtimeHealth: "ok",
    });
    expect(second.id).toBe(first.id + 1);
    const replay = readBuildEvents(runtimeRoot, "b1", { afterId: first.id });
    expect(replay).toHaveLength(1);
    expect(replay[0]!.type).toBe("runtime.updated");
    expect(JSON.stringify(readBuildEvents(runtimeRoot, "b1"))).not.toContain(
      "do-not-leak",
    );
  });

  it("does not flood build.updated for no-op record writes", () => {
    runtimeRoot = mkdtempSync(join(tmpdir(), "path-build-events-noop-"));
    const record = {
      schema: "pathcode.s5.build-record.v1",
      buildId: "b-noop",
      intent: { outcome: "noop", outcomeRevision: 1, explicitRequirements: [] },
      loop: { status: "running" },
      children: [],
      conversation: [],
    };
    writeBuildRecord(runtimeRoot, record as never);
    const before = readBuildEvents(runtimeRoot, "b-noop").filter(
      (event) => event.type === "build.updated",
    ).length;
    writeBuildRecord(runtimeRoot, {
      ...readBuildRecord(runtimeRoot, "b-noop")!,
      loop: { status: "running" },
    } as never);
    const after = readBuildEvents(runtimeRoot, "b-noop").filter(
      (event) => event.type === "build.updated",
    ).length;
    expect(after).toBe(before);
  });

  it("owns commands over Unix socket and single-flights autonomous loops", async () => {
    runtimeRoot = mkdtempSync(join(tmpdir(), "path-build-coordinator-"));
    const coordinator = await startCoordinator();
    const targetDir = join(runtimeRoot, "product");
    const started = await coordinator.startBuild("Build a tiny local CLI", {
      targetDir,
      autoRun: false,
      initialCriteria: [
        { id: "c-runnable", statement: "CLI runs", required: true },
        { id: "c-outcome", statement: "Outcome exists", required: true },
      ],
    });
    expect(started.ok).toBe(true);

    const record = readBuildRecord(runtimeRoot, started.build.buildId)!;
    expect(record.coordinator).toBeDefined();
    record.coordinator!.autoRun = true;
    writeBuildRecord(runtimeRoot, record);

    const [a, b] = await Promise.all([
      coordinator.ensureLoop(record.buildId),
      coordinator.ensureLoop(record.buildId),
    ]);
    expect(a.running || b.running).toBe(true);
    expect(a.deduped || b.deduped).toBe(true);

    const deadline = Date.now() + 20_000;
    let final = readBuildRecord(runtimeRoot, record.buildId);
    while (final?.loop.status !== "complete" && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      final = readBuildRecord(runtimeRoot, record.buildId);
    }
    expect(final?.loop.status).toBe("complete");
  }, 40_000);

  it("reconciles nonterminal records when the host restarts", async () => {
    runtimeRoot = mkdtempSync(join(tmpdir(), "path-build-restart-"));
    let coordinator = await startCoordinator();
    const started = await coordinator.startBuild("Build a restartable demo", {
      targetDir: join(runtimeRoot, "restart-product"),
      autoRun: false,
      initialCriteria: [
        { id: "c-runnable", statement: "Demo runs", required: true },
        { id: "c-outcome", statement: "Outcome exists", required: true },
      ],
    });
    const record = readBuildRecord(runtimeRoot, started.build.buildId)!;
    record.loop.pendingReinspect = true;
    expect(record.coordinator).toBeDefined();
    record.coordinator!.autoRun = true;
    writeBuildRecord(runtimeRoot, record);

    client?.close();
    client = null;
    await server!.stop();
    server = null;

    coordinator = await startCoordinator();
    expect(
      server!.service.recovered.some(
        (entry: any) => entry.buildId === record.buildId && entry.ok,
      ),
    ).toBe(true);

    const deadline = Date.now() + 20_000;
    let final = readBuildRecord(runtimeRoot, record.buildId);
    while (final?.loop.status !== "complete" && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      final = readBuildRecord(runtimeRoot, record.buildId);
    }
    expect(final?.loop.pendingReinspect).toBe(false);
    expect(final?.loop.status).toBe("complete");
  }, 40_000);

  it("serializes stop between autonomous loop steps without rescheduling", async () => {
    runtimeRoot = mkdtempSync(join(tmpdir(), "path-build-stop-race-"));
    const coordinator = await startCoordinator();
    const started = await coordinator.startBuild("Build a pausable demo", {
      targetDir: join(runtimeRoot, "pause-product"),
      autoRun: false,
      initialCriteria: [
        { id: "c-runnable", statement: "Demo runs", required: true },
        { id: "c-outcome", statement: "Outcome exists", required: true },
      ],
    });
    const buildId = started.build.buildId;
    const record = readBuildRecord(runtimeRoot, buildId)!;
    record.coordinator!.autoRun = true;
    writeBuildRecord(runtimeRoot, record);

    await coordinator.ensureLoop(buildId);
    const stopped = await coordinator.stopBuild(buildId);
    expect(stopped.ok).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 400));

    const durable = readBuildRecord(runtimeRoot, buildId)!;
    expect(durable.loop.status).toBe("paused");
    expect(durable.coordinator?.autoRun).toBe(false);
    expect(
      durable.children.some(
        (child: any) =>
          child.dispatchState === "selected" ||
          child.dispatchState === "dispatched",
      ),
    ).toBe(false);
  });

  it(
    "stops, resumes, and explicitly recovers durable Build state",
    async () => {
      runtimeRoot = mkdtempSync(join(tmpdir(), "path-build-controls-"));
      const coordinator = await startCoordinator();
      const started = await coordinator.startBuild(
        "Build a controlled local CLI",
        {
          targetDir: join(runtimeRoot, "controlled-product"),
          autoRun: false,
          initialCriteria: [
            { id: "c-runnable", statement: "CLI runs", required: true },
            { id: "c-outcome", statement: "Outcome exists", required: true },
          ],
        },
      );
      const buildId = started.build.buildId;

      const stopped = await coordinator.stopBuild(buildId);
      expect(stopped.ok).toBe(true);
      expect(stopped.build.loop.status).toBe("paused");
      expect(stopped.build.coordinator?.autoRun).toBe(false);

      const recovered = await coordinator.recoverBuild(buildId);
      expect(recovered.ok).toBe(true);
      expect(recovered.build.loop.status).toBe("running");
      expect(recovered.build.coordinator?.autoRun).toBe(true);

      const deadline = Date.now() + 20_000;
      let final = readBuildRecord(runtimeRoot, buildId);
      while (final?.loop.status !== "complete" && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        final = readBuildRecord(runtimeRoot, buildId);
      }
      expect(final?.loop.status).toBe("complete");

      const queued = appendPendingConversation(runtimeRoot, buildId, {
        id: "msg-queued-1",
        role: "user",
        text: "Show a usage section before more engineering",
        at: new Date().toISOString(),
        status: "queued",
        kind: "change",
      });
      expect(readPendingConversations(runtimeRoot, buildId)).toHaveLength(1);
      expect(queued.status).toBe("queued");

      await coordinator.messageBuild(buildId, {
        message: "The CLI must include friendly output",
      });
      const revised = readBuildRecord(runtimeRoot, buildId)!;
      expect(readPendingConversations(runtimeRoot, buildId)).toHaveLength(0);
      expect(
        revised.conversation?.some(
          (msg: { text?: string }) =>
            String(msg.text || "").includes("usage section"),
        ),
      ).toBe(true);
      expect(["running", "complete"]).toContain(revised.loop.status);
      expect(revised.intent.outcomeRevision).toBe(2);
      expect(revised.productBrief?.intentRevision).toBe(2);
      expect(
        revised.children.some(
          (child: any) =>
            child.kind === "engineer" && child.intentRevision === 2,
        ) || revised.loop.status === "running",
      ).toBe(true);
    },
    60_000,
  );
});
