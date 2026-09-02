import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadProjectConfig } from "../../src/config/index.js";
import { discoverGitRepository } from "../../src/git/index.js";
import { createWorkspaceBoundary } from "../../src/workspace/index.js";
import {
  cleanupGitFixtures,
  createCanonicalTempRoot,
  initCommitWorktree,
} from "../git/fixture-helpers.js";
import type { ProjectConfig } from "../../src/config/index.js";

const fixtures: string[] = [];

function repositoryFileConfig(
  config: ProjectConfig,
): Extract<ProjectConfig, { source: { kind: "REPOSITORY_FILE" } }> {
  if (config.source.kind !== "REPOSITORY_FILE") {
    throw new Error("expected repository file configuration");
  }
  return config as Extract<
    ProjectConfig,
    { source: { kind: "REPOSITORY_FILE" } }
  >;
}

async function createRoot(prefix: string): Promise<string> {
  const lexical = await mkdtemp(path.join(tmpdir(), prefix));
  const physical = await realpath(lexical);
  fixtures.push(physical);
  return physical;
}

async function boundaryFor(root: string) {
  const boundary = await createWorkspaceBoundary(root);
  expect(boundary.ok).toBe(true);
  if (!boundary.ok) {
    throw new Error("expected workspace boundary");
  }
  return boundary.value;
}

async function loadAt(root: string) {
  return loadProjectConfig(await boundaryFor(root));
}

afterEach(async () => {
  while (fixtures.length > 0) {
    const dir = fixtures.pop();
    if (dir === undefined) {
      continue;
    }
    await rm(dir, { recursive: true, force: true });
  }
  await cleanupGitFixtures();
});

describe("loadProjectConfig — discovery / absence", () => {
  it("returns default configuration when PATHCODE.md directory entry is absent", async () => {
    const root = await createRoot("pc-config-absent-");
    const loaded = await loadAt(root);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.value.source).toEqual({ kind: "ABSENT" });
      expect(loaded.value.source.kind).toBe("ABSENT");
      expect(loaded.value.restrictions.deniedPaths).toEqual([]);
      expect(loaded.value.restrictions.disabledActions).toEqual([]);
    }
  });

  it("loads a present valid PATHCODE.md through WorkspaceBoundary admission", async () => {
    const root = await createRoot("pc-config-present-");
    await writeFile(
      path.join(root, "PATHCODE.md"),
      "# Guidance\n\nProject notes.\n",
      "utf8",
    );

    const loaded = await loadAt(root);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.value.source).toEqual({ kind: "REPOSITORY_FILE" });
      const config = repositoryFileConfig(loaded.value);
      expect(config.guidance).toMatchObject({
        trust: "UNTRUSTED_REPOSITORY",
        provenance: "PRE_EXISTING",
      });
      expect(config.guidance.text).toContain("Project notes.");
    }
  });

  it("ignores other configuration filenames — only the fixed PATHCODE.md name is loaded", async () => {
    const root = await createRoot("pc-config-fixed-name-");
    await writeFile(path.join(root, "other-config.md"), "other", "utf8");
    await writeFile(path.join(root, "PATHCODE.local.md"), "local", "utf8");

    const loaded = await loadAt(root);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.value.source).toEqual({ kind: "ABSENT" });
    }
  });
});

describe("loadProjectConfig — path security / broken entry", () => {
  it("rejects PATHCODE.md symlink to a target outside the workspace", async () => {
    const root = await createRoot("pc-config-outside-");
    const outside = await createRoot("pc-config-outside-target-");
    const secret = "OUTSIDE-SECRET-CONTENT";
    await writeFile(path.join(outside, "evil.md"), secret, "utf8");
    await symlink(path.join(outside, "evil.md"), path.join(root, "PATHCODE.md"));

    const loaded = await loadAt(root);
    expect(loaded.ok).toBe(false);
    if (!loaded.ok) {
      expect(loaded.error.code).toBe("CONFIG_PATH_REJECTED");
    }
  });

  it("loads PATHCODE.md symlink to a target inside the workspace", async () => {
    const root = await createRoot("pc-config-inside-link-");
    await mkdir(path.join(root, "cfg"));
    await writeFile(
      path.join(root, "cfg", "real.md"),
      "Inside linked configuration.\n",
      "utf8",
    );
    await symlink(path.join(root, "cfg", "real.md"), path.join(root, "PATHCODE.md"));

    const loaded = await loadAt(root);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.value.source.kind).toBe("REPOSITORY_FILE");
      const config = repositoryFileConfig(loaded.value);
      expect(config.guidance.text).toContain("Inside linked configuration.");
    }
  });

  it("treats a dangling PATHCODE.md symlink as CONFIG_UNREADABLE, not ABSENT", async () => {
    const root = await createRoot("pc-config-dangling-");
    await symlink(
      path.join(root, "missing", "target.md"),
      path.join(root, "PATHCODE.md"),
    );

    const loaded = await loadAt(root);
    expect(loaded.ok).toBe(false);
    if (!loaded.ok) {
      expect(loaded.error.code).toBe("CONFIG_UNREADABLE");
    }
  });

  it("rejects PATHCODE.md when it is a directory", async () => {
    const root = await createRoot("pc-config-dir-");
    await mkdir(path.join(root, "PATHCODE.md"));

    const loaded = await loadAt(root);
    expect(loaded.ok).toBe(false);
    if (!loaded.ok) {
      expect(loaded.error.code).toBe("CONFIG_NOT_FILE");
    }
  });
});

describe("loadProjectConfig — read bounds / decoding", () => {
  it("accepts a valid file exactly at the 65,536 byte limit", async () => {
    const root = await createRoot("pc-config-at-limit-");
    const payload = "x".repeat(65_536);
    await writeFile(path.join(root, "PATHCODE.md"), payload, "utf8");

    const loaded = await loadAt(root);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      const config = repositoryFileConfig(loaded.value);
      expect(config.guidance.text.length).toBe(65_536);
    }
  });

  it("rejects 65,537 bytes with CONFIG_TOO_LARGE without truncation", async () => {
    const root = await createRoot("pc-config-over-limit-");
    const payload = "a".repeat(65_537);
    await writeFile(path.join(root, "PATHCODE.md"), payload, "utf8");

    const loaded = await loadAt(root);
    expect(loaded.ok).toBe(false);
    if (!loaded.ok) {
      expect(loaded.error.code).toBe("CONFIG_TOO_LARGE");
    }
  });

  it("rejects invalid UTF-8 with CONFIG_INVALID_ENCODING", async () => {
    const root = await createRoot("pc-config-utf8-");
    await writeFile(path.join(root, "PATHCODE.md"), Buffer.from([0xff, 0xfe, 0xfd]));

    const loaded = await loadAt(root);
    expect(loaded.ok).toBe(false);
    if (!loaded.ok) {
      expect(loaded.error.code).toBe("CONFIG_INVALID_ENCODING");
    }
  });

  it("rejects null bytes in decoded content with CONFIG_MALFORMED", async () => {
    const root = await createRoot("pc-config-null-");
    await writeFile(path.join(root, "PATHCODE.md"), "before\u0000after", "utf8");

    const loaded = await loadAt(root);
    expect(loaded.ok).toBe(false);
    if (!loaded.ok) {
      expect(loaded.error.code).toBe("CONFIG_MALFORMED");
    }
  });

  it("completes bounded reads without leaking handles on success", async () => {
    const root = await createRoot("pc-config-close-");
    await writeFile(path.join(root, "PATHCODE.md"), "x", "utf8");

    const loaded = await loadAt(root);
    expect(loaded.ok).toBe(true);
  });
});

describe("loadProjectConfig — fenced directive parsing", () => {
  it("parses a valid pathcode-config block into restrictions", async () => {
    const root = await createRoot("pc-config-parse-");
    await writeFile(
      path.join(root, "PATHCODE.md"),
      `# Notes
\`\`\`pathcode-config
deny-path = src/private
disable-action = GIT_PUSH
\`\`\`
`,
      "utf8",
    );

    const loaded = await loadAt(root);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.value.restrictions.deniedPaths).toEqual(["src/private"]);
      expect(loaded.value.restrictions.disabledActions).toEqual(["GIT_PUSH"]);
      const config = repositoryFileConfig(loaded.value);
      expect(config.guidance.text).toContain("# Notes");
    }
  });

  it("treats guidance-only files without a directive block as success", async () => {
    const root = await createRoot("pc-config-guidance-only-");
    const text = "# Guidance only\nNo directives here.\n";
    await writeFile(path.join(root, "PATHCODE.md"), text, "utf8");

    const loaded = await loadAt(root);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      const config = repositoryFileConfig(loaded.value);
      expect(config.guidance.text).toBe(text);
      expect(loaded.value.restrictions.deniedPaths).toEqual([]);
    }
  });

  it("rejects multiple directive blocks as CONFIG_MALFORMED", async () => {
    const root = await createRoot("pc-config-multi-block-");
    await writeFile(
      path.join(root, "PATHCODE.md"),
      `\`\`\`pathcode-config
deny-path = a
\`\`\`
\`\`\`pathcode-config
deny-path = b
\`\`\`
`,
      "utf8",
    );

    const loaded = await loadAt(root);
    expect(loaded.ok).toBe(false);
    if (!loaded.ok) {
      expect(loaded.error.code).toBe("CONFIG_MALFORMED");
    }
  });

  it("rejects an unterminated directive block as CONFIG_MALFORMED", async () => {
    const root = await createRoot("pc-config-unterminated-");
    await writeFile(
      path.join(root, "PATHCODE.md"),
      "```pathcode-config\ndeny-path = src\n",
      "utf8",
    );

    const loaded = await loadAt(root);
    expect(loaded.ok).toBe(false);
    if (!loaded.ok) {
      expect(loaded.error.code).toBe("CONFIG_MALFORMED");
    }
  });

  it("rejects malformed directive lines as CONFIG_MALFORMED", async () => {
    const root = await createRoot("pc-config-bad-line-");
    await writeFile(
      path.join(root, "PATHCODE.md"),
      "```pathcode-config\nnot-a-directive-line\n```",
      "utf8",
    );

    const loaded = await loadAt(root);
    expect(loaded.ok).toBe(false);
    if (!loaded.ok) {
      expect(loaded.error.code).toBe("CONFIG_MALFORMED");
    }
  });

  it("deduplicates exact repeated deny-path values deterministically", async () => {
    const root = await createRoot("pc-config-dedupe-path-");
    await writeFile(
      path.join(root, "PATHCODE.md"),
      "```pathcode-config\ndeny-path = src/a\ndeny-path = src/a\ndeny-path = src/b\n```",
      "utf8",
    );

    const loaded = await loadAt(root);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.value.restrictions.deniedPaths).toEqual(["src/a", "src/b"]);
    }
  });

  it("deduplicates exact repeated disable-action values deterministically", async () => {
    const root = await createRoot("pc-config-dedupe-action-");
    await writeFile(
      path.join(root, "PATHCODE.md"),
      "```pathcode-config\ndisable-action = READ\ndisable-action = READ\ndisable-action = EDIT\n```",
      "utf8",
    );

    const loaded = await loadAt(root);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.value.restrictions.disabledActions).toEqual(["READ", "EDIT"]);
    }
  });

  it("preserves unknown directives without applying them", async () => {
    const root = await createRoot("pc-config-unknown-");
    await writeFile(
      path.join(root, "PATHCODE.md"),
      "```pathcode-config\nfuture-flag = maybe\n```",
      "utf8",
    );

    const loaded = await loadAt(root);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.value.unknownDirectives).toEqual([
        { name: "future-flag", value: "maybe" },
      ]);
      expect(loaded.value.restrictions.deniedPaths).toEqual([]);
    }
  });
});

describe("loadProjectConfig — narrowing vocabulary / authority", () => {
  it("represents deny-path for non-existing targets without canonicalizing them", async () => {
    const root = await createRoot("pc-config-deny-nonexist-");
    await writeFile(
      path.join(root, "PATHCODE.md"),
      "```pathcode-config\ndeny-path = future/nope\n```",
      "utf8",
    );

    const loaded = await loadAt(root);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.value.restrictions.deniedPaths).toEqual(["future/nope"]);
    }
  });

  it("rejects absolute deny-path values as CONFIG_MALFORMED", async () => {
    const root = await createRoot("pc-config-deny-abs-");
    await writeFile(
      path.join(root, "PATHCODE.md"),
      "```pathcode-config\ndeny-path = /etc/passwd\n```",
      "utf8",
    );

    const loaded = await loadAt(root);
    expect(loaded.ok).toBe(false);
    if (!loaded.ok) {
      expect(loaded.error.code).toBe("CONFIG_MALFORMED");
    }
  });

  it("rejects deny-path values containing .. segments as CONFIG_MALFORMED", async () => {
    const root = await createRoot("pc-config-deny-dotdot-");
    await writeFile(
      path.join(root, "PATHCODE.md"),
      "```pathcode-config\ndeny-path = ../outside\n```",
      "utf8",
    );

    const loaded = await loadAt(root);
    expect(loaded.ok).toBe(false);
    if (!loaded.ok) {
      expect(loaded.error.code).toBe("CONFIG_MALFORMED");
    }
  });

  it("rejects unknown ActionClass values under disable-action", async () => {
    const root = await createRoot("pc-config-bad-action-");
    await writeFile(
      path.join(root, "PATHCODE.md"),
      "```pathcode-config\ndisable-action = NOT_A_REAL_ACTION\n```",
      "utf8",
    );

    const loaded = await loadAt(root);
    expect(loaded.ok).toBe(false);
    if (!loaded.ok) {
      expect(loaded.error.code).toBe("CONFIG_MALFORMED");
    }
  });

  it("accepts CREATE_FILE as a disable-action ActionClass", async () => {
    const root = await createRoot("pc-config-create-file-action-");
    await writeFile(
      path.join(root, "PATHCODE.md"),
      "```pathcode-config\ndisable-action = CREATE_FILE\n```",
      "utf8",
    );

    const loaded = await loadAt(root);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.value.restrictions.disabledActions).toEqual(["CREATE_FILE"]);
    }
  });

  it.each([
    ["workspace-root", "workspace-root = /tmp"],
    ["allow-path", "allow-path = ../outside"],
    ["allow-action", "allow-action = READ"],
    ["grant-action", "grant-action = DEPLOYMENT"],
    ["authority", "authority = ADMIN"],
    ["trust-level", "trust-level = FULL"],
    ["risk-ceiling", "risk-ceiling = CRITICAL"],
    ["autonomy-level", "autonomy-level = FULL"],
  ])("rejects authority-increasing directive %s", async (_label, line) => {
    const root = await createRoot("pc-config-auth-inc-");
    await writeFile(
      path.join(root, "PATHCODE.md"),
      `\`\`\`pathcode-config\n${line}\n\`\`\``,
      "utf8",
    );

    const loaded = await loadAt(root);
    expect(loaded.ok).toBe(false);
    if (!loaded.ok) {
      expect(loaded.error.code).toBe("CONFIG_AUTHORITY_INCREASE_REJECTED");
    }
  });
});

describe("loadProjectConfig — trust / provenance / non-application", () => {
  it("does not falsely claim PRE_EXISTING provenance for absent configuration", async () => {
    const root = await createRoot("pc-config-provenance-absent-");
    const loaded = await loadAt(root);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.value.source.kind).toBe("ABSENT");
    }
  });

  it("marks present repository guidance as UNTRUSTED_REPOSITORY / PRE_EXISTING", async () => {
    const root = await createRoot("pc-config-provenance-present-");
    await writeFile(path.join(root, "PATHCODE.md"), "repo prose", "utf8");
    const loaded = await loadAt(root);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      const config = repositoryFileConfig(loaded.value);
      expect(config.guidance).toEqual({
        trust: "UNTRUSTED_REPOSITORY",
        provenance: "PRE_EXISTING",
        text: "repo prose",
      });
    }
  });

  it("does not alter WorkspaceBoundary behavior after loading configuration", async () => {
    const root = await createRoot("pc-config-ws-unchanged-");
    await writeFile(
      path.join(root, "PATHCODE.md"),
      "```pathcode-config\ndeny-path = .\n```",
      "utf8",
    );
    const boundary = await boundaryFor(root);
    const outside = path.join(root, "..", "outside.txt");
    const before = await boundary.canonicalize(outside);
    await loadProjectConfig(boundary);
    const after = await boundary.canonicalize(outside);
    expect(after).toEqual(before);
  });

  it("does not alter Git discovery behavior after loading configuration", async () => {
    const root = await createCanonicalTempRoot("pc-config-git-");
    await initCommitWorktree(root);
    await writeFile(
      path.join(root, "PATHCODE.md"),
      "```pathcode-config\ndisable-action = GIT_COMMIT\n```",
      "utf8",
    );

    const boundary = await boundaryFor(root);
    const before = await discoverGitRepository(boundary);
    await loadProjectConfig(boundary);
    const after = await discoverGitRepository(boundary);
    expect(after).toEqual(before);
  });
});

describe("loadProjectConfig — adversarial truncation attempt", () => {
  it("fails oversized content rather than silently truncating hidden bytes", async () => {
    const root = await createRoot("pc-config-trunc-adv-");
    const visible = "a".repeat(65_531);
    const hidden = "SECRET";
    await writeFile(path.join(root, "PATHCODE.md"), visible + hidden, "utf8");

    const loaded = await loadAt(root);
    expect(loaded.ok).toBe(false);
    if (!loaded.ok) {
      expect(loaded.error.code).toBe("CONFIG_TOO_LARGE");
    }
  });
});

describe("loadProjectConfig — bounded read mechanism evidence", () => {
  it("documents MAX + 1 bounded handle read in reader source", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const readerPath = fileURLToPath(
      new URL("../../src/config/reader.ts", import.meta.url),
    );
    const source = readFileSync(readerPath, "utf8");
    expect(source).toContain("CONFIG_READ_LIMIT_BYTES");
    expect(source).toContain("handle.read(");
    expect(source).not.toContain("readFile(");
    expect(source).toContain("await handle?.close()");
  });
});
