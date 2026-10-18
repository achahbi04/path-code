/** P16 bounded argv executor. Only reduced codes leave this module. */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync, cpSync, rmSync, realpathSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { detectBuildArtifact } from './runtime/artifact.mjs';
import { CAPACITOR_VERSION } from './native.mjs';
import { fail, secretLike } from './operation-validation.mjs';
export const NATIVE_LIMITS = Object.freeze({ timeoutMs: 300000, outputBytes: 1024 * 1024, diskBytes: 1024 * 1024 * 1024, artifactBytes: 256 * 1024 * 1024 });
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
  function visit(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const target = join(dir, entry.name); const st = lstatSync(target); count++;
      if (count > 200000) throw new Error('NATIVE_DISK_LIMIT');
      if (st.isSymbolicLink()) { if (allowLinks) continue; throw new Error('NATIVE_ARTIFACT_UNSAFE'); }
      if (st.isDirectory()) visit(target);
      else if (st.isFile()) {
        bytes += st.size; if (bytes > maxBytes) throw new Error('NATIVE_DISK_LIMIT');
        if (checksum) {
          if (checksums.length >= 20000) throw new Error('NATIVE_ARTIFACT_LIMIT');
          const data = readFileSync(target);
          if (sentinels.some(v => v && (data.includes(Buffer.from(v)) || data.includes(Buffer.from(Buffer.from(v).toString('base64'))))) || secretLike(data.toString('utf8'))) throw new Error('NATIVE_SECRET_OUTPUT_UNSAFE');
          checksums.push({ path: relative(root,target).split(sep).join('/'), sha256: createHash('sha256').update(data).digest('hex') });
        }
      } else throw new Error('NATIVE_ARTIFACT_UNSAFE');
    }
  }
  visit(root); return { bytes, checksums: checksums.sort((a,b) => a.path.localeCompare(b.path)) };
}
export function executeNativeCommand(argv, { cwd, env, limits = NATIVE_LIMITS, spawnImpl = spawn, diskRoot = cwd } = {}) {
  return new Promise(resolve => {
    let processHandle, size = 0, finished = false, failure = null, deadline, diskTimer, killTimer;
    const finish = result => { if (!finished) { finished = true; clearTimeout(deadline); clearInterval(diskTimer); clearTimeout(killTimer); resolve(result); } };
    const kill = code => {
      if (failure) return;
      failure = code;
      try { process.kill(-processHandle.pid, 'SIGTERM'); } catch { processHandle.kill?.('SIGTERM'); }
      killTimer = setTimeout(() => { try { process.kill(-processHandle.pid, 'SIGKILL'); } catch { processHandle.kill?.('SIGKILL'); } }, 1000);
    };
    try {
      processHandle = spawnImpl(argv[0], argv.slice(1), { cwd, env, shell: false, detached: true, stdio: ['ignore','pipe','pipe'] });
      const capture = chunk => { size += chunk.length; if (size > limits.outputBytes) kill('NATIVE_OUTPUT_LIMIT'); };
      processHandle.stdout?.on('data',capture); processHandle.stderr?.on('data',capture);
      processHandle.on('error', () => finish(fail('NATIVE_TOOL_UNAVAILABLE')));
      processHandle.on('close', code => {
        if (failure) { try { process.kill(-processHandle.pid,'SIGKILL'); } catch { /* group already exited */ } }
        finish(failure ? fail(failure) : code === 0 ? { ok: true } : fail('NATIVE_COMMAND_FAILED'));
      });
      deadline = setTimeout(() => kill('NATIVE_TIMEOUT'), limits.timeoutMs);
      diskTimer = setInterval(() => { try { inspectNativeFiles(diskRoot, { maxBytes: limits.diskBytes, allowLinks: true, checksum: false }); } catch { kill('NATIVE_DISK_LIMIT'); } }, 1000);
    } catch { finish(fail('NATIVE_TOOL_UNAVAILABLE')); }
  });
}
export async function executeNativePackage({ workspace, profile, env, plan, secretValues = [], limits = NATIVE_LIMITS, commandExecutor = executeNativeCommand }) {
  const run = async (argv, cwd) => {
    const r = await commandExecutor(argv, { cwd, diskRoot: workspace, env: { ...env, NPM_CONFIG_CACHE: join(workspace,'.path-native-cache'), XDG_CACHE_HOME: join(workspace,'.path-native-cache') }, limits });
    if (!r?.ok) throw new Error(/^NATIVE_[A-Z_]+$/.test(r?.code) ? r.code : 'NATIVE_COMMAND_FAILED');
    inspectNativeFiles(workspace, { maxBytes: limits.diskBytes, allowLinks: true, checksum: false });
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
