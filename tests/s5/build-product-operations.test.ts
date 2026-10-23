import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync, existsSync, truncateSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createBuildCoordinatorService, createBuildRecordSkeleton, writeBuildRecord, readBuildRecord, readBuildEvents, resolveBuildRecordPath } from '../../scripts/pathcode-cli/build/index.mjs';
import { resolvePathPackageRoot } from '../../scripts/pathcode-cli/paths.mjs';
const load = async (name: string) => import(new URL(`../../scripts/pathcode-cli/build/${name}.mjs`,import.meta.url).href);
const roots: string[] = []; const services: any[] = [];
afterEach(async()=>{for(const s of services.splice(0))await s.close(); for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true});});
async function fixture(options: any = {}) {
 const root=mkdtempSync(join(tmpdir(),'path-tranche-'));roots.push(root);
 const project=join(root,'project');mkdirSync(project);mkdirSync(join(project,'public'));
 writeFileSync(join(project,'public/index.html'),'<html>Canonical product</html>');writeFileSync(join(project,'.gitignore'),'.env.local\n');
 const git=(...args:string[])=>execFileSync('git',args,{cwd:project,encoding:'utf8'}).trim();
 git('init','-q');git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@example.com','commit','-qm','canonical');
 const record=createBuildRecordSkeleton({outcome:'Tranche fixture'});record.projectBindings.push({bindingId:'fixture',projectRoot:project});record.loop.status='paused';record.authoritativeSha=git('rev-parse','HEAD');writeBuildRecord(root,record);
 const service=await (createBuildCoordinatorService as any)({runtimeRoot:root,packageRoot:resolvePathPackageRoot(),fakeMode:true,...options});services.push(service);await service.whenReady;
 const call=(method:string,p:any={})=>service.dispatch('build.'+method,{buildId:record.buildId,...p});
 const env=await call('environments.mutate',{action:'create_environment',expectedEnvironmentRevision:0,input:{name:'Local build'}});
 return {root,project,record,service,call,git,environmentId:env.environmentId};
}
async function authFixture(adapter?:any) {
 const {reduceAuthConfig}=await load('supabase-auth-adapter');
 const raw:any={site_url:'https://app.example.com',uri_allow_list:'https://app.example.com/callback',disable_signup:false,external_email_enabled:true,mailer_autoconfirm:false,external_google_enabled:false,external_github_enabled:false,external_google_client_id:'',external_github_client_id:'',external_google_secret:'PROVIDER_SECRET_SENTINEL',external_github_secret:null};
 let patches=0,observes=0;
 const provider=adapter || {observe:async()=>{observes++;return {ok:true,config:reduceAuthConfig(raw)};},patch:async(_input:any,patch:any)=>{patches++;Object.assign(raw,patch);return {ok:true,config:reduceAuthConfig(raw)};}};
 const f=await fixture({authAdapter:provider,databaseVerificationAdapters:{supabase:{provider:{provider:'supabase',adapterVersion:'synthetic.v1',verify:async()=>({ok:true,projectRef:'projectref',organizationSlug:null,region:null,projectStatus:'ACTIVE_HEALTHY'})}}}});
 writeFileSync(join(f.project,'package.json'),JSON.stringify({dependencies:{vite:'1.0.0'}}));
 writeFileSync(join(f.project,'.env.local'),'MGMT=SYNTHETIC_MANAGEMENT_SENTINEL\nVITE_SUPABASE_PUBLISHABLE_KEY=SYNTHETIC_PUBLIC_SENTINEL\nGOOGLE_SECRET=SYNTHETIC_GOOGLE_SENTINEL\n');
 let revision=1; const refs:any={};
 for(const variableName of ['MGMT','VITE_SUPABASE_PUBLISHABLE_KEY','GOOGLE_SECRET']){
  const b=await f.call('environments.mutate',{action:'bind_secret',expectedEnvironmentRevision:revision++,input:{environmentId:f.environmentId,variableName,backend:'local_env_file'}});refs[variableName]=b.secretRef;
 }
 for (const variableName of ['MGMT','VITE_SUPABASE_PUBLISHABLE_KEY','GOOGLE_SECRET']) {
  const v=await f.call('environments.verifyLocal',{environmentId:f.environmentId,variableName,expectedEnvironmentRevision:revision++});expect(v).toMatchObject({ok:true});
 }
 const db=await f.call('databases.mutate',{action:'create_database',expectedDatabaseRevision:0,input:{provider:'supabase',label:'Primary database',environmentId:f.environmentId,source:'existing'}});
 await f.call('databases.mutate',{action:'set_provider_target',expectedDatabaseRevision:1,input:{databaseId:db.databaseId,projectRef:'projectref',organizationSlug:null,region:null}});
 await f.call('databases.mutate',{action:'bind_management_credential',expectedDatabaseRevision:2,input:{databaseId:db.databaseId,secretRef:refs.MGMT}});
 const fullEnv = readFileSync(join(f.project,'.env.local'),'utf8');
 writeFileSync(join(f.project,'.env.local'),'MGMT=SYNTHETIC_MANAGEMENT_SENTINEL\n');
 expect((await f.call('databases.verifyProvider',{databaseId:db.databaseId,expectedDatabaseRevision:3,expectedEnvironmentRevision:revision})).ok).toBe(true);
 writeFileSync(join(f.project,'.env.local'),fullEnv);
 const config={siteUrlSource:'explicit',domainId:null,siteUrl:'https://app.example.com',redirectUrls:['https://app.example.com/new-callback'],signupEnabled:true,emailEnabled:true,emailConfirmationRequired:true,publishableKeyVariableName:'VITE_SUPABASE_PUBLISHABLE_KEY',socialProviders:[]};
 const auth=await f.call('auth.mutate',{action:'create_auth',expectedAuthRevision:0,input:{label:'Customer sign-in',databaseId:db.databaseId,environmentId:f.environmentId,config}});expect(auth.ok).toBe(true);
 const parameters=async()=>({authId:auth.authId,expectedAuthRevision:(await f.call('auth.list')).revision,expectedDatabaseRevision:(await f.call('databases.list')).revision,expectedEnvironmentRevision:(await f.call('environments.list')).revision});
 return {...f,raw,refs,auth,config,databaseId:db.databaseId,parameters,counts:()=>({patches,observes})};
}
describe('P14 authentication authority and orchestration',()=>{
 it('projects legacy-empty planes without writes, rejects invalid schemas and exact-key violations',async()=>{
  const f=await fixture();const before=readFileSync(resolveBuildRecordPath(f.root,f.record.buildId),'utf8');
  for(const plane of ['auth','payments','native'])expect(await f.call(plane+'.list')).toMatchObject({ok:true,revision:0});
  expect(readFileSync(resolveBuildRecordPath(f.root,f.record.buildId),'utf8')).toBe(before);
  expect((await f.call('auth.list',{credential:'forbidden'})).ok).toBe(false);
  const r:any=readBuildRecord(f.root,f.record.buildId);r.auth={schema:'wrong'};writeBuildRecord(f.root,r);expect(await f.call('auth.list')).toMatchObject({ok:false,code:'AUTH_INVALID'});
 });
 it('observes reduced facts, prepares durably, patches changed owned fields once, protects referenced P13',async()=>{
  const f=await authFixture();
  expect(await f.call('databases.mutate',{action:'delete_database',expectedDatabaseRevision:4,input:{databaseId:f.databaseId,acknowledgeExternalResourceRetained:true}})).toMatchObject({ok:false,code:'DATABASE_REFERENCED'});
  expect(await f.call('auth.observe',await f.parameters())).toMatchObject({ok:true,observation:{state:'ready'}});
  const prepare=await f.call('auth.applyPrepare',await f.parameters());expect(prepare).toMatchObject({ok:true,state:'prepared'});expect(f.counts().patches).toBe(0);
  expect(await f.call('auth.applyExecute',await f.parameters())).toMatchObject({ok:true,state:'completed'});expect(f.counts().patches).toBe(1);
  expect(await f.call('auth.applyExecute',await f.parameters())).toMatchObject({ok:false});expect(f.counts().patches).toBe(1);
  const encoded=JSON.stringify(readBuildRecord(f.root,f.record.buildId))+JSON.stringify(readBuildEvents(f.root,f.record.buildId));
  for(const sentinel of ['SYNTHETIC_MANAGEMENT_SENTINEL','PROVIDER_SECRET_SENTINEL','SYNTHETIC_GOOGLE_SENTINEL'])expect(encoded).not.toContain(sentinel);
 });
 it('blocks dashboard drift with a fresh GET and no PATCH',async()=>{
  const f=await authFixture();await f.call('auth.observe',await f.parameters());await f.call('auth.applyPrepare',await f.parameters());f.raw.disable_signup=true;
  expect(await f.call('auth.applyExecute',await f.parameters())).toMatchObject({ok:false,code:'AUTH_PROVIDER_CONFIG_DRIFTED'});expect(f.counts().patches).toBe(0);
 });
 it('refuses stale P9 revisions, pending restore, foreign environment and unknown patch fields',async()=>{
  const f=await authFixture();const p=await f.parameters();
  expect(await f.call('auth.observe',{...p,expectedEnvironmentRevision:0})).toMatchObject({ok:false,code:'AUTH_AUTHORITY_STALE'});
  expect(await f.call('auth.mutate',{action:'create_auth',expectedAuthRevision:1,input:{label:'Foreign',databaseId:f.databaseId,environmentId:'foreign',config:f.config}})).toMatchObject({ok:false,code:'AUTH_DEPENDENCY_MISSING'});
  expect(await f.call('auth.mutate',{action:'update_auth',expectedAuthRevision:1,input:{authId:f.auth.authId,label:'Bad',databaseId:f.databaseId,environmentId:f.environmentId,config:{...f.config,jwt_secret:'forbidden'}}})).toMatchObject({ok:false,code:'AUTH_CONFIG_INVALID'});
  const r:any=readBuildRecord(f.root,f.record.buildId);r.pendingRestore={restoreId:'pending'};writeBuildRecord(f.root,r);expect(await f.call('auth.observe',p)).toMatchObject({ok:false,code:'RESTORE_PENDING'});
 });
 it('degrades manually dangling dependencies and framework readiness without crashing',async()=>{
  const f=await authFixture();const r:any=readBuildRecord(f.root,f.record.buildId);r.databases.items=[];writeBuildRecord(f.root,r);
  const listed=await f.call('auth.list');expect(listed.items[0].readiness).toMatchObject({state:'action_required',problems:expect.arrayContaining(['dependency_missing'])});
 });
});
describe('P14 provider contract',()=>{
 it('reduces secret presence only and hashes independently of secret values',async()=>{
  const m=await load('supabase-auth-adapter'); const f=await authFixture();const one=m.reduceAuthConfig(f.raw),two=m.reduceAuthConfig({...f.raw,external_google_secret:'OTHER_SECRET_SENTINEL'});
  expect(one).toEqual(two);expect(m.authConfigDigest(one)).toEqual(m.authConfigDigest(two));expect(JSON.stringify(one)).not.toContain('PROVIDER_SECRET_SENTINEL');
 });
 it('uses fixed endpoints and exact PATCH allowlist with comma-separated redirect strings',async()=>{
  const m=await load('supabase-auth-adapter');const f=await authFixture();const calls:any[]=[];
  const adapter=m.createSupabaseAuthAdapter({executor:async(spec:any)=>{calls.push(spec);return{statusCode:200,body:Buffer.from(JSON.stringify(f.raw))};}});
  const input={credential:'synthetic',projectRef:'projectref'};
  await adapter.observe(input);await adapter.patch(input,{uri_allow_list:'https://app.example.com/callback'});
  expect(calls.map(c=>c.method)).toEqual(['GET','PATCH']);expect(calls[0]).toMatchObject({hostname:'api.supabase.com',path:'/v1/projects/projectref/config/auth',rejectUnauthorized:true});
  expect(JSON.parse(calls[1].body)).toEqual({uri_allow_list:'https://app.example.com/callback'});
  expect(await adapter.patch(input,{jwt_secret:'forbidden'})).toMatchObject({ok:false,code:'AUTH_PATCH_INVALID'});expect(calls).toHaveLength(2);
 });
 it.each(['rk_test_synthetic123','rk_live_synthetic123','whsec_synthetic123','sb_secret_synthetic123'])('rejects new secret prefix in non-secret config: %s',async(value)=>{
  const f=await fixture();expect(await f.call('environments.mutate',{action:'set_config',expectedEnvironmentRevision:1,input:{environmentId:f.environmentId,variableName:'PUBLIC_VALUE',value}})).toMatchObject({ok:false});
 });
});
async function paymentFixture(existing?: any) {
 const f=existing || await fixture();
 const i=await f.call('integrations.mutate',{action:'create_integration',expectedIntegrationRevision:0,input:{providerKey:'stripe',label:'Stripe test account'}});
 const b=await f.call('integrations.mutate',{action:'bind_environment',expectedIntegrationRevision:1,input:{integrationId:i.integrationId,environmentId:f.environmentId}});
 const {PAYMENT_EVENTS}=await load('payments');
 const config={label:'Customer checkout',integrationId:i.integrationId,verificationBindingId:b.bindingId,runtimeEnvironmentId:f.environmentId,expectedMode:'test',checkout:{mode:'payment',priceIds:['price_synthetic123'],successPath:'/success',cancelPath:'/cancel',webhookPath:'/api/stripe/webhook',requiredWebhookEvents:[...PAYMENT_EVENTS.payment]},urlSource:{kind:'explicit',domainId:null,explicitBaseUrl:'https://app.example.com'},dependencies:{authId:null,databaseId:null},webhook:{endpointId:null,signingSecretVariableName:'STRIPE_WEBHOOK_SECRET'}};
 const payment=await f.call('payments.mutate',{action:'create_payment',expectedPaymentRevision:0,input:config});expect(payment.ok).toBe(true);
 return {...f,integrationId:i.integrationId,bindingId:b.bindingId,config,payment};
}
describe('P15 payments',()=>{
 it('adds Stripe without changing GitHub roles or the strict P12 verification shape',async()=>{
  const f=await fixture();const providers=(await f.service.dispatch('build.integrations.catalog')).providers;
  expect(providers).toEqual([{providerKey:'github',displayName:'GitHub',credentialRoles:[{role:'token',required:true}]},{providerKey:'stripe',displayName:'Stripe',credentialRoles:[{role:'secret_key',required:true}]}]);
 });
 it('separates verification from production runtime presence, enforces reference guards and stale revisions',async()=>{
  const f=await paymentFixture();const listed=await f.call('payments.list');
  expect(listed.items[0].readiness).toMatchObject({state:'action_required',verificationIdentity:'not_verified',verifiedMode:'unknown',runtimeSecret:'missing',webhookSecret:'missing',crossBackendIdentityProven:false});
  expect(await f.call('integrations.mutate',{action:'unbind_environment',expectedIntegrationRevision:2,input:{integrationId:f.integrationId,bindingId:f.bindingId}})).toMatchObject({ok:false,code:'INTEGRATION_REFERENCED'});
  expect(await f.call('payments.mutate',{action:'delete_payment',expectedPaymentRevision:0,input:{paymentId:f.payment.paymentId}})).toMatchObject({ok:false,code:'PAYMENT_REVISION_STALE'});
  expect(await f.call('payments.mutate',{action:'delete_payment',expectedPaymentRevision:1,input:{paymentId:f.payment.paymentId}})).toMatchObject({ok:true,revision:2});
 });
 it('degrades dangling dependencies, requires exact frozen events and rejects arbitrary paths and Price IDs',async()=>{
  const f=await paymentFixture();
  for(const patch of [{priceIds:['prod_wrong']},{successPath:'https://foreign.example'},{cancelPath:'//foreign.example'},{webhookPath:'/../secret'},{requiredWebhookEvents:['*']}])
    expect(await f.call('payments.mutate',{action:'update_payment',expectedPaymentRevision:1,input:{...f.config,paymentId:f.payment.paymentId,checkout:{...f.config.checkout,...patch}}})).toMatchObject({ok:false,code:'PAYMENT_CONFIG_INVALID'});
  const r:any=readBuildRecord(f.root,f.record.buildId);r.integrations.items=[];writeBuildRecord(f.root,r);
  expect((await f.call('payments.list')).items[0].readiness.problems).toContain('dependency_missing');
 });
 it('projects verified mode independently of runtime-key identity and detects mode mismatches',async()=>{
  const f=await paymentFixture();const m=await load('payments');const r:any=readBuildRecord(f.root,f.record.buildId);
  const e=r.environments.items[0];e.variables.push({kind:'secret',secretRef:'verification',variableName:'LOCAL_STRIPE',backend:'local_env_file',bindingState:'configured',presenceState:'verified_present',safetyState:'verified_safe'});
  r.integrations.items[0].bindings[0].credentials=[{role:'secret_key',secretRef:'verification'}];
  r.integrations.items[0].bindings[0].verification={state:'ready',adapterVersion:'stripe.account.v1',capabilities:['stripe.account.read','stripe.mode.live']};
  for(const variableName of ['STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET'])e.variables.push({kind:'secret',variableName,backend:'vercel_env',bindingState:'configured',presenceState:'verified_present'});
  const readiness=m.paymentReadiness(r,{...f.config,paymentId:f.payment.paymentId});
  expect(readiness).toMatchObject({verifiedMode:'live',runtimeSecret:'present',webhookSecret:'present',crossBackendIdentityProven:false});expect(readiness.problems).toContain('stripe_mode_mismatch');
 });
 it('never infers Checkout capability from Account identity',async()=>{
  const m=await load('stripe-integration-adapter');
  expect(m.reduceStripeAccount({object:'account',id:'acct_synthetic',secret:'SENTINEL'},'test')).toEqual({ok:true,providerAccountRef:'acct_synthetic',capabilities:['stripe.account.read','stripe.mode.test']});
  expect(m.reduceStripeAccount({object:'customer',id:'cus_wrong'},'test')).toMatchObject({ok:false});
 });
});
async function nativeFixture(executor?:any) {
 const f=await fixture(executor?{nativeExecutor:executor}:{});const {CAPACITOR_VERSION}=await load('native');
 const config={appId:'com.example.product',appName:'Example product',platforms:['android'],buildEnvironmentId:f.environmentId,packagePolicy:{capacitorVersion:CAPACITOR_VERSION,webDir:'public',iosPackageManager:'SPM'},authId:null,authCallbackScheme:null};
 const profile=await f.call('native.mutate',{action:'create_profile',expectedNativeRevision:0,input:config});expect(profile.ok).toBe(true);
 const parameters=async()=>({nativeId:profile.nativeId,expectedNativeRevision:(await f.call('native.list')).revision,expectedEnvironmentRevision:(await f.call('environments.list')).revision});
 return {...f,config,profile,parameters};
}
describe('P16 native authority',()=>{
 it('packages canonical blobs with a fake executor, records checksums and marks artifacts stale after adoption',async()=>{
  let captured:any;
  const f=await nativeFixture(async(input:any)=>{captured=input;mkdirSync(join(input.workspace,'.path-native-package'));mkdirSync(join(input.workspace,'.path-native-package','android'));writeFileSync(join(input.workspace,'.path-native-package','android','build.gradle'),'// synthetic scaffold');return{ok:true};});
  writeFileSync(join(f.project,'public/index.html'),'<html>DIRTY_NOT_AUTHORITY</html>');
  const prepared=await f.call('native.prepare',await f.parameters());expect(prepared).toMatchObject({ok:true,state:'prepared'});
  const a=await f.call('native.list');expect(a.pendingOperation).toMatchObject({sourceSha:f.record.authoritativeSha,capacitorVersion:'8.5.3',framework:'static',installCommand:null});
  expect(await f.call('native.execute',await f.parameters())).toMatchObject({ok:true,state:'completed'});
  expect(readFileSync(join(captured.workspace,'public/index.html'),'utf8')).not.toContain('DIRTY_NOT_AUTHORITY');
  expect(captured.env).not.toHaveProperty('OPENAI_API_KEY');expect(captured.env).not.toHaveProperty('PORT');
  expect((await f.call('native.list')).artifacts[0]).toMatchObject({state:'packaged',checksums:[{path:'android/build.gradle',sha256:expect.stringMatching(/^[a-f0-9]{64}$/)}]});
  const r:any=readBuildRecord(f.root,f.record.buildId);r.authoritativeSha='a'.repeat(40);writeBuildRecord(f.root,r);expect((await f.call('native.list')).artifacts[0].state).toBe('stale');
 });
 it('rejects a production Vercel environment without substituting or dropping entries',async()=>{
  const f=await nativeFixture();await f.call('environments.mutate',{action:'bind_secret',expectedEnvironmentRevision:1,input:{environmentId:f.environmentId,variableName:'STRIPE_SECRET_KEY',backend:'vercel_env'}});
  expect(await f.call('native.prepare',await f.parameters())).toMatchObject({ok:false,code:'NATIVE_BUILD_ENVIRONMENT_UNUSABLE'});
  const listed=await f.call('native.list');expect(listed.profiles[0].readiness.problems).toContain('build_environment_unusable');expect(listed.pendingOperation).toBeNull();
 });
 it('performs long work outside the coordinator gate and refuses stale env results',async()=>{
  let release:()=>void=()=>{};let entered:()=>void=()=>{};const enteredPromise=new Promise<void>(r=>{entered=r;});const hold=new Promise<void>(r=>{release=r;});
  const f=await nativeFixture(async(input:any)=>{entered();await hold;mkdirSync(join(input.workspace,'.path-native-package'));writeFileSync(join(input.workspace,'.path-native-package','index.html'),'synthetic');return{ok:true};});
  expect((await f.call('native.prepare',await f.parameters())).ok).toBe(true);
  const running=f.call('native.execute',await f.parameters());await enteredPromise;
  const mutation=await f.call('environments.mutate',{action:'set_config',expectedEnvironmentRevision:1,input:{environmentId:f.environmentId,variableName:'FEATURE_FLAG',value:'changed'}});expect(mutation.ok).toBe(true);
  release();expect(await running).toMatchObject({ok:true,state:'stale'});expect((await f.call('native.list')).artifacts).toEqual([]);
 });
 it('blocks candidate and restore, validates profile identity, and requires auth redirects',async()=>{
  const f=await nativeFixture();
  for(const patch of [{appId:'invalid'},{appId:'com.example;echo'},{buildEnvironmentId:''},{authCallbackScheme:'javascript'},{platforms:['linux']},{packagePolicy:{...f.config.packagePolicy,capacitorVersion:'latest'}},{packagePolicy:{...f.config.packagePolicy,webDir:'../escape'}}])expect(await f.call('native.mutate',{action:'update_profile',expectedNativeRevision:1,input:{...f.config,...patch,nativeId:f.profile.nativeId}})).toMatchObject({ok:false});
  const r:any=readBuildRecord(f.root,f.record.buildId);r.pendingCandidate={status:'pending'};writeBuildRecord(f.root,r);expect(await f.call('native.prepare',await f.parameters())).toMatchObject({ok:false,code:'NATIVE_CANDIDATE_PENDING'});
  delete r.pendingCandidate;r.pendingRestore={restoreId:'pending'};writeBuildRecord(f.root,r);expect(await f.call('native.prepare',await f.parameters())).toMatchObject({ok:false,code:'RESTORE_PENDING'});
 });
 it('recovers an orphan running operation on explicit observation without resuming scripts',async()=>{
  const f=await nativeFixture();await f.call('native.prepare',await f.parameters());const r:any=readBuildRecord(f.root,f.record.buildId);r.native.pendingOperation.state='running';writeBuildRecord(f.root,r);
  expect(await f.call('native.observe',await f.parameters())).toMatchObject({ok:true,state:'interrupted'});expect((await f.call('native.list')).pendingOperation).toBeNull();
 });
 it('requires matching lockfiles and uses frozen argv commands for each package manager',async()=>{
  const f=await fixture();const {nativeCommandPlan}=await load('native-executor');
  for(const [manager,lock,args] of [['npm','package-lock.json',['npm','ci']],['pnpm','pnpm-lock.yaml',['pnpm','install','--frozen-lockfile']],['yarn','yarn.lock',['yarn','install','--immutable']],['bun','bun.lock',['bun','install','--frozen-lockfile']]] as const){
   writeFileSync(join(f.project,'package.json'),JSON.stringify({packageManager:manager+'@4.0.0',dependencies:{vite:'1.0.0'},scripts:{build:'vite build'}}));
   expect(nativeCommandPlan(f.project)).toMatchObject({ok:false,code:'NATIVE_LOCKFILE_REQUIRED'});
   writeFileSync(join(f.project,lock),'{}');expect(nativeCommandPlan(f.project)).toMatchObject({ok:true,installCommand:[...args],buildCommand:[manager,'run','build']});rmSync(join(f.project,lock));
  }
 });
 it('scrubs host secrets and permits build config without invented port/host',async()=>{
  const f=await fixture();await f.call('environments.mutate',{action:'set_config',expectedEnvironmentRevision:1,input:{environmentId:f.environmentId,variableName:'FEATURE_FLAG',value:'enabled'}});
  const {createProductRuntimeEnv}=await load('runtime/product-env');
  const host={PATH:'/usr/bin',HOME:f.root,PATHCODE_SECRET:'sentinel',OPENAI_API_KEY:'sentinel',CURSOR_API_KEY:'sentinel',PATH_CURSOR_API_KEY:'sentinel',GITHUB_TOKEN:'sentinel',GH_TOKEN:'sentinel',VERCEL_TOKEN:'sentinel'};
  const env=createProductRuntimeEnv({kind:'build',env:{}},host,{runtimeRoot:f.root,buildId:f.record.buildId,environmentId:f.environmentId,projectRoot:f.project});
  expect(env).toMatchObject({FEATURE_FLAG:'enabled',PATH:'/usr/bin'});for(const k of Object.keys(host).filter(k=>!['PATH','HOME'].includes(k)))expect(env).not.toHaveProperty(k);for(const k of ['PORT','HOST','HOSTNAME'])expect(env).not.toHaveProperty(k);
 });
 it('bounds process output and timeout and never invokes a shell',async()=>{
  const f=await fixture();const {executeNativeCommand,NATIVE_LIMITS}=await load('native-executor');
  expect(await executeNativeCommand([process.execPath,'-e','process.stdout.write("x".repeat(10000));setInterval(()=>{},1000)'],{cwd:f.project,env:{},limits:{...NATIVE_LIMITS,outputBytes:100,timeoutMs:3000}})).toMatchObject({ok:false,code:'NATIVE_OUTPUT_LIMIT'});
  expect(await executeNativeCommand([process.execPath,'-e','setInterval(()=>{},1000)'],{cwd:f.project,env:{},limits:{...NATIVE_LIMITS,timeoutMs:50}})).toMatchObject({ok:false,code:'NATIVE_TIMEOUT'});
 });
});
describe('Tranche hardening',()=>{
 it('permits only the three required public Supabase secret binding names',async()=>{
  const f=await fixture();let rev=1;
  for(const variableName of ['VITE_SUPABASE_PUBLISHABLE_KEY','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','PUBLIC_SUPABASE_PUBLISHABLE_KEY'])expect(await f.call('environments.mutate',{action:'bind_secret',expectedEnvironmentRevision:rev++,input:{environmentId:f.environmentId,variableName,backend:'vercel_env'}})).toMatchObject({ok:true});
  for(const variableName of ['VITE_CLIENT_SECRET','NEXT_PUBLIC_STRIPE_SECRET_KEY','PUBLIC_TOKEN'])expect(await f.call('environments.mutate',{action:'bind_secret',expectedEnvironmentRevision:rev,input:{environmentId:f.environmentId,variableName,backend:'vercel_env'}})).toMatchObject({ok:false,code:'SECRET_PUBLIC_NAME_REJECTED'});
 });
 it('redacts every new provider secret prefix from event strings',async()=>{
  const {sanitizeBuildEventValue}=await load('events');
  for(const prefix of ['rk_test_','rk_live_','whsec_','sb_secret_','sk_live_','ghp_'])expect(sanitizeBuildEventValue(prefix+'SYNTHETIC_SENTINEL123')).toBe('[redacted]');
 });
 it('validates stable verified-domain truth, explicit origins and mobile callback schemes',async()=>{
  const {stableBase,safeUrl}=await load('operation-validation');
  const record={p11Domains:{schema:'pathcode.p11.domains.v1',revision:1,domains:[{domainId:'domain',fqdn:'app.example.com',attachmentState:'attached',verificationState:'verified',tlsState:'ready'}],pendingOperation:null,operationHistory:[]}};
  const source={kind:'p11_domain',domainId:'domain',explicitBaseUrl:null};expect(stableBase(record,source)).toBe('https://app.example.com');record.p11Domains.domains[0]!.tlsState='pending';expect(stableBase(record,source)).toBeNull();
  expect(safeUrl('com.example.product://auth-callback',true)).toBe(true);for(const u of ['javascript://callback','https://user:password@example.com','http://foreign.example/callback'])expect(safeUrl(u,true)).toBe(false);
 });
 it('rejects raw provider fields and invalid responses without retaining them',async()=>{
  const m=await load('supabase-auth-adapter');const f=await authFixture();
  expect(m.reduceAuthConfig({...f.raw,site_url:'https://user:pass@example.com'})).toBeNull();
  const adapter=m.createSupabaseAuthAdapter({executor:async()=>({statusCode:200,body:Buffer.alloc(65537)})});expect(await adapter.observe({credential:'synthetic',projectRef:'projectref'})).toMatchObject({ok:false,code:'AUTH_PROVIDER_RESPONSE_UNSAFE'});
 });
 it('detects P9 material changes during provider observation and never saves stale results',async()=>{
  let enter:()=>void=()=>{},release:()=>void=()=>{};const entered=new Promise<void>(r=>{enter=r;}),hold=new Promise<void>(r=>{release=r;});
  const f=await authFixture({observe:async()=>{enter();await hold;return{ok:false,code:'AUTH_PROVIDER_UNAVAILABLE'};}});
  const running=f.call('auth.observe',await f.parameters());await entered;
  writeFileSync(join(f.project,'.env.local'),'MGMT=CHANGED_MANAGEMENT_SENTINEL\nVITE_SUPABASE_PUBLISHABLE_KEY=SYNTHETIC_PUBLIC_SENTINEL\nGOOGLE_SECRET=SYNTHETIC_GOOGLE_SENTINEL\n');release();
  expect(await running).toMatchObject({ok:false,code:'AUTH_AUTHORITY_STALE'});expect((await f.call('auth.list')).items[0].observation.state).toBe('unverified');
 });
 it('executes a synthetic add/sync pipeline with exact packaging pins and frozen install argv',async()=>{
  const f=await fixture();const {executeNativePackage}=await load('native-executor');const {CAPACITOR_VERSION}=await load('native');
  const calls:string[][]=[];const profile={appId:'com.example.test',appName:'Example',platforms:['android'],packagePolicy:{webDir:'public'}};
  const result=await executeNativePackage({workspace:f.project,profile,env:{PATH:process.env.PATH || ''},plan:{},commandExecutor:async(argv:string[],options:any)=>{calls.push(argv);if(argv.includes('add')){mkdirSync(join(options.cwd,'android'));writeFileSync(join(options.cwd,'android','build.gradle'),'// scaffold');}return{ok:true};}});
  expect(result.ok).toBe(true);expect(calls[1]).toEqual(['npm','ci','--ignore-scripts','--no-audit','--no-fund']);
  const pkg=JSON.parse(readFileSync(join(f.project,'.path-native-package','package.json'),'utf8'));expect(Object.values(pkg.dependencies)).toEqual([CAPACITOR_VERSION,CAPACITOR_VERSION,CAPACITOR_VERSION,CAPACITOR_VERSION]);expect(calls.some(c=>c.includes('sync'))).toBe(true);
 });
 it('rejects secret-bearing artifacts and static-output absence',async()=>{
  const f=await fixture();const {inspectNativeFiles,executeNativePackage}=await load('native-executor');
  writeFileSync(join(f.project,'public','secret.txt'),'SELECTED_SECRET_SENTINEL');expect(()=>inspectNativeFiles(join(f.project,'public'),{sentinels:['SELECTED_SECRET_SENTINEL']})).toThrow('NATIVE_SECRET_OUTPUT_UNSAFE');
  expect(await executeNativePackage({workspace:f.project,profile:{packagePolicy:{webDir:'out'}},env:{},plan:{}})).toMatchObject({ok:false,code:'NATIVE_STATIC_EXPORT_REQUIRED'});
 });
 it('retains at most three artifacts and cleans old workspaces',async()=>{
  const f=await nativeFixture(async(input:any)=>{mkdirSync(join(input.workspace,'.path-native-package'));writeFileSync(join(input.workspace,'.path-native-package','index.html'),'scaffold');return{ok:true};});
  let oldest='';for(let n=0;n<4;n++){const p=await f.call('native.prepare',await f.parameters());expect(p.ok).toBe(true);const e=await f.call('native.execute',await f.parameters());expect(e.state).toBe('completed');if(!n)oldest=e.artifactId;}
  const listed=await f.call('native.list');expect(listed.artifacts).toHaveLength(3);expect(()=>readFileSync(join(f.root,'native-snapshots',f.record.buildId,oldest,'.path-native-package','index.html'))).toThrow();
 });
});
describe('Managed native build transport',()=>{
 it('inherits noncredential egress and trust only for build mode and refuses authenticated proxy URLs',async()=>{
  const {createProductRuntimeEnv}=await load('runtime/product-env');
  const host={PATH:'/usr/bin',HTTPS_PROXY:'http://proxy.example:8080',NO_PROXY:'localhost',NODE_EXTRA_CA_CERTS:'/trusted/platform-ca.pem',SSL_CERT_FILE:'/trusted/platform-ca.pem',OPENAI_API_KEY:'HOST_SECRET_SENTINEL'};
  expect(createProductRuntimeEnv({kind:'build',env:{}},host)).toMatchObject({HTTPS_PROXY:host.HTTPS_PROXY,NODE_EXTRA_CA_CERTS:host.NODE_EXTRA_CA_CERTS});
  expect(createProductRuntimeEnv({kind:'spawn',port:4000,env:{PORT:'4000',HOST:'127.0.0.1',HOSTNAME:'127.0.0.1'}},host)).not.toHaveProperty('HTTPS_PROXY');
  expect(createProductRuntimeEnv({kind:'build',env:{}},host)).not.toHaveProperty('OPENAI_API_KEY');
  expect(()=>createProductRuntimeEnv({kind:'build',env:{}},{HTTPS_PROXY:'http://user:SECRET_SENTINEL@proxy.example:8080'})).toThrow();
 });
 it('cleans profile artifacts on explicit deletion without deleting product source',async()=>{
  const f=await nativeFixture(async(input:any)=>{mkdirSync(join(input.workspace,'.path-native-package'));writeFileSync(join(input.workspace,'.path-native-package','index.html'),'scaffold');return{ok:true};});
  await f.call('native.prepare',await f.parameters());await f.call('native.execute',await f.parameters());const listed=await f.call('native.list');
  expect(await f.call('native.mutate',{action:'delete_profile',expectedNativeRevision:listed.revision,input:{nativeId:f.profile.nativeId}})).toMatchObject({ok:true});expect((await f.call('native.list')).artifacts).toEqual([]);expect(readFileSync(join(f.project,'public/index.html'),'utf8')).toContain('Canonical product');
 });
});
describe('Prepared operation recovery',()=>{
 it('clears a stale native preparation after an environment revision change',async()=>{
  const f=await nativeFixture();expect((await f.call('native.prepare',await f.parameters())).ok).toBe(true);
  await f.call('environments.mutate',{action:'set_config',expectedEnvironmentRevision:1,input:{environmentId:f.environmentId,variableName:'FEATURE_FLAG',value:'new'}});
  expect(await f.call('native.observe',await f.parameters())).toMatchObject({ok:true,state:'stale'});expect((await f.call('native.list')).pendingOperation).toBeNull();
 });
 it('can explicitly cancel auth preparation after credentials are removed without a provider effect',async()=>{
  const f=await authFixture();await f.call('auth.observe',await f.parameters());await f.call('auth.applyPrepare',await f.parameters());
  const p=await f.parameters();await f.call('environments.mutate',{action:'unbind_secret',expectedEnvironmentRevision:p.expectedEnvironmentRevision,input:{environmentId:f.environmentId,variableName:'MGMT'}});
  expect(await f.call('auth.applyObserve',await f.parameters())).toMatchObject({ok:true,state:'failed_no_effect'});expect((await f.call('auth.list')).pendingOperation).toBeNull();expect(f.counts().patches).toBe(0);
 });
});
describe('Deterministic provider state and workspace caps',()=>{
 it('makes provider digests independent of property order',async()=>{
  const {authConfigDigest}=await load('supabase-auth-adapter');expect(authConfigDigest({a:1,b:2})).toBe(authConfigDigest({b:2,a:1}));
 });
 it('checks the entire native workspace while running a nested packaging command',async()=>{
  const f=await fixture();const nested=join(f.project,'package');mkdirSync(nested);writeFileSync(join(f.project,'excess.bin'),Buffer.alloc(1000));
  const {executeNativeCommand,NATIVE_LIMITS}=await load('native-executor');
  expect(await executeNativeCommand([process.execPath,'-e','setInterval(()=>{},1000)'],{cwd:nested,diskRoot:f.project,env:{},limits:{...NATIVE_LIMITS,diskBytes:100,timeoutMs:5000}})).toMatchObject({ok:false,code:'NATIVE_DISK_LIMIT'});
 });
});
describe('Native artifact secret roles',()=>{
 it('allows ordinary config and public client keys while rejecting private secret values',async()=>{
  let leakPrivate=false;let observedSecrets:string[]=[];
  const f=await nativeFixture(async(input:any)=>{observedSecrets=input.secretValues;mkdirSync(join(input.workspace,'.path-native-package'));writeFileSync(join(input.workspace,'.path-native-package','index.html'),'production PUBLIC_RUNTIME_SENTINEL'+(leakPrivate?' PRIVATE_RUNTIME_SENTINEL':''));return{ok:true};});
  writeFileSync(join(f.project,'.env.local'),'PRODUCT_SECRET=PRIVATE_RUNTIME_SENTINEL\nVITE_SUPABASE_PUBLISHABLE_KEY=PUBLIC_RUNTIME_SENTINEL\n');
  let rev=1;for(const variableName of ['PRODUCT_SECRET','VITE_SUPABASE_PUBLISHABLE_KEY'])expect(await f.call('environments.mutate',{action:'bind_secret',expectedEnvironmentRevision:rev++,input:{environmentId:f.environmentId,variableName,backend:'local_env_file'}})).toMatchObject({ok:true});
  for(const variableName of ['PRODUCT_SECRET','VITE_SUPABASE_PUBLISHABLE_KEY'])expect(await f.call('environments.verifyLocal',{environmentId:f.environmentId,variableName,expectedEnvironmentRevision:rev++})).toMatchObject({ok:true});
  expect(await f.call('environments.mutate',{action:'set_config',expectedEnvironmentRevision:rev,input:{environmentId:f.environmentId,variableName:'NODE_ENV',value:'production'}})).toMatchObject({ok:true});
  await f.call('native.prepare',await f.parameters());expect(await f.call('native.execute',await f.parameters())).toMatchObject({ok:true,state:'completed'});expect(observedSecrets).toEqual(['PRIVATE_RUNTIME_SENTINEL']);
  leakPrivate=true;await f.call('native.prepare',await f.parameters());expect(await f.call('native.execute',await f.parameters())).toMatchObject({ok:true,state:'failed'});
  const recordText=JSON.stringify(readBuildRecord(f.root,f.record.buildId));expect(recordText).not.toContain('PRIVATE_RUNTIME_SENTINEL');expect(recordText).not.toContain('PUBLIC_RUNTIME_SENTINEL');
 });
});
describe('Final readiness and Stripe transport regression',()=>{
 it('reports missing canonical source before attempting native materialization',async()=>{
  const f=await nativeFixture();const r:any=readBuildRecord(f.root,f.record.buildId);r.authoritativeSha=null;writeBuildRecord(f.root,r);
  expect((await f.call('native.list')).profiles[0].readiness).toMatchObject({state:'action_required',buildEnvironmentState:'usable',webArtifactState:'build_verification_required',problems:expect.arrayContaining(['source_unresolved'])});
  expect(await f.call('native.prepare',await f.parameters())).toMatchObject({ok:false,code:'NATIVE_SOURCE_UNRESOLVED'});
 });
 it('degrades a malformed referenced Auth authority in payment/native projections',async()=>{
  const f=await paymentFixture();const p=await f.call('native.mutate',{action:'create_profile',expectedNativeRevision:0,input:{appId:'com.example.app',appName:'Example',platforms:['android'],buildEnvironmentId:f.environmentId,packagePolicy:{capacitorVersion:'8.5.3',webDir:'public',iosPackageManager:'SPM'},authId:null,authCallbackScheme:null}});expect(p.ok).toBe(true);
  const r:any=readBuildRecord(f.root,f.record.buildId);r.payments.items[0].dependencies.authId='damaged-auth';r.native.profiles[0].authId='damaged-auth';r.auth={schema:'pathcode.p14.auth.v1',revision:1,items:[{authId:'damaged-auth'}],pendingOperation:null,operationHistory:[]};writeBuildRecord(f.root,r);
  expect((await f.call('payments.list')).items[0].readiness.problems).toContain('dependency_missing');expect((await f.call('native.list')).profiles[0].readiness.problems).toContain('dependency_missing');
 });
 it.each(['test','live'])('makes one fixed read-only Stripe identity request for %s mode',async(mode)=>{
  const {EventEmitter}=await import('node:events');const {createStripeIdentityAdapter}=await load('stripe-integration-adapter');let calls=0;
  const adapter=createStripeIdentityAdapter({requestImpl:(options:any,callback:any)=>{calls++;expect(options).toMatchObject({hostname:'api.stripe.com',path:'/v1/account',method:'GET',rejectUnauthorized:true});const req:any=new EventEmitter();req.destroy=()=>{};req.end=()=>queueMicrotask(()=>{const res:any=new EventEmitter();res.statusCode=200;callback(res);res.emit('data',Buffer.from(JSON.stringify({object:'account',id:'acct_synthetic123',secret:'PROVIDER_SECRET_SENTINEL'})));res.emit('end');});return req;}});
  const result=await adapter.verify({credentials:{secret_key:`rk_${mode}_synthetic123`}});expect(result).toEqual({ok:true,providerAccountRef:'acct_synthetic123',capabilities:['stripe.account.read',`stripe.mode.${mode}`]});expect(calls).toBe(1);expect(JSON.stringify(result)).not.toContain('PROVIDER_SECRET_SENTINEL');
 });
});
describe('Contextual credential and artifact freshness',()=>{
 it('degrades social management readiness after P9 unbind and requires a client key in the native build environment',async()=>{
  const f=await authFixture();const config={...f.config,redirectUrls:['com.example.app://auth-callback'],socialProviders:[{provider:'google',enabled:true,clientId:'synthetic-client',clientSecretRef:f.refs.GOOGLE_SECRET}]};
  expect(await f.call('auth.mutate',{action:'update_auth',expectedAuthRevision:1,input:{authId:f.auth.authId,label:'Sign in',databaseId:f.databaseId,environmentId:f.environmentId,config}})).toMatchObject({ok:true});
  Object.assign(f.raw,{uri_allow_list:'com.example.app://auth-callback',external_google_enabled:true,external_google_client_id:'synthetic-client'});await f.call('auth.observe',await f.parameters());
  expect((await f.call('auth.list')).items[0].readiness.state).toBe('ready');
  const p=await f.parameters();await f.call('environments.mutate',{action:'unbind_secret',expectedEnvironmentRevision:p.expectedEnvironmentRevision,input:{environmentId:f.environmentId,variableName:'GOOGLE_SECRET'}});
  expect((await f.call('auth.list')).items[0].readiness.problems).toContain('social_credential_action_required');
  const e=await f.call('environments.mutate',{action:'create_environment',expectedEnvironmentRevision:p.expectedEnvironmentRevision+1,input:{name:'Native build'}});
  const {nativeReadiness}=await load('native');const r:any=readBuildRecord(f.root,f.record.buildId);expect(nativeReadiness(r,{buildEnvironmentId:e.environmentId,authId:f.auth.authId,authCallbackScheme:'com.example.app',platforms:['android']}).problems).toContain('auth_publishable_key_missing');
 });
 it('marks retained artifacts stale when their profile identity changes at the same source SHA',async()=>{
  const f=await nativeFixture(async(input:any)=>{mkdirSync(join(input.workspace,'.path-native-package'));writeFileSync(join(input.workspace,'.path-native-package','index.html'),'scaffold');return{ok:true};});
  await f.call('native.prepare',await f.parameters());await f.call('native.execute',await f.parameters());const listed=await f.call('native.list');
  expect(await f.call('native.mutate',{action:'update_profile',expectedNativeRevision:listed.revision,input:{...f.config,nativeId:f.profile.nativeId,appId:'com.example.changed'}})).toMatchObject({ok:true});expect((await f.call('native.list')).artifacts[0].state).toBe('stale');
 });
});
describe('Native coordinator crash containment',()=>{
 it('terminates the real creator command when its coordinator process is killed',async()=>{
  const {spawn}=await import('node:child_process');const f=await fixture();const pidfile=join(f.root,'owned-child.pid'),parentfile=join(f.root,'coordinator-probe.mjs');
  const code=`require('node:fs').writeFileSync(${JSON.stringify(pidfile)},String(process.pid));setInterval(()=>{},1000)`;
  const executorUrl=new URL('../../scripts/pathcode-cli/build/native-executor.mjs',import.meta.url).href;
  writeFileSync(parentfile,`import {executeNativeCommand} from ${JSON.stringify(executorUrl)};await executeNativeCommand([process.execPath,'-e',${JSON.stringify(code)}],{cwd:${JSON.stringify(f.project)},env:{},limits:{timeoutMs:15000,outputBytes:1024,diskBytes:1048576}});`);
  const parent=spawn(process.execPath,[parentfile],{stdio:'ignore'});let child=0;
  const running=(pid:number)=>{try{return !execFileSync('ps',['-p',String(pid),'-o','stat='],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim().startsWith('Z');}catch{return false;}};
  try{
   for(let n=0;n<120;n++){try{child=Number(readFileSync(pidfile,'utf8'));break;}catch{await new Promise(r=>setTimeout(r,25));}}
   expect(child).toBeGreaterThan(0);expect(running(child)).toBe(true);parent.kill('SIGKILL');
   for(let n=0;n<120&&running(child);n++)await new Promise(r=>setTimeout(r,25));
   expect(running(child)).toBe(false);
  }finally{parent.kill('SIGKILL');if(child){try{process.kill(child,'SIGKILL');}catch{}}}
 });
});
describe('RC-3 frozen invariant regression proofs', () => {
 it.each(['VITE_SUPABASE_PUBLISHABLE_KEY','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','PUBLIC_SUPABASE_PUBLISHABLE_KEY'])('accepts the exact public client binding %s but rejects private material under that same name',async variableName=>{
  let content='sb_publishable_SYNTHETIC_PUBLIC_VALUE';
  const f=await nativeFixture(async(input:any)=>{mkdirSync(join(input.workspace,'.path-native-package'));writeFileSync(join(input.workspace,'.path-native-package','client.js'),content);return{ok:true};});
  writeFileSync(join(f.project,'.env.local'),variableName+'='+content+'\n');
  expect(await f.call('environments.mutate',{action:'bind_secret',expectedEnvironmentRevision:1,input:{environmentId:f.environmentId,variableName,backend:'local_env_file'}})).toMatchObject({ok:true});
  expect(await f.call('environments.verifyLocal',{environmentId:f.environmentId,variableName,expectedEnvironmentRevision:2})).toMatchObject({ok:true});
  await f.call('native.prepare',await f.parameters());expect(await f.call('native.execute',await f.parameters())).toMatchObject({ok:true,state:'completed'});
  content='sb_secret_SYNTHETIC_PRIVATE_VALUE';writeFileSync(join(f.project,'.env.local'),variableName+'='+content+'\n');
  await f.call('native.prepare',await f.parameters());expect(await f.call('native.execute',await f.parameters())).toMatchObject({ok:true,state:'failed'});
  expect((await f.call('native.list')).artifacts).toHaveLength(1);
  const durable=JSON.stringify(readBuildRecord(f.root,f.record.buildId))+JSON.stringify(readBuildEvents(f.root,f.record.buildId));
  expect(durable).not.toContain(content);expect(durable).not.toContain('sb_publishable_SYNTHETIC_PUBLIC_VALUE');
 });
 it.each(['throws', 'failed response'] as const)('keeps a possibly applied Auth PATCH uncertain after it %s, never retries it, and explicitly reconciles', async mode => {
  let f: any, patches = 0;
  const { reduceAuthConfig } = await load('supabase-auth-adapter');
  f = await authFixture({
   observe: async () => ({ ok: true, config: reduceAuthConfig(f.raw) }),
   patch: async () => {
    patches++;
    expect((readBuildRecord(f.root, f.record.buildId) as any)?.auth.pendingOperation.state).toBe('effect_started');
    if (mode === 'throws') throw new Error('SYNTHETIC_PROVIDER_PRIVATE_SENTINEL');
    return { ok: false, code: 'AUTH_PROVIDER_UNAVAILABLE', raw: 'SYNTHETIC_PROVIDER_PRIVATE_SENTINEL' };
   },
  });
  await f.call('auth.observe', await f.parameters());
  await f.call('auth.applyPrepare', await f.parameters());
  expect(await f.call('auth.applyExecute', await f.parameters())).toMatchObject({ ok: true, state: 'uncertain' });
  expect((await f.call('auth.list')).pendingOperation.state).toBe('uncertain');
  expect(await f.call('auth.applyExecute', await f.parameters())).toMatchObject({ ok: false, code: 'AUTH_OPERATION_STALE' });
  expect(patches).toBe(1);
  await f.call('auth.applyObserve', await f.parameters());
  const final = await f.call('auth.list');
  expect(final.pendingOperation).toBeNull();
  expect(final.operationHistory.map((o: any) => o.state)).toEqual(['interrupted']);
  expect(patches).toBe(1);
  expect(JSON.stringify(readBuildRecord(f.root, f.record.buildId)) + JSON.stringify(readBuildEvents(f.root, f.record.buildId))).not.toContain('SYNTHETIC_PROVIDER_PRIVATE_SENTINEL');
 });
 it('recovers durable effect_started Auth state after simulated worker loss without repeating PATCH', async () => {
  const f = await authFixture();
  await f.call('auth.observe', await f.parameters());
  await f.call('auth.applyPrepare', await f.parameters());
  const { runAuthOperation } = await load('auth-operations');
  let patches = 0;
  // Lose the worker after PATCH succeeds but before the terminal durable write.
  await expect(runAuthOperation({ runtimeRoot: f.root, buildId: f.record.buildId, action: 'applyExecute', params: await f.parameters(),
   adapter: { observe: async () => ({ok:true,config:(await load('supabase-auth-adapter')).reduceAuthConfig(f.raw)}), patch: async (_input:any,patch:any) => { patches++;Object.assign(f.raw,patch);return {ok:true,config:(await load('supabase-auth-adapter')).reduceAuthConfig(f.raw)}; } },
   exclusive: async (_id: string, fn: () => any) => {
    if (patches && (readBuildRecord(f.root, f.record.buildId) as any)?.auth.pendingOperation?.state === 'effect_started') throw new Error('SIMULATED_WORKER_LOSS');
    return fn();
   },
  })).rejects.toThrow('SIMULATED_WORKER_LOSS');
  expect((await f.call('auth.list')).pendingOperation.state).toBe('effect_started');
  await f.call('auth.applyObserve', await f.parameters());
  const final = await f.call('auth.list');
  expect(final.pendingOperation).toBeNull();
  expect(final.operationHistory.map((o: any) => o.state)).toEqual(['interrupted']);
  expect(patches).toBe(1); expect(f.counts().patches).toBe(0);
 });
 it('blocks payment create, update and delete at preparation and coordinator boundaries during pending restore', async () => {
  const f = await paymentFixture();
  const r: any = readBuildRecord(f.root, f.record.buildId); r.pendingRestore = { operationId: 'restore-pending' }; writeBuildRecord(f.root, r);
  const before = readFileSync(resolveBuildRecordPath(f.root, f.record.buildId), 'utf8');
  const { prepareBuildPaymentMutation } = await load('payments');
  for (const [action, input] of [['create_payment', f.config], ['update_payment', {...f.config,paymentId:f.payment.paymentId}], ['delete_payment', {paymentId:f.payment.paymentId}]] as const) {
   const request = {action, expectedPaymentRevision:1, input};
   expect(prepareBuildPaymentMutation(f.root, f.record.buildId, request)).toEqual({ok:false,code:'RESTORE_PENDING'});
   expect(await f.call('payments.mutate', request)).toEqual({ok:false,code:'RESTORE_PENDING'});
  }
  expect(readFileSync(resolveBuildRecordPath(f.root, f.record.buildId), 'utf8')).toBe(before);
 });
 it('rejects canonical source symlinks before native materialization', async () => {
  const f = await nativeFixture();
  symlinkSync('/outside-product', join(f.project, 'escape'));
  f.git('add','escape'); f.git('-c','user.name=Fixture','-c','user.email=fixture@example.com','commit','-qm','unsafe link');
  const r: any = readBuildRecord(f.root,f.record.buildId); r.authoritativeSha=f.git('rev-parse','HEAD'); writeBuildRecord(f.root,r);
  expect(await f.call('native.prepare',await f.parameters())).toMatchObject({ok:false,code:'NATIVE_SOURCE_LINK_UNSAFE'});
  expect((await f.call('native.list')).pendingOperation).toBeNull();
 });
 it('rejects linked artifact roots, nested symlinks and escaping static web roots', async () => {
  const f = await fixture(); const {inspectNativeFiles,executeNativePackage}=await load('native-executor');
  symlinkSync(join(f.project,'public'),join(f.project,'linked'));
  expect(()=>inspectNativeFiles(join(f.project,'linked'))).toThrow('NATIVE_ARTIFACT_UNSAFE');
  symlinkSync('/outside-product',join(f.project,'public','escape'));
  expect(()=>inspectNativeFiles(join(f.project,'public'))).toThrow('NATIVE_ARTIFACT_UNSAFE');
  const outside=join(f.root,'outside');mkdirSync(outside);mkdirSync(join(outside,'site'));writeFileSync(join(outside,'site','index.html'),'outside');
  symlinkSync(outside,join(f.project,'escape-root'));
  expect(await executeNativePackage({workspace:f.project,profile:{packagePolicy:{webDir:'escape-root/site'}},env:{},plan:{}})).toMatchObject({ok:false,code:'NATIVE_ARTIFACT_UNSAFE'});
 });
 it('requires actual Next static index output, accepting out/index.html and rejecting server-only .next output', async () => {
  const f=await fixture();const {nativeCommandPlan,executeNativePackage}=await load('native-executor');
  writeFileSync(join(f.project,'package.json'),JSON.stringify({packageManager:'npm@11.9.0',dependencies:{next:'15.0.0'},scripts:{build:'next build'}}));
  writeFileSync(join(f.project,'package-lock.json'),'{}');writeFileSync(join(f.project,'next.config.mjs'),'export default { output: "export" };');
  const plan=nativeCommandPlan(f.project);expect(plan).toMatchObject({ok:true,framework:'next'});
  const profile={appId:'com.example.next',appName:'Next fixture',platforms:['android'],packagePolicy:{webDir:'out'}};
  let staticExport=false;
  const executor=async(argv:string[],options:any)=>{
   if(argv.join(' ')==='npm run build') {
    const dir=join(options.cwd,staticExport?'out':'.next');mkdirSync(dir,{recursive:true});
    writeFileSync(join(dir,staticExport?'index.html':'server.js'),staticExport?'<html>Static Next export</html>':'// server bundle');
   }
   if(argv.includes('add')){mkdirSync(join(options.cwd,'android'));writeFileSync(join(options.cwd,'android','build.gradle'),'// scaffold');}
   return {ok:true};
  };
  expect(await executeNativePackage({workspace:f.project,profile,plan,env:{},commandExecutor:executor})).toMatchObject({ok:false,code:'NATIVE_STATIC_EXPORT_REQUIRED'});
  staticExport=true;
  const result=await executeNativePackage({workspace:f.project,profile,plan,env:{},commandExecutor:executor});
  expect(result.ok).toBe(true);expect(result.checksums).toEqual(expect.arrayContaining([expect.objectContaining({path:'www/index.html'})]));
  expect(readFileSync(join(f.project,'.path-native-package/www/index.html'),'utf8')).toBe('<html>Static Next export</html>');
 });
 it('enforces total retained bytes across profiles and removes oldest workspace before exceeding the cap', async () => {
  const f=await nativeFixture(async(input:any)=>{mkdirSync(join(input.workspace,'.path-native-package'));writeFileSync(join(input.workspace,'.path-native-package','index.html'),'new scaffold');return{ok:true};});
  const {NATIVE_LIMITS}=await load('native-executor');
  const r:any=readBuildRecord(f.root,f.record.buildId);const oldIds:string[]=[];
  for(let n=0;n<4;n++) {
   const artifactId=randomUUID(),nativeId='historical-profile-'+n;oldIds.push(artifactId);
   r.native.profiles.push({...r.native.profiles[0],nativeId});
   const dir=join(f.root,'native-snapshots',f.record.buildId,artifactId,'.path-native-package');mkdirSync(dir,{recursive:true});
   writeFileSync(join(dir,'native.bin'),'');truncateSync(join(dir,'native.bin'),NATIVE_LIMITS.artifactBytes);
   r.native.artifacts.push({artifactId,nativeId,sourceSha:r.authoritativeSha,sourceTreeSha:f.git('rev-parse','HEAD^{tree}'),platforms:['android'],checksums:[],bytes:NATIVE_LIMITS.artifactBytes,state:'packaged',createdAt:new Date().toISOString()});
  }
  writeBuildRecord(f.root,r);
  expect((await f.call('native.prepare',await f.parameters())).ok).toBe(true);
  expect(await f.call('native.execute',await f.parameters())).toMatchObject({ok:true,state:'completed'});
  const final=await f.call('native.list');expect(final.artifacts.reduce((sum:number,a:any)=>sum+a.bytes,0)).toBeLessThanOrEqual(NATIVE_LIMITS.diskBytes);
  expect(final.artifacts).toHaveLength(4);expect(final.artifacts.some((a:any)=>a.artifactId===oldIds[0])).toBe(false);
  expect(existsSync(join(f.root,'native-snapshots',f.record.buildId,oldIds[0]!))).toBe(false);
  expect(existsSync(join(f.root,'native-snapshots',f.record.buildId,oldIds[1]!))).toBe(true);
 });
 it('completed historical restore preserves newer Auth, Payments and Native authority and projects old-source artifacts stale', async () => {
  const f=await authFixture();await f.call('auth.observe',await f.parameters());await paymentFixture(f);
  const {CAPACITOR_VERSION}=await load('native');
  expect((await f.call('native.mutate',{action:'create_profile',expectedNativeRevision:0,input:{appId:'com.example.restore',appName:'Newer native identity',platforms:['android'],buildEnvironmentId:f.environmentId,packagePolicy:{capacitorVersion:CAPACITOR_VERSION,webDir:'public',iosPackageManager:'SPM'},authId:null,authCallbackScheme:null}})).ok).toBe(true);
  const first=f.record.authoritativeSha;
  writeFileSync(join(f.project,'newer.txt'),'newer product tree');f.git('add','.');f.git('-c','user.name=Fixture','-c','user.email=fixture@example.com','commit','-qm','newer product');
  const second=f.git('rev-parse','HEAD');const r:any=readBuildRecord(f.root,f.record.buildId);
  r.authoritativeSha=second;r.productBranch=f.git('branch','--show-current');
  r.adoptionHistory=[first,second].map(sha=>({buildId:r.buildId,projectRoot:f.project,adoptedSha:sha,sourceSha:sha,mode:'merge'}));
  r.native.artifacts.push({artifactId:randomUUID(),nativeId:r.native.profiles[0].nativeId,sourceSha:second,sourceTreeSha:f.git('rev-parse','HEAD^{tree}'),platforms:['android'],checksums:[],bytes:0,state:'packaged',createdAt:new Date().toISOString()});
  writeBuildRecord(f.root,r);const authority=structuredClone({auth:r.auth,payments:r.payments,native:r.native});
  const {restoreHistoricalProductVersion}=await load('historical-restore');
  expect(restoreHistoricalProductVersion({runtimeRoot:f.root,buildId:r.buildId,adoptionIndex:0,expectedAuthoritativeSha:second})).toMatchObject({ok:true});
  const after:any=readBuildRecord(f.root,r.buildId);
  expect({auth:after.auth,payments:after.payments,native:after.native}).toEqual(authority);
  expect(after.pendingRestore).toBeUndefined();expect(after.authoritativeSha).not.toBe(first);expect(after.authoritativeSha).not.toBe(second);
  expect(f.git('rev-parse','HEAD^{tree}')).toBe(f.git('rev-parse',first+'^{tree}'));
  expect((await f.call('native.list')).artifacts[0].state).toBe('stale');
 });
 it.each(['http://user:password@proxy.example:8080','file:///private/proxy','http://proxy.example/path','http://proxy.example/?secret=sentinel'])('preserves BUILD_TRANSPORT_UNSAFE for unsafe transport %s', async proxy => {
  const {createProductRuntimeEnv}=await load('runtime/product-env');
  expect(()=>createProductRuntimeEnv({kind:'build',env:{}},{HTTPS_PROXY:proxy})).toThrow(expect.objectContaining({code:'BUILD_TRANSPORT_UNSAFE'}));
 });
 it.each(['vite_supabase_publishable_key','Vite_SUPABASE_PUBLISHABLE_KEY','next_public_supabase_publishable_key','public_supabase_publishable_key','VITE_SUPABASE_PUBLISHABLE_KEY_EXTRA','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEYS','PUBLIC_SUPABASE_PUBLISHABLE_KEY2','VITE_PRIVATE_KEY','NEXT_PUBLIC_TOKEN','PUBLIC_CLIENT_SECRET'])('rejects case variants, near misses and arbitrary public secret name %s',async variableName=>{
  const f=await fixture();
  expect(await f.call('environments.mutate',{action:'bind_secret',expectedEnvironmentRevision:1,input:{environmentId:f.environmentId,variableName,backend:'local_env_file'}})).toMatchObject({ok:false,code:'SECRET_PUBLIC_NAME_REJECTED'});
 });
});
describe('OAC pass 0 — Auth local-secret coexistence', () => {
 const siblings = ['MGMT', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'GOOGLE_SECRET'];
 const base = () => siblings.map(n => n + '=SYNTHETIC_' + n + '\n').join('');
 async function observeWith(extra: (f: any) => Promise<void>, line: string) {
  const inputs: any[] = []; const { reduceAuthConfig } = await load('supabase-auth-adapter');
  let f: any; f = await authFixture({ observe: async (input: any) => { inputs.push(input); return { ok: true, config: reduceAuthConfig(f.raw) }; }, patch: async () => ({ ok: false }) });
  writeFileSync(join(f.project, '.env.local'), base());
  const verified = await f.call('auth.observe', await f.parameters()); expect(verified).toMatchObject({ ok: true }); expect(inputs).toHaveLength(1);
  expect(JSON.stringify(inputs)).not.toContain('SYNTHETIC_GOOGLE_SECRET'); expect(JSON.stringify(inputs)).not.toContain('SYNTHETIC_VITE_SUPABASE_PUBLISHABLE_KEY');
  await extra(f); writeFileSync(join(f.project, '.env.local'), base() + line);
  const result = await f.call('auth.observe', await f.parameters());
  expect(inputs).toHaveLength(1); expect(JSON.stringify(result)).not.toContain('SYNTHETIC_');
  return { f, result };
 }
 it('rejects an unbound extra name before the Auth adapter', async () => {
  expect((await observeWith(async () => {}, 'UNBOUND_EXTRA=x\n')).result).toMatchObject({ ok: false });
 });
 it('rejects a bound but unverified sibling, which the previous allow-list admitted', async () => {
  const { result } = await observeWith(async f => { expect((await f.call('environments.mutate', { action: 'bind_secret', expectedEnvironmentRevision: (await f.call('environments.list')).revision, input: { environmentId: f.environmentId, variableName: 'UNVERIFIED_EXTRA', backend: 'local_env_file' } })).ok).toBe(true); }, 'UNVERIFIED_EXTRA=x\n');
  expect(result).toMatchObject({ ok: false });
 });
 it('rejects a verified-unsafe sibling before the Auth adapter', async () => {
  const { result } = await observeWith(async f => {
   const bound = await f.call('environments.mutate', { action: 'bind_secret', expectedEnvironmentRevision: (await f.call('environments.list')).revision, input: { environmentId: f.environmentId, variableName: 'UNSAFE_EXTRA', backend: 'local_env_file' } }); expect(bound.ok).toBe(true);
   writeFileSync(join(f.project, '.env.local'), base() + 'UNSAFE_EXTRA=x\n'); writeFileSync(join(f.project, '.gitignore'), '');
   expect(await f.call('environments.verifyLocal', { environmentId: f.environmentId, variableName: 'UNSAFE_EXTRA', expectedEnvironmentRevision: (await f.call('environments.list')).revision })).toMatchObject({ ok: true, safetyState: 'verified_unsafe' });
   writeFileSync(join(f.project, '.gitignore'), '.env.local\n');
  }, 'UNSAFE_EXTRA=x\n');
  expect(result).toMatchObject({ ok: false });
 });
});
describe('OAC pass 0 — P15 unknown versus missing runtime-secret presence', () => {
 it('reports a P9-valid Vercel binding as unknown, never missing, without fetching any value', async () => {
  const f = await paymentFixture(); const { paymentReadiness } = await load('payments');
  const bind = async (variableName: string) => f.call('environments.mutate', { action: 'bind_secret', expectedEnvironmentRevision: (await f.call('environments.list')).revision, input: { environmentId: f.environmentId, variableName, backend: 'vercel_env' } });
  expect((await f.call('payments.list')).items[0].readiness).toMatchObject({ runtimeSecret: 'missing', webhookSecret: 'missing' });
  expect((await f.call('payments.list')).items[0].readiness.problems).toEqual(expect.arrayContaining(['runtime_secret_missing', 'webhook_secret_missing']));
  expect((await bind('STRIPE_SECRET_KEY')).ok).toBe(true); expect((await bind('STRIPE_WEBHOOK_SECRET')).ok).toBe(true);
  const readiness = (await f.call('payments.list')).items[0].readiness;
  const stored: any = readBuildRecord(f.root, f.record.buildId);
  expect(stored.environments.items[0].variables.filter((v: any) => v.backend === 'vercel_env').map((v: any) => v.presenceState)).toEqual(['unknown', 'unknown']);
  expect(readiness).toMatchObject({ runtimeSecret: 'unknown', webhookSecret: 'unknown', crossBackendIdentityProven: false, webhookEndpointVerification: 'acceptance_pending' });
  expect(readiness.problems).toEqual(expect.arrayContaining(['runtime_secret_presence_unverified', 'webhook_secret_presence_unverified']));
  expect(readiness.problems).not.toContain('runtime_secret_missing'); expect(readiness.problems).not.toContain('webhook_secret_missing');
  // A fact PATH cannot prove never becomes ready on its own.
  expect(readiness.state).toBe('action_required');
  const missing = JSON.parse(JSON.stringify(stored)); missing.environments.items[0].variables.find((v: any) => v.variableName === 'STRIPE_WEBHOOK_SECRET').presenceState = 'verified_missing';
  const mixed = paymentReadiness(missing, { ...f.config, paymentId: f.payment.paymentId, webhook: { endpointId: null } });
  expect(mixed).toMatchObject({ runtimeSecret: 'unknown', webhookSecret: 'missing' });
  expect(mixed.problems).toEqual(expect.arrayContaining(['runtime_secret_presence_unverified', 'webhook_secret_missing']));
 });
 it('keeps the real Stripe webhook endpoint ID requirement even when runtime presence is verified', async () => {
  const f = await paymentFixture(); const { paymentReadiness } = await load('payments');
  const r: any = readBuildRecord(f.root, f.record.buildId); const env = r.environments.items[0];
  for (const variableName of ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET']) env.variables.push({ kind: 'secret', variableName, backend: 'vercel_env', bindingState: 'configured', presenceState: 'verified_present' });
  const item = r.payments.items[0]; expect(item.webhook.endpointId).toBeNull();
  const without = paymentReadiness(r, item);
  expect(without).toMatchObject({ runtimeSecret: 'present', webhookSecret: 'present' }); expect(without.problems).toContain('webhook_endpoint_owner_action_required'); expect(without.state).toBe('action_required');
  const withId = paymentReadiness(r, { ...item, webhook: { ...item.webhook, endpointId: 'we_synthetic123' } });
  expect(withId.problems).not.toContain('webhook_endpoint_owner_action_required'); expect(withId).toMatchObject({ webhookEndpointVerification: 'acceptance_pending', crossBackendIdentityProven: false });
 });
});
