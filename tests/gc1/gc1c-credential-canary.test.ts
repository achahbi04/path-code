/**
 * GC1-c synthetic credential canary — local surfaces + remote boundary proof.
 */

import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const CHECKOUT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const GC1 = join(CHECKOUT, "scripts/pathcode-cli/gc1");

async function load() {
  const b = randomUUID();
  return {
    ...(await import(`${pathToFileURL(join(GC1, "credential-boundary.mjs")).href}?b=${b}`)),
    ...(await import(`${pathToFileURL(join(GC1, "cloud-effects.mjs")).href}?b=${b}`)),
    ...(await import(`${pathToFileURL(join(GC1, "mock-transport.mjs")).href}?b=${b}`)),
    ...(await import(`${pathToFileURL(join(GC1, "task-snapshot.mjs")).href}?b=${b}`)),
    ...(await import(`${pathToFileURL(join(GC1, "remote-worker.mjs")).href}?b=${b}`)),
  };
}

const CANARY = "gc1c-synthetic-canary-value-never-travel";

describe("GC1-c credential canary", () => {
  it("local surfaces refuse canary in hydration/worker/journal/env", async () => {
    const {
      assertLocalSurfacesFreeOfCanary,
      FORBIDDEN_REMOTE_CREDENTIAL_ENV_KEYS,
      assertNoCredentialCanaries,
      CREDENTIAL_CANARY_PATH_PATTERNS,
    } = await load();

    expect(FORBIDDEN_REMOTE_CREDENTIAL_ENV_KEYS).toContain("PATHCODE_GC1C_SECRET_CANARY");
    expect(FORBIDDEN_REMOTE_CREDENTIAL_ENV_KEYS).toContain("OPENAI_API_KEY");
    expect(
      CREDENTIAL_CANARY_PATH_PATTERNS.some((re: RegExp) =>
        re.test("PATHCODE_GC1C_SECRET_CANARY"),
      ),
    ).toBe(true);

    expect(() =>
      assertLocalSurfacesFreeOfCanary({
        canaryValue: CANARY,
        surfaces: {
          hydrationPayload: { "src/a.ts": "ok" },
          workerRequests: [{ op: "writeFile", path: "src/a.ts" }],
          journalText: "task began",
          eventsText: "session.hydration",
          artifactsText: "diff empty",
          childEnv: { PATH: "/usr/bin", SAFE: "1" },
        },
      }),
    ).not.toThrow();

    expect(() =>
      assertLocalSurfacesFreeOfCanary({
        canaryValue: CANARY,
        surfaces: {
          hydrationPayload: { "src/a.ts": `leak ${CANARY}` },
        },
      }),
    ).toThrow(/canary value leaked/);

    expect(() =>
      assertLocalSurfacesFreeOfCanary({
        canaryValue: CANARY,
        surfaces: {
          childEnv: { PATH: "/usr/bin", PATHCODE_GC1C_SECRET_CANARY: CANARY },
        },
      }),
    ).toThrow(/forbidden credential key/);

    expect(() =>
      assertLocalSurfacesFreeOfCanary({
        canaryValue: CANARY,
        surfaces: {
          workerRequests: [
            { op: "run", env: { OPENAI_API_KEY: CANARY } },
          ],
          journalText: `OPENAI_API_KEY=${CANARY}`,
        },
      }),
    ).toThrow();

    expect(() =>
      assertNoCredentialCanaries({
        env: { PATHCODE_GC1C_SECRET_CANARY: "x" },
      }),
    ).toThrow(/canary/i);
  });

  it("mock remote: clean env PASS; seeded canary key → named VIOLATION without value", async () => {
    const {
      createMockWorkstationTransport,
      buildRemoteCredentialBoundaryCommand,
      runRemoteCredentialBoundaryProof,
    } = await load();

    const cmd = buildRemoteCredentialBoundaryCommand();
    expect(cmd).toContain("PATHCODE_GC1C_SECRET_CANARY");
    expect(cmd).toContain("OPENAI_API_KEY");
    // Command must never interpolate secret values — only key names.
    expect(cmd).not.toContain(CANARY);
    expect(cmd).toMatch(/CREDENTIAL_BOUNDARY_PASS/);

    const transport = createMockWorkstationTransport();
    transport.seedCluster?.();
    const pass = await runRemoteCredentialBoundaryProof(transport, {
      workstationName: "projects/p/locations/l/workstations/ws",
    });
    expect(pass).toEqual({ ok: true });

    transport.seedRemoteEnv({
      PATHCODE_GC1C_SECRET_CANARY: CANARY,
      PATH: "/usr/bin",
    });
    const fail = await runRemoteCredentialBoundaryProof(transport, {
      workstationName: "projects/p/locations/l/workstations/ws",
    });
    expect(fail.ok).toBe(false);
    expect(fail.code).toBe("CREDENTIAL_BOUNDARY_VIOLATION");
    expect(fail.violatedKey).toBe("PATHCODE_GC1C_SECRET_CANARY");
    expect(JSON.stringify(fail)).not.toContain(CANARY);
    expect(fail.message).not.toContain(CANARY);

    // Direct executeCommand stdout must name the key only.
    const raw = await transport.executeCommand({
      workstationName: "ws",
      command: cmd,
    });
    expect(raw.stdout.trim()).toBe(
      "CREDENTIAL_BOUNDARY_VIOLATION:PATHCODE_GC1C_SECRET_CANARY",
    );
    expect(raw.stdout).not.toContain(CANARY);
    expect(raw.exitCode).toBe(1);
  });

  it("sanitizeRemoteEnv strips canary keys", async () => {
    const { sanitizeRemoteEnv } = await load();
    const cleaned = sanitizeRemoteEnv({
      PATH: "/usr/bin",
      SAFE_FLAG: "1",
      OPENAI_API_KEY: CANARY,
      PATHCODE_OPENAI_API_KEY: CANARY,
      PATHCODE_LIVE_OPENAI: "1",
      PATHCODE_GC1C_SECRET_CANARY: CANARY,
      NODE_ENV: "test",
    });
    expect(cleaned).toEqual({ PATH: "/usr/bin", SAFE_FLAG: "1", NODE_ENV: "test" });
    expect(cleaned).not.toHaveProperty("OPENAI_API_KEY");
    expect(cleaned).not.toHaveProperty("PATHCODE_GC1C_SECRET_CANARY");
    expect(JSON.stringify(cleaned)).not.toContain(CANARY);
  });
});
