/**
 * Regression tests for the public-authority src lock ownership contract.
 *
 * Every case binds a disposable lock path under the OS temp dir, so these
 * tests never touch the lock the real architecture suites contend on and can
 * run in parallel with them safely.
 */

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  __lockTesting,
  createSrcLock,
} from "./public-authority-src-lock.js";

let dir: string;
let lockPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pathcode-srclock-"));
  lockPath = join(dir, "pas-src.lock");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function ownerToken(): string {
  return (JSON.parse(readFileSync(lockPath, "utf8")) as { token: string })
    .token;
}

describe("public-authority src lock — ownership contract", () => {
  it("records a complete owner while held and releases afterwards", () => {
    const withLock = createSrcLock(lockPath);
    let seen = "";
    const result = withLock(() => {
      seen = readFileSync(lockPath, "utf8");
      return "held";
    });
    expect(result).toBe("held");
    const owner = JSON.parse(seen) as { pid: number; token: string };
    expect(owner.pid).toBe(process.pid);
    expect(typeof owner.token).toBe("string");
    expect(existsSync(lockPath)).toBe(false);
  });

  it("reclaims a lock whose recorded owner has exited", () => {
    // A disposable child writes an owner record and exits, leaving the
    // artifact behind exactly as an interrupted worker would.
    const child = spawnSync(
      process.execPath,
      [
        "-e",
        `require('fs').writeFileSync(${JSON.stringify(lockPath)}, JSON.stringify({pid: process.pid, token: 'abandoned'}))`,
      ],
      { encoding: "utf8" },
    );
    expect(child.status).toBe(0);
    expect(existsSync(lockPath)).toBe(true);

    const value = createSrcLock(lockPath)(() => "reclaimed");
    expect(value).toBe("reclaimed");
    expect(existsSync(lockPath)).toBe(false);
  });

  it("does not reclaim a lock whose recorded owner is still alive", () => {
    const record = JSON.stringify({ pid: process.pid, token: "someone-else" });
    writeFileSync(lockPath, record);
    __lockTesting.reclaimIfAbandoned(lockPath, record);
    expect(existsSync(lockPath)).toBe(true);
    expect(ownerToken()).toBe("someone-else");
  });

  it("never reclaims on age alone", () => {
    const record = JSON.stringify({ pid: process.pid, token: "old-but-live" });
    writeFileSync(lockPath, record);
    // Backdate far beyond any plausible staleness window.
    utimesSync(lockPath, new Date(0), new Date(0));
    __lockTesting.reclaimIfAbandoned(lockPath, record);
    expect(existsSync(lockPath)).toBe(true);
    expect(ownerToken()).toBe("old-but-live");
  });

  it("leaves the lock alone when the record changed under the reclaimer", () => {
    writeFileSync(lockPath, JSON.stringify({ pid: 2, token: "successor" }));
    // The reclaimer observed a different, abandoned record; it must not delete
    // the successor that took the lock in the meantime.
    __lockTesting.reclaimIfAbandoned(
      lockPath,
      JSON.stringify({ pid: 999_999, token: "stale-observation" }),
    );
    expect(existsSync(lockPath)).toBe(true);
    expect(ownerToken()).toBe("successor");
  });

  it("releases only its own record and leaves a successor untouched", () => {
    createSrcLock(lockPath)(() => {
      // Simulate takeover by a live successor during the critical section.
      writeFileSync(
        lockPath,
        JSON.stringify({ pid: process.pid, token: "successor" }),
      );
    });
    expect(existsSync(lockPath)).toBe(true);
    expect(ownerToken()).toBe("successor");
  });

  it("leaves no staging files behind", () => {
    createSrcLock(lockPath)(() => undefined);
    expect(readdirSync(dir)).toEqual([]);
  });
});
