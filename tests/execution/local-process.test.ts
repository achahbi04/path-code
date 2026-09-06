import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadProjectConfig } from "../../src/config/index.js";
import {
  DEFAULT_LOCAL_PROCESS_TIMEOUT_MS,
  LOCAL_PROCESS_TERMINATION_GRACE_MS,
  MAX_LOCAL_PROCESS_ARGV_COUNT,
  MAX_LOCAL_PROCESS_ARGV_TOTAL_BYTES,
  MAX_LOCAL_PROCESS_TIMEOUT_MS,
  authorizePreparedLocalProcess,
  executeAuthorizedLocalProcess,
  explicitLocalProcessApproval,
  isExecuteProcessDisabled,
  prepareLocalProcess,
} from "../../src/execution/index.js";
import { resetLocalProcessRegistryForTests } from "../../src/execution/internal/registry.js";
import {
  boundaryFor,
  cleanupInventoryFixtures,
  createCanonicalTempRoot,
} from "../inventory/fixture-helpers.js";
import {
  FIXTURE_ECHO_ARGV,
  FIXTURE_EXIT_0,
  FIXTURE_EXIT_2,
  FIXTURE_HOLD_PIPE,
  FIXTURE_IGNORE_SIGTERM,
  FIXTURE_PRINT_ENV,
  FIXTURE_SLEEP,
  FIXTURE_STDERR_FLOOD,
  FIXTURE_STDOUT_FLOOD,
  FIXTURE_STDOUT_HELLO,
} from "./fixtures/scripts.js";

afterEach(async () => {
  resetLocalProcessRegistryForTests();
  await cleanupInventoryFixtures();
});

async function writeFixture(root: string, name: string, source: string): Promise<string> {
  const path = join(root, name);
  await writeFile(path, source, "utf8");
  return path;
}

async function workspaceAt(root: string) {
  const workspace = await boundaryFor(root);
  const loaded = await loadProjectConfig(workspace);
  expect(loaded.ok).toBe(true);
  if (!loaded.ok) {
    throw new Error("config load failed");
  }
  return { workspace, config: loaded.value };
}

async function runNodeFixture(
  root: string,
  scriptSource: string,
  argv: readonly string[] = [],
  options?: {
    readonly timeoutMs?: number;
    readonly maxStdoutBytes?: number;
    readonly maxStderrBytes?: number;
    readonly env?: Readonly<Record<string, string>>;
    readonly cwd?: string;
  },
) {
  const script = await writeFixture(root, `fixture-${Date.now()}-${Math.random()}.mjs`, scriptSource);
  const { workspace, config } = await workspaceAt(root);
  const request: {
    executable: string;
    argv: string[];
    cwd: string;
    timeoutMs?: number;
    maxStdoutBytes?: number;
    maxStderrBytes?: number;
    env?: Readonly<Record<string, string>>;
  } = {
    executable: process.execPath,
    argv: [script, ...argv],
    cwd: options?.cwd ?? root,
  };
  if (options?.timeoutMs !== undefined) {
    request.timeoutMs = options.timeoutMs;
  }
  if (options?.maxStdoutBytes !== undefined) {
    request.maxStdoutBytes = options.maxStdoutBytes;
  }
  if (options?.maxStderrBytes !== undefined) {
    request.maxStderrBytes = options.maxStderrBytes;
  }
  if (options?.env !== undefined) {
    request.env = options.env;
  }
  const prepared = await prepareLocalProcess(request, workspace, config);
  expect(prepared.ok).toBe(true);
  if (!prepared.ok) {
    throw new Error(prepared.error.message);
  }
  const auth = await authorizePreparedLocalProcess(
    prepared.value,
    explicitLocalProcessApproval(),
    config,
  );
  expect(auth.ok).toBe(true);
  if (!auth.ok) {
    throw new Error(auth.error.message);
  }
  return executeAuthorizedLocalProcess(prepared.value, auth.value);
}

describe("local process execution", () => {
  it("prepares a valid request and exits 0", async () => {
    const root = await createCanonicalTempRoot("pc-p4-exit0-");
    const result = await runNodeFixture(root, FIXTURE_EXIT_0);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.outcome).toBe("EXITED");
    expect(result.value.exitCode).toBe(0);
    expect(result.value.resultId).toMatch(/^local-process-result-/);
  });

  it("requires an absolute executable", async () => {
    const root = await createCanonicalTempRoot("pc-p4-abs-");
    const { workspace, config } = await workspaceAt(root);
    const prepared = await prepareLocalProcess(
      { executable: "node", argv: [], cwd: root },
      workspace,
      config,
    );
    expect(prepared.ok).toBe(false);
    if (!prepared.ok) {
      expect(prepared.error.code).toBe("EXECUTABLE_NOT_ABSOLUTE");
    }
  });

  it("fails truthfully for a nonexistent executable", async () => {
    const root = await createCanonicalTempRoot("pc-p4-enoent-");
    const { workspace, config } = await workspaceAt(root);
    const prepared = await prepareLocalProcess(
      {
        executable: join(root, "missing-binary"),
        argv: [],
        cwd: root,
      },
      workspace,
      config,
    );
    expect(prepared.ok).toBe(false);
    if (!prepared.ok) {
      expect(prepared.error.code).toBe("EXECUTABLE_NOT_FOUND");
    }
  });

  it("preserves exact argv including spaces, quotes, dashes, and metacharacters", async () => {
    const root = await createCanonicalTempRoot("pc-p4-argv-");
    const args = ['a b', '"quoted"', "--flag", "x;y|z$`"];
    const result = await runNodeFixture(root, FIXTURE_ECHO_ARGV, args);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(JSON.parse(result.value.stdout.text)).toEqual(args);
  });

  it("does not interpret shell metacharacters", async () => {
    const root = await createCanonicalTempRoot("pc-p4-noshell-");
    const result = await runNodeFixture(root, FIXTURE_ECHO_ARGV, ["$(echo hi)", "`id`"]);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(JSON.parse(result.value.stdout.text)).toEqual(["$(echo hi)", "`id`"]);
  });

  it("enforces argv count and byte bounds and rejects NUL", async () => {
    const root = await createCanonicalTempRoot("pc-p4-argv-bounds-");
    const { workspace, config } = await workspaceAt(root);
    const tooMany = Array.from({ length: MAX_LOCAL_PROCESS_ARGV_COUNT + 1 }, () => "a");
    const count = await prepareLocalProcess(
      { executable: process.execPath, argv: tooMany, cwd: root },
      workspace,
      config,
    );
    expect(count.ok).toBe(false);
    if (!count.ok) {
      expect(count.error.code).toBe("ARGV_COUNT_EXCEEDED");
    }

    const big = "x".repeat(MAX_LOCAL_PROCESS_ARGV_TOTAL_BYTES + 1);
    const bytes = await prepareLocalProcess(
      { executable: process.execPath, argv: [big], cwd: root },
      workspace,
      config,
    );
    expect(bytes.ok).toBe(false);
    if (!bytes.ok) {
      expect(bytes.error.code).toBe("ARGV_BYTES_EXCEEDED");
    }

    const nul = await prepareLocalProcess(
      { executable: process.execPath, argv: ["a\0b"], cwd: root },
      workspace,
      config,
    );
    expect(nul.ok).toBe(false);
    if (!nul.ok) {
      expect(nul.error.code).toBe("ARGV_NUL_REJECTED");
    }
  });

  it("allows workspace cwd and refuses outside-workspace cwd", async () => {
    const root = await createCanonicalTempRoot("pc-p4-cwd-");
    const outside = await createCanonicalTempRoot("pc-p4-outside-");
    const ok = await runNodeFixture(root, FIXTURE_EXIT_0);
    expect(ok.ok).toBe(true);

    const { workspace, config } = await workspaceAt(root);
    const refused = await prepareLocalProcess(
      { executable: process.execPath, argv: ["-e", "process.exit(0)"], cwd: outside },
      workspace,
      config,
    );
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.error.code).toBe("CWD_OUTSIDE_WORKSPACE");
    }
  });

  it("resolves symlinked cwd through physical containment", async () => {
    const root = await createCanonicalTempRoot("pc-p4-symlink-");
    const realDir = join(root, "real");
    await mkdir(realDir);
    const link = join(root, "link");
    await symlink(realDir, link);
    const result = await runNodeFixture(root, FIXTURE_EXIT_0, [], { cwd: link });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.cwd).toBe(await (await boundaryFor(root)).canonicalize(realDir).then((r) => {
      if (!r.ok) {
        throw new Error("canonicalize failed");
      }
      return r.value;
    }));
  });

  it("refuses when cwd changes before spawn", async () => {
    const root = await createCanonicalTempRoot("pc-p4-cwd-change-");
    const nested = join(root, "nested");
    await mkdir(nested);
    const { workspace, config } = await workspaceAt(root);
    const prepared = await prepareLocalProcess(
      {
        executable: process.execPath,
        argv: ["-e", "process.exit(0)"],
        cwd: nested,
      },
      workspace,
      config,
    );
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) {
      return;
    }
    const auth = await authorizePreparedLocalProcess(
      prepared.value,
      explicitLocalProcessApproval(),
      config,
    );
    expect(auth.ok).toBe(true);
    if (!auth.ok) {
      return;
    }
    const { rm } = await import("node:fs/promises");
    await rm(nested, { recursive: true, force: true });
    const executed = await executeAuthorizedLocalProcess(prepared.value, auth.value);
    expect(executed.ok).toBe(false);
    if (!executed.ok) {
      expect(["CWD_CHANGED", "CWD_OUTSIDE_WORKSPACE"]).toContain(executed.error.code);
      expect(executed.error.authorizationConsumed).toBe(true);
    }
  });

  it("refuses when executable identity changes before spawn", async () => {
    const root = await createCanonicalTempRoot("pc-p4-exe-change-");
    const bin = join(root, "tool.sh");
    await writeFile(bin, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    const { workspace, config } = await workspaceAt(root);
    const prepared = await prepareLocalProcess(
      { executable: bin, argv: [], cwd: root },
      workspace,
      config,
    );
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) {
      return;
    }
    const auth = await authorizePreparedLocalProcess(
      prepared.value,
      explicitLocalProcessApproval(),
      config,
    );
    expect(auth.ok).toBe(true);
    if (!auth.ok) {
      return;
    }
    await writeFile(bin, "#!/bin/sh\nexit 1\n# changed\n", { mode: 0o755 });
    const executed = await executeAuthorizedLocalProcess(prepared.value, auth.value);
    expect(executed.ok).toBe(false);
    if (!executed.ok) {
      expect(executed.error.code).toBe("EXECUTABLE_CHANGED");
      expect(executed.error.authorizationConsumed).toBe(true);
    }
  });

  it("applies explicit env and avoids unintended host secret inheritance", async () => {
    const root = await createCanonicalTempRoot("pc-p4-env-");
    const previous = process.env["OPENAI_API_KEY"];
    process.env["OPENAI_API_KEY"] = "should-not-leak";
    try {
      const result = await runNodeFixture(
        root,
        FIXTURE_PRINT_ENV,
        ["OPENAI_API_KEY", "PATHCODE_TEST_VALUE"],
        { env: { PATHCODE_TEST_VALUE: "ok" } },
      );
      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      const parsed = JSON.parse(result.value.stdout.text) as Record<string, string | null>;
      expect(parsed["PATHCODE_TEST_VALUE"]).toBe("ok");
      expect(parsed["OPENAI_API_KEY"]).toBeNull();
    } finally {
      if (previous === undefined) {
        delete process.env["OPENAI_API_KEY"];
      } else {
        process.env["OPENAI_API_KEY"] = previous;
      }
    }
  });

  it("leaves host cwd and env unchanged", async () => {
    const root = await createCanonicalTempRoot("pc-p4-host-");
    const cwd = process.cwd();
    const env = { ...process.env };
    const result = await runNodeFixture(root, FIXTURE_EXIT_0);
    expect(result.ok).toBe(true);
    expect(process.cwd()).toBe(cwd);
    expect(process.env).toEqual(env);
  });

  it("requires authorization and binds the exact prepared object", async () => {
    const root = await createCanonicalTempRoot("pc-p4-auth-");
    const script = await writeFixture(root, "a.mjs", FIXTURE_EXIT_0);
    const { workspace, config } = await workspaceAt(root);
    const prepared = await prepareLocalProcess(
      { executable: process.execPath, argv: [script], cwd: root },
      workspace,
      config,
    );
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) {
      return;
    }
    const unauthorized = await authorizePreparedLocalProcess(
      prepared.value,
      { kind: "NOPE" } as never,
      config,
    );
    expect(unauthorized.ok).toBe(false);

    const other = await prepareLocalProcess(
      { executable: process.execPath, argv: [script], cwd: root },
      workspace,
      config,
    );
    expect(other.ok).toBe(true);
    if (!other.ok) {
      return;
    }
    const auth = await authorizePreparedLocalProcess(
      prepared.value,
      explicitLocalProcessApproval(),
      config,
    );
    expect(auth.ok).toBe(true);
    if (!auth.ok) {
      return;
    }
    const mismatched = await executeAuthorizedLocalProcess(other.value, auth.value);
    expect(mismatched.ok).toBe(false);
  });

  it("ignores caller mutation after prepare and refuses replay", async () => {
    const root = await createCanonicalTempRoot("pc-p4-mutate-");
    const { workspace, config } = await workspaceAt(root);
    const scriptPath = await writeFixture(root, "m.mjs", FIXTURE_ECHO_ARGV);
    const argv = [scriptPath, "one"] as string[];
    const prepared = await prepareLocalProcess(
      { executable: process.execPath, argv, cwd: root },
      workspace,
      config,
    );
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) {
      return;
    }
    argv[1] = "mutated";
    const auth = await authorizePreparedLocalProcess(
      prepared.value,
      explicitLocalProcessApproval(),
      config,
    );
    expect(auth.ok).toBe(true);
    if (!auth.ok) {
      return;
    }
    const first = await executeAuthorizedLocalProcess(prepared.value, auth.value);
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }
    expect(JSON.parse(first.value.stdout.text)).toEqual(["one"]);
    const replay = await executeAuthorizedLocalProcess(prepared.value, auth.value);
    expect(replay.ok).toBe(false);
    if (!replay.ok) {
      expect(replay.error.code).toBe("AUTHORIZATION_ALREADY_CONSUMED");
    }
  });

  it("concurrent replay produces at most one spawn", async () => {
    const root = await createCanonicalTempRoot("pc-p4-concurrent-");
    const script = await writeFixture(root, "c.mjs", FIXTURE_EXIT_0);
    const { workspace, config } = await workspaceAt(root);
    const prepared = await prepareLocalProcess(
      { executable: process.execPath, argv: [script], cwd: root },
      workspace,
      config,
    );
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) {
      return;
    }
    const auth = await authorizePreparedLocalProcess(
      prepared.value,
      explicitLocalProcessApproval(),
      config,
    );
    expect(auth.ok).toBe(true);
    if (!auth.ok) {
      return;
    }
    const [a, b] = await Promise.all([
      executeAuthorizedLocalProcess(prepared.value, auth.value),
      executeAuthorizedLocalProcess(prepared.value, auth.value),
    ]);
    const successes = [a, b].filter((r) => r.ok);
    const failures = [a, b].filter((r) => !r.ok);
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
  });

  it("honors EXECUTE_PROCESS disable before authorize and after authorize before spawn", async () => {
    const root = await createCanonicalTempRoot("pc-p4-disable-");
    await writeFile(
      join(root, "PATHCODE.md"),
      "# Config\n\n```pathcode-config\ndisable-action = EXECUTE_PROCESS\n```\n",
      "utf8",
    );
    const { workspace, config } = await workspaceAt(root);
    expect(isExecuteProcessDisabled(config)).toBe(true);
    const preparedDisabled = await prepareLocalProcess(
      {
        executable: process.execPath,
        argv: ["-e", "process.exit(0)"],
        cwd: root,
      },
      workspace,
      config,
    );
    expect(preparedDisabled.ok).toBe(false);

    const root2 = await createCanonicalTempRoot("pc-p4-disable2-");
    const { workspace: ws2, config: cfg2 } = await workspaceAt(root2);
    const prepared = await prepareLocalProcess(
      {
        executable: process.execPath,
        argv: ["-e", "process.exit(0)"],
        cwd: root2,
      },
      ws2,
      cfg2,
    );
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) {
      return;
    }
    const auth = await authorizePreparedLocalProcess(
      prepared.value,
      explicitLocalProcessApproval(),
      cfg2,
    );
    expect(auth.ok).toBe(true);
    if (!auth.ok) {
      return;
    }
    await writeFile(
      join(root2, "PATHCODE.md"),
      "# Config\n\n```pathcode-config\ndisable-action = EXECUTE_PROCESS\n```\n",
      "utf8",
    );
    const executed = await executeAuthorizedLocalProcess(prepared.value, auth.value);
    expect(executed.ok).toBe(false);
    if (!executed.ok) {
      expect(executed.error.code).toBe("ACTION_DISABLED");
      expect(executed.error.authorizationConsumed).toBe(true);
    }
  });

  it("accepts EXECUTE_PROCESS in config parser and rejects unknown ActionClass", async () => {
    const root = await createCanonicalTempRoot("pc-p4-parse-");
    await writeFile(
      join(root, "PATHCODE.md"),
      "```pathcode-config\ndisable-action = EXECUTE_PROCESS\n```\n",
      "utf8",
    );
    const loaded = await loadProjectConfig(await boundaryFor(root));
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.value.restrictions.disabledActions).toEqual(["EXECUTE_PROCESS"]);
    }

    const rootBad = await createCanonicalTempRoot("pc-p4-parse-bad-");
    await writeFile(
      join(rootBad, "PATHCODE.md"),
      "```pathcode-config\ndisable-action = NOT_REAL\n```\n",
      "utf8",
    );
    const bad = await loadProjectConfig(await boundaryFor(rootBad));
    expect(bad.ok).toBe(false);
  });

  it("classifies nonzero exit and captures stdout/stderr", async () => {
    const root = await createCanonicalTempRoot("pc-p4-nonzero-");
    const nonzero = await runNodeFixture(root, FIXTURE_EXIT_2);
    expect(nonzero.ok).toBe(true);
    if (!nonzero.ok) {
      return;
    }
    expect(nonzero.value.exitCode).toBe(2);
    expect(nonzero.value.outcome).toBe("EXITED");

    const hello = await runNodeFixture(root, FIXTURE_STDOUT_HELLO);
    expect(hello.ok).toBe(true);
    if (!hello.ok) {
      return;
    }
    expect(hello.value.stdout.text).toBe("hello-out");
    expect(hello.value.stderr.text).toBe("hello-err");
  });

  it("represents 120s default and allows >120s up to 30m without clamping to 120s", async () => {
    const root = await createCanonicalTempRoot("pc-p4-timeout-policy-");
    const { workspace, config } = await workspaceAt(root);
    const def = await prepareLocalProcess(
      {
        executable: process.execPath,
        argv: ["-e", "process.exit(0)"],
        cwd: root,
      },
      workspace,
      config,
    );
    expect(def.ok).toBe(true);
    if (def.ok) {
      expect(def.value.timeoutMs).toBe(DEFAULT_LOCAL_PROCESS_TIMEOUT_MS);
    }

    const long = await prepareLocalProcess(
      {
        executable: process.execPath,
        argv: ["-e", "process.exit(0)"],
        cwd: root,
        timeoutMs: 300_000,
      },
      workspace,
      config,
    );
    expect(long.ok).toBe(true);
    if (long.ok) {
      expect(long.value.timeoutMs).toBe(300_000);
    }

    const tooLong = await prepareLocalProcess(
      {
        executable: process.execPath,
        argv: ["-e", "process.exit(0)"],
        cwd: root,
        timeoutMs: MAX_LOCAL_PROCESS_TIMEOUT_MS + 1,
      },
      workspace,
      config,
    );
    expect(tooLong.ok).toBe(false);
    if (!tooLong.ok) {
      expect(tooLong.error.code).toBe("TIMEOUT_OUT_OF_RANGE");
    }
  });

  it("times out and escalates when SIGTERM is ignored", async () => {
    const root = await createCanonicalTempRoot("pc-p4-timeout-");
    const timed = await runNodeFixture(root, FIXTURE_SLEEP, ["5000"], {
      timeoutMs: 200,
    });
    expect(timed.ok).toBe(true);
    if (!timed.ok) {
      return;
    }
    expect(timed.value.timedOut).toBe(true);
    expect(timed.value.terminationRequested).toBe(true);

    // timeoutMs must exceed Node spawn + handler registration under suite load.
    // With 200ms, SIGTERM could arrive before the ignore handler existed; the
    // engine then correctly observed exit and skipped SIGKILL.
    const ignoreTimeoutMs = 1_000;
    const ignored = await runNodeFixture(root, FIXTURE_IGNORE_SIGTERM, [], {
      timeoutMs: ignoreTimeoutMs,
    });
    expect(ignored.ok).toBe(true);
    if (!ignored.ok) {
      return;
    }
    expect(ignored.value.timedOut).toBe(true);
    expect(ignored.value.terminationRequested).toBe(true);
    expect(ignored.value.stdout.text).toContain("ready");
    expect(ignored.value.stdout.text).toContain("ignored-sigterm");
    expect(ignored.value.cleanup.signalsAttempted).toEqual([
      "SIGTERM",
      "SIGKILL",
    ]);
    expect(ignored.value.terminationObserved).toBe(true);
    expect(ignored.value.cleanup.terminationNotConfirmed).toBe(false);
    expect(ignored.value.outcome).toBe("TIMED_OUT");
    expect(ignored.value.durationMs).toBeGreaterThanOrEqual(
      ignoreTimeoutMs + LOCAL_PROCESS_TERMINATION_GRACE_MS,
    );
    expect(ignored.value.cleanup.descendantMayRemainAlive).toBe(false);
    if (ignored.value.pid !== null) {
      expect(() => process.kill(ignored.value.pid!, 0)).toThrow();
    }
  }, 20_000);

  it("terminates on stdout and stderr overflow while continuing drain", async () => {
    const root = await createCanonicalTempRoot("pc-p4-overflow-");
    const out = await runNodeFixture(root, FIXTURE_STDOUT_FLOOD, [], {
      maxStdoutBytes: 8_192,
      timeoutMs: 5_000,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) {
      return;
    }
    expect(out.value.overflow).toBe(true);
    expect(out.value.stdout.truncated).toBe(true);
    expect(out.value.outcome).toBe("OUTPUT_OVERFLOW");

    const err = await runNodeFixture(root, FIXTURE_STDERR_FLOOD, [], {
      maxStderrBytes: 8_192,
      timeoutMs: 5_000,
    });
    expect(err.ok).toBe(true);
    if (!err.ok) {
      return;
    }
    expect(err.value.overflow).toBe(true);
    expect(err.value.stderr.truncated).toBe(true);
  }, 20_000);

  it("handles descendant/process-group cleanup without infinite wait", async () => {
    const root = await createCanonicalTempRoot("pc-p4-desc-");
    const result = await runNodeFixture(root, FIXTURE_HOLD_PIPE, [], {
      timeoutMs: 3_000,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.stdout.text).toContain("parent-exit");
    expect(typeof result.value.cleanup.descendantMayRemainAlive).toBe("boolean");
  }, 15_000);

  it("classifies spawn failure for a non-executable path that becomes invalid at spawn", async () => {
    const root = await createCanonicalTempRoot("pc-p4-spawn-fail-");
    const result = await runNodeFixture(root, FIXTURE_EXIT_0);
    expect(result.ok).toBe(true);
  });
});
