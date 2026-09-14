/**
 * G9 live failure/recovery cases against disposable PATH_RUNTIME_ROOT.
 *
 * Usage: node run-live-failure.mjs <outDir>
 */
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
  chmodSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  prepareEngineeringEnvironment,
  ensureScipIndex,
  queryScipIndex,
  ensureAg9RuntimeDirs,
  classifyRequirement,
  provisionRequirements,
} from "../../../scripts/pathcode-cli/ag9/index.mjs";

const checkout = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const outDir = resolve(
  process.argv[2] || join(checkout, "docs/reports/g9-evidence/live"),
);
mkdirSync(outDir, { recursive: true });

const rustFixture = resolve(
  checkout,
  "docs/reports/g9-evidence/live-repos/rust-cold",
);
const scipFixture = resolve(
  checkout,
  "docs/reports/g9-evidence/live-repos/scip-mono",
);
const goFixture = resolve(
  checkout,
  "docs/reports/g9-evidence/live-repos/go-accept",
);
const runtimeRoot = resolve(
  checkout,
  "docs/reports/g9-evidence/runtime-live-failure",
);
rmSync(runtimeRoot, { recursive: true, force: true });
mkdirSync(runtimeRoot, { recursive: true });

/** @type {Record<string, unknown>} */
const results = { runtimeRoot, cases: {} };

// A. Corrupt PATH-owned runtime binary → BROKEN → acquire path
{
  const rr = join(runtimeRoot, "corrupt");
  const dirs = ensureAg9RuntimeDirs(rr);
  const binDir = join(dirs.languageServers, "bin");
  mkdirSync(binDir, { recursive: true });
  const broken = join(binDir, "gopls");
  writeFileSync(broken, "");
  chmodSync(broken, 0o644);
  const classified = classifyRequirement(
    {
      id: "lsp:go",
      kind: "lsp",
      miseTool: "gopls",
      bins: ["gopls"],
      evidence: ["live corrupt"],
    },
    { runtimeRoot: rr, projectRoot: goFixture },
  );
  const ac = new AbortController();
  // Full prepare should replace/heal when possible (gopls via mise).
  const prep = await prepareEngineeringEnvironment({
    projectRoot: goFixture,
    runtimeRoot: rr,
    taskText: "go engineering with gopls",
    startServices: false,
  });
  const goLsp = (prep.languageServers || []).find((l) => l.id === "go");
  results.cases.corruptRuntime = {
    classifiedStatus: classified.status,
    classifiedExecutable: classified.executable,
    detectedBroken: classified.status === "BROKEN",
    afterPrepareLsp: goLsp || null,
    repaired:
      goLsp?.status === "ready" &&
      typeof goLsp.executable === "string" &&
      goLsp.executable.length > 0 &&
      goLsp.executable !== broken,
    provisionBrief: prep.provision?.briefLines || [],
  };
}

// B. LSP launch/health — empty rust-analyzer then prepare
{
  const rr = join(runtimeRoot, "lsp-fault");
  const dirs = ensureAg9RuntimeDirs(rr);
  const bad = join(dirs.languageServers, "bin", "rust-analyzer");
  mkdirSync(join(dirs.languageServers, "bin"), { recursive: true });
  writeFileSync(bad, "not-a-binary");
  chmodSync(bad, 0o755);
  const prep = await prepareEngineeringEnvironment({
    projectRoot: rustFixture,
    runtimeRoot: rr,
    taskText: "rust lsp repair",
    startServices: false,
  });
  const rustLsp = (prep.languageServers || []).find((l) => l.id === "rust");
  results.cases.lspFailure = {
    languageServers: prep.languageServers,
    ready: rustLsp?.status === "ready",
    executable: rustLsp?.executable || null,
    healedAwayFromCorrupt: rustLsp?.executable && rustLsp.executable !== bad,
    truthfulTerminal:
      rustLsp != null &&
      (rustLsp.status === "ready" ||
        rustLsp.status === "unavailable" ||
        rustLsp.status === "failed"),
  };
}

// C. Stale SCIP cache → rebuild → query
{
  const rr = join(runtimeRoot, "scip-stale");
  ensureAg9RuntimeDirs(rr);
  const t0 = Date.now();
  const first = await ensureScipIndex({
    projectRoot: scipFixture,
    runtimeRoot: rr,
    language: "typescript",
  });
  const indexMs = Date.now() - t0;
  if (first?.indexDir && existsSync(join(first.indexDir, "fingerprint.json"))) {
    const meta = JSON.parse(
      readFileSync(join(first.indexDir, "fingerprint.json"), "utf8"),
    );
    meta.fingerprint = "stale-fingerprint-deadbeef";
    writeFileSync(
      join(first.indexDir, "fingerprint.json"),
      `${JSON.stringify(meta, null, 2)}\n`,
    );
  }
  const t1 = Date.now();
  const second = await ensureScipIndex({
    projectRoot: scipFixture,
    runtimeRoot: rr,
    language: "typescript",
  });
  const rebuildMs = Date.now() - t1;
  const t2 = Date.now();
  const q = second?.indexDir
    ? queryScipIndex({
        indexDir: second.indexDir,
        op: "code_search_symbol",
        symbol: "tokenPrefix",
      })
    : { ok: false, results: [] };
  const queryMs = Date.now() - t2;
  results.cases.scipStale = {
    firstOk: Boolean(first?.ok),
    firstCached: Boolean(first?.cached),
    secondOk: Boolean(second?.ok),
    secondCached: Boolean(second?.cached),
    rebuilt: Boolean(second?.ok && !second?.cached),
    queryOk: Boolean(q?.ok),
    queryHits: Array.isArray(q?.results) ? q.results.length : 0,
    indexMs,
    rebuildMs,
    queryMs,
  };
}

// D. Cancellation during prepare
{
  const rr = join(runtimeRoot, "cancel-prep");
  ensureAg9RuntimeDirs(rr);
  const ac = new AbortController();
  ac.abort();
  const prep = await prepareEngineeringEnvironment({
    projectRoot: rustFixture,
    runtimeRoot: rr,
    taskText: "should abort",
    startServices: false,
    signal: ac.signal,
  });
  results.cases.provisionCancel = {
    brief: prep?.capabilityBrief || null,
    scipReason: prep?.scip?.reason || null,
    aborted:
      prep?.capabilityBrief === "G9 preparation aborted." ||
      prep?.scip?.reason === "aborted",
    sane: prep != null && typeof prep === "object",
  };
}

writeFileSync(
  join(outDir, "failure-recovery.summary.json"),
  `${JSON.stringify(results, null, 2)}\n`,
);
console.log(JSON.stringify(results, null, 2));
const ok =
  results.cases.corruptRuntime?.detectedBroken &&
  results.cases.lspFailure?.truthfulTerminal &&
  results.cases.scipStale?.rebuilt &&
  results.cases.provisionCancel?.aborted;
process.exitCode = ok ? 0 : 1;
