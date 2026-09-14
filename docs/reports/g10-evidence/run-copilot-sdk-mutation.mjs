/**
 * G10 — Copilot SDK real mutation + command proof (not CLI-only).
 */
import { mkdirSync, writeFileSync, readFileSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const OUT = join(ROOT, "docs/reports/g10-evidence/live");
const TMP = join(ROOT, "docs/reports/g10-evidence/tmp");

function git(cwd, args) {
  return spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  mkdirSync(TMP, { recursive: true });
  const { createCopilotEngine } = await import(
    join(ROOT, "scripts/pathcode-cli/ag10/copilot-sdk.mjs")
  );

  const wt = mkdtempSync(join(TMP, "g10-sdk-mut-"));
  const evidence = { schema: "pathcode.g10.copilot-sdk-mutation.v1", at: new Date().toISOString() };
  try {
    git(wt, ["init"]);
    git(wt, ["config", "user.email", "g10@test"]);
    git(wt, ["config", "user.name", "g10"]);
    git(wt, ["config", "commit.gpgsign", "false"]);
    writeFileSync(join(wt, "greet.js"), "export function greet(){ return 'hi' }\n");
    writeFileSync(
      join(wt, "greet.test.js"),
      "import { greet } from './greet.js';\nimport assert from 'node:assert/strict';\nassert.equal(greet(), 'hello');\nconsole.log('ok');\n",
    );
    writeFileSync(
      join(wt, "package.json"),
      JSON.stringify({ name: "g10-sdk-mut", type: "module", scripts: { test: "node greet.test.js" } }, null, 2),
    );
    git(wt, ["add", "."]);
    git(wt, ["commit", "-m", "init broken"]);

    const engine = await createCopilotEngine({
      taskId: "sdk-mut",
      cwd: wt,
      sessionId: `path-sdk-mut-${Date.now()}`,
      preferSdk: true,
      emit: (e) => {
        if (!evidence.events) evidence.events = [];
        evidence.events.push({ type: e.type, at: Date.now(), detail: e.detail || e.summary });
      },
    });
    const connected = await engine.ensureConnected();
    evidence.connect = { mode: engine.getMode(), ok: connected.ok, sessionId: engine.getSessionId() };

    if (engine.getMode() !== "native_sdk") {
      evidence.verdict = "BLOCKED_NOT_NATIVE";
      evidence.detail = connected.detail || engine.getDegradeReason();
      writeFileSync(join(OUT, "copilot-sdk-mutation.json"), `${JSON.stringify(evidence, null, 2)}\n`);
      console.log(JSON.stringify({ verdict: evidence.verdict, mode: engine.getMode() }));
      process.exit(2);
    }

    const turn = await engine.runEngineeringTurn({
      prompt: [
        "Fix greet.js so the test passes: greet() must return exactly 'hello'.",
        "You may edit files and run `npm test` or `node greet.test.js`.",
        "Do not push. Do not create extra markdown files.",
      ].join("\n"),
      timeoutMs: 180_000,
    });
    evidence.turn = {
      ok: turn.ok,
      mode: turn.mode,
      detail: turn.detail,
      textPreview: typeof turn.text === "string" ? turn.text.slice(0, 300) : "",
    };

    const src = existsSync(join(wt, "greet.js"))
      ? readFileSync(join(wt, "greet.js"), "utf8")
      : "";
    const test = spawnSync("node", ["greet.test.js"], { cwd: wt, encoding: "utf8", timeout: 20_000 });
    evidence.mutation = {
      greetSource: src.slice(0, 200),
      returnsHello: /hello/.test(src),
      testExit: test.status,
      testOut: `${test.stdout || ""}${test.stderr || ""}`.slice(0, 300),
    };
    evidence.verdict =
      evidence.turn.mode === "native_sdk" &&
      evidence.mutation.returnsHello &&
      evidence.mutation.testExit === 0
        ? "PASS"
        : "PARTIAL";

    await engine.disconnect();
    writeFileSync(join(OUT, "copilot-sdk-mutation.json"), `${JSON.stringify(evidence, null, 2)}\n`);
    console.log(JSON.stringify({ verdict: evidence.verdict, testExit: evidence.mutation.testExit }));
  } finally {
    // keep worktree for inspection on failure; clean on pass
    if (evidence.verdict === "PASS") {
      try {
        rmSync(wt, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    } else {
      evidence.preservedWorktree = wt;
      writeFileSync(join(OUT, "copilot-sdk-mutation.json"), `${JSON.stringify(evidence, null, 2)}\n`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
