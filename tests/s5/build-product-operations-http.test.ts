import { afterEach, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createBuildCoordinatorService,createBuildRecordSkeleton,writeBuildRecord,readBuildRecord } from '../../scripts/pathcode-cli/build/index.mjs';
import { resolvePathPackageRoot } from '../../scripts/pathcode-cli/paths.mjs';
const load=async(name:string)=>import(new URL(`../../scripts/pathcode-cli/build/${name}.mjs`,import.meta.url).href);
const cleanups:Array<()=>Promise<void>>=[];
afterEach(async()=>{for(const cleanup of cleanups.splice(0).reverse())await cleanup();});
async function fixture(options:any={}){
 const root=mkdtempSync(join(tmpdir(),'path-product-http-'));cleanups.push(async()=>rmSync(root,{recursive:true,force:true}));
 execFileSync('git',['init','-q',root]);writeFileSync(join(root,'.gitignore'),'.env.local\n');
 const record=createBuildRecordSkeleton({outcome:'Provider boundary HTTP fixture'});record.loop.status='paused';record.projectBindings.push({bindingId:'fixture',projectRoot:root});writeBuildRecord(root,record);
 const service=await createBuildCoordinatorService({runtimeRoot:root,packageRoot:resolvePathPackageRoot(),fakeMode:true,...options});await service.whenReady;cleanups.push(()=>service.close());
 const call=(method:string,params:any={})=>service.dispatch('build.'+method,{buildId:record.buildId,...params});
 const coordinator:any={request:(method:string,params:any)=>service.dispatch(method,params),listEnvironments:()=>call('environments.list'),getBuild:()=>call('get'),listDomains:()=>call('domains.list'),listDatabaseCatalog:()=>service.dispatch('build.databases.catalog'),readDatabase:(_id:string,databaseId:string)=>call('databases.read',{databaseId}),mutateDatabase:(_id:string,p:any)=>call('databases.mutate',p),prepareDatabaseProvision:(_id:string,p:any)=>call('databases.provisionPrepare',p)};
 const {handleOperationSurface}=await load('surface/operations-surface');const {guardBuilderApiRequest}=await load('surface/ingress');
 const server=createServer(async(req,res)=>{const send=(code:number,value:unknown)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};try{const guard=await guardBuilderApiRequest(req);if(!guard.ok){send(guard.status,guard);return;}const parts=(req.url || '').split('/').filter(Boolean);const body=(req as any).builderJsonBody?JSON.parse((req as any).builderJsonBody):{};await handleOperationSurface({coordinator,buildId:record.buildId,action:parts[3],sub:parts[4] || '',method:req.method,body,send});}catch{send(500,{ok:false,code:'FIXTURE_ERROR'});}});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));cleanups.push(async()=>{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));});
 const port=(server.address() as any).port;const request=async(plane:string,sub:string,body?:unknown)=>{const r=await fetch(`http://127.0.0.1:${port}/api/builds/${record.buildId}/${plane}${sub?'/'+sub:''}`,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,body:await r.json() as any};};
 return{root,record,call,request};
}
describe('Provider operations over the guarded HTTP boundary',()=>{
 it('prepares, executes once and explicitly observes a synthetic Supabase project with no browser refs',async()=>{
  let creates=0;
  const f=await fixture({databaseOperationAdapters:{supabase:{createProject:async(i:any)=>{creates++;return{ok:true,projectRef:'project123',projectName:i.name,organizationSlug:i.organizationSlug,region:i.region,projectStatus:'COMING_UP'};},listProjects:async()=>({ok:true,matches:[],truncated:false}),health:async()=>({ok:true,projectStatus:'ACTIVE_HEALTHY'})}}});
  writeFileSync(join(f.root,'.env.local'),'MGMT=SYNTHETIC_MANAGEMENT\nDB_PASSWORD=SYNTHETIC_PASSWORD\n');
  const env=await f.call('environments.mutate',{action:'create_environment',expectedEnvironmentRevision:0,input:{name:'Database operations'}});let revision=1;
  for(const variableName of ['MGMT','DB_PASSWORD'])expect(await f.call('environments.mutate',{action:'bind_secret',expectedEnvironmentRevision:revision++,input:{environmentId:env.environmentId,variableName,backend:'local_env_file'}})).toMatchObject({ok:true});
  for(const variableName of ['MGMT','DB_PASSWORD'])expect(await f.call('environments.verifyLocal',{environmentId:env.environmentId,variableName,expectedEnvironmentRevision:revision++})).toMatchObject({ok:true});
  const created=await f.request('databases','mutate',{action:'create_database',expectedDatabaseRevision:0,input:{provider:'supabase',label:'Provisioned DB',environmentId:env.environmentId,source:'path_provisioned'}});expect(created.status).toBe(200);const databaseId=created.body.databaseId;
  expect(await f.request('databases','mutate',{action:'bind_management_credential',expectedDatabaseRevision:1,input:{databaseId,variableName:'MGMT'}})).toMatchObject({status:200});
  const p={databaseId,expectedDatabaseRevision:2,expectedEnvironmentRevision:revision,organizationSlug:'org-1',region:'eu-north-1',provisionPasswordVariableName:'DB_PASSWORD',acknowledgeProviderBilling:true};
  expect(await f.request('databases','provision-prepare',{...p,acknowledgeProviderBilling:false})).toMatchObject({status:400});
  const prepared=await f.request('databases','provision-prepare',p);expect(prepared).toMatchObject({status:200,body:{state:'prepared'}});expect(creates).toBe(0);
  const execute={operationId:prepared.body.operationId,expectedDatabaseRevision:prepared.body.revision,expectedEnvironmentRevision:revision};
  const executed=await f.request('databases','provision-execute',execute);expect(executed).toMatchObject({status:200,body:{state:'observed'}});expect(creates).toBe(1);
  expect((await f.request('databases','provision-execute',execute)).status).toBe(409);expect(creates).toBe(1);
  expect(await f.request('databases','provision-observe',{...execute,expectedDatabaseRevision:executed.body.revision})).toMatchObject({status:200,body:{state:'completed'}});
  const listed=await f.request('databases','');expect(listed.body.pendingOperation).toBeNull();expect(listed.body.items[0].providerObservation.state).toBe('ready');
  const encoded=JSON.stringify(listed.body)+JSON.stringify(readBuildRecord(f.root,f.record.buildId));for(const secret of ['SYNTHETIC_MANAGEMENT','SYNTHETIC_PASSWORD'])expect(encoded).not.toContain(secret);expect(JSON.stringify(listed.body)).not.toContain('SecretRef');
 });
 it('resolves social secret variables server-side and projects safe facts without refs or raw provider transport',async()=>{
  const f=await fixture();const env=await f.call('environments.mutate',{action:'create_environment',expectedEnvironmentRevision:0,input:{name:'Auth environment'}});
  await f.call('environments.mutate',{action:'bind_secret',expectedEnvironmentRevision:1,input:{environmentId:env.environmentId,variableName:'GOOGLE_CLIENT_SECRET',backend:'local_env_file'}});
  const db=await f.call('databases.mutate',{action:'create_database',expectedDatabaseRevision:0,input:{provider:'supabase',label:'Auth database',source:'existing',environmentId:env.environmentId}});
  const config={siteUrlSource:'explicit',domainId:null,siteUrl:'https://app.example.com',redirectUrls:['com.example.app://auth-callback'],signupEnabled:true,emailEnabled:true,emailConfirmationRequired:true,publishableKeyVariableName:'VITE_SUPABASE_PUBLISHABLE_KEY',socialProviders:[{provider:'google',enabled:true,clientId:'synthetic-client-id',clientSecretVariableName:'GOOGLE_CLIENT_SECRET'}]};
  expect(await f.request('auth','mutate',{action:'create_auth',expectedAuthRevision:0,input:{label:'Sign-in',databaseId:db.databaseId,environmentId:env.environmentId,config}})).toMatchObject({status:200});
  const listed=await f.request('auth','');expect(listed.body.items[0].config.socialProviders[0]).toMatchObject({provider:'google',credential:{variableName:'GOOGLE_CLIENT_SECRET',backend:'local_env_file'}});expect(JSON.stringify(listed.body)).not.toMatch(/secretRef|authorization|api\.supabase\.com/i);
  expect(await f.request('auth','mutate',{action:'create_auth',expectedAuthRevision:1,input:{label:'Forbidden',databaseId:db.databaseId,environmentId:env.environmentId,config:{...config,socialProviders:[{provider:'google',enabled:true,clientId:'client',clientSecretRef:'raw-ref'}]}}})).toMatchObject({status:400});
 });
});
