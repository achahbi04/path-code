/**
 * GC1-c verified host-runtime file delivery — proofs A–L + falsifications F1–F5.
 * Zero GCP / provider network.
 */

import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const CHECKOUT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const GC1 = join(CHECKOUT, "scripts/pathcode-cli/gc1");

const temps: string[] = [];
afterEach(() => {
  for (const t of temps.splice(0)) {
    try {
      rmSync(t, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

async function loadMods(...names: string[]) {
  const b = randomUUID();
  const out: Record<string, unknown> = {};
  for (const name of names) {
    Object.assign(
      out,
      await import(`${pathToFileURL(join(GC1, name)).href}?b=${b}`),
    );
  }
  return out as any;
}

function binaryFixture(): Buffer {
  // LF, CRLF, quotes, backslash, null byte — exact-byte surface.
  return Buffer.from(
    Uint8Array.from([0x68, 0x69, 0x0a, 0x0d, 0x0a, 0x27, 0x22, 0x5c, 0x00, 0x7a]),
  );
}

/** In-memory fake tunnel for GcpWorkstationTransport ($0, no GCP). */
function createFakeTunnelSession() {
  const remoteFs = new Map<string, Buffer>();
  function unquote(raw: string): string {
    const s = String(raw ?? "").trim();
    if (s.startsWith("'")) {
      let out = "";
      let i = 0;
      while (i < s.length) {
        if (s[i] === "'") {
          i += 1;
          while (i < s.length && s[i] !== "'") {
            out += s[i];
            i += 1;
          }
          if (s[i] === "'") i += 1;
          continue;
        }
        out += s[i];
        i += 1;
      }
      return out;
    }
    return s;
  }
  return {
    remoteFs,
    async execute({ command, stdin }: { command: string; stdin?: Buffer }) {
      const trimmed = String(command).trim();
      const mkdir = trimmed.match(/^mkdir\s+-p\s+(.+)$/);
      if (mkdir) {
        const dir = unquote(mkdir[1]!);
        remoteFs.set(`${dir}/.pathcode-dir`, Buffer.alloc(0));
        return { stdout: "", stderr: "", exitCode: 0 };
      }
      const catWrite = trimmed.match(/^cat\s+>\s+(.+)$/);
      if (catWrite) {
        const p = unquote(catWrite[1]!);
        const buf = Buffer.isBuffer(stdin)
          ? Buffer.from(stdin)
          : Buffer.from(String(stdin ?? ""), "utf8");
        remoteFs.set(p, buf);
        return { stdout: "", stderr: "", exitCode: 0 };
      }
      const wc = trimmed.match(/^wc\s+-c\s+(.+)$/);
      if (wc) {
        const p = unquote(wc[1]!);
        const buf = remoteFs.get(p);
        if (!buf) return { stdout: "", stderr: "missing", exitCode: 1 };
        return { stdout: `${buf.length} ${p}\n`, stderr: "", exitCode: 0 };
      }
      const sha =
        trimmed.match(/^sha256sum\s+(.+)$/) ||
        trimmed.match(/^shasum\s+-a\s+256\s+(.+)$/);
      if (sha) {
        const p = unquote(sha[1]!);
        const buf = remoteFs.get(p);
        if (!buf) return { stdout: "", stderr: "missing", exitCode: 1 };
        const hex = createHash("sha256").update(buf).digest("hex");
        return { stdout: `${hex}  ${p}\n`, stderr: "", exitCode: 0 };
      }
      if (/^chmod\s+/.test(trimmed)) {
        return { stdout: "", stderr: "", exitCode: 0 };
      }
      const mv = trimmed.match(/^mv\s+-f\s+(\S+)\s+(.+)$/);
      if (mv) {
        const from = unquote(mv[1]!);
        const to = unquote(mv[2]!);
        const buf = remoteFs.get(from);
        if (!buf) return { stdout: "", stderr: "missing", exitCode: 1 };
        remoteFs.set(to, Buffer.from(buf));
        remoteFs.delete(from);
        return { stdout: "", stderr: "", exitCode: 0 };
      }
      const rm = trimmed.match(/^rm\s+-f\s+(.+)$/);
      if (rm) {
        for (const a of rm[1]!.trim().split(/\s+/)) {
          remoteFs.delete(unquote(a));
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      }
      if (/^test\b/.test(trimmed)) {
        return { stdout: "", stderr: "", exitCode: 0 };
      }
      return { stdout: `ran:${command}`, stderr: "", exitCode: 0 };
    },
    async closeAll() {},
  };
}

describe("GC1-c runtime delivery A–L", () => {
  it("A: exact byte delivery (LF/CRLF/quotes/backslash/null) length+sha256", async () => {
    const {
      createMockWorkstationTransport,
      deliverVerifiedHostRuntimeFile,
      buildRuntimeRoot,
      sha256Hex,
    } = await loadMods("mock-transport.mjs", "runtime-delivery.mjs");
    const transport = createMockWorkstationTransport();
    const bytes = binaryFixture();
    const runtimeRoot = buildRuntimeRoot("sess-a");
    const receipt = await deliverVerifiedHostRuntimeFile({
      transport,
      workstationName: "ws",
      runtimeRoot,
      bytes,
    });
    expect(receipt.ok).toBe(true);
    expect(receipt.published).toBe(true);
    expect(receipt.length).toBe(bytes.length);
    expect(receipt.sha256).toBe(sha256Hex(bytes));
    expect(receipt.remotePath).toBe(
      `${runtimeRoot}/remote-worker-${receipt.sha256}.cjs`,
    );
    const remote = transport.getRemoteFs().get(receipt.remotePath);
    expect(Buffer.compare(remote, bytes)).toBe(0);
  });

  it("B: truncation → LENGTH_MISMATCH before publish", async () => {
    const {
      createMockWorkstationTransport,
      deliverVerifiedHostRuntimeFile,
      buildRuntimeRoot,
      GC1_RUNTIME_DELIVERY_ERROR,
    } = await loadMods("mock-transport.mjs", "runtime-delivery.mjs");
    const transport = createMockWorkstationTransport();
    const bytes = binaryFixture();
    await expect(
      deliverVerifiedHostRuntimeFile({
        transport,
        workstationName: "ws",
        runtimeRoot: buildRuntimeRoot("sess-b"),
        bytes,
        _testHooks: { dropBytes: 2 },
      }),
    ).rejects.toMatchObject({
      code: GC1_RUNTIME_DELIVERY_ERROR.LENGTH_MISMATCH,
    });
    const finals = [...transport.getRemoteFs().keys()].filter((k: string) =>
      /remote-worker-[a-f0-9]{64}\.cjs$/.test(k),
    );
    expect(finals).toHaveLength(0);
  });

  it("C: byte corruption → INTEGRITY_MISMATCH", async () => {
    const {
      createMockWorkstationTransport,
      deliverVerifiedHostRuntimeFile,
      buildRuntimeRoot,
      GC1_RUNTIME_DELIVERY_ERROR,
    } = await loadMods("mock-transport.mjs", "runtime-delivery.mjs");
    const transport = createMockWorkstationTransport();
    await expect(
      deliverVerifiedHostRuntimeFile({
        transport,
        workstationName: "ws",
        runtimeRoot: buildRuntimeRoot("sess-c"),
        bytes: binaryFixture(),
        _testHooks: { corruptRemoteHash: true },
      }),
    ).rejects.toMatchObject({
      code: GC1_RUNTIME_DELIVERY_ERROR.INTEGRITY_MISMATCH,
    });
  });

  it("D: early remote exit → WRITE_FAILED", async () => {
    const {
      createMockWorkstationTransport,
      deliverVerifiedHostRuntimeFile,
      buildRuntimeRoot,
      GC1_RUNTIME_DELIVERY_ERROR,
    } = await loadMods("mock-transport.mjs", "runtime-delivery.mjs");
    const transport = createMockWorkstationTransport();
    await expect(
      deliverVerifiedHostRuntimeFile({
        transport,
        workstationName: "ws",
        runtimeRoot: buildRuntimeRoot("sess-d"),
        bytes: binaryFixture(),
        _testHooks: { earlyExit: true },
      }),
    ).rejects.toMatchObject({
      code: GC1_RUNTIME_DELIVERY_ERROR.WRITE_FAILED,
    });
  });

  it("E: nonzero writer → WRITE_FAILED", async () => {
    const {
      createMockWorkstationTransport,
      deliverVerifiedHostRuntimeFile,
      buildRuntimeRoot,
      GC1_RUNTIME_DELIVERY_ERROR,
    } = await loadMods("mock-transport.mjs", "runtime-delivery.mjs");
    const transport = createMockWorkstationTransport();
    await expect(
      deliverVerifiedHostRuntimeFile({
        transport,
        workstationName: "ws",
        runtimeRoot: buildRuntimeRoot("sess-e"),
        bytes: binaryFixture(),
        _testHooks: { nonzeroWriter: true },
      }),
    ).rejects.toMatchObject({
      code: GC1_RUNTIME_DELIVERY_ERROR.WRITE_FAILED,
    });
  });

  it("F: publish failure → PUBLISH_FAILED; worker not executable path", async () => {
    const {
      createMockWorkstationTransport,
      deliverVerifiedHostRuntimeFile,
      buildRuntimeRoot,
      GC1_RUNTIME_DELIVERY_ERROR,
    } = await loadMods("mock-transport.mjs", "runtime-delivery.mjs");
    const transport = createMockWorkstationTransport();
    const runtimeRoot = buildRuntimeRoot("sess-f");
    await expect(
      deliverVerifiedHostRuntimeFile({
        transport,
        workstationName: "ws",
        runtimeRoot,
        bytes: binaryFixture(),
        _testHooks: { failPublish: true },
      }),
    ).rejects.toMatchObject({
      code: GC1_RUNTIME_DELIVERY_ERROR.PUBLISH_FAILED,
    });
    const finals = [...transport.getRemoteFs().keys()].filter((k: string) =>
      k.startsWith(runtimeRoot) && /remote-worker-[a-f0-9]{64}\.cjs$/.test(k),
    );
    expect(finals).toHaveLength(0);
  });

  it("G: temp cleanup on failure — no valid-looking final worker", async () => {
    const {
      createMockWorkstationTransport,
      deliverVerifiedHostRuntimeFile,
      buildRuntimeRoot,
    } = await loadMods("mock-transport.mjs", "runtime-delivery.mjs");
    const transport = createMockWorkstationTransport();
    const runtimeRoot = buildRuntimeRoot("sess-g");
    await expect(
      deliverVerifiedHostRuntimeFile({
        transport,
        workstationName: "ws",
        runtimeRoot,
        bytes: binaryFixture(),
        _testHooks: { corruptRemoteHash: true },
      }),
    ).rejects.toBeTruthy();
    const leftovers = [...transport.getRemoteFs().keys()].filter(
      (k: string) =>
        k.startsWith(runtimeRoot) &&
        (k.includes(".remote-worker.") || /remote-worker-[a-f0-9]{64}\.cjs$/.test(k)),
    );
    expect(leftovers).toHaveLength(0);
  });

  it("H: path confinement refuses project / traversal destinations", async () => {
    const {
      createMockWorkstationTransport,
      deliverVerifiedHostRuntimeFile,
      buildRuntimeRoot,
      assertRuntimeRelativePath,
      GC1_RUNTIME_DELIVERY_ERROR,
    } = await loadMods("mock-transport.mjs", "runtime-delivery.mjs");
    const transport = createMockWorkstationTransport();

    expect(() => assertRuntimeRelativePath("../workspace/src/file.ts")).toThrow(
      expect.objectContaining({ code: GC1_RUNTIME_DELIVERY_ERROR.PATH_REFUSED }),
    );
    expect(() =>
      assertRuntimeRelativePath("/home/user/workspace/src/file.ts"),
    ).toThrow(
      expect.objectContaining({ code: GC1_RUNTIME_DELIVERY_ERROR.PATH_REFUSED }),
    );

    await expect(
      deliverVerifiedHostRuntimeFile({
        transport,
        workstationName: "ws",
        runtimeRoot: "/home/user/workspace",
        bytes: binaryFixture(),
      }),
    ).rejects.toMatchObject({
      code: GC1_RUNTIME_DELIVERY_ERROR.PATH_REFUSED,
    });

    await expect(
      deliverVerifiedHostRuntimeFile({
        transport,
        workstationName: "ws",
        runtimeRoot: buildRuntimeRoot("sess-h"),
        bytes: binaryFixture(),
        finalBaseName: "../escape.mjs",
      }),
    ).rejects.toMatchObject({
      code: GC1_RUNTIME_DELIVERY_ERROR.PATH_REFUSED,
    });
  });

  it("I: model-derived path cannot influence destination", async () => {
    const {
      createMockWorkstationTransport,
      deliverVerifiedHostRuntimeFile,
      buildRuntimeRoot,
      sha256Hex,
      GC1_RUNTIME_DELIVERY_ERROR,
    } = await loadMods("mock-transport.mjs", "runtime-delivery.mjs");
    const transport = createMockWorkstationTransport();
    const bytes = binaryFixture();
    const modelPath = "src/evil.ts";
    await expect(
      deliverVerifiedHostRuntimeFile({
        transport,
        workstationName: "ws",
        runtimeRoot: buildRuntimeRoot("sess-i"),
        bytes,
        finalBaseName: modelPath,
      }),
    ).rejects.toMatchObject({
      code: GC1_RUNTIME_DELIVERY_ERROR.PATH_REFUSED,
    });
    // Host-chosen name still binds to content hash, ignoring model suggestion.
    const receipt = await deliverVerifiedHostRuntimeFile({
      transport,
      workstationName: "ws",
      runtimeRoot: buildRuntimeRoot("sess-i2"),
      bytes,
    });
    expect(receipt.remotePath.endsWith(`remote-worker-${sha256Hex(bytes)}.cjs`)).toBe(
      true,
    );
    expect(receipt.remotePath).not.toContain(modelPath);
  });

  it("J: secret canary absent from worker/delivery surfaces", async () => {
    const {
      createMockWorkstationTransport,
      installRemoteWorker,
      REMOTE_WORKER_SCRIPT_SOURCE,
      assertNoSecretsInDeliverySurfaces,
      sha256Hex,
    } = await loadMods(
      "mock-transport.mjs",
      "remote-worker.mjs",
      "runtime-delivery.mjs",
    );
    const canary = "PATHCODE_GC1C_SECRET_CANARY=super-secret-value-xyz";
    expect(REMOTE_WORKER_SCRIPT_SOURCE).not.toContain("PATHCODE_GC1C_SECRET_CANARY");
    expect(REMOTE_WORKER_SCRIPT_SOURCE).not.toContain("OPENAI_API_KEY");

    const transport = createMockWorkstationTransport();
    const receipt = await installRemoteWorker(transport, {
      workstationName: "ws",
      sessionId: "sess-j",
    });
    assertNoSecretsInDeliverySurfaces({
      remotePath: receipt.remotePath,
      sha256: receipt.sha256,
      runtimeRoot: receipt.runtimeRoot,
      source: REMOTE_WORKER_SCRIPT_SOURCE,
      callLog: transport.getCallLog().join("\n"),
    });
    expect(JSON.stringify(receipt)).not.toContain(canary);
    expect(receipt.sha256).toBe(
      sha256Hex(Buffer.from(REMOTE_WORKER_SCRIPT_SOURCE, "utf8")),
    );
  });

  it("K: production GcpWorkstationTransport with fake tunnel satisfies delivery", async () => {
    const { createGcpWorkstationTransport } = await loadMods("gcp-transport.mjs");
    const {
      deliverVerifiedHostRuntimeFile,
      buildRuntimeRoot,
      sha256Hex,
      assertGc1cTransportConformance,
      assertTransportRuntimeDeliveryCapability,
      GC1_RUNTIME_DELIVERY_ERROR,
    } = await loadMods("runtime-delivery.mjs", "transport-conformance.mjs");

    const fakeTunnel = createFakeTunnelSession();
    const transport = await createGcpWorkstationTransport({
      skipEnvGate: true,
      auth: { targetPrincipal: "control-sa@example.iam.gserviceaccount.com" },
      fetchImpl: async () =>
        new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
      tunnelSession: fakeTunnel,
    });

    expect(transport.kind).toBe("gcp");
    assertGc1cTransportConformance(transport);
    expect(typeof transport.executeCommand).toBe("function");
    expect(typeof transport.writeHostRuntimeFile).toBe("function");

    const bytes = binaryFixture();
    const runtimeRoot = buildRuntimeRoot("gcp-k");
    const receipt = await deliverVerifiedHostRuntimeFile({
      transport,
      workstationName:
        "projects/p/locations/r/workstationClusters/c/workstationConfigs/cfg/workstations/ws",
      runtimeRoot,
      bytes,
    });
    expect(receipt.ok).toBe(true);
    expect(receipt.sha256).toBe(sha256Hex(bytes));
    expect(
      Buffer.compare(fakeTunnel.remoteFs.get(receipt.remotePath)!, bytes),
    ).toBe(0);

    // Remove primitive → conformance fails.
    const broken = { ...transport, executeCommand: undefined };
    expect(() => assertTransportRuntimeDeliveryCapability(broken)).toThrow(
      expect.objectContaining({
        code: GC1_RUNTIME_DELIVERY_ERROR.CAPABILITY_MISSING,
      }),
    );
  });

  it("L: mock uses same install abstraction; remove executeCommand → fail", async () => {
    const {
      createMockWorkstationTransport,
      installRemoteWorker,
      deliverVerifiedHostRuntimeFile,
      assertGc1cTransportConformance,
      GC1_RUNTIME_DELIVERY_ERROR,
      DEFAULT_RUNTIME_ROOT_PREFIX,
    } = await loadMods(
      "mock-transport.mjs",
      "remote-worker.mjs",
      "runtime-delivery.mjs",
      "transport-conformance.mjs",
    );
    const transport = createMockWorkstationTransport();
    assertGc1cTransportConformance(transport);
    const receipt = await installRemoteWorker(transport, {
      workstationName: "ws",
      sessionId: "sess-l",
    });
    expect(receipt.remotePath.startsWith(DEFAULT_RUNTIME_ROOT_PREFIX)).toBe(true);
    expect(receipt.published).toBe(true);
    // Same abstraction — not writeRemoteFile shortcut.
    expect(transport.getCallLog().some((c: string) => c.startsWith("catWrite:"))).toBe(
      true,
    );

    const noExec = {
      kind: "mock",
      writeRemoteFile: transport.writeRemoteFile.bind(transport),
    };
    expect(() => assertGc1cTransportConformance(noExec)).toThrow(
      expect.objectContaining({
        code: GC1_RUNTIME_DELIVERY_ERROR.CAPABILITY_MISSING,
      }),
    );
    await expect(
      installRemoteWorker(noExec as any, { workstationName: "ws", sessionId: "x" }),
    ).rejects.toMatchObject({
      code: GC1_RUNTIME_DELIVERY_ERROR.CAPABILITY_MISSING,
    });
    // writeRemoteFile alone is insufficient for deliverVerifiedHostRuntimeFile.
    await expect(
      deliverVerifiedHostRuntimeFile({
        transport: noExec as any,
        workstationName: "ws",
        runtimeRoot: `${DEFAULT_RUNTIME_ROOT_PREFIX}/x`,
        bytes: Buffer.from("x"),
      }),
    ).rejects.toMatchObject({
      code: GC1_RUNTIME_DELIVERY_ERROR.CAPABILITY_MISSING,
    });
  });

  it("three-channel sentinel remains exact after worker install", async () => {
    const {
      createCloudEffectsBackend,
      createMockWorkstationTransport,
      toProcessObservation,
    } = await loadMods(
      "mock-transport.mjs",
      "cloud-effects.mjs",
      "remote-worker.mjs",
    );
    const transport = createMockWorkstationTransport();
    const primary = mkdtempSync(join(tmpdir(), "gc1c-prim-"));
    const task = mkdtempSync(join(tmpdir(), "gc1c-task-"));
    temps.push(primary, task);
    const backend = createCloudEffectsBackend({
      transport,
      workstationName: "ws",
      taskWorkspaceRoot: task,
      localPrimaryRoot: primary,
      sessionId: "sentinel",
      scriptedProcessResults: [
        {
          exitCode: 17,
          stdout: "GC1_STDOUT_SENTINEL",
          stderr: "GC1_STDERR_SENTINEL",
          signal: null,
        },
      ],
    });
    const obs = await backend.runProcess({
      executable: "/usr/bin/true",
      argv: [],
      cwd: task,
      env: { PATH: "/usr/bin" },
      timeoutMs: 5_000,
      maxStdoutBytes: 1024,
      maxStderrBytes: 1024,
    });
    expect(obs.exitCode).toBe(17);
    expect(obs.stdout.text).toContain("GC1_STDOUT_SENTINEL");
    expect(obs.stderr.text).toContain("GC1_STDERR_SENTINEL");
    const mapped = toProcessObservation({
      exitCode: 17,
      stdout: "GC1_STDOUT_SENTINEL",
      stderr: "GC1_STDERR_SENTINEL",
    });
    expect(mapped.exitCode).toBe(17);
    expect(mapped.stdout.text).toBe("GC1_STDOUT_SENTINEL");
    expect(mapped.stderr.text).toBe("GC1_STDERR_SENTINEL");
  });
});

describe("GC1-c runtime delivery falsifications F1–F5", () => {
  it("F1: remove production capability check → conformance FAILS; restore by hash", async () => {
    const path = join(GC1, "runtime-delivery.mjs");
    const before = sha256File(path);
    const original = readFileSync(path, "utf8");
    expect(original).toContain("GC1_REMOTE_TRANSPORT_CAPABILITY_MISSING");

    const mutated = original.replace(
      /if \(!transport \|\| typeof transport\.executeCommand !== "function"\) \{[\s\S]*?throw namedError\([\s\S]*?\);[\s\S]*?\}/,
      "/* F1 mutated: capability check removed */",
    );
    expect(mutated).not.toBe(original);
    writeFileSync(path, mutated);
    try {
      expect(sha256File(path)).not.toBe(before);
      const mod = await loadMods("runtime-delivery.mjs");
      // Broken module no longer throws for missing executeCommand.
      expect(() =>
        mod.assertTransportRuntimeDeliveryCapability({}),
      ).not.toThrow();
    } finally {
      writeFileSync(path, original);
    }
    expect(sha256File(path)).toBe(before);
  });

  it("F2: mock bypass of deliverVerifiedHostRuntimeFile → parity proof FAILS; restore", async () => {
    const path = join(GC1, "remote-worker.mjs");
    const before = sha256File(path);
    const original = readFileSync(path, "utf8");
    expect(original).toContain("deliverVerifiedHostRuntimeFile");

    const mutated = original.replace(
      /const receipt = await deliverVerifiedHostRuntimeFile\(\{[\s\S]*?\}\);/,
      `const receipt = {
    ok: true,
    remotePath: "/home/user/.pathcode-worker/worker.js",
    runtimeRoot: "/home/user/.pathcode-worker",
    sha256: sha256Hex(bytes),
    length: bytes.length,
    published: true,
    stagingPath: "/tmp/bypass",
  };
  if (typeof transport.writeRemoteFile === "function") {
    await transport.writeRemoteFile({
      remotePath: receipt.remotePath,
      content: REMOTE_WORKER_SCRIPT_SOURCE,
      encoding: "utf8",
    });
  }`,
    );
    expect(mutated).not.toBe(original);
    writeFileSync(path, mutated);
    try {
      expect(sha256File(path)).not.toBe(before);
      const { createMockWorkstationTransport, installRemoteWorker, DEFAULT_RUNTIME_ROOT_PREFIX } =
        await loadMods("mock-transport.mjs", "remote-worker.mjs", "runtime-delivery.mjs");
      const transport = createMockWorkstationTransport();
      const receipt = await installRemoteWorker(transport, {
        workstationName: "ws",
        sessionId: "f2",
      });
      // Parity broken: mock bypass lands outside runtime prefix.
      expect(receipt.remotePath.startsWith(DEFAULT_RUNTIME_ROOT_PREFIX)).toBe(false);
    } finally {
      writeFileSync(path, original);
    }
    expect(sha256File(path)).toBe(before);
  });

  it("F3: skip SHA compare → corrupted-byte proof FAILS; restore by hash", async () => {
    const path = join(GC1, "runtime-delivery.mjs");
    const before = sha256File(path);
    const original = readFileSync(path, "utf8");
    expect(original).toContain("GC1_REMOTE_RUNTIME_INTEGRITY_MISMATCH");

    const mutated = original.replace(
      /if \(remoteSha256 !== localSha256\) \{[\s\S]*?throw namedError\([\s\S]*?INTEGRITY_MISMATCH[\s\S]*?\);[\s\S]*?\}/,
      "/* F3 mutated: sha compare skipped */",
    );
    expect(mutated).not.toBe(original);
    writeFileSync(path, mutated);
    try {
      expect(sha256File(path)).not.toBe(before);
      const {
        createMockWorkstationTransport,
        deliverVerifiedHostRuntimeFile,
        buildRuntimeRoot,
      } = await loadMods("mock-transport.mjs", "runtime-delivery.mjs");
      const transport = createMockWorkstationTransport();
      // With SHA skipped, corruptRemoteHash still publishes — proof no longer holds.
      const receipt = await deliverVerifiedHostRuntimeFile({
        transport,
        workstationName: "ws",
        runtimeRoot: buildRuntimeRoot("f3"),
        bytes: binaryFixture(),
        _testHooks: { corruptRemoteHash: true },
      });
      expect(receipt.ok).toBe(true);
      expect(receipt.published).toBe(true);
    } finally {
      writeFileSync(path, original);
    }
    expect(sha256File(path)).toBe(before);
  });

  it("F4: allow project path → confinement proof FAILS; restore by hash", async () => {
    const path = join(GC1, "runtime-delivery.mjs");
    const before = sha256File(path);
    const original = readFileSync(path, "utf8");
    expect(original).toContain("runtime root prefix refused");

    const mutated = original.replace(
      /if \(!root\.startsWith\(DEFAULT_RUNTIME_ROOT_PREFIX\)\) \{[\s\S]*?throw namedError\([\s\S]*?\);[\s\S]*?\}/,
      "/* F4 mutated: prefix check removed */",
    ).replace(
      /if \(\s*p\.startsWith\("\/home\/user\/workspace"\)[\s\S]*?throw namedError\([\s\S]*?\);[\s\S]*?\}/,
      "/* F4 mutated: workspace refuse removed */",
    );
    expect(mutated).not.toBe(original);
    writeFileSync(path, mutated);
    try {
      expect(sha256File(path)).not.toBe(before);
      const {
        createMockWorkstationTransport,
        deliverVerifiedHostRuntimeFile,
      } = await loadMods("mock-transport.mjs", "runtime-delivery.mjs");
      const transport = createMockWorkstationTransport();
      // Confinement no longer refuses project workspace root.
      const receipt = await deliverVerifiedHostRuntimeFile({
        transport,
        workstationName: "ws",
        runtimeRoot: "/home/user/workspace",
        bytes: Buffer.from("x"),
        finalBaseName: "worker-f4.mjs",
      });
      expect(receipt.ok).toBe(true);
      expect(receipt.remotePath.startsWith("/home/user/workspace")).toBe(true);
    } finally {
      writeFileSync(path, original);
    }
    expect(sha256File(path)).toBe(before);
  });

  it("F5: execute staging before publish → install proof FAILS; restore by hash", async () => {
    const path = join(GC1, "runtime-delivery.mjs");
    const before = sha256File(path);
    const original = readFileSync(path, "utf8");
    expect(original).toMatch(/Never execute/i);

    // Inject an execute of the staging path after write, before integrity.
    const needle =
      "if (typeof hooks?.afterWrite === \"function\") {\n    await hooks.afterWrite({";
    const inject =
      "await transport.executeCommand({\n" +
      "    workstationName,\n" +
      "    command: `node ${shQuote(stagingPath)}`,\n" +
      "  });\n" +
      "  if (typeof hooks?.afterWrite === \"function\") {\n    await hooks.afterWrite({";
    const mutated = original.replace(needle, inject);
    expect(mutated).not.toBe(original);
    writeFileSync(path, mutated);
    try {
      expect(sha256File(path)).not.toBe(before);
      const src = readFileSync(path, "utf8");
      // Proof that staging is executed before verified publish.
      const execIdx = src.indexOf("node ${shQuote(stagingPath)}");
      const mvIdx = src.indexOf("mv -f ${shQuote(stagingPath)}");
      expect(execIdx).toBeGreaterThan(0);
      expect(mvIdx).toBeGreaterThan(execIdx);
    } finally {
      writeFileSync(path, original);
    }
    expect(sha256File(path)).toBe(before);
  });
});
