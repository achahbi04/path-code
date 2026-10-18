/** P16 preparation/execution/recovery, serialized only at durable transitions. */
import { randomUUID } from 'node:crypto';
import { join, resolve, sep } from 'node:path';
import { existsSync, realpathSync, rmSync } from 'node:fs';
import { readBuildRecord, writeBuildRecord } from './record.mjs';
import { readNativeAuthority, nativeReadiness, CAPACITOR_VERSION } from './native.mjs';
import { prepareDeploymentSource, cleanupDeploymentSource, verifyDeploymentSourceWorkspace } from './deploy-source.mjs';
import { nativeCommandPlan, executeNativePackage, NATIVE_LIMITS, inspectNativeFiles } from './native-executor.mjs';
import { createProductRuntimeEnv } from './runtime/product-env.mjs';
import { exact, integer, id, digest, now, fail } from './operation-validation.mjs';
const namespace = 'native-snapshots';
export function removeNativeWorkspace(runtimeRoot, buildId, workspaceId) {
  if (!id(buildId) || !/^[a-f0-9-]{36}$/.test(workspaceId)) return fail('NATIVE_WORKSPACE_UNSAFE');
  const workspace = join(realpathSync(runtimeRoot),namespace,buildId,workspaceId);
  if (!existsSync(workspace)) return {ok:true};
  try {
    if (!realpathSync(workspace).startsWith(realpathSync(runtimeRoot)+sep) || realpathSync(workspace) !== workspace) return fail('NATIVE_WORKSPACE_UNSAFE');
    rmSync(workspace,{recursive:true,force:true}); return {ok:true};
  } catch { return fail('NATIVE_CLEANUP_FAILED'); }
}
function snapshot(runtimeRoot,buildId,p) {
  if (!exact(p,['nativeId','expectedNativeRevision','expectedEnvironmentRevision']) || !id(p.nativeId) || !integer(p.expectedNativeRevision) || !integer(p.expectedEnvironmentRevision)) return fail('NATIVE_REQUEST_INVALID');
  const record = readBuildRecord(runtimeRoot,buildId), read = readNativeAuthority(record);
  if (!read.ok) return read;
  if (record.pendingRestore) return fail('RESTORE_PENDING');
  if (record.pendingCandidate) return fail('NATIVE_CANDIDATE_PENDING');
  if (read.authority.revision !== p.expectedNativeRevision || (record.environments?.revision ?? 0) !== p.expectedEnvironmentRevision) return fail('NATIVE_AUTHORITY_STALE');
  const profile = read.authority.profiles.find(x => x.nativeId === p.nativeId);
  if (!profile) return fail('NATIVE_NOT_FOUND');
  const readiness = nativeReadiness(record,profile);
  if (readiness.problems.length) return fail(readiness.problems.includes('build_environment_unusable') ? 'NATIVE_BUILD_ENVIRONMENT_UNUSABLE' : readiness.problems.includes('dependency_missing') ? 'NATIVE_DEPENDENCY_MISSING' : 'NATIVE_AUTH_CALLBACK_NOT_READY');
  let env;
  try { env = createProductRuntimeEnv({kind:'build',env:{}},process.env,{runtimeRoot,buildId,environmentId:profile.buildEnvironmentId,projectRoot:record.projectBindings?.[0]?.projectRoot}); }
  catch { return fail('NATIVE_BUILD_ENVIRONMENT_UNUSABLE'); }
  return {ok:true,record,authority:read.authority,profile,env};
}
export async function runNativeOperation({runtimeRoot,buildId,action,params,exclusive,executor = executeNativePackage,activeOperations}) {
  if (action === 'observe') {
    if (!exact(params,['nativeId','expectedNativeRevision','expectedEnvironmentRevision'])) return fail('NATIVE_REQUEST_INVALID');
    return exclusive(buildId,() => {
      const record = readBuildRecord(runtimeRoot,buildId), read = readNativeAuthority(record);
      if (!read.ok) return read;
      if (record.pendingRestore) return fail('RESTORE_PENDING');
      const a = read.authority;
      if (a.revision !== params.expectedNativeRevision || (record.environments?.revision ?? 0) !== params.expectedEnvironmentRevision) return fail('NATIVE_AUTHORITY_STALE');
      const op = a.pendingOperation;
      if (op && op.nativeId !== params.nativeId) return fail('NATIVE_OPERATION_STALE');
      const stale = op && (op.sourceSha !== record.authoritativeSha || op.environmentRevision !== (record.environments?.revision ?? 0) || op.profileDigest !== digest(a.profiles.find(p => p.nativeId === op.nativeId)) || record.pendingCandidate);
      if (!op || activeOperations.has(op.operationId) || op.state !== 'running' && !stale) return {ok:true,revision:a.revision,state:op?.state || 'idle'};
      const cleaned = removeNativeWorkspace(runtimeRoot,buildId,op.workspaceId);
      if (!cleaned.ok) return cleaned;
      const interrupted = {...op,state:stale ? 'stale' : 'interrupted',updatedAt:now(),failureCode:stale ? 'NATIVE_AUTHORITY_STALE' : 'NATIVE_INTERRUPTED'};
      a.pendingOperation = null; a.operationHistory = [...a.operationHistory,interrupted].slice(-20); a.revision++;
      writeBuildRecord(runtimeRoot,{...record,native:a}); return {ok:true,revision:a.revision,state:interrupted.state};
    });
  }
  const s = await exclusive(buildId,() => snapshot(runtimeRoot,buildId,params));
  if (!s.ok) return s;
  if (action === 'prepare') {
    if (s.authority.pendingOperation) return fail('NATIVE_OPERATION_PENDING');
    // Blob materialization is read-only against product Git, outside the gate.
    const source = prepareDeploymentSource({runtimeRoot,buildId,namespace});
    if (!source.ok) return fail(source.code.replace(/^DEPLOY_/,'NATIVE_'));
    const plan = nativeCommandPlan(source.workspace);
    if (!plan.ok) { cleanupDeploymentSource({...source,namespace}); return plan; }
    return exclusive(buildId,() => {
      const current = snapshot(runtimeRoot,buildId,params);
      if (!current.ok || current.record.authoritativeSha !== source.authoritativeSha || digest(current.env) !== digest(s.env)) { cleanupDeploymentSource({...source,namespace}); return fail('NATIVE_AUTHORITY_STALE'); }
      const op = {operationId:randomUUID(),nativeId:s.profile.nativeId,state:'prepared',sourceSha:source.authoritativeSha,sourceTreeSha:source.treeSha,profileDigest:digest(s.profile),environmentRevision:params.expectedEnvironmentRevision,nativeRevision:s.authority.revision+1,
        workspaceId:source.workspace.split(sep).pop(),framework:plan.framework,packageManager:plan.packageManager,installCommand:plan.installCommand,buildCommand:plan.buildCommand,capacitorVersion:CAPACITOR_VERSION,createdAt:now(),updatedAt:now(),failureCode:null};
      const a = current.authority; a.pendingOperation = op; a.revision++;
      writeBuildRecord(runtimeRoot,{...current.record,native:a});
      return {ok:true,revision:a.revision,state:'prepared',operationId:op.operationId};
    });
  }
  if (action !== 'execute') return fail('NATIVE_REQUEST_INVALID');
  const op = s.authority.pendingOperation;
  if (!op || op.state !== 'prepared' || op.nativeId !== s.profile.nativeId || op.nativeRevision !== s.authority.revision || op.sourceSha !== s.record.authoritativeSha || op.profileDigest !== digest(s.profile) || op.environmentRevision !== params.expectedEnvironmentRevision) return fail('NATIVE_OPERATION_STALE');
  const workspace = join(realpathSync(runtimeRoot),namespace,buildId,op.workspaceId);
  try { if (realpathSync(workspace) !== workspace || !workspace.startsWith(realpathSync(runtimeRoot)+sep)) return fail('NATIVE_WORKSPACE_UNSAFE'); } catch { return fail('NATIVE_WORKSPACE_UNAVAILABLE'); }
  const verified = verifyDeploymentSourceWorkspace({runtimeRoot,buildId,workspace});
  if (!verified.ok || verified.sha !== op.sourceSha || verified.treeSha !== op.sourceTreeSha) return fail('NATIVE_TREE_MISMATCH');
  const started = await exclusive(buildId,() => {
    const c = snapshot(runtimeRoot,buildId,params);
    if (!c.ok || c.record.authoritativeSha !== op.sourceSha || digest(c.env) !== digest(s.env)) return fail('NATIVE_AUTHORITY_STALE');
    c.authority.pendingOperation = {...op,state:'running',updatedAt:now()}; c.authority.revision++;
    writeBuildRecord(runtimeRoot,{...c.record,native:c.authority}); activeOperations.add(op.operationId);
    return {ok:true,revision:c.authority.revision};
  });
  if (!started.ok) return started;
  let result;
  try { result = await executor({workspace,profile:s.profile,env:s.env,plan:op}); } catch { result = fail('NATIVE_PACKAGE_FAILED'); }
  try {
    return await exclusive(buildId,() => {
      const record = readBuildRecord(runtimeRoot,buildId), read = readNativeAuthority(record);
      if (!read.ok) { removeNativeWorkspace(runtimeRoot,buildId,op.workspaceId); return read; }
      const a = read.authority;
      if (a.pendingOperation?.operationId !== op.operationId) { removeNativeWorkspace(runtimeRoot,buildId,op.workspaceId); return fail('NATIVE_AUTHORITY_STALE'); }
      let environmentUnchanged = false;
      try { environmentUnchanged = digest(createProductRuntimeEnv({kind:'build',env:{}},process.env,{runtimeRoot,buildId,environmentId:s.profile.buildEnvironmentId,projectRoot:record.projectBindings?.[0]?.projectRoot})) === digest(s.env); } catch { /* fail closed */ }
      const stale = record.pendingRestore || record.pendingCandidate || record.authoritativeSha !== op.sourceSha || (record.environments?.revision ?? 0) !== op.environmentRevision || a.revision !== started.revision || !environmentUnchanged || digest(a.profiles.find(p => p.nativeId === op.nativeId)) !== op.profileDigest;
      let inspected = null;
      if (result?.ok && !stale) {
        try { inspected = inspectNativeFiles(join(workspace,'.path-native-package'),{maxBytes:NATIVE_LIMITS.artifactBytes,sentinels:Object.entries(s.env).filter(([k,v])=>!['PATH','HOME','USER','TMPDIR','TMP','TEMP','LANG','LC_ALL','LC_CTYPE','CI','BROWSER','FORCE_COLOR','HTTP_PROXY','HTTPS_PROXY','http_proxy','https_proxy','NO_PROXY','no_proxy','NODE_EXTRA_CA_CERTS','SSL_CERT_FILE'].includes(k) && v.length >= 4).map(([,v])=>v)}); } catch { result = fail('NATIVE_ARTIFACT_UNSAFE'); }
      }
      const state = stale ? 'stale' : inspected ? 'completed' : 'failed';
      const terminal = {...op,state,failureCode:stale ? 'NATIVE_AUTHORITY_STALE' : inspected ? null : /^NATIVE_[A-Z_]+$/.test(result?.code) ? result.code : 'NATIVE_PACKAGE_FAILED',updatedAt:now()};
      a.pendingOperation = null; a.operationHistory = [...a.operationHistory,terminal].slice(-20);
      if (inspected) {
        const artifact = {artifactId:op.workspaceId,nativeId:op.nativeId,sourceSha:op.sourceSha,sourceTreeSha:op.sourceTreeSha,platforms:s.profile.platforms,checksums:inspected.checksums,bytes:inspected.bytes,state:'packaged',createdAt:now()};
        a.artifacts.push(artifact);
        const perProfile = a.artifacts.filter(x => x.nativeId === op.nativeId);
        const remove = perProfile.slice(0,Math.max(0,perProfile.length-3));
        let total = a.artifacts.reduce((n,x) => n+x.bytes,0);
        for (const old of a.artifacts) if (total > NATIVE_LIMITS.diskBytes && !remove.includes(old) && old.artifactId !== artifact.artifactId) { remove.push(old); total -= old.bytes; }
        for (const old of remove) { const cleanup = removeNativeWorkspace(runtimeRoot,buildId,old.artifactId); if (!cleanup.ok) return cleanup; }
        a.artifacts = a.artifacts.filter(x => !remove.includes(x));
      } else removeNativeWorkspace(runtimeRoot,buildId,op.workspaceId);
      a.revision++; writeBuildRecord(runtimeRoot,{...record,native:a});
      return {ok:true,revision:a.revision,state,...(inspected ? {artifactId:op.workspaceId} : {})};
    });
  } finally { activeOperations.delete(op.operationId); }
}
