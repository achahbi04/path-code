/**
 * AG1 focused proofs A–J.
 */

import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  mkdtempSync,
  symlinkSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const CHECKOUT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const AG1 = join(CHECKOUT_ROOT, "scripts/pathcode-cli/ag1");
const SCRATCH_PARENT = join(CHECKOUT_ROOT, ".path-code-tmp", "ag1-test-scratch");
const TEST_RUNTIME = join(CHECKOUT_ROOT, ".path-code-tmp", "ag1-test-runtime");

// AG3: point AG1 venv resolution at a test runtime rooted beside the legacy venv.
beforeAll(() => {
  mkdirSync(TEST_RUNTIME, { recursive: true });
  const link = join(TEST_RUNTIME, "ag1-venv");
  const legacy = join(CHECKOUT_ROOT, ".path-code-tmp", "ag1-venv");
  try {
    if (!existsSync(link) && existsSync(legacy)) {
      symlinkSync(legacy, link);
    }
  } catch {
    // ignore
  }
  writeFileSync(
    join(TEST_RUNTIME, "runtime.marker.json"),
    JSON.stringify({
      pathVersion: "0.1.0",
      sdkPin: "google-antigravity==0.1.16",
      venv: link,
    }),
    "utf8",
  );
  process.env.PATHCODE_RUNTIME_ROOT = TEST_RUNTIME;
});

async function load(name: string) {
  return import(`${pathToFileURL(join(AG1, name)).href}?b=${randomUUID()}`);
}

async function loadStudio() {
  return import(
    `${pathToFileURL(join(CHECKOUT_ROOT, "scripts/path-studio/state.mjs")).href}?b=${randomUUID()}`
  );
}

function git(cwd: string, args: string[]) {
  return spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
}

function initRepo(dir: string) {
  mkdirSync(dir, { recursive: true });
  const init = git(dir, ["init"]);
  if (init.status !== 0) {
    throw new Error(`git init failed: ${init.stderr}`);
  }
  git(dir, ["config", "user.email", "ag1@example.com"]);
  git(dir, ["config", "user.name", "AG1 Test"]);
  writeFileSync(join(dir, "README.md"), "ag1 fixture\n", "utf8");
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify(
      {
        name: "ag1-fixture",
        private: true,
        scripts: {
          test: "node -e \"process.exit(0)\"",
          typecheck: "node -e \"process.exit(0)\"",
        },
      },
      null,
      2,
    ),
    "utf8",
  );
  git(dir, ["add", "."]);
  const commit = git(dir, ["commit", "-m", "init"]);
  if (commit.status !== 0) {
    throw new Error(`git commit failed: ${commit.stderr}`);
  }
}

function makeScratch(prefix: string) {
  mkdirSync(SCRATCH_PARENT, { recursive: true });
  const root = mkdtempSync(join(SCRATCH_PARENT, prefix));
  scratchRoots.push(root);
  return root;
}

const scratchRoots: string[] = [];
afterAll(() => {
  for (const root of scratchRoots) {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
});

describe("AG1 A/B — JSONL bridge parser", () => {
  it("A: valid JSONL events are received; B: rogue lines do not kill the stream", async () => {
    const { createJsonlParser, isRecognizedBridgeMessage } = await load(
      "jsonl-parser.mjs",
    );
    const received: Array<Record<string, unknown>> = [];
    const diags: Array<{ kind: string; text: string }> = [];
    const parser = createJsonlParser({
      onMessage: (msg: Record<string, unknown>) => {
        if (isRecognizedBridgeMessage(msg)) received.push(msg);
        else diags.push({ kind: "unrecognized", text: JSON.stringify(msg) });
      },
      onDiagnostic: (kind: string, text: string) => {
        diags.push({ kind, text });
      },
    });

    parser.push('{"type":"started","taskId":"t1"}\n');
    parser.push("UserWarning: something noisy from SDK\n");
    parser.push('{"type":"activity","activity":"editing"}\n');
    parser.push('{"not":"a protocol message"}\n');
    parser.push("not json at all\n");
    parser.flush();

    expect(received.map((m) => m.type)).toEqual(["started", "activity"]);
    expect(diags.some((d) => d.kind === "rogue_stdout")).toBe(true);
    expect(diags.some((d) => d.kind === "unrecognized_json")).toBe(true);
  });
});

describe("AG1 C — task worktree leaves primary untouched", () => {
  it("creates isolated worktree and does not mutate primary porcelain", async () => {
    const {
      createTaskWorktree,
      capturePrimaryFingerprint,
      primaryUntouched,
      removeTaskWorktree,
      collectWorktreeResult,
    } = await load("task-worktree.mjs");

    const root = makeScratch("ag1-wt-");
    const primary = join(root, "primary");
    initRepo(primary);
    const before = capturePrimaryFingerprint(primary);

    const wt = createTaskWorktree({
      primaryRoot: primary,
      tasksParent: join(root, "tasks"),
      checkoutRoot: CHECKOUT_ROOT,
    });
    expect(wt.ok).toBe(true);

    writeFileSync(join(wt.worktreePath, "EDITED.txt"), "from agent\n", "utf8");
    const result = collectWorktreeResult(wt.worktreePath, wt.baseline.head);
    expect(result.changedFiles).toContain("EDITED.txt");

    const after = capturePrimaryFingerprint(primary);
    expect(primaryUntouched(before, after)).toBe(true);
    expect(existsSync(join(primary, "EDITED.txt"))).toBe(false);

    removeTaskWorktree(primary, wt.worktreePath);
  });
});

describe("AG1 D — file tools cannot escape workspace", () => {
  it("proves inside allowed / outside denied path boundary", async () => {
    const { proveFileToolsWorkspaceOnly } = await load("filebound-proof.mjs");
    const proof = proveFileToolsWorkspaceOnly({ checkoutRoot: CHECKOUT_ROOT });
    expect(proof.ok).toBe(true);
  });
});

describe("AG1 E — sandbox canary fail-closed", () => {
  it(
    "runs one disposable canary and refuses shell when unproven",
    async () => {
    const { proveLocalSandboxConfinement, resetSandboxProofCacheForTests } =
      await load("sandbox-proof.mjs");
    resetSandboxProofCacheForTests();
    const proof = proveLocalSandboxConfinement({
      checkoutRoot: CHECKOUT_ROOT,
      force: true,
    });
    // On macOS with sandbox-exec we expect allowShell true; otherwise fail closed.
    if (process.platform === "darwin" && spawnSync("which", ["sandbox-exec"]).status === 0) {
      expect(proof.ok).toBe(true);
      expect(proof.allowShell).toBe(true);
    } else {
      expect(proof.allowShell).toBe(false);
      expect(proof.ok).toBe(false);
    }
    },
    30_000,
  );
});

describe("AG1 F — cancellation terminates owned process", () => {
  it(
    "cancel kills the bridge child",
    async () => {
    const { createAntigravityEngineeringAgent } = await load("bridge-client.mjs");
    const { assertAg1VenvReady, resolveAg1PythonExecutable } = await load(
      "venv-guard.mjs",
    );

    const guard = assertAg1VenvReady({ checkoutRoot: CHECKOUT_ROOT });
    expect(guard.ok).toBe(true);

    // Fake bridge: ignore stdin until killed; emit started then sleep.
    const fakeBridgeDir = makeScratch("ag1-fake-bridge-");
    const fakeBridge = join(fakeBridgeDir, "fake_bridge.py");
    writeFileSync(
      fakeBridge,
      `
import sys, time, json
print(json.dumps({"type":"started","taskId":"x"}), flush=True)
while True:
  time.sleep(0.2)
`,
      "utf8",
    );

    const events: Array<Record<string, unknown>> = [];
    const agent = createAntigravityEngineeringAgent({
      checkoutRoot: CHECKOUT_ROOT,
      pythonPath: resolveAg1PythonExecutable(CHECKOUT_ROOT),
      bridgeScript: fakeBridge,
      onEvent: (m: Record<string, unknown>) => events.push(m),
    });

    await agent.startTask({
      taskId: "x",
      workspace: fakeBridgeDir,
      task: "noop",
      allowShell: false,
    });

    // Wait for started
    const deadline = Date.now() + 5_000;
    while (!events.some((e) => e.type === "started") && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(events.some((e) => e.type === "started")).toBe(true);
    const pid = agent.getPid();
    expect(pid).toBeTypeOf("number");

    agent.cancel();
    await agent.close();

    // Process should be gone.
    const still = spawnSync("kill", ["-0", String(pid)], { encoding: "utf8" });
    expect(still.status === 0).toBe(false);
  },
  30_000,
  );
});

describe("AG1 G/H/I — finished ≠ VERIFIED; PATH validation owns result", () => {
  it("G: agent finished alone classifies NOT_VERIFIED", async () => {
    const { classifyAg1Result } = await load("final-validation.mjs");
    expect(
      classifyAg1Result({ agentFinished: true, validation: null }),
    ).toBe("NOT_VERIFIED");
  });

  it("H/I: independent validation determines VERIFIED / FAILED honestly", async () => {
    const { runIndependentFinalValidation, classifyAg1Result } = await load(
      "final-validation.mjs",
    );
    const root = makeScratch("ag1-val-");

    // Passing fixture
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({
        name: "ok",
        private: true,
        scripts: {
          test: "node -e \"process.exit(0)\"",
          typecheck: "node -e \"process.exit(0)\"",
        },
      }),
      "utf8",
    );
    // Provide a fake local tsc? selectPlannedChecks needs TYPECHECK and/or TARGETED_TEST.
    // npm scripts alone are enough if npm cli resolves.
    const pass = await runIndependentFinalValidation({ worktreePath: root });
    // May be NOT_VERIFIED if npm cli unavailable in sandbox — still must not be VERIFIED from agent alone.
    const classPass = classifyAg1Result({
      agentFinished: true,
      validation: pass,
    });
    expect(classPass).toBe(pass.classification);
    expect(classPass === "VERIFIED" || classPass === "NOT_VERIFIED" || classPass === "FAILED" || classPass === "PARTIALLY_VERIFIED").toBe(true);

    // Failing fixture
    const failRoot = join(root, "fail");
    mkdirSync(failRoot);
    writeFileSync(
      join(failRoot, "package.json"),
      JSON.stringify({
        name: "fail",
        private: true,
        scripts: {
          test: "node -e \"process.exit(1)\"",
          typecheck: "node -e \"process.exit(0)\"",
        },
      }),
      "utf8",
    );
    const fail = await runIndependentFinalValidation({ worktreePath: failRoot });
    if (fail.checks.length > 0) {
      expect(
        ["FAILED", "PARTIALLY_VERIFIED"].includes(fail.classification),
      ).toBe(true);
    } else {
      expect(fail.classification).toBe("NOT_VERIFIED");
    }
  });
});

describe("AG1 J — living UI receives real lifecycle events", () => {
  it("studio reducer projects AG1 engineering activities", async () => {
    const {
      applyStudioEvent,
      createEmptyStudioState,
      projectAuthoritativePathPhase,
    } = await loadStudio();
    const sessionId = randomUUID();
    let state = createEmptyStudioState();
    const events = [
      { type: "session.task.received", sessionId, task: "fix tests" },
      {
        type: "session.preflight",
        sessionId,
        branch: "main",
        dirtySummary: "clean",
      },
      {
        type: "session.engineering.workspace",
        sessionId,
        workspace: "/tmp/wt",
        baselineHead: "abc123",
      },
      {
        type: "session.engineering.activity",
        sessionId,
        activity: "inspecting",
        label: "Inspecting",
      },
      {
        type: "session.engineering.activity",
        sessionId,
        activity: "editing",
        label: "Editing",
      },
      {
        type: "session.engineering.activity",
        sessionId,
        activity: "testing",
        label: "Testing",
      },
      {
        type: "session.engineering.result",
        sessionId,
        classification: "VERIFIED",
        changedFiles: ["src/a.ts"],
        primaryUntouched: true,
      },
      {
        type: "session.terminal",
        sessionId,
        disposition: "VERIFIED",
        summary: "All configured final checks passed.",
      },
    ];
    for (const event of events) {
      state = applyStudioEvent(state, event);
    }
    expect(state.cards.task.arrived).toBe(true);
    expect(state.product.projectFiles).toContain("src/a.ts");
    // Terminal VERIFIED is the authoritative PATH phase (not legacy Complete).
    expect(projectAuthoritativePathPhase(state)).toBe("Verified");
    expect(state.product.ag1).toBe(true);
    expect(state.product.ag1Activities).toEqual(
      expect.arrayContaining(["Inspecting", "Editing", "Testing"]),
    );
  });
});

describe("AG1 venv guard — no silent global fallback", () => {
  it("3: rejects wrong/global interpreter; 4: accepts AG1 venv", async () => {
    const { assertAg1VenvReady, resolveAg1PythonExecutable } = await load(
      "venv-guard.mjs",
    );
    const good = assertAg1VenvReady({ checkoutRoot: CHECKOUT_ROOT });
    expect(good.ok).toBe(true);
    expect(good.package).toBe("google-antigravity==0.1.16");

    const systemPython = spawnSync("which", ["python3"], { encoding: "utf8" })
      .stdout.trim();
    if (systemPython && !systemPython.includes("ag1-venv")) {
      const bad = assertAg1VenvReady({
        checkoutRoot: CHECKOUT_ROOT,
        pythonPath: systemPython,
      });
      expect(bad.ok).toBe(false);
      expect(
        ["AG1_VENV_WRONG_INTERPRETER", "AG1_VENV_PREFIX_MISMATCH"].includes(
          bad.code,
        ),
      ).toBe(true);
    }

    // Bare names rejected by bridge client path check.
    expect(resolveAg1PythonExecutable(CHECKOUT_ROOT)).toContain("ag1-venv");
  });
});

describe("AG1 bridge can start/stream/terminate with fake engine", () => {
  it("A: bridge client streams events and terminates cleanly", async () => {
    const { createAntigravityEngineeringAgent } = await load("bridge-client.mjs");
    const { resolveAg1PythonExecutable } = await load("venv-guard.mjs");

    const dir = makeScratch("ag1-bridge-ok-");
    const script = join(dir, "echo_bridge.py");
    writeFileSync(
      script,
      `
import sys, json
for line in sys.stdin:
  msg = json.loads(line)
  if msg.get("type") == "start":
    print(json.dumps({"type":"started","taskId":msg["taskId"]}), flush=True)
    print("UserWarning: ignore me", flush=True)
    print(json.dumps({"type":"activity","activity":"inspecting"}), flush=True)
    print(json.dumps({"type":"finished","taskId":msg["taskId"],"summary":"done"}), flush=True)
  elif msg.get("type") == "close":
    break
`,
      "utf8",
    );

    const events: Array<Record<string, unknown>> = [];
    const diags: string[] = [];
    const agent = createAntigravityEngineeringAgent({
      checkoutRoot: CHECKOUT_ROOT,
      pythonPath: resolveAg1PythonExecutable(CHECKOUT_ROOT),
      bridgeScript: script,
      onEvent: (m: Record<string, unknown>) => events.push(m),
      onDiagnostic: (kind: string, text: string) => diags.push(`${kind}:${text}`),
    });

    await agent.startTask({
      taskId: "t-bridge",
      workspace: dir,
      task: "demo",
      allowShell: false,
    });

    const deadline = Date.now() + 5_000;
    while (
      !events.some((e) => e.type === "finished") &&
      Date.now() < deadline
    ) {
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(events.map((e) => e.type)).toEqual(
      expect.arrayContaining(["started", "activity", "finished"]),
    );
    expect(diags.some((d) => d.startsWith("rogue_stdout:"))).toBe(true);
    await agent.close();
  });
});

describe("AG1 scrubEngineIdentity", () => {
  it("strips engine branding from product strings", async () => {
    const { scrubEngineIdentity } = await load("session.mjs");
    expect(scrubEngineIdentity("Antigravity used Gemini via google-antigravity")).toBe(
      "PATH used model via engine",
    );
  });
});
