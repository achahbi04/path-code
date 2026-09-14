#!/usr/bin/env node
/**
 * Create disposable polyglot acceptance fixtures with intentional bugs.
 * Usage: node docs/reports/g9-evidence/make-polyglot-fixtures.mjs
 */
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(fileURLToPath(new URL("live-repos", import.meta.url)));

function gitInit(dir) {
  spawnSync("git", ["init", "-b", "main"], { cwd: dir, encoding: "utf8" });
  spawnSync("git", ["add", "-A"], { cwd: dir, encoding: "utf8" });
  spawnSync(
    "git",
    ["-c", "user.email=g9@path.local", "-c", "user.name=g9", "commit", "-m", "init broken accept"],
    { cwd: dir, encoding: "utf8" },
  );
}

function write(dir, rel, body) {
  const p = join(dir, rel);
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, body);
}

// ── JS/TS ──────────────────────────────────────────────────────────────────
{
  const dir = join(root, "js-accept");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  write(
    dir,
    "package.json",
    JSON.stringify(
      {
        name: "g9-js-accept",
        private: true,
        type: "module",
        scripts: { test: "node --test test/add.test.js" },
      },
      null,
      2,
    ) + "\n",
  );
  write(
    dir,
    "src/add.js",
    `/** Intentionally wrong for JS live acceptance. */\nexport function add(a, b) {\n  return a - b;\n}\n`,
  );
  write(
    dir,
    "test/add.test.js",
    `import test from "node:test";\nimport assert from "node:assert/strict";\nimport { add } from "../src/add.js";\ntest("add", () => {\n  assert.equal(add(2, 2), 4);\n});\n`,
  );
  write(dir, "jsconfig.json", JSON.stringify({ compilerOptions: { checkJs: true } }, null, 2) + "\n");
  gitInit(dir);
}

// ── Python ─────────────────────────────────────────────────────────────────
{
  const dir = join(root, "py-accept");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "tests"), { recursive: true });
  write(
    dir,
    "pyproject.toml",
    `[project]\nname = "g9-py-accept"\nversion = "0.1.0"\nrequires-python = ">=3.10"\n\n[tool.pytest.ini_options]\npythonpath = ["."]\n`,
  );
  write(
    dir,
    "g9_py_accept/__init__.py",
    `"""Intentionally wrong mul for Python live acceptance."""\ndef mul(a: int, b: int) -> int:\n    return a + b\n`,
  );
  write(
    dir,
    "tests/test_mul.py",
    `from g9_py_accept import mul\n\ndef test_mul():\n    assert mul(3, 4) == 12\n`,
  );
  gitInit(dir);
}

// ── Go ─────────────────────────────────────────────────────────────────────
{
  const dir = join(root, "go-accept");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  write(dir, "go.mod", "module g9.go.accept\n\ngo 1.22\n");
  write(
    dir,
    "add.go",
    `package accept\n\n// Add is intentionally wrong for Go live acceptance.\nfunc Add(a, b int) int {\n\treturn a - b\n}\n`,
  );
  write(
    dir,
    "add_test.go",
    `package accept\n\nimport "testing"\n\nfunc TestAdd(t *testing.T) {\n\tif Add(2, 2) != 4 {\n\t\tt.Fatalf("Add(2,2)=%d want 4", Add(2, 2))\n\t}\n}\n`,
  );
  gitInit(dir);
}

// ── C ──────────────────────────────────────────────────────────────────────
{
  const dir = join(root, "c-accept");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  write(
    dir,
    "add.c",
    `/* Intentionally wrong for C live acceptance. */\nint add(int a, int b) {\n  return a - b;\n}\n`,
  );
  write(
    dir,
    "test_add.c",
    `#include <stdio.h>\n#include <stdlib.h>\nint add(int a, int b);\nint main(void) {\n  if (add(2, 2) != 4) {\n    fprintf(stderr, "add failed\\n");\n    return 1;\n  }\n  return 0;\n}\n`,
  );
  write(
    dir,
    "Makefile",
    `CC ?= cc\n.PHONY: test\ntest:\n\t$(CC) -o test_add add.c test_add.c && ./test_add\n`,
  );
  gitInit(dir);
}

// ── .NET / C# ──────────────────────────────────────────────────────────────
{
  const dir = join(root, "csharp-accept");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  write(
    dir,
    "G9CsAccept.csproj",
    `<Project Sdk="Microsoft.NET.Sdk">\n  <PropertyGroup>\n    <TargetFramework>net8.0</TargetFramework>\n    <IsPackable>false</IsPackable>\n    <Nullable>enable</Nullable>\n  </PropertyGroup>\n  <ItemGroup>\n    <PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.11.1" />\n    <PackageReference Include="xunit" Version="2.9.2" />\n    <PackageReference Include="xunit.runner.visualstudio" Version="2.8.2" />\n  </ItemGroup>\n</Project>\n`,
  );
  write(
    dir,
    "Math.cs",
    `namespace G9CsAccept;\n\npublic static class MathOps\n{\n    // Intentionally wrong for C# live acceptance.\n    public static int Mul(int a, int b) => a + b;\n}\n`,
  );
  write(
    dir,
    "MathTests.cs",
    `using Xunit;\n\nnamespace G9CsAccept;\n\npublic class MathTests\n{\n    [Fact]\n    public void Mul_works()\n    {\n        Assert.Equal(12, MathOps.Mul(3, 4));\n    }\n}\n`,
  );
  gitInit(dir);
}

// ── SCIP mono: add tsconfig + intentional cross-package bug + test ─────────
{
  const dir = join(root, "scip-mono");
  write(
    dir,
    "tsconfig.json",
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          strict: true,
          skipLibCheck: true,
          noEmit: true,
        },
        include: ["packages/**/*.ts"],
      },
      null,
      2,
    ) + "\n",
  );
  write(
    dir,
    "packages/a/index.ts",
    `/** Shared token helper — intentionally returns wrong prefix for SCIP live engineering. */\nexport function tokenPrefix(name: string): string {\n  return "bad:" + name;\n}\nexport function helloA(): string {\n  return "a";\n}\n`,
  );
  write(
    dir,
    "packages/b/index.ts",
    `import { helloA, tokenPrefix } from "a";\nexport function helloB(): string {\n  return helloA() + "b";\n}\nexport function authHeader(user: string): string {\n  return tokenPrefix(user);\n}\n`,
  );
  write(
    dir,
    "packages/a/package.json",
    JSON.stringify({ name: "a", type: "module", main: "index.ts" }, null, 2) + "\n",
  );
  write(
    dir,
    "packages/b/package.json",
    JSON.stringify(
      { name: "b", type: "module", main: "index.ts", dependencies: { a: "workspace:*" } },
      null,
      2,
    ) + "\n",
  );
  write(
    dir,
    "package.json",
    JSON.stringify(
      {
        name: "g9-scip-mono",
        private: true,
        scripts: {
          test: "node --import tsx --test packages/b/auth.test.ts",
          typecheck: "tsc -p tsconfig.json --noEmit",
        },
        devDependencies: { tsx: "^4.19.0", typescript: "^5.6.0" },
      },
      null,
      2,
    ) + "\n",
  );
  write(
    dir,
    "packages/b/auth.test.ts",
    `import test from "node:test";\nimport assert from "node:assert/strict";\nimport { authHeader } from "./index.ts";\ntest("authHeader uses correct token prefix", () => {\n  assert.equal(authHeader("alice"), "tok:alice");\n});\n`,
  );
  if (!existsSync(join(dir, ".git"))) gitInit(dir);
  else {
    spawnSync("git", ["add", "-A"], { cwd: dir, encoding: "utf8" });
    spawnSync(
      "git",
      ["-c", "user.email=g9@path.local", "-c", "user.name=g9", "commit", "-m", "broken tokenPrefix for scip live"],
      { cwd: dir, encoding: "utf8" },
    );
  }
}

// ── compose-svc engineering interaction ────────────────────────────────────
{
  const dir = join(root, "compose-svc");
  write(
    dir,
    "package.json",
    JSON.stringify(
      {
        name: "g9-compose-svc",
        private: true,
        type: "module",
        scripts: { test: "node --test test/redis.test.js" },
      },
      null,
      2,
    ) + "\n",
  );
  write(
    dir,
    "src/ping.js",
    `/** Intentionally returns PONGX so engineering must fix after redis is up. */\nexport function expectedPong() {\n  return "PONGX";\n}\n`,
  );
  write(
    dir,
    "test/redis.test.js",
    `import test from "node:test";\nimport assert from "node:assert/strict";\nimport net from "node:net";\nimport { expectedPong } from "../src/ping.js";\n\nfunction redisPing(host = "127.0.0.1", port = 6379) {\n  return new Promise((resolve, reject) => {\n    const s = net.createConnection({ host, port }, () => {\n      s.write("*1\\r\\n$4\\r\\nPING\\r\\n");\n    });\n    let buf = "";\n    s.on("data", (d) => {\n      buf += d.toString("utf8");\n      if (buf.includes("\\n")) {\n        s.end();\n        resolve(buf.trim());\n      }\n    });\n    s.on("error", reject);\n    s.setTimeout(5000, () => {\n      s.destroy();\n      reject(new Error("redis timeout"));\n    });\n  });\n}\n\ntest("redis PING matches expectedPong", async () => {\n  const port = Number(process.env.REDIS_PORT || 16379);\n  const reply = await redisPing("127.0.0.1", port);\n  assert.match(reply, /PONG/);\n  assert.equal(expectedPong(), "PONG");\n});\n`,
  );
  write(
    dir,
    "compose.yaml",
    `services:\n  redis:\n    image: redis:7-alpine\n    ports:\n      - "16379:6379"\n    command: ["redis-server", "--save", "", "--appendonly", "no"]\n`,
  );
  if (!existsSync(join(dir, ".git"))) gitInit(dir);
  else {
    spawnSync("git", ["add", "-A"], { cwd: dir, encoding: "utf8" });
    spawnSync(
      "git",
      ["-c", "user.email=g9@path.local", "-c", "user.name=g9", "commit", "-m", "compose svc accept fixture"],
      { cwd: dir, encoding: "utf8" },
    );
  }
}

console.log(JSON.stringify({ ok: true, root }, null, 2));
