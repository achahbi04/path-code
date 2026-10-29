/** P14 Supabase authentication intent. P13 owns projects; P9 owns credentials. */
import { randomUUID } from 'node:crypto';
import { readBuildRecord } from './record.mjs';
import { listBuildDatabases } from './databases.mjs';
import { readBuildEnvironment, readBuildSecretBinding, APPROVED_PUBLIC_SUPABASE_KEY_NAMES } from './environments.mjs';
import { detectBuildArtifact } from './runtime/artifact.mjs';
import { exact, integer, id, text, variable, safeUrl, stableBase, iso, fail, now } from './operation-validation.mjs';
export const AUTH_SCHEMA = 'pathcode.p14.auth.v1';
export const emptyBuildAuthAuthority = () => ({ schema: AUTH_SCHEMA, revision: 0, items: [], pendingOperation: null, operationHistory: [] });
const OBS = ['state','adapterVersion','projectRef','configDigest','siteUrl','redirectUrlsDigest','enabledMethods','observedAt','failureCode','matchesDesired'];
export const emptyAuthObservation = () => ({ state: 'unverified', adapterVersion: null, projectRef: null, configDigest: null, siteUrl: null, redirectUrlsDigest: null, enabledMethods: [], observedAt: null, failureCode: null, matchesDesired: null });
export function validAuthConfig(c) {
  return exact(c, ['siteUrlSource','domainId','siteUrl','redirectUrls','signupEnabled','emailEnabled','emailConfirmationRequired','publishableKeyVariableName','socialProviders']) &&
    ['explicit','p11_domain'].includes(c.siteUrlSource) && (c.siteUrlSource === 'explicit' ? c.domainId === null : id(c.domainId)) && safeUrl(c.siteUrl) &&
    Array.isArray(c.redirectUrls) && c.redirectUrls.length <= 32 && new Set(c.redirectUrls).size === c.redirectUrls.length && c.redirectUrls.every(u => safeUrl(u, true)) &&
    ['signupEnabled','emailEnabled','emailConfirmationRequired'].every(k => typeof c[k] === 'boolean') && variable(c.publishableKeyVariableName) &&
    Array.isArray(c.socialProviders) && c.socialProviders.length <= 2 && new Set(c.socialProviders.map(s => s.provider)).size === c.socialProviders.length &&
    c.socialProviders.every(s => exact(s, ['provider','enabled','clientId','clientSecretRef']) && ['google','github'].includes(s.provider) && typeof s.enabled === 'boolean' && (s.clientId === '' || text(s.clientId, 512)) && (s.clientSecretRef === null || id(s.clientSecretRef)) && (!s.enabled || s.clientId !== '' && s.clientSecretRef !== null));
}
function validObservation(o) {
  return exact(o, OBS) && (o.matchesDesired === null || typeof o.matchesDesired === 'boolean') && ['unverified','ready','action_required','unavailable'].includes(o.state) &&
    (o.adapterVersion === null || id(o.adapterVersion)) && (o.projectRef === null || id(o.projectRef)) &&
    ['configDigest','redirectUrlsDigest'].every(k => o[k] === null || /^[a-f0-9]{64}$/.test(o[k])) && (o.siteUrl === null || safeUrl(o.siteUrl)) &&
    Array.isArray(o.enabledMethods) && o.enabledMethods.length <= 3 && o.enabledMethods.every(m => ['email','google','github'].includes(m)) &&
    (o.observedAt === null || iso(o.observedAt)) && (o.failureCode === null || /^[A-Z][A-Z0-9_]{0,79}$/.test(o.failureCode));
}
function validOperation(o) {
  return exact(o, ['operationId','authId','state','authRevision','databaseRevision','environmentRevision','domainRevision','desiredDigest','observedDigest','createdAt','updatedAt','failureCode']) && id(o.operationId) && id(o.authId) &&
    ['prepared','effect_started','completed','uncertain','failed_no_effect','interrupted'].includes(o.state) && ['authRevision','databaseRevision','environmentRevision','domainRevision'].every(k => integer(o[k])) &&
    /^[a-f0-9]{64}$/.test(o.desiredDigest) && /^[a-f0-9]{64}$/.test(o.observedDigest) && iso(o.createdAt) && iso(o.updatedAt) && (o.failureCode === null || /^[A-Z][A-Z0-9_]{0,79}$/.test(o.failureCode));
}
export function readAuthAuthority(record) {
  if (!record) return fail('BUILD_NOT_FOUND');
  if (!Object.hasOwn(record, 'auth')) return { ok: true, authority: emptyBuildAuthAuthority() };
  const a = record.auth;
  if (!exact(a, ['schema','revision','items','pendingOperation','operationHistory']) || a.schema !== AUTH_SCHEMA || !integer(a.revision) || !Array.isArray(a.items) || a.items.length > 32 ||
    new Set(a.items.map(i => i.authId)).size !== a.items.length || a.items.some(i => !exact(i, ['authId','provider','label','databaseId','environmentId','config','observation','createdAt','updatedAt']) || !id(i.authId) || i.provider !== 'supabase' || !text(i.label) || !id(i.databaseId) || !id(i.environmentId) || !validAuthConfig(i.config) || !validObservation(i.observation) || !iso(i.createdAt) || !iso(i.updatedAt)) ||
    !(a.pendingOperation === null || validOperation(a.pendingOperation)) || !Array.isArray(a.operationHistory) || a.operationHistory.length > 20 || !a.operationHistory.every(validOperation)) return fail('AUTH_INVALID');
  return { ok: true, authority: structuredClone(a) };
}
export function listBuildAuth(runtimeRoot, buildId) {
  const read = readAuthAuthority(readBuildRecord(runtimeRoot, buildId));
  return read.ok ? { ok: true, buildId, ...read.authority } : read;
}
export function readBuildAuth(runtimeRoot, buildId, authId) {
  const a = listBuildAuth(runtimeRoot, buildId);
  if (!a.ok) return a;
  const auth = a.items.find(i => i.authId === authId);
  return auth ? { ok: true, revision: a.revision, auth } : fail('AUTH_NOT_FOUND');
}
export function authReadiness(record, item) {
  const database = record.databases?.items?.find(d => d.databaseId === item.databaseId);
  const environment = record.environments?.items?.find(e => e.environmentId === item.environmentId);
  const problems = [];
  if (!database || !environment || database.environmentId !== item.environmentId) problems.push('dependency_missing');
  if (database?.providerObservation?.state !== 'ready') problems.push('database_provider_unverified');
  if (!environment?.variables?.some(v => v.kind === 'secret' && v.secretRef === database?.credentials?.managementSecretRef && v.bindingState === 'configured')) problems.push('management_credential_missing');
  const source = { kind: item.config.siteUrlSource, domainId: item.config.domainId, explicitBaseUrl: item.config.siteUrlSource === 'explicit' ? new URL(item.config.siteUrl).origin : null };
  if (!stableBase(record, source) || item.config.siteUrlSource === 'p11_domain' && stableBase(record, source) !== new URL(item.config.siteUrl).origin) problems.push('site_url_action_required');
  let framework = null;
  try { framework = detectBuildArtifact(record.projectBindings?.[0]?.projectRoot).framework; } catch { /* unavailable */ }
  const frameworkNames = { vite: 'VITE_SUPABASE_PUBLISHABLE_KEY', next: 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', astro: 'PUBLIC_SUPABASE_PUBLISHABLE_KEY' };
  // Static products have no framework-specific build prefix, so any approved public name is acceptable; other frameworks keep their exact mapping.
  const variableName = item.config.publishableKeyVariableName;
  const nameMatches = framework === 'static' ? APPROVED_PUBLIC_SUPABASE_KEY_NAMES.has(variableName)
    : Object.hasOwn(frameworkNames, framework) && variableName === frameworkNames[framework];
  if (!nameMatches) problems.push('publishable_variable_framework_mismatch');
  const key = environment?.variables?.find(v => v.kind === 'secret' && v.variableName === item.config.publishableKeyVariableName);
  if (!key || key.bindingState !== 'configured' || key.presenceState !== 'verified_present' || key.backend === 'local_env_file' && key.safetyState !== 'verified_safe') problems.push('publishable_key_missing');
  for (const social of item.config.socialProviders) {
    if (!social.enabled) continue;
    const credential = environment?.variables?.find(v => v.kind === 'secret' && v.secretRef === social.clientSecretRef);
    if (!credential || credential.backend !== 'local_env_file' || credential.bindingState !== 'configured' || credential.presenceState !== 'verified_present' || credential.safetyState !== 'verified_safe') problems.push('social_credential_action_required');
  }
  if (item.observation.state !== 'ready') problems.push('provider_config_unverified');
  else if (item.observation.matchesDesired !== true) problems.push('auth_configuration_differs');
  return { state: problems.length ? 'action_required' : 'ready', problems, projectUrl: database?.providerTarget?.projectRef ? `https://${database.providerTarget.projectRef}.supabase.co` : null, publishableKeyVariableName: item.config.publishableKeyVariableName, localMaterialReady: !!key && key.backend === 'local_env_file' && key.safetyState === 'verified_safe' && key.presenceState === 'verified_present' };
}
export function prepareBuildAuthMutation(runtimeRoot, buildId, request) {
  if (!exact(request, ['action','expectedAuthRevision','input']) || !integer(request.expectedAuthRevision)) return fail('AUTH_MUTATION_INVALID');
  const record = readBuildRecord(runtimeRoot, buildId); const read = readAuthAuthority(record);
  if (!read.ok) return read;
  if (record.pendingRestore) return fail('RESTORE_PENDING');
  const a = read.authority;
  if (a.revision !== request.expectedAuthRevision) return fail('AUTH_REVISION_STALE');
  if (a.pendingOperation) return fail('AUTH_OPERATION_PENDING');
  const i = request.input; let authId;
  if (request.action === 'delete_auth') {
    if (!exact(i, ['authId']) || !a.items.some(x => x.authId === i.authId)) return fail('AUTH_NOT_FOUND');
    authId = i.authId; a.items = a.items.filter(x => x.authId !== authId);
  } else if (['create_auth','update_auth'].includes(request.action)) {
    if (!exact(i, request.action === 'create_auth' ? ['label','databaseId','environmentId','config'] : ['authId','label','databaseId','environmentId','config']) || !text(i.label) || !validAuthConfig(i.config)) return fail('AUTH_CONFIG_INVALID');
    const d = listBuildDatabases(runtimeRoot, buildId); const database = d.ok && d.items.find(d => d.databaseId === i.databaseId);
    if (!database || database.provider !== 'supabase' || database.environmentId !== i.environmentId) return fail('AUTH_DEPENDENCY_MISSING');
    if (!readBuildEnvironment(runtimeRoot, buildId, i.environmentId).ok) return fail('AUTH_DEPENDENCY_MISSING');
    if (i.config.siteUrlSource === 'p11_domain' && stableBase(record, { kind: 'p11_domain', domainId: i.config.domainId, explicitBaseUrl: null }) !== new URL(i.config.siteUrl).origin) return fail('AUTH_DOMAIN_NOT_READY');
    for (const s of i.config.socialProviders) if (s.clientSecretRef && !readBuildSecretBinding(runtimeRoot, buildId, i.environmentId, s.clientSecretRef).ok) return fail('AUTH_SECRET_REF_NOT_FOUND');
    const old = request.action === 'update_auth' ? a.items.find(x => x.authId === i.authId) : null;
    if (request.action === 'update_auth' && !old) return fail('AUTH_NOT_FOUND');
    if (!old && a.items.length >= 32) return fail('AUTH_LIMIT');
    authId = old?.authId || randomUUID();
    const item = { authId, provider: 'supabase', label: i.label, databaseId: i.databaseId, environmentId: i.environmentId, config: structuredClone(i.config), observation: emptyAuthObservation(), createdAt: old?.createdAt || now(), updatedAt: now() };
    a.items = [...a.items.filter(x => x.authId !== authId), item];
  } else return fail('AUTH_MUTATION_INVALID');
  a.revision++;
  return { ok: true, authId, revision: a.revision, record: { ...record, auth: a } };
}
