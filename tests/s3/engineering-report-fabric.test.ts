/**
 * S3.1 — engineering report carries engine fabric provenance.
 */
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const CHECKOUT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const REPORT = join(CHECKOUT, "scripts/pathcode-cli/engineering-report.mjs");

async function load() {
  return import(`${pathToFileURL(REPORT).href}?s3r=${randomUUID()}`);
}

describe("S3.1 engineering report engine fabric", () => {
  it("includes preferred / last / used engines in plain report", async () => {
    const { buildEngineeringReportModel, formatEngineeringReportPlain } =
      await load();
    const model = buildEngineeringReportModel(
      {
        taskObjective: "Append a fabric mark",
        preferredEngine: "cursor",
        engine: "cursor",
        cursorMode: "native_sdk",
        enginesUsed: ["cursor", "copilot"],
        projectFiles: ["S31_FABRIC.md"],
        resultClassification: "VERIFIED",
      },
      {
        classification: "VERIFIED",
        preferredEngine: "cursor",
        engine: "cursor",
        cursorMode: "native_sdk",
        enginesUsed: ["cursor", "copilot"],
        changedFiles: ["S31_FABRIC.md"],
      },
    );
    expect(model.preferredEngine).toBe("cursor");
    expect(model.engine).toBe("cursor");
    expect(model.enginesUsed).toEqual(["cursor", "copilot"]);
    const plain = formatEngineeringReportPlain(model);
    expect(plain).toMatch(/Engine fabric/);
    expect(plain).toMatch(/preferred\s+cursor/);
    expect(plain).toMatch(/last turn\s+cursor/);
    expect(plain).toMatch(/used\s+cursor · copilot/);
  });
});
