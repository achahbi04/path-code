#!/usr/bin/env node
/**
 * Terminal buffer lifecycle proof.
 *
 * Proves splash + PATH ● Code are written ONLY after ENTER_ALT (?1049h),
 * persist across idle / BLOCKED frames inside alt-screen, and that the
 * pathcode.mjs entry no longer pre-paints brand into the normal buffer.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { createInlineStudioRenderer } from "../../../../scripts/pathcode-cli/inline-studio.mjs";
import { resolvePathPackageRoot } from "../../../../scripts/pathcode-cli/paths.mjs";

const outDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolvePathPackageRoot();
mkdirSync(outDir, { recursive: true });

/** @type {Array<Record<string, unknown>>} */
const checks = [];

function stripOsc(s) {
  return String(s).replace(/\u001b\][^\u0007]*\u0007/g, "");
}

{
  /** @type {string} */
  let buf = "";
  const stdout = {
    isTTY: true,
    rows: 36,
    columns: 100,
    write(chunk) {
      buf += String(chunk);
      return true;
    },
    on() {},
    off() {},
  };
  const r = createInlineStudioRenderer({
    stdout,
    enabled: true,
    alternateScreen: true,
    projectName: "nordic-rain-pathcode-live",
  });
  r.begin();
  r.onEvent({ type: "session.started", sessionId: "buf-1" });
  r.onEvent({
    type: "session.preflight",
    sessionId: "buf-1",
    branch: "shamail-01",
    dirtySummary: "dirty",
    projectName: "nordic-rain-pathcode-live",
  });
  r.setIdlePrompt("PATH ● Code > ");

  // Soft lifecycle must leave splash alive long enough to paint the wordmark.
  await sleep(400);

  const mid = stripOsc(buf);
  const enterIdx = mid.indexOf("\u001b[?1049h");
  // Clean splash: PATH ● Code at normal cell size — never DEC double-width, never block ASCII.
  const splashIdx = (() => {
    const after = enterIdx >= 0 ? mid.slice(enterIdx) : mid;
    const m = after.match(/PATH[\s\S]{0,24}Code/);
    return m && typeof m.index === "number" ? enterIdx + m.index : -1;
  })();
  const hasAsciiArt = /█|╔|╚|engineering gateway/i.test(mid);
  const brandBeforeAlt = [...mid.matchAll(/PATH/g)].some(
    (m) => enterIdx < 0 || (m.index ?? 0) < enterIdx,
  );

  checks.push({
    id: "enter_alt_before_any_brand",
    ok: enterIdx >= 0 && !brandBeforeAlt && splashIdx > enterIdx && !hasAsciiArt,
    enterIdx,
    splashIdx,
    brandBeforeAlt,
    hasAsciiArt,
  });

  checks.push({
    id: "splash_survives_soft_lifecycle_events",
    ok: splashIdx > enterIdx && !hasAsciiArt,
    splashIdx,
    hasAsciiArt,
  });

  r.onEvent({
    type: "session.task.received",
    mode: "ag1",
    preview: "Inspect architecture and run native checks",
  });
  r.onEvent({
    type: "session.terminal",
    disposition: "AG1_AUTH_REQUIRED",
    summary: "PATH needs Antigravity authentication before engineering can start.",
  });
  // Allow coalesced alt-screen paint to flush.
  await sleep(80);

  const after = stripOsc(buf);
  const afterEnter = after.slice(after.indexOf("\u001b[?1049h"));
  const hasBrandInAlt = /PATH . Code/.test(afterEnter);
  const hasBlocked = /BLOCKED/.test(afterEnter);
  writeFileSync(join(outDir, "buffer-lifecycle-alt.txt"), afterEnter.slice(0, 4000));

  checks.push({
    id: "blocked_frame_keeps_brand_inside_alt",
    ok: hasBrandInAlt && hasBlocked,
    hasBrandInAlt,
    hasBlocked,
  });

  const beforeFinishLen = buf.length;
  r.finish();
  const exitIdx = buf.lastIndexOf("\u001b[?1049l");
  const postExit = stripOsc(buf.slice(Math.max(0, exitIdx)));
  checks.push({
    id: "exit_does_not_dump_brand_to_normal_buffer",
    ok:
      exitIdx >= beforeFinishLen - 200 &&
      !/PATH . Code\s*\n\s*nordic-rain-pathcode-live ·/.test(postExit),
    postExitSample: postExit.slice(0, 120),
  });
}

{
  const proj = mkdtempSync(join(tmpdir(), "path-buf-"));
  spawnSync("git", ["init"], { cwd: proj, stdio: "ignore" });
  spawnSync("git", ["config", "user.email", "t@t"], { cwd: proj });
  spawnSync("git", ["config", "user.name", "t"], { cwd: proj });
  writeFileSync(join(proj, "readme.md"), "ok\n");
  spawnSync("git", ["add", "."], { cwd: proj });
  spawnSync("git", ["commit", "-m", "init"], { cwd: proj, stdio: "ignore" });

  const outFile = join(outDir, "buffer-lifecycle-pty.raw.txt");
  const entry = join(packageRoot, "scripts/pathcode.mjs");
  const py = `
import os, pty, select, time, subprocess, re, pathlib
proj = ${JSON.stringify(proj)}
entry = ${JSON.stringify(entry)}
out_path = pathlib.Path(${JSON.stringify(outFile)})
env = os.environ.copy()
env.update({
  'PATHCODE_GATEWAY_FAKE_ENGINE':'1',
  'PATHCODE_GATEWAY_SKIP_BOOTSTRAP':'1',
  'FORCE_COLOR':'1',
  'COLUMNS':'100','LINES':'36','TERM':'xterm-256color',
})
master, slave = pty.openpty()
proc = subprocess.Popen(['node', entry], cwd=proj, env=env, stdin=slave, stdout=slave, stderr=slave, close_fds=True)
os.close(slave)
out = b''
deadline = time.time() + 6
sent_exit = False
saw_ui = False
while time.time() < deadline and proc.poll() is None:
  r,_,_ = select.select([master], [], [], 0.15)
  if master in r:
    try:
      chunk = os.read(master, 16384)
    except OSError:
      break
    if not chunk: break
    out += chunk
    text = out.decode('utf-8','replace')
    if 'Ready for engineering' in text or ('PATH' in text and 'Code' in text):
      saw_ui = True
    if saw_ui and not sent_exit and time.time() > deadline - 3.5:
      os.write(master, b'/exit\\n')
      sent_exit = True
  elif saw_ui and not sent_exit and time.time() > deadline - 2:
    os.write(master, b'/exit\\n')
    sent_exit = True
try:
  proc.wait(timeout=3)
except Exception:
  proc.kill()
try: os.close(master)
except Exception: pass
out_path.write_bytes(out)
text = out.decode('utf-8','replace')
enter = text.find('\\x1b[?1049h')
raw_brands = [m.start() for m in re.finditer(r'PATH', text)]
before_real = []
for i in raw_brands:
  if enter >= 0 and i >= enter:
    continue
  # Ignore OSC window titles that mention PATH Code before alt-screen.
  window = text[max(0, i - 40):i]
  if '\\x1b]' in window:
    continue
  before_real.append(i)
splash_at = -1
for m in re.finditer(r'PATH', text):
  if enter >= 0 and m.start() > enter and 'Code' in text[m.start():m.start()+80]:
    splash_at = m.start()
    break
has_ascii = bool(re.search(r'[█╔╚]|engineering gateway', text))
print('ENTER', enter)
print('BRANDS_BEFORE_ALT', len(before_real))
print('HAS_SPLASH', 'True' if (splash_at > enter >= 0 and not has_ascii) else 'False')
print('HAS_READY', 'True' if ('Ready for engineering' in text) else 'False')
print('HAS_BRAND_IN_ALT', 'True' if any(i > enter for i in raw_brands) else 'False')
print('EXIT', text.find('\\x1b[?1049l'))
`;
  const r = spawnSync("python3", ["-c", py], {
    encoding: "utf8",
    timeout: 25000,
  });
  /** @type {Record<string, string>} */
  const parsed = {};
  for (const line of String(r.stdout || "").split("\n")) {
    const i = line.indexOf(" ");
    if (i > 0) parsed[line.slice(0, i)] = line.slice(i + 1).trim();
  }
  writeFileSync(
    join(outDir, "buffer-lifecycle-pty.meta.json"),
    JSON.stringify({ parsed, stderr: r.stderr, status: r.status }, null, 2),
  );
  checks.push({
    id: "pty_pathcode_brand_only_inside_alt_screen",
    ok: /openpty|Operation not permitted|ENOTSUP/i.test(String(r.stderr || ""))
      ? true
      : Number(parsed.ENTER ?? -1) >= 0 &&
        Number(parsed.BRANDS_BEFORE_ALT ?? 99) === 0 &&
        parsed.HAS_SPLASH === "True" &&
        (parsed.HAS_READY === "True" || parsed.HAS_BRAND_IN_ALT === "True"),
    skipped: /openpty|Operation not permitted|ENOTSUP/i.test(String(r.stderr || ""))
      ? true
      : undefined,
    parsed,
    stderr: String(r.stderr || "").slice(0, 300),
    status: r.status,
  });
}

const pass = checks.every((c) => c.ok);
writeFileSync(
  join(outDir, "buffer-lifecycle-proof.json"),
  JSON.stringify({ pass, at: new Date().toISOString(), checks }, null, 2),
);
console.log(JSON.stringify({ pass, checks }, null, 2));
process.exit(pass ? 0 : 1);
