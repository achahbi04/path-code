/** P16 profile and source-bound artifact authority; generated files are not source. */
import { readAuthAuthority } from './auth.mjs';
import { randomUUID } from 'node:crypto';
import { readBuildRecord } from './record.mjs';
import { exact, integer, id, text, iso, fail, now } from './operation-validation.mjs';
export const NATIVE_SCHEMA = 'pathcode.p16.native.v1';
export const CAPACITOR_VERSION = '8.5.3';
export const emptyBuildNativeAuthority = () => ({ schema: NATIVE_SCHEMA, revision: 0, profiles: [], pendingOperation: null, operationHistory: [], artifacts: [] });
export function validNativeProfile(p) {
  return exact(p, ['appId','appName','platforms','buildEnvironmentId','packagePolicy','authId','authCallbackScheme']) && typeof p.appId === 'string' && p.appId.length <= 160 && /^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*){1,7}$/.test(p.appId) && text(p.appName, 80) &&
    Array.isArray(p.platforms) && p.platforms.length >= 1 && p.platforms.length <= 2 && new Set(p.platforms).size === p.platforms.length && p.platforms.every(v => ['ios','android'].includes(v)) && id(p.buildEnvironmentId) &&
    exact(p.packagePolicy, ['capacitorVersion','webDir','iosPackageManager']) && p.packagePolicy.capacitorVersion === CAPACITOR_VERSION && typeof p.packagePolicy.webDir === 'string' && /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(p.packagePolicy.webDir) && p.packagePolicy.webDir.length <= 128 && p.packagePolicy.iosPackageManager === 'SPM' &&
    (p.authId === null || id(p.authId)) && (p.authCallbackScheme === null || typeof p.authCallbackScheme === 'string' && p.authCallbackScheme.length <= 160 && /^[A-Za-z][A-Za-z0-9+.-]*$/.test(p.authCallbackScheme) && !['javascript','data','file','http','https'].includes(p.authCallbackScheme.toLowerCase()));
}
function validOperation(o) {
  return exact(o, ['operationId','nativeId','state','sourceSha','sourceTreeSha','profileDigest','environmentRevision','nativeRevision','workspaceId','framework','packageManager','installCommand','buildCommand','capacitorVersion','createdAt','updatedAt','failureCode']) && id(o.operationId) && id(o.nativeId) &&
    ['prepared','running','completed','failed','interrupted','stale'].includes(o.state) && /^[a-f0-9]{40,64}$/.test(o.sourceSha) && /^[a-f0-9]{40,64}$/.test(o.sourceTreeSha) && /^[a-f0-9]{64}$/.test(o.profileDigest) && integer(o.environmentRevision) && integer(o.nativeRevision) && id(o.workspaceId) &&
    ['static','vite','astro','next'].includes(o.framework) && [null,'npm','pnpm','yarn','bun'].includes(o.packageManager) && [o.installCommand,o.buildCommand].every(c => c === null || Array.isArray(c) && c.length <= 8 && c.every(v => typeof v === 'string' && v.length <= 200)) && o.capacitorVersion === CAPACITOR_VERSION && iso(o.createdAt) && iso(o.updatedAt) && (o.failureCode === null || /^[A-Z][A-Z0-9_]{0,79}$/.test(o.failureCode));
}
export function readNativeAuthority(record) {
  if (!record) return fail('BUILD_NOT_FOUND');
  if (!Object.hasOwn(record, 'native')) return { ok: true, authority: emptyBuildNativeAuthority() };
  const a = record.native;
  if (!exact(a, ['schema','revision','profiles','pendingOperation','operationHistory','artifacts']) || a.schema !== NATIVE_SCHEMA || !integer(a.revision) || !Array.isArray(a.profiles) || a.profiles.length > 16 || new Set(a.profiles.map(p => p.nativeId)).size !== a.profiles.length || a.profiles.some(p => {
    if (!exact(p, ['nativeId','appId','appName','platforms','buildEnvironmentId','packagePolicy','authId','authCallbackScheme','createdAt','updatedAt'])) return true;
    const { nativeId, createdAt, updatedAt, ...config } = p;
    return !id(nativeId) || !iso(createdAt) || !iso(updatedAt) || !validNativeProfile(config);
  }) || !(a.pendingOperation === null || validOperation(a.pendingOperation)) || !Array.isArray(a.operationHistory) || a.operationHistory.length > 20 || !a.operationHistory.every(validOperation) || !Array.isArray(a.artifacts) || a.artifacts.length > 48 || a.artifacts.some(x => !exact(x, ['artifactId','nativeId','sourceSha','sourceTreeSha','platforms','checksums','bytes','state','createdAt']) || !id(x.artifactId) || !id(x.nativeId) || !/^[a-f0-9]{40,64}$/.test(x.sourceSha) || !/^[a-f0-9]{40,64}$/.test(x.sourceTreeSha) || !integer(x.bytes) || !['packaged','stale'].includes(x.state) || !iso(x.createdAt) || !Array.isArray(x.platforms) || x.platforms.some(p => !['ios','android'].includes(p)) || !Array.isArray(x.checksums) || x.checksums.length > 20000 || x.checksums.some(c => !exact(c, ['path','sha256']) || !text(c.path, 512) || !/^[a-f0-9]{64}$/.test(c.sha256)))) return fail('NATIVE_INVALID');
  return { ok: true, authority: structuredClone(a) };
}
export function nativeReadiness(record, p) {
  const problems = [];
  const e = record.environments?.items?.find(e => e.environmentId === p.buildEnvironmentId);
  if (!e) problems.push('dependency_missing');
  else if (e.variables.some(v => v.kind === 'secret' && (v.backend !== 'local_env_file' || v.bindingState !== 'configured' || v.presenceState !== 'verified_present' || v.safetyState !== 'verified_safe'))) problems.push('build_environment_unusable');
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(record.authoritativeSha || '')) problems.push('source_unresolved');
  if (record.pendingRestore) problems.push('restore_pending');
  if (record.pendingCandidate) problems.push('candidate_pending');
  const authAuthority = readAuthAuthority(record);
  const auth = p.authId && authAuthority.ok && authAuthority.authority.items.find(a => a.authId === p.authId);
  const callback = p.authCallbackScheme ? `${p.authCallbackScheme}://auth-callback` : null;
  if (p.authId && !auth) problems.push('dependency_missing');
  if (p.authId && (!callback || !auth?.config?.redirectUrls?.includes(callback) || auth?.observation?.state !== 'ready' || auth?.observation?.matchesDesired !== true)) problems.push('auth_callback_action_required');
  return { state: problems.length ? 'action_required' : 'ready', problems, buildEnvironmentId: p.buildEnvironmentId, buildEnvironmentState: !e ? 'dependency_missing' : problems.includes('build_environment_unusable') ? 'build_environment_unusable' : 'usable', webArtifactState: 'build_verification_required', callbackUrl: callback, signing: 'owner_gate', toolchains: p.platforms.map(platform => ({ platform, state: 'local_toolchain_required' })), hostedCheckoutCompatibility: 'return_deep_link_acceptance_pending' };
}
export function listBuildNative(runtimeRoot, buildId) {
  const record = readBuildRecord(runtimeRoot, buildId), r = readNativeAuthority(record);
  if (!r.ok) return r;
  return { ok: true, buildId, ...r.authority, artifacts: r.authority.artifacts.map(a => ({ ...a, state: a.sourceSha === record.authoritativeSha ? a.state : 'stale' })) };
}
export function prepareBuildNativeMutation(runtimeRoot, buildId, request) {
  if (!exact(request, ['action','expectedNativeRevision','input']) || !integer(request.expectedNativeRevision)) return fail('NATIVE_MUTATION_INVALID');
  const record = readBuildRecord(runtimeRoot, buildId), r = readNativeAuthority(record);
  if (!r.ok) return r;
  if (record.pendingRestore) return fail('RESTORE_PENDING');
  const a = r.authority;
  if (a.revision !== request.expectedNativeRevision) return fail('NATIVE_REVISION_STALE');
  if (a.pendingOperation) return fail('NATIVE_OPERATION_PENDING');
  const i = request.input; let nativeId;
  if (request.action === 'delete_profile') {
    if (!exact(i, ['nativeId']) || !a.profiles.some(p => p.nativeId === i.nativeId)) return fail('NATIVE_NOT_FOUND');
    nativeId = i.nativeId;
    a.artifacts = a.artifacts.filter(x => x.nativeId !== nativeId);
    a.profiles = a.profiles.filter(p => p.nativeId !== nativeId);
  } else if (['create_profile','update_profile'].includes(request.action)) {
    if (!i || typeof i !== 'object') return fail('NATIVE_PROFILE_INVALID');
    const { nativeId: supplied, ...rest } = i;
    const config = request.action === 'create_profile' ? i : rest;
    if (!validNativeProfile(config)) return fail('NATIVE_PROFILE_INVALID');
    if (!record.environments?.items?.some(e => e.environmentId === i.buildEnvironmentId) || i.authId && !record.auth?.items?.some(a => a.authId === i.authId)) return fail('NATIVE_DEPENDENCY_MISSING');
    const old = request.action === 'update_profile' ? a.profiles.find(p => p.nativeId === supplied) : null;
    if (request.action === 'update_profile' && !old) return fail('NATIVE_NOT_FOUND');
    if (!old && a.profiles.length >= 16) return fail('NATIVE_LIMIT');
    nativeId = old?.nativeId || randomUUID();
    a.profiles = [...a.profiles.filter(p => p.nativeId !== nativeId), { nativeId, ...structuredClone(config), createdAt: old?.createdAt || now(), updatedAt: now() }];
  } else return fail('NATIVE_MUTATION_INVALID');
  a.revision++;
  return { ok: true, nativeId, revision: a.revision, record: { ...record, native: a }, cleanupArtifactIds: request.action === 'delete_profile' ? (record.native?.artifacts || []).filter(x => x.nativeId === nativeId).map(x => x.artifactId) : [] };
}
