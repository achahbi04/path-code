/**
 * G9 — orchestrate engineering environment preparation before Antigravity startTask.
 * resolve → provision → lsp → optional scip → copilot home → affected → services
 */

import { discoverCapabilityPlane } from "../ag8/discover.mjs";
import { ensureAg9RuntimeDirs } from "./layout.mjs";
import {
  resolveCapabilityRequirements,
  classifyRequirement,
} from "./resolve.mjs";
import { provisionRequirements } from "./provision.mjs";
import { buildEngineeringToolEnv } from "./envelope.mjs";
import { toSeamDescriptors } from "./seam.mjs";
import { provisionLanguageServers } from "./lsp.mjs";
import { prepareCopilotLspHome, probeCopilotLspReady } from "./copilot-lsp.mjs";
import { shouldBuildScipIndex, ensureScipIndex } from "./scip.mjs";
import { createScipMcpServerConfig } from "./scip-mcp.mjs";
import { discoverAffectedChecks } from "./affected.mjs";
import { detectProjectServices, startDisposableServices } from "./services.mjs";
import { join } from "node:path";

/**
 * @param {unknown} emit
 * @param {object} event
 */
function safeEmit(emit, event) {
  if (typeof emit !== "function") return;
  try {
    emit(event);
  } catch {
    /* ignore emitter failures */
  }
}

/**
 * Prepare PATH-owned polyglot engineering environment for one task.
 *
 * @param {{
 *   projectRoot: string,
 *   worktreePath?: string,
 *   runtimeRoot: string,
 *   plane?: object,
 *   taskText?: string,
 *   emit?: (event: object) => void,
 *   signal?: AbortSignal,
 *   startServices?: boolean,
 * }} input
 * @returns {Promise<{
 *   capabilityBrief: string,
 *   toolEnv: Record<string, string>,
 *   mcpServersExtra: object[],
 *   languageServers: object[],
 *   scip: object,
 *   affected: object,
 *   services: object,
 *   seam: object[],
 *   pathPrepend: string[],
 *   provision: object,
 * }>}
 */
export async function prepareEngineeringEnvironment({
  projectRoot,
  worktreePath,
  runtimeRoot,
  plane,
  taskText,
  emit,
  signal,
  startServices = false,
}) {
  const root =
    typeof worktreePath === "string" && worktreePath.trim()
      ? worktreePath.trim()
      : projectRoot;
  const dirs = ensureAg9RuntimeDirs(runtimeRoot);

  safeEmit(emit, {
    type: "session.capability.preparing",
    projectRoot: root,
    runtimeRoot,
  });

  const capabilityPlane =
    plane && typeof plane === "object"
      ? plane
      : discoverCapabilityPlane(root);

  // 1. Resolve + classify
  const requirements = resolveCapabilityRequirements(root, capabilityPlane);
  const classified = requirements.map((req) => ({
    ...req,
    ...classifyRequirement(req, { runtimeRoot, projectRoot: root }),
  }));

  if (signal?.aborted) {
    return abortedResult(dirs);
  }

  // 2. Provision missing toolchains
  safeEmit(emit, { type: "session.capability.provisioning", phase: "toolchains" });
  const provision = await provisionRequirements(classified, {
    runtimeRoot,
    projectRoot: root,
    emit,
    signal,
  });

  /** @type {string[]} */
  const pathPrepend = [
    ...(provision.toolEnvPathPrepend || []),
    dirs.languageServers,
    join(dirs.languageServers, "npm"),
    join(dirs.indexers, "npm"),
    join(dirs.miseHome, "bin"),
  ].filter(Boolean);

  // 3. Language servers
  const languages = (capabilityPlane.languages || []).map((l) =>
    typeof l === "string" ? l : l.id,
  );
  safeEmit(emit, { type: "session.capability.provisioning", phase: "lsp" });
  const languageServers = await provisionLanguageServers({
    languages,
    runtimeRoot,
    emit,
  });

  for (const ls of languageServers) {
    if (ls.executable) {
      pathPrepend.push(dirnameOf(ls.executable));
    }
  }

  if (signal?.aborted) {
    return abortedResult(dirs, { provision, languageServers, pathPrepend });
  }

  // 4. Optional SCIP
  /** @type {object} */
  let scip = { ok: false, skipped: true, reason: "not_needed" };
  /** @type {object[]} */
  const mcpServersExtra = [];

  const wantScip = shouldBuildScipIndex({ projectRoot: root, taskText });
  if (wantScip) {
    safeEmit(emit, { type: "session.capability.indexing", phase: "scip" });
    const primaryLang =
      languages.find((l) =>
        ["typescript", "javascript", "python", "go", "rust"].includes(l),
      ) || languages[0] || "typescript";
    scip = await ensureScipIndex({
      projectRoot: root,
      runtimeRoot,
      language: primaryLang,
      emit,
    });
    if (scip.ok && scip.indexDir) {
      mcpServersExtra.push(
        createScipMcpServerConfig({
          runtimeRoot,
          indexDir: scip.indexDir,
          nodeExecutable: process.execPath,
        }),
      );
    }
  }

  // 5. Copilot PATH home (when any LSP ready)
  const readyLsps = languageServers.filter((l) => l.status === "ready" && l.executable);
  /** @type {object} */
  let copilot = { prepared: false };
  if (readyLsps.length > 0) {
    const prepared = prepareCopilotLspHome({
      runtimeRoot,
      languageServers: readyLsps,
    });
    const probe = probeCopilotLspReady({
      copilotHome: prepared.copilotHome,
      cwd: root,
    });
    copilot = { ...prepared, probe };
  }

  // 6. Affected checks
  const affected = discoverAffectedChecks(root);
  safeEmit(emit, {
    type: "session.capability.affected",
    classification: affected.classification,
    source: affected.source,
  });

  // 7. Services (opt-in start; always detect)
  const detectedServices = detectProjectServices(root);
  /** @type {object} */
  let services = {
    detected: detectedServices,
    runtime: { status: "SKIPPED", reason: "startServices_false" },
  };
  if (startServices && detectedServices.composeFile) {
    services = {
      detected: detectedServices,
      runtime: startDisposableServices({
        projectRoot: root,
        runtimeRoot,
        emit,
      }),
    };
  } else if (!detectedServices.composeFile) {
    services = {
      detected: detectedServices,
      runtime: {
        status: "UNAVAILABLE",
        reason: detectedServices.evidence.length
          ? "no_compose_file"
          : "no_service_evidence",
      },
    };
  }

  const toolEnv = buildEngineeringToolEnv({
    baseEnv: process.env,
    pathPrepend: [...new Set(pathPrepend)],
    runtimeRoot,
  });
  if (copilot.env?.COPILOT_HOME) {
    toolEnv.COPILOT_HOME = copilot.env.COPILOT_HOME;
  }

  const seam = [
    ...toSeamDescriptors(provision),
    ...languageServers.map((ls) => ({
      kind: "LOCAL_TOOL",
      id: `lsp:${ls.id}`,
      status: ls.status,
      lifecycle: ls.status === "ready" ? "expose" : "acquire",
    })),
    ...mcpServersExtra.map((s) => ({
      kind: "MCP_TOOL",
      id: s.name,
      status: "ready",
      lifecycle: "expose",
    })),
  ];

  const capabilityBrief = buildBrief({
    capabilityPlane,
    provision,
    languageServers,
    scip,
    affected,
    services,
    copilot,
  });

  safeEmit(emit, {
    type: "session.capability.ready",
    lspReady: readyLsps.map((l) => l.id),
    scip: Boolean(scip.ok),
    affected: affected.classification,
  });

  return {
    capabilityBrief,
    toolEnv,
    mcpServersExtra,
    languageServers,
    scip,
    affected,
    services,
    seam,
    pathPrepend: [...new Set(pathPrepend)],
    provision,
    copilot,
    dirs,
  };
}

/**
 * @param {string} executable
 */
function dirnameOf(executable) {
  const i = Math.max(executable.lastIndexOf("/"), executable.lastIndexOf("\\"));
  return i >= 0 ? executable.slice(0, i) : executable;
}

/**
 * @param {object} dirs
 * @param {object} [partial]
 */
function abortedResult(dirs, partial = {}) {
  return {
    capabilityBrief: "G9 preparation aborted.",
    toolEnv: {},
    mcpServersExtra: [],
    languageServers: partial.languageServers || [],
    scip: { ok: false, reason: "aborted" },
    affected: {
      classification: "UNAVAILABLE",
      commands: [],
      source: "aborted",
      evidence: [],
    },
    services: { status: "UNAVAILABLE", reason: "aborted" },
    seam: [],
    pathPrepend: partial.pathPrepend || [],
    provision: partial.provision || { ready: [], failed: [], briefLines: [] },
    dirs,
  };
}

/**
 * @param {object} input
 */
function buildBrief(input) {
  const lines = ["## PATH G9 engineering environment"];

  const langs = (input.capabilityPlane?.languages || [])
    .map((l) => (typeof l === "string" ? l : l.id))
    .filter(Boolean);
  if (langs.length) lines.push(`Languages: ${langs.join(", ")}`);

  if (input.provision?.briefLines?.length) {
    lines.push("Toolchains:");
    for (const l of input.provision.briefLines.slice(0, 24)) lines.push(`- ${l}`);
  }

  lines.push("Language servers:");
  for (const ls of input.languageServers || []) {
    lines.push(
      `- ${ls.id}: ${ls.status}${ls.executable ? ` (${ls.executable})` : ""}`,
    );
  }

  if (input.scip?.ok) {
    lines.push(
      `Code intelligence (SCIP): ready fingerprint=${input.scip.fingerprint || "?"}`,
    );
  } else if (input.scip?.skipped) {
    lines.push("Code intelligence (SCIP): skipped (not indicated)");
  } else {
    lines.push(
      `Code intelligence (SCIP): unavailable (${input.scip?.reason || "unknown"})`,
    );
  }

  if (input.copilot?.prepared !== false && input.copilot?.copilotHome) {
    lines.push(
      `Copilot LSP home: ${input.copilot.copilotHome} (servers: ${(input.copilot.servers || []).join(", ") || "none"})`,
    );
  }

  const aff = input.affected;
  if (aff) {
    lines.push(
      `Affected checks: ${aff.classification} via ${aff.source || "none"}`,
    );
    for (const c of aff.commands || []) lines.push(`- ${c}`);
  }

  const svc = input.services?.runtime || input.services;
  if (svc?.status) {
    lines.push(`Services: ${svc.status}${svc.reason ? ` (${svc.reason})` : ""}`);
  }

  lines.push(
    "PATH acquires/configures mature tools; Antigravity and Copilot collaborate as full engineering engines in this session.",
  );
  return lines.join("\n");
}
