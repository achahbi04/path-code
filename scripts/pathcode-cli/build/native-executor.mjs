/** P16 bounded argv executor. Only reduced codes leave this module. */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const NATIVE_COMMAND_GUARD = fileURLToPath(new URL('./native-command-guard.mjs',import.meta.url));
import { createHash } from 'node:crypto';
import { lstat, opendir, realpath, readlink } from 'node:fs/promises';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync, cpSync, rmSync, realpathSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { detectBuildArtifact } from './runtime/artifact.mjs';
import { CAPACITOR_VERSION } from './native.mjs';
import { fail } from './operation-validation.mjs';
export const NATIVE_LIMITS = Object.freeze({ timeoutMs: 300000, outputBytes: 1024 * 1024, diskBytes: 1024 * 1024 * 1024, artifactBytes: 256 * 1024 * 1024 });
// Admission/redaction deliberately recognizes generic source syntax. Artifact
// inspection instead recognizes embedded private values, plus exact P9 sentinels.
// A header literal in a PEM parser is not a private key; encoded key payload is.
function artifactSecretLike(value) {
  if (/\b(?:ghp|github_pat|sk_test|sk_live|rk_test|rk_live|whsec|sb_secret)_[A-Za-z0-9_]+/i.test(value)) return true;
  const pemText = value.replace(/\\r\\n|\\n/g, '\n');
  for (const match of pemText.matchAll(/-----BEGIN ((?:[A-Z0-9]+ )*PRIVATE KEY)-----([A-Za-z0-9+/=\s]+)-----END \1-----/g)) {
    if (match[2].replace(/\s/g, '').length >= 64) return true;
  }
  // Also reject an exposed/truncated standard PEM body without its footer.
  return /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----[ \t\r\n]*[A-Za-z0-9+/]{64}/.test(pemText);
}

/** Streaming async workspace accounting: at most 128 open directories, no path list.
 * Only descendants that disappear/change type during traversal are transient.
 * Permission/I/O failures stop execution as unavailable, never as measured overflow.
 * Internal package-manager links are not traversed; escaping links are rejected.
 */
export async function measureNativeWorkspace(root, { maxBytes = NATIVE_LIMITS.diskBytes, shouldStop = () => false } = {}) {
  let bytes = 0, count = 0;
  let canonical;
  try { canonical = await realpath(root); }
  catch { throw new Error('NATIVE_WORKSPACE_UNAVAILABLE'); }
  const inside = path => path === canonical || path.startsWith(canonical + sep);
  const transient = error => ['ENOENT', 'ENOTDIR'].includes(error?.code);
  async function visit(dir, depth) {
    if (shouldStop()) return;
    // A traversal we cannot complete is unavailable, not measured disk overflow.
    if (depth >= 128) throw new Error('NATIVE_WORKSPACE_UNAVAILABLE');
    // Check both sides of opening the directory, including symlink replacement.
    if (!inside(await realpath(dir))) throw new Error('NATIVE_WORKSPACE_UNSAFE');
    const entries = await opendir(dir);
    try {
      if (!inside(await realpath(dir))) throw new Error('NATIVE_WORKSPACE_UNSAFE');
      for await (const entry of entries) {
        if (shouldStop()) break;
        if (++count > 200000) throw new Error('NATIVE_DISK_LIMIT');
        const path = join(dir, entry.name);
        try {
          const st = await lstat(path);
          if (st.isSymbolicLink()) {
            if (!inside(resolve(dirname(path), await readlink(path)))) throw new Error('NATIVE_WORKSPACE_UNSAFE');
            // Resolve nested links as well, without following them during accounting.
            if (!inside(await realpath(path))) throw new Error('NATIVE_WORKSPACE_UNSAFE');
          } else if (st.isDirectory()) await visit(path, depth + 1);
          else if (st.isFile()) {
            bytes += st.size;
            if (bytes > maxBytes) throw new Error('NATIVE_DISK_LIMIT');
          } else throw new Error('NATIVE_WORKSPACE_UNSAFE');
        } catch (error) { if (!transient(error)) throw error; }
      }
    } finally { await entries.close().catch(() => {}); }
  }
  try {
    // macOS /tmp and /var may be parent aliases. Reject a linked workspace
    // itself, while doing all traversal against its canonical physical root.
    const rootInfo = await lstat(root);
    if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) throw new Error('NATIVE_WORKSPACE_UNSAFE');
    await visit(canonical, 0);
    return { bytes, count };
  } catch (error) {
    if (['NATIVE_DISK_LIMIT', 'NATIVE_WORKSPACE_UNSAFE'].includes(error?.message)) throw error;
    throw new Error('NATIVE_WORKSPACE_UNAVAILABLE');
  }
}
export function nativeCommandPlan(workspace) {
  const artifact = detectBuildArtifact(workspace);
  if (artifact.kind !== 'web' || !['static','vite','astro','next'].includes(artifact.framework)) return fail('NATIVE_PRODUCT_UNSUPPORTED');
  if (!existsSync(join(workspace, 'package.json'))) return { ok: true, framework: artifact.framework, packageManager: null, installCommand: null, buildCommand: null };
  let pkg;
  try { pkg = JSON.parse(readFileSync(join(workspace,'package.json'), 'utf8')); } catch { return fail('NATIVE_PACKAGE_INVALID'); }
  const lock = { npm: 'package-lock.json', pnpm: 'pnpm-lock.yaml', yarn: 'yarn.lock', bun: existsSync(join(workspace,'bun.lock')) ? 'bun.lock' : 'bun.lockb' };
  const declared = typeof pkg.packageManager === 'string' ? pkg.packageManager.split('@')[0] : artifact.packageManager;
  if (!Object.hasOwn(lock, declared) || !existsSync(join(workspace,lock[declared]))) return fail('NATIVE_LOCKFILE_REQUIRED');
  if (Object.entries(lock).filter(([,file]) => existsSync(join(workspace,file))).length !== 1) return fail('NATIVE_LOCKFILE_AMBIGUOUS');
  const yarnMajor = typeof pkg.packageManager === 'string' && /^yarn@(\d+)\./.exec(pkg.packageManager)?.[1];
  if (declared === 'yarn' && !yarnMajor) return fail('NATIVE_YARN_VERSION_REQUIRED');
  const installCommand = { npm: ['npm','ci'], pnpm: ['pnpm','install','--frozen-lockfile'], yarn: ['yarn','install', Number(yarnMajor) >= 2 ? '--immutable' : '--frozen-lockfile'], bun: ['bun','install','--frozen-lockfile'] }[declared];
  if (!artifact.buildCommand) return fail('NATIVE_BUILD_COMMAND_REQUIRED');
  return { ok: true, framework: artifact.framework, packageManager: declared, installCommand, buildCommand: [declared,'run','build'] };
}
export function inspectNativeFiles(root, { maxBytes = NATIVE_LIMITS.artifactBytes, sentinels = [], allowLinks = false, checksum = true } = {}) {
  let bytes = 0, count = 0; const checksums = [];
  function visit(dir, depth = 0) {
    if (depth > 128) throw new Error('NATIVE_ARTIFACT_LIMIT');
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const target = join(dir, entry.name); const st = lstatSync(target); count++;
      if (count > 200000) throw new Error('NATIVE_DISK_LIMIT');
      if (st.isSymbolicLink()) { if (allowLinks) continue; throw new Error('NATIVE_ARTIFACT_UNSAFE'); }
      if (st.isDirectory()) visit(target, depth + 1);
      else if (st.isFile()) {
        bytes += st.size; if (bytes > maxBytes) throw new Error('NATIVE_DISK_LIMIT');
        if (checksum) {
          if (checksums.length >= 20000) throw new Error('NATIVE_ARTIFACT_LIMIT');
          const data = readFileSync(target);
          if (sentinels.some(v => v && (data.includes(Buffer.from(v)) || data.includes(Buffer.from(Buffer.from(v).toString('base64'))))) || artifactSecretLike(data.toString('utf8'))) throw new Error('NATIVE_SECRET_OUTPUT_UNSAFE');
          checksums.push({ path: relative(root,target).split(sep).join('/'), sha256: createHash('sha256').update(data).digest('hex') });
        }
      } else throw new Error('NATIVE_ARTIFACT_UNSAFE');
    }
  }
  if (lstatSync(root).isSymbolicLink()) throw new Error('NATIVE_ARTIFACT_UNSAFE');
  visit(root); return { bytes, checksums: checksums.sort((a,b) => a.path.localeCompare(b.path)) };
}
export function executeNativeCommand(argv, { cwd, env, limits = NATIVE_LIMITS, spawnImpl = spawn, diskRoot = cwd } = {}) {
  return new Promise(resolve => {
    let processHandle, size = 0, finished = false, failure = null, deadline, diskTimer, killTimer;
    const finish = result => { if (!finished) { finished = true; clearTimeout(deadline); clearTimeout(diskTimer); clearTimeout(killTimer); resolve(result); } };
    const kill = code => {
      if (failure) return;
      failure = code;
      try { process.kill(-processHandle.pid, 'SIGTERM'); } catch { processHandle.kill?.('SIGTERM'); }
      killTimer = setTimeout(() => { try { process.kill(-processHandle.pid, 'SIGKILL'); } catch { processHandle.kill?.('SIGKILL'); } }, 1000);
    };
    try {
      processHandle = spawnImpl(process.execPath, [NATIVE_COMMAND_GUARD, ...argv], { cwd, env, shell: false, detached: true, stdio: ['ignore','pipe','pipe','ipc'] });
      processHandle.on('message', message => {
        if (message?.kind === 'native.ready') {
          try { processHandle.send({kind:'native.start'}); } catch { kill('NATIVE_INTERRUPTED'); }
        } else if (message?.kind === 'native.error' && message.code === 'NATIVE_TOOL_UNAVAILABLE') failure = message.code;
      });
      const capture = chunk => { size += chunk.length; if (size > limits.outputBytes) kill('NATIVE_OUTPUT_LIMIT'); };
      processHandle.stdout?.on('data',capture); processHandle.stderr?.on('data',capture);
      processHandle.on('error', () => finish(fail('NATIVE_TOOL_UNAVAILABLE')));
      processHandle.on('close', code => {
        if (failure) { try { process.kill(-processHandle.pid,'SIGKILL'); } catch { /* group already exited */ } }
        finish(failure ? fail(failure) : code === 0 ? { ok: true } : fail('NATIVE_COMMAND_FAILED'));
      });
      deadline = setTimeout(() => kill('NATIVE_TIMEOUT'), limits.timeoutMs);
      const monitor = async () => {
        try { await measureNativeWorkspace(diskRoot, { maxBytes: limits.diskBytes, shouldStop: () => finished || !!failure }); }
        catch (error) { if (!finished && !failure) kill(error.message); }
        if (!finished && !failure) diskTimer = setTimeout(monitor, 1000);
      };
      diskTimer = setTimeout(monitor, 1000);
    } catch { finish(fail('NATIVE_TOOL_UNAVAILABLE')); }
  });
}
export async function executeNativePackage({ workspace, profile, env, plan, secretValues = [], limits = NATIVE_LIMITS, commandExecutor = executeNativeCommand }) {
  const run = async (argv, cwd) => {
    const r = await commandExecutor(argv, { cwd, diskRoot: workspace, env: { ...env, NPM_CONFIG_CACHE: join(workspace,'.path-native-cache'), XDG_CACHE_HOME: join(workspace,'.path-native-cache') }, limits });
    if (!r?.ok) throw new Error(/^NATIVE_[A-Z_]+$/.test(r?.code) ? r.code : 'NATIVE_COMMAND_FAILED');
    await measureNativeWorkspace(workspace, { maxBytes: limits.diskBytes });
  };
  try {
    if (plan.installCommand) await run(plan.installCommand,workspace);
    if (plan.buildCommand) await run(plan.buildCommand,workspace);
    const webRoot = join(workspace,profile.packagePolicy.webDir);
    if (!existsSync(join(webRoot,'index.html')) || lstatSync(webRoot).isSymbolicLink() || !lstatSync(join(webRoot,'index.html')).isFile()) return fail('NATIVE_STATIC_EXPORT_REQUIRED');
    if (!realpathSync(webRoot).startsWith(realpathSync(workspace)+sep)) return fail('NATIVE_ARTIFACT_UNSAFE');
    const sentinels = secretValues;
    inspectNativeFiles(webRoot,{ sentinels, maxBytes: limits.artifactBytes });
    const packaging = join(workspace,'.path-native-package');
    if (existsSync(packaging)) return fail('NATIVE_ARTIFACT_UNSAFE');
    mkdirSync(packaging, { mode: 0o700 }); cpSync(webRoot,join(packaging,'www'),{ recursive:true, dereference:false });
    const dependencies = Object.fromEntries(['core','cli','ios','android'].map(p => [`@capacitor/${p}`,CAPACITOR_VERSION]));
    writeFileSync(join(packaging,'package.json'),JSON.stringify({ private:true, name:'path-native-artifact', version:'0.0.0', dependencies }));
    writeFileSync(join(packaging,'capacitor.config.json'),JSON.stringify({ appId:profile.appId, appName:profile.appName, webDir:'www', ios:{ packageManager:'SPM' } }));
    await run(['npm','install','--package-lock-only','--ignore-scripts','--no-audit','--no-fund'],packaging);
    await run(['npm','ci','--ignore-scripts','--no-audit','--no-fund'],packaging);
    const cli = join(packaging,'node_modules','@capacitor','cli','bin','capacitor');
    for (const platform of profile.platforms) await run([process.execPath,cli,'add',platform,...(platform === 'ios' ? ['--packagemanager','SPM'] : [])],packaging);
    await run([process.execPath,cli,'sync'],packaging);
    for (const platform of profile.platforms) if (!existsSync(join(packaging,platform)) || lstatSync(join(packaging,platform)).isSymbolicLink()) return fail('NATIVE_ARTIFACT_MISSING');
    rmSync(join(packaging,'node_modules'),{recursive:true,force:true});
    // Keep only the packaging artifact, never build workspaces or product dependencies.
    for (const entry of readdirSync(workspace)) if (entry !== '.path-native-package') rmSync(join(workspace,entry),{recursive:true,force:true});
    const inspected = inspectNativeFiles(packaging,{ sentinels, maxBytes:limits.artifactBytes });
    return { ok:true, ...inspected };
  } catch (e) { return fail(/^NATIVE_[A-Z_]+$/.test(e?.message) ? e.message : 'NATIVE_PACKAGE_FAILED'); }
}
