/**
 * S5 — mechanical criteria / requirement probes from authoritative FS + checks.
 * Complements fabric evaluate; does not replace it for judgment-heavy claims.
 */

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  captureBindingReality,
  makeEvidenceRef,
} from "./evidence.mjs";

/**
 * @param {string} cwd
 * @param {string[]} argv
 * @param {number} [timeoutMs]
 */
function run(cwd, argv, timeoutMs = 120_000) {
  const r = spawnSync(argv[0], argv.slice(1), {
    cwd,
    encoding: "utf8",
    timeout: timeoutMs,
    env: { ...process.env, CI: "1", npm_config_yes: "true" },
  });
  return {
    ok: r.status === 0,
    status: r.status ?? 1,
    stdout: String(r.stdout || "").slice(-4_000),
    stderr: String(r.stderr || "").slice(-4_000),
  };
}

function findReadmeFile(root) {
  for (const name of ["README.md", "readme.md", "Readme.md"]) {
    const p = join(root, name);
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * @param {string} projectRoot
 * @param {string} gitRef branch or commit
 * @param {string} [fileName]
 */
function readFileViaGit(projectRoot, gitRef, fileName = "README.md") {
  if (!gitRef || !existsSync(join(projectRoot, ".git"))) return null;
  const spec = `${gitRef}:${fileName}`;
  const r = spawnSync("git", ["show", spec], {
    cwd: projectRoot,
    encoding: "utf8",
    timeout: 15_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  if (r.status !== 0) return null;
  const body = String(r.stdout || "").trim();
  return body.length ? body : null;
}

/**
 * Ordered unique probe roots: active worktree, ephemeral worktree, binding primary.
 * @param {import('./types.mjs').ProjectBinding} binding
 * @param {{ worktreePath?: string }} [input]
 */
export function resolveProductProbeRoots(binding, input = {}) {
  /** @type {string[]} */
  const roots = [];
  const push = (p) => {
    if (typeof p !== "string" || !p.trim()) return;
    const abs = resolve(p.trim());
    if (!roots.includes(abs)) roots.push(abs);
  };
  push(binding.activeWorktreePath);
  push(input.worktreePath);
  push(binding.projectRoot);
  return roots;
}

/**
 * Pick the first root that looks like a runnable Node tree for npm test.
 * @param {string[]} roots
 */
function resolveCheckRoot(roots) {
  for (const root of roots) {
    if (existsSync(join(root, "package.json"))) return root;
  }
  return roots[roots.length - 1] || roots[0];
}

/**
 * @param {string} body
 * @param {string} stmt
 */
function readmeContentSatisfies(body, stmt) {
  const trimmed = String(body || "").trim();
  if (trimmed.length < 8) return false;
  const mentionsRunOrTest =
    /npm\s+test|run\s+test|how\s+to\s+run|testing/i.test(trimmed) ||
    /test/i.test(stmt);
  return mentionsRunOrTest || trimmed.length >= 24;
}

/**
 * @param {string[]} roots
 * @param {string} projectRoot
 * @param {{ taskBranch?: string, taskSha?: string }} gitHints
 */
function locateReadmeEvidence(roots, projectRoot, gitHints = {}) {
  for (const root of roots) {
    const readmePath = findReadmeFile(root);
    if (readmePath) {
      try {
        const body = readFileSync(readmePath, "utf8");
        return { readmePath, body, source: "fs", root };
      } catch {
        /* try next */
      }
    }
  }
  const refs = [gitHints.taskSha, gitHints.taskBranch].filter(Boolean);
  for (const ref of refs) {
    const body = readFileViaGit(projectRoot, String(ref), "README.md");
    if (body) {
      return {
        readmePath: join(projectRoot, "README.md"),
        body,
        source: "git",
        root: projectRoot,
        gitRef: ref,
      };
    }
  }
  return null;
}

/**
 * Probe binding for runnable Node project evidence.
 * @param {{
 *   record: import('./types.mjs').BuildRecord,
 *   bindingId: string,
 *   taskId?: string,
 *   changedFiles?: string[],
 *   worktreePath?: string,
 *   taskBranch?: string,
 *   taskSha?: string,
 * }} input
 */
export function mechanicalProbeBinding(input) {
  const binding = (input.record.projectBindings || []).find(
    (b) => b.bindingId === input.bindingId,
  );
  if (!binding) {
    return { ok: false, code: "BINDING_MISSING", updates: [] };
  }
  const probeRoots = resolveProductProbeRoots(binding, {
    worktreePath: input.worktreePath,
  });
  const checkRoot = resolveCheckRoot(probeRoots);
  const reality = captureBindingReality(binding.projectRoot);
  /** @type {Array<{ id: string, layer: 'criterion'|'requirement', status: string, note: string }>} */
  const updates = [];

  const pkgPath = join(checkRoot, "package.json");
  const hasPkg = existsSync(pkgPath);
  let hasTestScript = false;
  if (hasPkg) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
      hasTestScript = Boolean(pkg?.scripts?.test);
    } catch {
      hasTestScript = false;
    }
  }

  let testOk = false;
  let testNote = "npm test not run";
  if (hasPkg && hasTestScript) {
    const npm = run(checkRoot, ["npm", "test"], 180_000);
    testOk = npm.ok;
    testNote = npm.ok
      ? "npm test exit 0"
      : `npm test failed: ${(npm.stderr || npm.stdout).slice(0, 200)}`;
  }

  const srcExists = probeRoots.some(
    (root) =>
      existsSync(join(root, "src")) ||
      existsSync(join(root, "lib")) ||
      existsSync(join(root, "index.js")) ||
      existsSync(join(root, "index.mjs")) ||
      existsSync(join(root, "index.html")) ||
      existsSync(join(root, "app")) ||
      existsSync(join(root, "public", "index.html")),
  );

  const webSurfaceExists = probeRoots.some(
    (root) =>
      existsSync(join(root, "index.html")) ||
      existsSync(join(root, "public", "index.html")),
  );

  for (const c of input.record.outcomeCriteria || []) {
    if (!c.required && c.status === "PROVEN") continue;
    const id = c.id;
    const stmt = String(c.statement || "").toLowerCase();
    /** @type {string|null} */
    let next = null;
    let note = "";

    if (/runnable|test|check|npm test|project-native/i.test(stmt + id)) {
      if (testOk) {
        next = "PROVEN";
        note = testNote;
      } else if (hasPkg && !hasTestScript) {
        next = "UNMET";
        note = "package.json present but no test script";
      } else if (!hasPkg) {
        next = "UNKNOWN";
        note = "no package.json yet";
      } else {
        next = "UNMET";
        note = testNote;
      }
    } else if (/outcome|architecture|software|api|service|cli|surface/i.test(stmt + id)) {
      if (hasPkg && srcExists) {
        next = testOk ? "PROVEN" : "UNKNOWN";
        note = testOk
          ? "package + src + npm test ok"
          : "package/src present; checks not green yet";
      } else if (webSurfaceExists && testOk) {
        next = "PROVEN";
        note = "web surface + project-native checks ok";
      } else if (webSurfaceExists) {
        next = "UNKNOWN";
        note = "web surface present; await checks/evidence";
      } else if (hasPkg || srcExists) {
        next = "UNKNOWN";
        note = "partial tree; await more engineering";
      } else {
        next = "UNKNOWN";
        note = "software surface not established";
      }
    } else if (/landing|hero|cta|call-to-action|render|preview|website|page/i.test(stmt)) {
      if (webSurfaceExists && testOk) {
        next = "PROVEN";
        note = "web surface present and checks green";
      } else if (webSurfaceExists) {
        next = "UNKNOWN";
        note = "web surface present; checks pending";
      } else {
        next = "UNKNOWN";
        note = "web surface not established";
      }
    }

    if (next && next !== c.status) {
      const ev = [
        makeEvidenceRef(
          {
            kind: testOk ? "check" : "fs",
            ref: testOk ? "npm test" : hasPkg ? "package.json" : checkRoot,
            bindingId: binding.bindingId,
            taskId: input.taskId,
            scope: hasPkg ? ["package.json", "src/"] : ["."],
          },
          reality,
        ),
      ];
      c.status = /** @type {any} */ (next);
      c.evidence = ev;
      c.updatedAt = new Date().toISOString();
      updates.push({ id, layer: "criterion", status: next, note });
    }
  }

  for (const r of input.record.intent.explicitRequirements || []) {
    const stmt = String(r.statement || "").toLowerCase();
    if (/readme/i.test(stmt + String(r.id || "").toLowerCase())) {
      const changed = (input.changedFiles || []).map((f) =>
        String(f).replace(/\\/g, "/"),
      );
      const readmeTouched = changed.some((f) => /readme\.md$/i.test(f));
      const located = locateReadmeEvidence(probeRoots, binding.projectRoot, {
        taskBranch: input.taskBranch || binding.activeTaskBranch,
        taskSha: input.taskSha,
      });
      if (located && readmeContentSatisfies(located.body, stmt)) {
        if (r.status !== "SATISFIED") {
          r.status = "SATISFIED";
          const refName =
            located.source === "git"
              ? `README.md@${located.gitRef}`
              : located.readmePath.split(/[/\\]/).pop() || "README.md";
          r.evidence = [
            makeEvidenceRef(
              {
                kind: located.source === "git" ? "git" : "fs",
                ref: refName,
                bindingId: binding.bindingId,
                taskId: input.taskId,
                scope: ["README.md"],
              },
              reality,
            ),
          ];
          updates.push({
            id: r.id,
            layer: "requirement",
            status: "SATISFIED",
            note:
              located.source === "git"
                ? "README.md on engineer task branch (git show)"
                : "README.md present with run/test guidance",
          });
        }
      } else if (readmeTouched && located?.body && readmeContentSatisfies(located.body, stmt)) {
        if (r.status !== "SATISFIED") {
          r.status = "SATISFIED";
          updates.push({
            id: r.id,
            layer: "requirement",
            status: "SATISFIED",
            note: "README.md touched in latest engineering turn",
          });
        }
      } else if (readmeTouched && !located) {
        const gitBody = readFileViaGit(
          binding.projectRoot,
          input.taskSha || input.taskBranch || binding.activeTaskBranch || "",
          "README.md",
        );
        if (gitBody && readmeContentSatisfies(gitBody, stmt) && r.status !== "SATISFIED") {
          r.status = "SATISFIED";
          r.evidence = [
            makeEvidenceRef(
              {
                kind: "git",
                ref: "README.md",
                bindingId: binding.bindingId,
                taskId: input.taskId,
                scope: ["README.md"],
              },
              reality,
            ),
          ];
          updates.push({
            id: r.id,
            layer: "requirement",
            status: "SATISFIED",
            note: "README.md on task branch from changedFiles + git",
          });
        }
      }
    }
    if (/local|offline|no cloud|without.*saas/i.test(stmt)) {
      if (testOk && hasPkg) {
        if (r.status !== "SATISFIED") {
          r.status = "SATISFIED";
          r.evidence = [
            makeEvidenceRef(
              {
                kind: "check",
                ref: "npm test (local)",
                bindingId: binding.bindingId,
                taskId: input.taskId,
                scope: ["package.json"],
              },
              reality,
            ),
          ];
          updates.push({
            id: r.id,
            layer: "requirement",
            status: "SATISFIED",
            note: "local npm test succeeded",
          });
        }
      } else if (!hasPkg) {
        if (r.status === "SATISFIED") r.status = "UNKNOWN";
      }
    }
  }

  return {
    ok: true,
    bindingId: binding.bindingId,
    probeRoots,
    checkRoot,
    hasPkg,
    hasTestScript,
    testOk,
    srcExists,
    updates,
    reality,
  };
}
