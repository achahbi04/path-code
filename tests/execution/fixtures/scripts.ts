/**
 * Fixture scripts for Phase 4 local-process tests.
 * Invoked as: process.execPath <fixture.js> [args...]
 */

export const FIXTURE_EXIT_0 = String.raw`
process.exit(0);
`;

export const FIXTURE_EXIT_2 = String.raw`
process.exit(2);
`;

export const FIXTURE_ECHO_ARGV = String.raw`
process.stdout.write(JSON.stringify(process.argv.slice(2)));
`;

export const FIXTURE_SLEEP = String.raw`
const ms = Number(process.argv[2] ?? "5000");
setTimeout(() => process.exit(0), ms);
`;

export const FIXTURE_IGNORE_SIGTERM = String.raw`
process.on("SIGTERM", () => {
  process.stdout.write("ignored-sigterm\n");
});
setInterval(() => {}, 1000);
`;

export const FIXTURE_STDOUT_FLOOD = String.raw`
const chunk = Buffer.alloc(64 * 1024, 0x61);
for (;;) {
  process.stdout.write(chunk);
}
`;

export const FIXTURE_STDERR_FLOOD = String.raw`
const chunk = Buffer.alloc(64 * 1024, 0x62);
for (;;) {
  process.stderr.write(chunk);
}
`;

export const FIXTURE_PRINT_ENV = String.raw`
const keys = process.argv.slice(2);
const out = {};
for (const key of keys) {
  out[key] = process.env[key] ?? null;
}
process.stdout.write(JSON.stringify(out));
`;

export const FIXTURE_HOLD_PIPE = String.raw`
import { spawn } from "node:child_process";
const child = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], {
  stdio: ["ignore", "pipe", "ignore"],
  detached: true,
});
child.unref();
process.stdout.write("parent-exit\n");
process.exit(0);
`;

export const FIXTURE_STDOUT_HELLO = String.raw`
process.stdout.write("hello-out");
process.stderr.write("hello-err");
process.exit(0);
`;
