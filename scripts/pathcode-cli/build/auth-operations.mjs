/** P14 orchestration steps; all durable writes use the existing coordinator gate. */
import { randomUUID } from 'node:crypto';
import { readBuildRecord, writeBuildRecord } from './record.mjs';
import { readAuthAuthority, emptyAuthObservation } from './auth.mjs';
import { resolveExactLocalEnvValues } from './runtime/local-env-resolve.mjs';
import { verifiedSafeLocalSecretNames } from './runtime/local-env-coexistence.mjs';
import { desiredAuthPatch, authConfigDigest, validReducedAuthConfig, AUTH_ADAPTER_VERSION } from './supabase-auth-adapter.mjs';
import { exact, integer, digest, fail, now, stableBase } from './operation-validation.mjs';

function snapshot(runtimeRoot, buildId, p) {
  if (!exact(p, ['authId','expectedAuthRevision','expectedDatabaseRevision','expectedEnvironmentRevision']) || !['expectedAuthRevision','expectedDatabaseRevision','expectedEnvironmentRevision'].every(k => integer(p[k]))) return fail('AUTH_REQUEST_INVALID');
  const record = readBuildRecord(runtimeRoot, buildId), read = readAuthAuthority(record);
  if (!read.ok) return read;
  if (record.pendingRestore) return fail('RESTORE_PENDING');
  if (read.authority.revision !== p.expectedAuthRevision || (record.databases?.revision ?? 0) !== p.expectedDatabaseRevision || (record.environments?.revision ?? 0) !== p.expectedEnvironmentRevision) return fail('AUTH_AUTHORITY_STALE');
  const item = read.authority.items.find(i => i.authId === p.authId);
  if (!item) return fail('AUTH_NOT_FOUND');
  const database = record.databases?.items?.find(d => d.databaseId === item.databaseId && d.environmentId === item.environmentId);
  const environment = record.environments?.items?.find(e => e.environmentId === item.environmentId);
  if (!database || !environment) return fail('AUTH_DEPENDENCY_MISSING');
  if (!database.providerTarget?.projectRef || database.providerObservation?.state !== 'ready') return fail('AUTH_DATABASE_NOT_READY');
  const source = { kind: item.config.siteUrlSource, domainId: item.config.domainId, explicitBaseUrl: item.config.siteUrlSource === 'explicit' ? new URL(item.config.siteUrl).origin : null };
  if (!stableBase(record, source) || item.config.siteUrlSource === 'p11_domain' && stableBase(record, source) !== new URL(item.config.siteUrl).origin) return fail('AUTH_DOMAIN_NOT_READY');
  const refs = { management: database.credentials.managementSecretRef };
  for (const s of item.config.socialProviders) if (s.enabled) refs[s.provider] = s.clientSecretRef;
  const names = {};
  for (const [role, ref] of Object.entries(refs)) {
    const v = environment.variables.find(v => v.kind === 'secret' && v.secretRef === ref);
    if (!v || v.backend !== 'local_env_file' || v.bindingState !== 'configured' || v.presenceState !== 'verified_present' || v.safetyState !== 'verified_safe') return fail('AUTH_CREDENTIAL_MATERIAL_UNAVAILABLE');
    names[role] = v.variableName;
  }
  return { ok: true, record, authority: read.authority, item, database, names, projectRoot: record.projectBindings?.[0]?.projectRoot,
    allowedNativeNames: verifiedSafeLocalSecretNames(environment.variables), domainRevision: record.p11Domains?.revision ?? 0 };
}
function material(s) {
  try {
    const r = resolveExactLocalEnvValues({ projectRoot: s.projectRoot, exactNames: [...new Set(Object.values(s.names))], allowedNativeNames: s.allowedNativeNames });
    return r.ok ? { ok: true, values: Object.fromEntries(Object.entries(s.names).map(([k,n]) => [k,r.values[n]])) } : fail('AUTH_CREDENTIAL_SOURCE_UNSAFE');
  } catch { return fail('AUTH_CREDENTIAL_SOURCE_UNSAFE'); }
}
function observation(outcome, projectRef, desiredConfig) {
  const c = outcome?.config;
  // Persist only our own reduced facts, regardless of injected adapter output.
  if (!outcome?.ok || !validReducedAuthConfig(c)) return { ...emptyAuthObservation(), state: 'unavailable', observedAt: now(), failureCode: ['AUTH_PROVIDER_PERMISSION_REQUIRED','AUTH_PROVIDER_UNAVAILABLE','AUTH_PROVIDER_RESPONSE_UNSAFE'].includes(outcome?.code) ? outcome.code : 'AUTH_PROVIDER_RESPONSE_UNSAFE' };
  const desired = desiredAuthPatch(desiredConfig, {google:'present',github:'present'});
  const matchesDesired = Object.entries(desired).every(([k,v]) => k.endsWith('_secret') ? c[k+'_present'] : c[k] === v);
  return { matchesDesired, state: 'ready', adapterVersion: AUTH_ADAPTER_VERSION, projectRef, configDigest: authConfigDigest(c), siteUrl: c.site_url, redirectUrlsDigest: digest(c.uri_allow_list.split(',').filter(Boolean)), enabledMethods: ['email','google','github'].filter(p => c[`external_${p}_enabled`] === true), observedAt: now(), failureCode: null };
}
export async function runAuthOperation({ runtimeRoot, buildId, action, params, exclusive, adapter }) {
  // A preparation has made no provider effect. Explicit reconcile can discard
  // it locally even if the credential was removed after preparation.
  if (action === 'applyObserve') {
    const cancelled = await exclusive(buildId, () => {
      const record = readBuildRecord(runtimeRoot,buildId), read = readAuthAuthority(record);
      if (!read.ok || !exact(params,['authId','expectedAuthRevision','expectedDatabaseRevision','expectedEnvironmentRevision'])) return null;
      if (record.pendingRestore) return fail('RESTORE_PENDING');
      const a = read.authority;
      if (a.pendingOperation?.state !== 'prepared') return null;
      if (a.revision !== params.expectedAuthRevision || a.pendingOperation.authId !== params.authId || (record.databases?.revision ?? 0) !== params.expectedDatabaseRevision || (record.environments?.revision ?? 0) !== params.expectedEnvironmentRevision) return fail('AUTH_AUTHORITY_STALE');
      a.operationHistory = [...a.operationHistory,{...a.pendingOperation,state:'failed_no_effect',failureCode:'AUTH_PREPARATION_CANCELLED',updatedAt:now()}].slice(-20);
      a.pendingOperation = null; a.revision++;
      writeBuildRecord(runtimeRoot,{...record,auth:a});
      return {ok:true,revision:a.revision,state:'failed_no_effect'};
    });
    if (cancelled) return cancelled;
  }
  const s = await exclusive(buildId, () => snapshot(runtimeRoot, buildId, params));
  if (!s.ok) return s;
  const a = s.authority;
  if (action === 'applyPrepare') {
    return exclusive(buildId, () => {
      const current = snapshot(runtimeRoot, buildId, params);
      if (!current.ok) return current;
      if (a.pendingOperation) return fail('AUTH_OPERATION_PENDING');
      if (s.item.observation.state !== 'ready' || !s.item.observation.configDigest) return fail('AUTH_OBSERVATION_REQUIRED');
      const operation = { operationId: randomUUID(), authId: s.item.authId, state: 'prepared', authRevision: a.revision + 1,
        databaseRevision: params.expectedDatabaseRevision, environmentRevision: params.expectedEnvironmentRevision, domainRevision: s.domainRevision,
        desiredDigest: digest(s.item.config), observedDigest: s.item.observation.configDigest, createdAt: now(), updatedAt: now(), failureCode: null };
      a.revision++; a.pendingOperation = operation;
      writeBuildRecord(runtimeRoot, { ...current.record, auth: a });
      return { ok: true, revision: a.revision, operationId: operation.operationId, state: operation.state };
    });
  }
  if (action === 'observe' && a.pendingOperation) return fail('AUTH_OPERATION_PENDING');
  const values = material(s); if (!values.ok) return values;
  const input = { credential: values.values.management, projectRef: s.database.providerTarget.projectRef };
  const checked = () => {
    const c = snapshot(runtimeRoot, buildId, params);
    const m = c.ok && material(c);
    return c.ok && c.domainRevision === s.domainRevision && m.ok && digest(m.values) === digest(values.values) ? c : fail('AUTH_AUTHORITY_STALE');
  };
  const callObserve = async () => { try { return await adapter.observe(input); } catch { return fail('AUTH_PROVIDER_UNAVAILABLE'); } };
  let outcome = await callObserve();
  if (action === 'applyExecute') {
    const op = a.pendingOperation;
    if (!op || op.authId !== s.item.authId || op.state !== 'prepared' || op.authRevision !== a.revision || op.databaseRevision !== params.expectedDatabaseRevision || op.environmentRevision !== params.expectedEnvironmentRevision || op.domainRevision !== s.domainRevision || op.desiredDigest !== digest(s.item.config)) return fail('AUTH_OPERATION_STALE');
    const safe = observation(outcome, input.projectRef, s.item.config);
    if (safe.state !== 'ready' || safe.configDigest !== op.observedDigest) {
      return exclusive(buildId, () => {
        const c = checked(); if (!c.ok) return c;
        const terminal = { ...op, state: 'failed_no_effect', failureCode: safe.state === 'ready' ? 'AUTH_PROVIDER_CONFIG_DRIFTED' : safe.failureCode, updatedAt: now() };
        a.pendingOperation = null; a.operationHistory = [...a.operationHistory, terminal].slice(-20); a.revision++;
        writeBuildRecord(runtimeRoot, { ...c.record, auth: a });
        return fail(terminal.failureCode);
      });
    }
    const desired = desiredAuthPatch(s.item.config, values.values);
    const patch = Object.fromEntries(Object.entries(desired).filter(([k,v]) => k.endsWith('_secret') ? !outcome.config[k + '_present'] : outcome.config[k] !== v));
    const started = await exclusive(buildId, () => {
      const c = checked(); if (!c.ok) return c;
      a.pendingOperation = { ...op, state: 'effect_started', updatedAt: now() }; a.revision++;
      writeBuildRecord(runtimeRoot, { ...c.record, auth: a });
      return { ok: true };
    });
    if (!started.ok) return started;
    if (Object.keys(patch).length) {
      try { outcome = await adapter.patch(input, patch); } catch { outcome = fail('AUTH_PROVIDER_UNAVAILABLE'); }
    }
    // Recheck all authorities and material after the one possible mutation.
    return exclusive(buildId, () => {
      const record = readBuildRecord(runtimeRoot, buildId);
      const local = material(s);
      const unchanged = record && !record.pendingRestore && record.auth?.revision === a.revision && (record.databases?.revision ?? 0) === params.expectedDatabaseRevision && (record.environments?.revision ?? 0) === params.expectedEnvironmentRevision && (record.p11Domains?.revision ?? 0) === s.domainRevision && local.ok && digest(local.values) === digest(values.values);
      if (!record || record.auth?.pendingOperation?.operationId !== op.operationId) return fail('AUTH_AUTHORITY_STALE');
      const auth = readAuthAuthority(record); if (!auth.ok) return auth;
      const final = auth.authority;
      const obs = observation(outcome, input.projectRef, s.item.config);
      const terminal = { ...op, state: unchanged && obs.state === 'ready' ? 'completed' : 'uncertain', failureCode: unchanged ? obs.failureCode : 'AUTH_AUTHORITY_STALE', updatedAt: now() };
      if (terminal.state === 'completed') final.pendingOperation = null; else final.pendingOperation = terminal;
      if (terminal.state === 'completed') final.operationHistory = [...final.operationHistory, terminal].slice(-20);
      if (unchanged) final.items = final.items.map(i => i.authId === s.item.authId ? { ...i, observation: obs, updatedAt: now() } : i);
      final.revision++;
      writeBuildRecord(runtimeRoot, { ...record, auth: final });
      return { ok: true, revision: final.revision, state: terminal.state, observation: unchanged ? obs : null };
    });
  }
  if (!['observe','applyObserve'].includes(action)) return fail('AUTH_REQUEST_INVALID');
  return exclusive(buildId, () => {
    const c = checked(); if (!c.ok) return c;
    const obs = observation(outcome, input.projectRef, s.item.config);
    a.items = a.items.map(i => i.authId === s.item.authId ? { ...i, observation: obs, updatedAt: now() } : i);
    // Explicit observation never retries PATCH. Recover ambiguity as observed facts.
    if (action === 'applyObserve' && a.pendingOperation && a.pendingOperation.authId === s.item.authId && true) {
      const terminal = { ...a.pendingOperation, state: a.pendingOperation.state === 'prepared' ? 'failed_no_effect' : 'interrupted', failureCode: 'AUTH_APPLY_REVIEW_REQUIRED', updatedAt: now() };
      a.operationHistory = [...a.operationHistory, terminal].slice(-20); a.pendingOperation = null;
    }
    a.revision++;
    writeBuildRecord(runtimeRoot, { ...c.record, auth: a });
    return { ok: true, revision: a.revision, observation: obs };
  });
}
