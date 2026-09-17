/**
 * S2.3 — installed-product discoverability + attach/help contracts.
 */
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const CHECKOUT = join(dirname(fileURLToPath(import.meta.url)), "../..");

async function load(rel: string) {
  return import(
    `${pathToFileURL(join(CHECKOUT, "scripts/pathcode-cli", rel)).href}?s23=${randomUUID()}`
  );
}

describe("S2.3 command discoverability", () => {
  it("help lists the accepted S2 product command surface", async () => {
    const { renderHelpText, renderWelcomeScreen } = await load("banner.mjs");
    const help = renderHelpText({ unicode: true, plain: false });
    for (const needle of [
      "/history",
      "/report",
      "/inspect",
      "/merge",
      "/discard",
      "/pr",
      "/prefs",
      "/model",
      "/autonomy",
      "/attach",
      "/help",
      "/exit",
      "/stop",
      "pathcode doctor",
    ]) {
      expect(help).toContain(needle);
    }
    expect(help).toMatch(/Normal reopen keeps durable history/i);
    expect(help).not.toMatch(/GC1|Antigravity|AG3|S3 Cursor SDK/i);

    const welcome = renderWelcomeScreen({ columns: 100, unicode: true, plain: false });
    expect(welcome).toContain("/history");
    expect(welcome).toContain("/attach");
    expect(welcome).toContain("/help");
  });

  it("idle home surfaces compact command discovery", async () => {
    const { createInlineStudioRenderer } = await load("inline-studio.mjs");
    const chunks: string[] = [];
    const studio = createInlineStudioRenderer({
      stdout: {
        isTTY: true,
        columns: 100,
        rows: 40,
        write: (s: string) => {
          chunks.push(String(s));
        },
      },
      enabled: true,
      alternateScreen: false,
      projectName: "Klarapp",
    });
    studio.begin();
    studio.onEvent({ type: "session.started", sessionId: "s23-test" });
    studio.onEvent({
      type: "session.preflight",
      sessionId: "s23-test",
      branch: "main",
      dirtySummary: "clean",
      projectName: "Klarapp",
    });
    const painted = chunks.join("");
    expect(painted).toMatch(/\/help/);
    expect(painted).toMatch(/\/history/);
    expect(painted).toMatch(/\/prefs/);
    expect(painted).toMatch(/\/attach/);
    studio.finish();
  });
});

describe("S2.3 doctor install identity", () => {
  it("reports package install location", async () => {
    const { runPathcodeDoctor } = await load("ag5/doctor.mjs");
    const result = runPathcodeDoctor({
      cwd: join(CHECKOUT, "docs/reports/g10-evidence/fixtures/repair-js"),
      packageRoot: CHECKOUT,
    });
    const install = result.rows.find((r: { name: string }) => r.name === "Install");
    expect(install).toBeTruthy();
    expect(install.ok).toBe(true);
    expect(String(install.detail)).toContain(CHECKOUT);
    expect(result.packageRoot).toBe(CHECKOUT);
  });
});

describe("S2.3 gateway listTasks client", () => {
  it("exposes listTasks beside attachTask", async () => {
    const { createGatewayClient } = await load("gateway/client.mjs");
    const client = createGatewayClient({
      socketPath: "/tmp/pathcode-s23-missing.sock",
      runtimeRoot: "/tmp/pathcode-s23-rt",
    });
    expect(typeof client.listTasks).toBe("function");
    expect(typeof client.attachTask).toBe("function");
  });
});
