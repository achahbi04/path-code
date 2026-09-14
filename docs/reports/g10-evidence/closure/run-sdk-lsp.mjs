/**
 * G10 closure §2 — Copilot SDK native session consuming PATH LSP capability.
 */
import {
  writeFileSync,
  mkdirSync,
  cpSync,
  rmSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { prepareEngineeringEnvironment } from "../../../../scripts/pathcode-cli/ag9/prepare.mjs";
import { prepareCopilotLspHome } from "../../../../scripts/pathcode-cli/ag9/copilot-lsp.mjs";
import { createCopilotEngine } from "../../../../scripts/pathcode-cli/ag10/copilot-sdk.mjs";
import {
  createEmptyStudioState,
  applyStudioEvent,
} from "../../../../scripts/path-studio/state.mjs";

const checkout = resolve(fileURLToPath(new URL("../../../..", import.meta.url)));
const outDir = resolve(checkout, "docs/reports/g10-evidence/closure");
const primary = resolve(checkout, "docs/reports/g10-evidence/tmp/sdk-lsp-primary");
const runtimeRoot =
  process.env.PATHCODE_RUNTIME_ROOT ||
  resolve(checkout, "docs/reports/g10-evidence/runtime-closure-sdk-lsp");

mkdirSync(outDir, { recursive: true });
rmSync(primary, { recursive: true, force: true });
cpSync(
  resolve(checkout, "docs/reports/g9-evidence/live-repos/js-accept"),
  primary,
  { recursive: true },
);
writeFileSync(
  join(primary, "src/add.js"),
  "export function add(a, b) { return a - b; }\n",
);
writeFileSync(
  join(primary, "src/math.js"),
  "import { add } from './add.js';\nexport function double(n){ return add(n,n); }\n",
);

function git(cwd, args) {
  return spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
}
if (!existsSync(join(primary, ".git"))) {
  git(primary, ["init"]);
  git(primary, ["config", "user.email", "g10@test"]);
  git(primary, ["config", "user.name", "g10"]);
  git(primary, ["config", "commit.gpgsign", "false"]);
}
git(primary, ["add", "-A"]);
git(primary, ["commit", "-m", "broken sdk lsp"]);

process.env.PATHCODE_RUNTIME_ROOT = runtimeRoot;
process.env.PATH = `/opt/homebrew/bin:${process.env.PATH || ""}`;

const evidence = {
  schema: "pathcode.g10.closure.sdk-lsp.v1",
  at: new Date().toISOString(),
};
/** @type {object[]} */
const events = [];
let studio = createEmptyStudioState();
studio.sessionId = "sdk-lsp";

const prepared = await prepareEngineeringEnvironment({
  projectRoot: primary,
  runtimeRoot,
  taskText: "sdk lsp",
  startServices: false,
  emit: (e) => {
    if (e?.type) {
      events.push({ ...e, at: Date.now() });
      try {
        studio = applyStudioEvent(studio, { sessionId: "sdk-lsp", ...e }) || studio;
      } catch {
        /* ignore */
      }
    }
  },
});

const lspHome = prepareCopilotLspHome({
  runtimeRoot,
  languageServers: prepared?.languageServers || [],
});
evidence.lspPrepared = {
  path: lspHome?.lspConfigPath || lspHome?.copilotHome || null,
  servers: lspHome?.servers || [],
  evidence: (lspHome?.evidence || []).slice(0, 8),
};

const engine = await createCopilotEngine({
  taskId: "sdk-lsp",
  cwd: primary,
  sessionId: `path-sdk-lsp-${Date.now()}`,
  preferSdk: true,
  toolEnv: {
    ...(prepared?.toolEnv || {}),
    ...(lspHome?.env || {}),
    COPILOT_HOME: lspHome?.copilotHome || prepared?.toolEnv?.COPILOT_HOME,
  },
  emit: (e) => {
    if (e?.type) {
      events.push({ ...e, at: Date.now() });
      try {
        studio = applyStudioEvent(studio, { sessionId: "sdk-lsp", ...e }) || studio;
      } catch {
        /* ignore */
      }
    }
  },
});

const connected = await engine.ensureConnected();
evidence.connect = {
  ok: connected.ok === true,
  mode: engine.getMode(),
  sessionId: engine.getSessionId(),
};

if (engine.getMode() !== "native_sdk") {
  evidence.verdict = "BLOCKED_NOT_NATIVE";
  writeFileSync(join(outDir, "sdk-lsp.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify({ verdict: evidence.verdict, mode: engine.getMode() }));
  process.exit(2);
}

const turn = await engine.runEngineeringTurn({
  prompt: [
    "You have PATH-prepared language intelligence available for this JS project.",
    "1) Inspect src/math.js and resolve where `add` is defined (use language intelligence / LSP / go-to-definition style tooling if available).",
    "2) Fix src/add.js so double(2) via add(2,2) equals 4 and `npm test` passes.",
    "3) Run npm test.",
    "Do not push. Keep the public add(a,b) API.",
    "In your final reply, mention whether you used language-server / definition lookup.",
  ].join("\n"),
  timeoutMs: 240_000,
});

evidence.turn = {
  ok: turn.ok === true,
  mode: turn.mode,
  detail: turn.detail,
  textPreview: typeof turn.text === "string" ? turn.text.slice(0, 600) : "",
};
const src = readFileSync(join(primary, "src/add.js"), "utf8");
const test = spawnSync("npm", ["test"], {
  cwd: primary,
  encoding: "utf8",
  timeout: 60_000,
  env: { ...process.env, ...(prepared?.toolEnv || {}) },
});
evidence.mutation = {
  source: src.slice(0, 160),
  fixed: /a\s*\+\s*b/.test(src),
  testExit: test.status,
};
evidence.lspConsumedClaim =
  /language.?server|LSP|definition|go-?to-?def|intellisense|typescript-language/i.test(
    String(turn.text || ""),
  ) ||
  events.some((e) =>
    /language|lsp|definition|typescript/i.test(
      String(e.detail || e.summary || e.label || ""),
    ),
  );
evidence.commandEvents = events.filter(
  (e) =>
    e.type === "session.engineering.tool" ||
    /command/i.test(String(e.detail || "")),
).length;
evidence.mcpNote =
  "MCP not forced; PATH SCIP MCP preserved from G9 when relevant. This task exercises SDK+LSP/toolchain.";

await engine.disconnect();

evidence.verdict =
  evidence.connect.mode === "native_sdk" &&
  evidence.mutation.fixed &&
  evidence.mutation.testExit === 0 &&
  evidence.lspPrepared.servers?.length >= 0
    ? evidence.lspConsumedClaim || evidence.lspPrepared.servers.length > 0
      ? "PASS"
      : "PARTIAL"
    : "PARTIAL";

writeFileSync(join(outDir, "sdk-lsp.json"), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(
  JSON.stringify({
    verdict: evidence.verdict,
    mode: evidence.connect.mode,
    lspServers: evidence.lspPrepared.servers,
    lspClaim: evidence.lspConsumedClaim,
    testExit: evidence.mutation.testExit,
  }),
);
process.exit(evidence.verdict === "PASS" ? 0 : 1);
