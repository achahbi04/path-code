import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProductRuntimeEnv, createBuildRuntimeManager, checkLocalEnvGitSafety } from "../../scripts/pathcode-cli/build/index.mjs";
import { startStaticPreviewServer } from "../../scripts/pathcode-cli/build/runtime/static-serve.mjs";
import { resolveSecurePreviewFile } from "../../scripts/pathcode-cli/build/runtime/secure-file.mjs";
import { startPathBuildSurface } from "../../scripts/pathcode-cli/build/surface/server.mjs";
import { createBuildRecordSkeleton, writeBuildRecord } from "../../scripts/pathcode-cli/build/record.mjs";
import { resolvePathPackageRoot } from "../../scripts/pathcode-cli/paths.mjs";

const dirs: string[] = [];
const servers: Array<{ stop: () => Promise<unknown> }> = [];
function temp(prefix: string) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
  for (const server of servers.splice(0)) await server.stop();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("P9.2A product environment", () => {
  it("allows only execution host keys and fixed start-plan values without global mutation", () => {
    const host = {
      PATH: "/usr/bin:/bin", HOME: "/tmp/home", TMPDIR: "/tmp", LANG: "C",
      OPENAI_API_KEY: "sentinel-openai", CURSOR_API_KEY: "sentinel-cursor",
      GH_TOKEN: "sentinel-gh", GITHUB_TOKEN: "sentinel-github",
      VERCEL_TOKEN: "sentinel-vercel", PATHCODE_ARBITRARY: "sentinel-path",
      ORDINARY_PARENT: "sentinel-ordinary",
    };
    const before = { ...process.env };
    const plan = { kind: "spawn", port: 4321, env: { PORT: "4321", HOST: "127.0.0.1", HOSTNAME: "127.0.0.1" } };
    const result = createProductRuntimeEnv(plan, host);
    expect(result).toMatchObject({ PATH: "/usr/bin:/bin", HOME: "/tmp/home", TMPDIR: "/tmp", PORT: "4321", HOST: "127.0.0.1", HOSTNAME: "127.0.0.1" });
    for (const key of ["OPENAI_API_KEY", "CURSOR_API_KEY", "GH_TOKEN", "GITHUB_TOKEN", "VERCEL_TOKEN", "PATHCODE_ARBITRARY", "ORDINARY_PARENT"]) {
      expect(result).not.toHaveProperty(key);
    }
    expect(process.env).toEqual(before);
    expect(() => createProductRuntimeEnv({ ...plan, env: { ...plan.env, OPENAI_API_KEY: "x" } }, host)).toThrow(/outside its authority/);
    expect(createProductRuntimeEnv({ kind: "static", port: 4321, env: {} }, host)).not.toHaveProperty("PORT");
  });

  it("starts a real product child with the bounded environment and never returns its printed output", async () => {
    const root = temp("p9-product-child-");
    const runtimeRoot = temp("p9-product-runtime-");
    writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { start: "node server.mjs" } }));
    writeFileSync(join(root, "server.mjs"), `
      import { createServer } from 'node:http';
      console.error('OUTPUT_SENTINEL');
      createServer((req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          port: process.env.PORT, host: process.env.HOST, hostname: process.env.HOSTNAME,
          openai: process.env.OPENAI_API_KEY, cursor: process.env.CURSOR_API_KEY,
          gh: process.env.GH_TOKEN, github: process.env.GITHUB_TOKEN,
          vercel: process.env.VERCEL_TOKEN, pathcode: process.env.PATHCODE_SECURITY_SENTINEL,
          other: process.env.P9_PARENT_SENTINEL,
        }));
      }).listen(Number(process.env.PORT), process.env.HOST);
    `);
    const keys = ["OPENAI_API_KEY", "CURSOR_API_KEY", "GH_TOKEN", "GITHUB_TOKEN", "VERCEL_TOKEN", "PATHCODE_SECURITY_SENTINEL", "P9_PARENT_SENTINEL"];
    const old = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    const manager = createBuildRuntimeManager({ runtimeRoot });
    try {
      for (const key of keys) process.env[key] = `SENTINEL_${key}`;
      const started = await manager.start("p9-product", root);
      expect(started.ok).toBe(true);
      if (!started.ok) return;
      const response = await fetch(started.runtime.url);
      expect(await response.json()).toEqual({
        port: String(started.runtime.port), host: "127.0.0.1", hostname: "127.0.0.1",
      });
      expect(JSON.stringify(started)).not.toContain("OUTPUT_SENTINEL");
      expect(JSON.stringify(await manager.inspect("p9-product"))).not.toContain("OUTPUT_SENTINEL");
      expect(readFileSync(join(runtimeRoot, "metadata", "build-runtimes", "p9-product.runtime.json"), "utf8")).not.toContain("OUTPUT_SENTINEL");
    } finally {
      await manager.stopAll();
      for (const key of keys) {
        if (old[key] == null) delete process.env[key];
        else process.env[key] = old[key];
      }
    }
  }, 30_000);
});

describe("P9.2A shared preview file authority", () => {
  function files() {
    const root = temp("p9-preview-");
    const outside = temp("p9-outside-");
    mkdirSync(join(root, "nested"));
    writeFileSync(join(root, "index.html"), "safe page");
    writeFileSync(join(root, ".env"), "SECRET_SENTINEL");
    writeFileSync(join(root, ".env.local"), "LOCAL_SECRET_SENTINEL");
    writeFileSync(join(root, "nested", ".env.production"), "NESTED_SECRET_SENTINEL");
    writeFileSync(join(root, ".env.example"), "EXAMPLE_ONLY");
    writeFileSync(join(outside, "outside.txt"), "OUTSIDE_SECRET_SENTINEL");
    symlinkSync(join(outside, "outside.txt"), join(root, "escape.txt"));
    return root;
  }
  it("serves ordinary files and the existing .env.example exception, but refuses secrets and symlink escape", async () => {
    const root = files();
    const server = await startStaticPreviewServer(root, 0);
    servers.push(server);
    for (const [path, status, body] of [
      ["/index.html", 200, "safe page"], ["/.env.example", 200, "EXAMPLE_ONLY"],
      ["/.env", 403, "SECRET_SENTINEL"], ["/.env.local", 403, "LOCAL_SECRET_SENTINEL"],
      ["/nested/.env.production", 403, "NESTED_SECRET_SENTINEL"],
      ["/escape.txt", 403, "OUTSIDE_SECRET_SENTINEL"],
    ] as const) {
      const response = await fetch(new URL(path, server.url));
      expect(response.status).toBe(status);
      expect((await response.text()).includes(body)).toBe(status === 200);
    }
    expect(resolveSecurePreviewFile(root, "/../outside.txt")).toMatchObject({ ok: false, status: 403 });
  });

  it("applies the same guard to Builder candidate preview", async () => {
    const root = files();
    const runtimeRoot = temp("p9-candidate-runtime-");
    const projectRoot = temp("p9-candidate-project-");
    const build = createBuildRecordSkeleton({ outcome: "Preview", buildId: "p9-candidate" });
    build.projectBindings = [{ bindingId: "binding", projectRoot }];
    build.pendingCandidate = { status: "pending", worktreePath: root, sourceSha: "abc123" };
    writeBuildRecord(runtimeRoot, build);
    const surface = await startPathBuildSurface({
      packageRoot: resolvePathPackageRoot(), runtimeRoot, openBrowser: false,
      fakeMode: true, autoLoop: false, port: 0,
    });
    servers.push(surface);
    for (const [path, status, body] of [
      ["index.html", 200, "safe page"], [".env.example", 200, "EXAMPLE_ONLY"],
      [".env.local", 403, "LOCAL_SECRET_SENTINEL"],
      ["nested/.env.production", 403, "NESTED_SECRET_SENTINEL"],
      ["escape.txt", 403, "OUTSIDE_SECRET_SENTINEL"],
    ] as const) {
      const response = await fetch(new URL(`/preview-candidate/p9-candidate/${path}`, surface.url));
      expect(response.status).toBe(status);
      expect((await response.text()).includes(body)).toBe(status === 200);
    }
  }, 30_000);
});

describe("P9.2A local Git safety observation", () => {
  function repo() {
    const root = temp("p9-local-git-");
    const git = (args: string[]) => spawnSync("git", args, { cwd: root, encoding: "utf8" });
    expect(git(["init", "-q"]).status).toBe(0);
    return { root, git };
  }
  it("rejects tracked, unignored and symlinked .env.local without reading or changing its content", () => {
    const { root, git } = repo();
    const file = join(root, ".env.local");
    writeFileSync(file, "SECRET_SENTINEL");
    expect(checkLocalEnvGitSafety(root)).toMatchObject({ ok: false, code: "LOCAL_ENV_NOT_IGNORED" });
    writeFileSync(join(root, ".gitignore"), ".env.local\n");
    expect(checkLocalEnvGitSafety(root)).toMatchObject({ ok: true, gitSafety: "ignored_untracked" });
    expect(git(["add", "-f", ".env.local"]).status).toBe(0);
    expect(checkLocalEnvGitSafety(root)).toMatchObject({ ok: false, code: "LOCAL_ENV_TRACKED" });
    expect(readFileSync(join(root, ".gitignore"), "utf8")).toBe(".env.local\n");
    expect(git(["ls-files", "--", ".gitignore"]).stdout).toBe("");
    rmSync(file);
    symlinkSync(join(temp("p9-local-escape-"), "missing"), file);
    expect(checkLocalEnvGitSafety(root)).toMatchObject({ ok: false, code: "LOCAL_ENV_PATH_UNSAFE" });
  });
});
