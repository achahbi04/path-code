import { mkdir, mkdtemp, realpath, rm, symlink, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createWorkspaceBoundary } from "../../src/workspace/index.js";

const fixtures: string[] = [];

async function createCanonicalTempRoot(prefix: string): Promise<string> {
  const lexical = await mkdtemp(path.join(tmpdir(), prefix));
  // CRITICAL: derive all expectations from the physical root (/var → /private/var on macOS).
  const physical = await realpath(lexical);
  fixtures.push(physical);
  return physical;
}

afterEach(async () => {
  while (fixtures.length > 0) {
    const dir = fixtures.pop();
    if (dir === undefined) {
      continue;
    }
    await rm(dir, { recursive: true, force: true });
  }
});

describe("createWorkspaceBoundary", () => {
  it("creates a boundary for an existing physical directory", async () => {
    const root = await createCanonicalTempRoot("path-code-ws-");
    const result = await createWorkspaceBoundary(root);
    expect(result.ok).toBe(true);
  });

  it("rejects a missing root with PATH_NOT_FOUND", async () => {
    const root = await createCanonicalTempRoot("path-code-ws-");
    const missing = path.join(root, "does-not-exist");
    const result = await createWorkspaceBoundary(missing);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("PATH_NOT_FOUND");
    }
  });

  it("rejects empty root with INVALID_PATH_INPUT", async () => {
    const result = await createWorkspaceBoundary("");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_PATH_INPUT");
    }
  });

  it("rejects whitespace root with INVALID_PATH_INPUT", async () => {
    const result = await createWorkspaceBoundary("   ");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_PATH_INPUT");
    }
  });

  it("rejects null-byte root with INVALID_PATH_INPUT", async () => {
    const result = await createWorkspaceBoundary("/tmp/path\0code");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_PATH_INPUT");
    }
  });

  it("uses the physical target when the root is supplied through a symlink", async () => {
    const physicalRoot = await createCanonicalTempRoot("path-code-ws-phys-");
    const holder = await createCanonicalTempRoot("path-code-ws-linkholder-");
    const linkPath = path.join(holder, "root-link");
    await symlink(physicalRoot, linkPath);

    const boundaryResult = await createWorkspaceBoundary(linkPath);
    expect(boundaryResult.ok).toBe(true);
    if (!boundaryResult.ok) {
      return;
    }

    const filePath = path.join(physicalRoot, "inside.txt");
    await writeFile(filePath, "ok");

    const canonical = await boundaryResult.value.canonicalize("inside.txt");
    expect(canonical.ok).toBe(true);
    if (canonical.ok) {
      expect(canonical.value).toBe(await realpath(filePath));
      expect(canonical.value.startsWith(physicalRoot)).toBe(true);
    }
  });
});

describe("WorkspaceBoundary.canonicalize", () => {
  it("canonicalizes an existing absolute path inside the workspace", async () => {
    const root = await createCanonicalTempRoot("path-code-ws-");
    const child = path.join(root, "a.txt");
    await writeFile(child, "x");

    const boundaryResult = await createWorkspaceBoundary(root);
    expect(boundaryResult.ok).toBe(true);
    if (!boundaryResult.ok) {
      return;
    }

    const result = await boundaryResult.value.canonicalize(child);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(await realpath(child));
    }
  });

  it("canonicalizes an existing relative path against the workspace root", async () => {
    const root = await createCanonicalTempRoot("path-code-ws-");
    await mkdir(path.join(root, "sub"));
    const child = path.join(root, "sub", "b.txt");
    await writeFile(child, "x");

    const boundaryResult = await createWorkspaceBoundary(root);
    expect(boundaryResult.ok).toBe(true);
    if (!boundaryResult.ok) {
      return;
    }

    const previousCwd = process.cwd();
    const other = await createCanonicalTempRoot("path-code-ws-cwd-");
    try {
      process.chdir(other);
      const result = await boundaryResult.value.canonicalize("sub/b.txt");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(await realpath(child));
      }
    } finally {
      process.chdir(previousCwd);
    }
  });

  it('canonicalizes "." to the physical workspace root', async () => {
    const root = await createCanonicalTempRoot("path-code-ws-");
    const boundaryResult = await createWorkspaceBoundary(root);
    expect(boundaryResult.ok).toBe(true);
    if (!boundaryResult.ok) {
      return;
    }

    const result = await boundaryResult.value.canonicalize(".");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(root);
    }
  });

  it("rejects empty input", async () => {
    const root = await createCanonicalTempRoot("path-code-ws-");
    const boundaryResult = await createWorkspaceBoundary(root);
    expect(boundaryResult.ok).toBe(true);
    if (!boundaryResult.ok) {
      return;
    }
    const result = await boundaryResult.value.canonicalize("");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_PATH_INPUT");
    }
  });

  it("rejects whitespace input", async () => {
    const root = await createCanonicalTempRoot("path-code-ws-");
    const boundaryResult = await createWorkspaceBoundary(root);
    expect(boundaryResult.ok).toBe(true);
    if (!boundaryResult.ok) {
      return;
    }
    const result = await boundaryResult.value.canonicalize("  \t");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_PATH_INPUT");
    }
  });

  it("rejects null-byte input", async () => {
    const root = await createCanonicalTempRoot("path-code-ws-");
    const boundaryResult = await createWorkspaceBoundary(root);
    expect(boundaryResult.ok).toBe(true);
    if (!boundaryResult.ok) {
      return;
    }
    const result = await boundaryResult.value.canonicalize("a\0b");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_PATH_INPUT");
    }
  });

  it("rejects missing targets with PATH_NOT_FOUND", async () => {
    const root = await createCanonicalTempRoot("path-code-ws-");
    const boundaryResult = await createWorkspaceBoundary(root);
    expect(boundaryResult.ok).toBe(true);
    if (!boundaryResult.ok) {
      return;
    }
    const result = await boundaryResult.value.canonicalize("missing.txt");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("PATH_NOT_FOUND");
    }
  });

  it("maps permission failures to CANONICALIZATION_FAILED rather than PATH_NOT_FOUND", async () => {
    const root = await createCanonicalTempRoot("path-code-ws-");
    const lockedDir = path.join(root, "locked");
    await mkdir(lockedDir);
    const lockedFile = path.join(lockedDir, "secret.txt");
    await writeFile(lockedFile, "secret");
    await chmod(lockedDir, 0);

    try {
      const boundaryResult = await createWorkspaceBoundary(root);
      expect(boundaryResult.ok).toBe(true);
      if (!boundaryResult.ok) {
        return;
      }

      const result = await boundaryResult.value.canonicalize("locked/secret.txt");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("CANONICALIZATION_FAILED");
        expect(result.error.code).not.toBe("PATH_NOT_FOUND");
        if (result.error.details !== undefined) {
          expect(result.error.details["fsCode"]).toBe("EACCES");
        }
      }
    } finally {
      await chmod(lockedDir, 0o755);
    }
  });

  it("rejects parent traversal escapes", async () => {
    const root = await createCanonicalTempRoot("path-code-ws-");
    const boundaryResult = await createWorkspaceBoundary(root);
    expect(boundaryResult.ok).toBe(true);
    if (!boundaryResult.ok) {
      return;
    }

    const result = await boundaryResult.value.canonicalize("../../etc/passwd");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // May be PATH_NOT_FOUND if target missing, or PATH_OUTSIDE_WORKSPACE if it exists.
      expect(["PATH_OUTSIDE_WORKSPACE", "PATH_NOT_FOUND"]).toContain(
        result.error.code,
      );
    }
  });

  it("rejects absolute external paths", async () => {
    const root = await createCanonicalTempRoot("path-code-ws-");
    const outside = await createCanonicalTempRoot("path-code-ws-out-");
    const outsideFile = path.join(outside, "ext.txt");
    await writeFile(outsideFile, "x");

    const boundaryResult = await createWorkspaceBoundary(root);
    expect(boundaryResult.ok).toBe(true);
    if (!boundaryResult.ok) {
      return;
    }

    const result = await boundaryResult.value.canonicalize(outsideFile);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("PATH_OUTSIDE_WORKSPACE");
    }
  });

  it("rejects sibling-prefix collisions", async () => {
    const holder = await createCanonicalTempRoot("path-code-ws-holder-");
    const root = path.join(holder, "path-code");
    const evil = path.join(holder, "path-code-evil");
    await mkdir(root);
    await mkdir(evil);
    const evilFile = path.join(evil, "x.txt");
    await writeFile(evilFile, "x");

    const physicalRoot = await realpath(root);
    const boundaryResult = await createWorkspaceBoundary(physicalRoot);
    expect(boundaryResult.ok).toBe(true);
    if (!boundaryResult.ok) {
      return;
    }

    const result = await boundaryResult.value.canonicalize(evilFile);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("PATH_OUTSIDE_WORKSPACE");
    }
  });
});

describe("symlink security", () => {
  it("accepts an inside symlink whose physical target is inside the workspace", async () => {
    const root = await createCanonicalTempRoot("path-code-ws-");
    const target = path.join(root, "real.txt");
    await writeFile(target, "inside");
    const link = path.join(root, "link-inside");
    await symlink(target, link);

    const boundaryResult = await createWorkspaceBoundary(root);
    expect(boundaryResult.ok).toBe(true);
    if (!boundaryResult.ok) {
      return;
    }

    const result = await boundaryResult.value.canonicalize("link-inside");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(await realpath(target));
    }
  });

  it("rejects an inside symlink whose physical target is outside the workspace", async () => {
    const root = await createCanonicalTempRoot("path-code-ws-");
    const outside = await createCanonicalTempRoot("path-code-ws-out-");
    const secret = path.join(outside, "secret.txt");
    await writeFile(secret, "nope");
    const link = path.join(root, "escape");
    await symlink(secret, link);

    const boundaryResult = await createWorkspaceBoundary(root);
    expect(boundaryResult.ok).toBe(true);
    if (!boundaryResult.ok) {
      return;
    }

    const result = await boundaryResult.value.canonicalize("escape");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("PATH_OUTSIDE_WORKSPACE");
    }
  });

  it("returns the physical target as CanonicalPath, not the lexical symlink path", async () => {
    const root = await createCanonicalTempRoot("path-code-ws-");
    const target = path.join(root, "physical.txt");
    await writeFile(target, "p");
    const link = path.join(root, "alias");
    await symlink(target, link);

    const boundaryResult = await createWorkspaceBoundary(root);
    expect(boundaryResult.ok).toBe(true);
    if (!boundaryResult.ok) {
      return;
    }

    const result = await boundaryResult.value.canonicalize(link);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const physical = await realpath(target);
      expect(result.value).toBe(physical);
      expect(result.value).not.toBe(link);
    }
  });
});

describe("non-expansion (falsifiable)", () => {
  it("resolves literal ~/file inside the workspace, not the user home", async () => {
    const root = await createCanonicalTempRoot("path-code-ws-");
    const tildeDir = path.join(root, "~");
    await mkdir(tildeDir);
    const file = path.join(tildeDir, "file");
    await writeFile(file, "literal-tilde");

    const boundaryResult = await createWorkspaceBoundary(root);
    expect(boundaryResult.ok).toBe(true);
    if (!boundaryResult.ok) {
      return;
    }

    const result = await boundaryResult.value.canonicalize("~/file");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(await realpath(file));
      expect(result.value.startsWith(root)).toBe(true);
      const home = process.env["HOME"];
      if (home !== undefined && home.length > 0) {
        expect(result.value.startsWith(await realpath(home))).toBe(false);
      }
    }
  });

  it("resolves literal $HOME/file inside the workspace, not process.env.HOME", async () => {
    const root = await createCanonicalTempRoot("path-code-ws-");
    const dollarHome = path.join(root, "$HOME");
    await mkdir(dollarHome);
    const file = path.join(dollarHome, "file");
    await writeFile(file, "literal-home");

    const boundaryResult = await createWorkspaceBoundary(root);
    expect(boundaryResult.ok).toBe(true);
    if (!boundaryResult.ok) {
      return;
    }

    const result = await boundaryResult.value.canonicalize("$HOME/file");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(await realpath(file));
      expect(result.value).toBe(path.join(root, "$HOME", "file"));
    }
  });

  it("resolves literal %USERPROFILE%/file on POSIX host without env expansion", async () => {
    const root = await createCanonicalTempRoot("path-code-ws-");
    const profileDir = path.join(root, "%USERPROFILE%");
    await mkdir(profileDir);
    const file = path.join(profileDir, "file");
    await writeFile(file, "literal-profile");

    const boundaryResult = await createWorkspaceBoundary(root);
    expect(boundaryResult.ok).toBe(true);
    if (!boundaryResult.ok) {
      return;
    }

    const result = await boundaryResult.value.canonicalize("%USERPROFILE%/file");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(await realpath(file));
      expect(result.value).toBe(path.join(root, "%USERPROFILE%", "file"));
    }
  });
});
