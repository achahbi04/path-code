/**
 * S5 — Open Folder / Open in PATH Code handoff regressions.
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { launchPathCodeInTerminal } from "../../scripts/pathcode-cli/build/surface/handoff.mjs";

describe("S5 Build handoff", () => {
  it("launchPathCodeInTerminal refuses missing project root", async () => {
    const r = await launchPathCodeInTerminal({
      projectRoot: join(tmpdir(), "does-not-exist-" + Date.now()),
      nodePath: process.execPath,
      launcherPath: join(tmpdir(), "missing-launcher.mjs"),
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("PATH_REQUIRED");
  });

  it("launchPathCodeInTerminal returns launched metadata for existing root", async () => {
    const dir = mkdtempSync(join(tmpdir(), "path-handoff-"));
    const launcher = join(dir, "fake-pathcode.mjs");
    writeFileSync(
      launcher,
      "console.log('fake pathcode', process.cwd());\n",
      "utf8",
    );
    const project = join(dir, "project");
    mkdirSync(project);

    const r = await launchPathCodeInTerminal({
      projectRoot: project,
      nodePath: process.execPath,
      launcherPath: launcher,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.projectRoot).toBe(project);
    expect(r.method).toBeTruthy();
    // On macOS this should be Terminal.app
    if (process.platform === "darwin") {
      expect(r.method).toBe("terminal.app");
    }

    rmSync(dir, { recursive: true, force: true });
  });
});
