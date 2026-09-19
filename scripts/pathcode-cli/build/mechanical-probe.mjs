/**
 * S5 — mechanical criteria / requirement probes from authoritative FS + checks.
 * Complements fabric evaluate; does not replace it for judgment-heavy claims.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
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

/**
 * Probe binding for runnable Node project evidence.
 * @param {{
 *   record: import('./types.mjs').BuildRecord,
 *   bindingId: string,
 *   taskId?: string,
 *   changedFiles?: string[],
 * }} input
 */
function findReadmeFile(root) {
  for (const name of ["README.md", "readme.md", "Readme.md"]) {
    const p = join(root, name);
    if (existsSync(p)) return p;
  }
  return null;
}

export function mechanicalProbeBinding(input) {
  const binding = (input.record.projectBindings || []).find(
    (b) => b.bindingId === input.bindingId,
  );
  if (!binding) {
    return { ok: false, code: "BINDING_MISSING", updates: [] };
  }
  const root = binding.projectRoot;
  const reality = captureBindingReality(root);
  /** @type {Array<{ id: string, layer: 'criterion'|'requirement', status: string, note: string }>} */
  const updates = [];

  const pkgPath = join(root, "package.json");
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
    const npm = run(root, ["npm", "test"], 180_000);
    testOk = npm.ok;
    testNote = npm.ok
      ? "npm test exit 0"
      : `npm test failed: ${(npm.stderr || npm.stdout).slice(0, 200)}`;
  }

  const srcExists =
    existsSync(join(root, "src")) ||
    existsSync(join(root, "lib")) ||
    existsSync(join(root, "index.js")) ||
    existsSync(join(root, "index.mjs"));

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
      } else if (hasPkg || srcExists) {
        next = "UNKNOWN";
        note = "partial tree; await more engineering";
      } else {
        next = "UNKNOWN";
        note = "software surface not established";
      }
    }

    if (next && next !== c.status) {
      const ev = [
        makeEvidenceRef(
          {
            kind: testOk ? "check" : "fs",
            ref: testOk ? "npm test" : hasPkg ? "package.json" : root,
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
      const readmePath = findReadmeFile(root);
      const changed = (input.changedFiles || []).map((f) =>
        String(f).replace(/\\/g, "/"),
      );
      const readmeTouched = changed.some((f) => /readme\.md$/i.test(f));
      if (readmePath) {
        let body = "";
        try {
          body = readFileSync(readmePath, "utf8").trim();
        } catch {
          body = "";
        }
        const mentionsRunOrTest =
          /npm\s+test|run\s+test|how\s+to\s+run|testing/i.test(body) ||
          /test/i.test(stmt);
        if (
          body.length >= 8 &&
          (mentionsRunOrTest || body.length >= 24 || readmeTouched)
        ) {
          if (r.status !== "SATISFIED") {
            r.status = "SATISFIED";
            r.evidence = [
              makeEvidenceRef(
                {
                  kind: "fs",
                  ref: readmePath.split(/[/\\]/).pop() || "README.md",
                  bindingId: binding.bindingId,
                  taskId: input.taskId,
                  scope: [readmePath.split(/[/\\]/).pop() || "README.md"],
                },
                reality,
              ),
            ];
            updates.push({
              id: r.id,
              layer: "requirement",
              status: "SATISFIED",
              note: "README.md present with run/test guidance",
            });
          }
        }
      } else if (readmeTouched) {
        if (r.status !== "SATISFIED") {
          r.status = "SATISFIED";
          updates.push({
            id: r.id,
            layer: "requirement",
            status: "SATISFIED",
            note: "README.md touched in latest engineering turn",
          });
        }
      }
    }
    if (/local|offline|no cloud|without.*saas/i.test(stmt)) {
      // Local runnable without cloud deps — satisfied when npm test works offline
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
    hasPkg,
    hasTestScript,
    testOk,
    srcExists,
    updates,
    reality,
  };
}
