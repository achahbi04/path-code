/** P13.4–P16 browser boundary: variable names in, safe facts out. */
import { exact, fail } from '../operation-validation.mjs';
const variableFact = v => ({ variableName:v.variableName, backend:v.backend, bindingState:v.bindingState, presenceState:v.presenceState, ...(v.backend === 'local_env_file' ? { safetyState:v.safetyState } : {}) });
export function projectOperationEnvironment(e) { return { environmentId:e.environmentId, name:e.name, variables:e.variables.filter(v => v.kind === 'secret').map(variableFact) }; }
const operationFact = o => o ? Object.fromEntries(['operationId','databaseId','authId','nativeId','state','providerProjectName','organizationSlug','region','failureCode','createdAt','updatedAt','sourceSha','sourceTreeSha','capacitorVersion','framework','packageManager'].filter(k => Object.hasOwn(o,k)).map(k => [k,o[k]])) : null;
function credentialFact(environment, ref) {
  const v = environment?.variables?.find(v => v.kind === 'secret' && v.secretRef === ref);
  return v ? { resolved:true, ...variableFact(v) } : { resolved:false };
}
export function projectDatabase(database,environments) {
  const e = environments.find(e => e.environmentId === database.environmentId);
  const management = credentialFact(e,database.credentials.managementSecretRef);
  const databaseUrl = credentialFact(e,database.credentials.databaseUrlSecretRef);
  const usable = c => c.resolved && c.backend === 'local_env_file' && c.bindingState === 'configured' && c.presenceState === 'verified_present' && c.safetyState === 'verified_safe';
  const readiness = { providerReady: usable(management) && database.providerObservation.state === 'ready', connectionReady: usable(databaseUrl) && database.connectionObservation.state === 'ready', credentialActionRequired: !usable(databaseUrl) };
  return { readiness, databaseId:database.databaseId, provider:database.provider, engine:database.engine, label:database.label, environmentId:database.environmentId, environmentName:e?.name || null, source:database.source,
    providerTarget:{...database.providerTarget}, providerObservation:{...database.providerObservation}, connectionObservation:{...database.connectionObservation}, migrationObservation:{...database.migrationObservation},
    credentials:{ management, databaseUrl }, createdAt:database.createdAt, updatedAt:database.updatedAt };
}
export function projectAuth(item,environments) {
  const e = environments.find(e => e.environmentId === item.environmentId);
  return { authId:item.authId, provider:item.provider, label:item.label, databaseId:item.databaseId, environmentId:item.environmentId, environmentName:e?.name || null,
    config:{ ...item.config, socialProviders:item.config.socialProviders.map(s => ({ provider:s.provider, enabled:s.enabled, clientId:s.clientId, credential:credentialFact(e,s.clientSecretRef) })) },
    observation:item.observation, readiness:item.readiness, createdAt:item.createdAt, updatedAt:item.updatedAt };
}
const status = r => r?.ok ? 200 : /STALE|PENDING|REFERENCED|NOT_EMPTY/.test(r?.code) ? 409 : /NOT_FOUND/.test(r?.code) ? 404 : 400;
const onlySafe = r => r?.ok ? Object.fromEntries(['ok','revision','databaseId','authId','paymentId','nativeId','operationId','state','regions','observation','artifactId','providerResourceChanged','credentialMaterialChanged'].filter(k => Object.hasOwn(r,k)).map(k => [k,r[k]])) : {ok:false,code:r?.code || 'OPERATION_FAILED'};
const noRefs = body => !/"(?:secretRef|\w*SecretRef|credential|authorization|token|password)"\s*:/i.test(JSON.stringify(body));
export async function handleOperationSurface({ coordinator, buildId, action, sub, method, body, send }) {
  if (!['databases','auth','payments','native'].includes(action)) return false;
  const environments = await coordinator.listEnvironments(buildId);
  if (!environments?.ok) { send(status(environments),onlySafe(environments)); return true; }
  const envs = environments.items;
  const resolveVariable = async (environmentId,variableName) => {
    const e = envs.find(e => e.environmentId === environmentId);
    return e?.variables?.find(v => v.kind === 'secret' && v.variableName === variableName)?.secretRef || null;
  };
  if (method === 'GET') {
    if (action === 'databases' && sub === 'catalog') { const r = await coordinator.listDatabaseCatalog(); send(status(r),r); return true; }
    const r = await coordinator.request(`build.${action}.list`,{buildId});
    if (!r?.ok) { send(status(r),onlySafe(r)); return true; }
    let items = action === 'native' ? r.profiles : r.items;
    if (sub) {
      const field = {databases:'databaseId',auth:'authId',payments:'paymentId',native:'nativeId'}[action];
      items = items.filter(i => i[field] === sub);
      if (!items.length) { send(404,fail('OPERATION_NOT_FOUND')); return true; }
    }
    const project = action === 'databases' ? i => projectDatabase(i,envs) : action === 'auth' ? i => projectAuth(i,envs) : i => i;
    const source = await coordinator.getBuild(buildId);
    send(200,{ok:true,authoritativeSha:source?.build?.authoritativeSha || null,revision:r.revision,environmentRevision:environments.revision,items:items.map(project),environments:envs.map(projectOperationEnvironment),
      pendingOperation:operationFact(r.pendingOperation),operationHistory:(r.operationHistory || []).map(operationFact),
      ...(action === 'native' ? { artifacts:r.artifacts } : {}),
      ...(action === 'auth' || action === 'payments' ? { domains: (await coordinator.listDomains(buildId))?.domains?.filter(d => d.attachmentState === 'attached' && d.verificationState === 'verified' && d.tlsState === 'ready').map(d => ({domainId:d.domainId,fqdn:d.fqdn})) || [] } : {}) });
    return true;
  }
  if (method !== 'POST' || !noRefs(body)) { send(400,fail('BROWSER_OPERATION_INVALID')); return true; }
  let result;
  if (action === 'databases') {
    if (sub === 'mutate') {
      if (!exact(body,['action','expectedDatabaseRevision','input'])) { send(400,fail('DATABASE_MUTATION_INVALID')); return true; }
      let input = body.input;
      if (['bind_management_credential','bind_database_url'].includes(body.action)) {
        if (!exact(input,['databaseId','variableName'])) { send(400,fail('DATABASE_MUTATION_INVALID')); return true; }
        const read = await coordinator.readDatabase(buildId,input.databaseId);
        const ref = read?.ok && await resolveVariable(read.database.environmentId,input.variableName);
        if (!ref) { send(404,fail('DATABASE_SECRET_REF_NOT_FOUND')); return true; }
        input = {databaseId:input.databaseId,secretRef:ref};
      }
      result = await coordinator.mutateDatabase(buildId,{...body,input});
    } else if (['verify-provider','verify-connection'].includes(sub)) {
      if (!exact(body,['databaseId','expectedDatabaseRevision','expectedEnvironmentRevision'])) { send(400,fail('DATABASE_REQUEST_INVALID')); return true; }
      result = await coordinator.request(`build.databases.${sub === 'verify-provider' ? 'verifyProvider':'verifyConnection'}`,{...body,buildId});
    } else if (sub === 'regions') {
      if (!exact(body,['databaseId','organizationSlug','expectedDatabaseRevision','expectedEnvironmentRevision'])) { send(400,fail('DATABASE_REQUEST_INVALID')); return true; }
      result = await coordinator.request('build.databases.availableRegions',{...body,buildId});
    } else if (sub === 'provision-prepare') {
      if (!exact(body,['databaseId','expectedDatabaseRevision','expectedEnvironmentRevision','organizationSlug','region','provisionPasswordVariableName','acknowledgeProviderBilling'])) { send(400,fail('DATABASE_REQUEST_INVALID')); return true; }
      const read = await coordinator.readDatabase(buildId,body.databaseId);
      const ref = read?.ok && await resolveVariable(read.database.environmentId,body.provisionPasswordVariableName);
      if (!ref) { send(404,fail('DATABASE_SECRET_REF_NOT_FOUND')); return true; }
      const {provisionPasswordVariableName,...input} = body;
      result = await coordinator.prepareDatabaseProvision(buildId,{...input,provisionPasswordSecretRef:ref});
    } else if (['provision-execute','provision-observe'].includes(sub)) {
      if (!exact(body,['operationId','expectedDatabaseRevision','expectedEnvironmentRevision'])) { send(400,fail('DATABASE_REQUEST_INVALID')); return true; }
      result = await coordinator.request(`build.databases.${sub === 'provision-execute' ? 'provisionExecute':'provisionObserve'}`,{...body,buildId});
    } else if (sub === 'migrations-observe') {
      if (!exact(body,['databaseId','expectedDatabaseRevision','expectedEnvironmentRevision','expectedAuthoritativeSha'])) { send(400,fail('DATABASE_REQUEST_INVALID')); return true; }
      result = await coordinator.request('build.databases.observeMigrations',{...body,buildId});
    }
  } else if (action === 'auth') {
    if (sub === 'mutate') {
      if (!exact(body,['action','expectedAuthRevision','input'])) { send(400,fail('AUTH_MUTATION_INVALID')); return true; }
      const input = structuredClone(body.input);
      if (input?.config?.socialProviders) {
        if (!Array.isArray(input.config.socialProviders)) { send(400,fail('AUTH_CONFIG_INVALID')); return true; }
        for (const s of input.config.socialProviders) {
          if (!exact(s,['provider','enabled','clientId','clientSecretVariableName'])) { send(400,fail('AUTH_CONFIG_INVALID')); return true; }
          const ref = s.clientSecretVariableName === null ? null : await resolveVariable(input.environmentId,s.clientSecretVariableName);
          if (s.clientSecretVariableName !== null && !ref) { send(404,fail('AUTH_SECRET_REF_NOT_FOUND')); return true; }
          delete s.clientSecretVariableName; s.clientSecretRef = ref;
        }
      }
      result = await coordinator.request('build.auth.mutate',{...body,input,buildId});
    } else if (['observe','apply-prepare','apply-execute','apply-observe'].includes(sub)) {
      result = await coordinator.request(`build.auth.${{'apply-prepare':'applyPrepare','apply-execute':'applyExecute','apply-observe':'applyObserve',observe:'observe'}[sub]}`,{...body,buildId});
    }
  } else if (action === 'payments' && sub === 'mutate') result = await coordinator.request('build.payments.mutate',{...body,buildId});
  else if (action === 'native' && ['mutate','prepare','execute','observe'].includes(sub)) result = await coordinator.request(`build.native.${sub}`,{...body,buildId});
  send(result ? status(result) : 404,result ? onlySafe(result) : fail('OPERATION_ROUTE_NOT_FOUND'));
  return true;
}
