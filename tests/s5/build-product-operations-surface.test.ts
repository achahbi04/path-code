import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBuildRecordSkeleton, writeBuildRecord, resolveBuildRecordPath } from '../../scripts/pathcode-cli/build/index.mjs';
import { startPathBuildSurface } from '../../scripts/pathcode-cli/build/surface/server.mjs';
import { resolvePathPackageRoot } from '../../scripts/pathcode-cli/paths.mjs';
const roots:string[]=[];let surface:any;
afterEach(async()=>{await surface?.stop({teardownOwned:true});surface=null;for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true});});
async function fixture(){const root=mkdtempSync(join(tmpdir(),'path-tranche-http-'));roots.push(root);const b=createBuildRecordSkeleton({outcome:'Surface fixture'});b.projectBindings.push({bindingId:'fixture',projectRoot:root});b.loop.status='paused';writeBuildRecord(root,b);surface=await startPathBuildSurface({packageRoot:resolvePathPackageRoot(),runtimeRoot:root,fakeMode:true,autoLoop:false,openBrowser:false,port:0});const base=surface.url;const route=`/api/builds/${b.buildId}`;const request=async(path:string,body?:any,headers:Record<string,string>={})=>{const response=await fetch(new URL(path,base),body===undefined?{headers}:{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});return{status:response.status,body:await response.json() as any};};return{root,b,base,route,request};}
describe('Builder shared foreign-origin protection',()=>{
 it('rejects foreign Host, cross-origin mutations, unsafe fetch-site, wrong content type and large JSON',async()=>{
  const f=await fixture();const path=f.route+'/databases/mutate';const body={action:'create_database',expectedDatabaseRevision:0,input:{}};
  const foreign:any=await new Promise((resolve,reject)=>{const req=httpRequest(new URL(path,f.base),{method:'POST',headers:{Host:'foreign.example','Content-Type':'application/json'}},res=>{const chunks:Buffer[]=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(Buffer.concat(chunks).toString())}));});req.on('error',reject);req.end(JSON.stringify(body));});
  expect(foreign).toMatchObject({status:403,body:{code:'BUILDER_HOST_FORBIDDEN'}});
  expect(await f.request(path,body,{Origin:'https://foreign.example'})).toMatchObject({status:403,body:{code:'BUILDER_ORIGIN_FORBIDDEN'}});
  expect((await fetch(new URL(path,f.base),{method:'HEAD',headers:{Origin:'https://foreign.example'}})).status).toBe(403);
  expect(await f.request(path,body,{'Sec-Fetch-Site':'cross-site'})).toMatchObject({status:403,body:{code:'BUILDER_FETCH_SITE_FORBIDDEN'}});
  expect(await f.request(path,body,{'Content-Type':'text/plain'})).toMatchObject({status:415});
  expect(await f.request(path,{padding:'a'.repeat(256*1024)})).toMatchObject({status:413});
 });
 it('preserves bodyless lifecycle requests and dedicated reference upload transport',async()=>{
  const f=await fixture();
  const stop=await fetch(new URL(f.route+'/stop',f.base),{method:'POST'});expect(stop.status).not.toBe(415);expect(stop.status).not.toBe(403);
  const upload=await fetch(new URL(f.route+'/references/upload',f.base),{method:'POST',headers:{'Content-Type':'text/plain','x-reference-filename':'notes.txt'},body:'Useful creator reference'});expect(upload.status).toBe(200);
 });
});
describe('P13.4–P16 HTTP projection and transport',()=>{
 it('projects legacy planes without writes and renders four management controls',async()=>{
  const f=await fixture();const path=resolveBuildRecordPath(f.root,f.b.buildId);const before=readFileSync(path,'utf8');
  for(const plane of ['databases','auth','payments','native'])expect(await f.request(f.route+'/'+plane)).toMatchObject({status:200,body:{ok:true,revision:0,items:[]}});
  expect(readFileSync(path,'utf8')).toBe(before);
  expect(await f.request(f.route+'/databases/catalog')).toMatchObject({status:200,body:{providers:[{provider:'supabase'}]}});
  const html=await(await fetch(f.base)).text();for(const plane of ['databases','auth','payments','native'])expect(html).toContain(`data-product-plane="${plane}"`);
 });
 it('supports existing database lifecycle using variable-name selection and read-only refresh',async()=>{
  const f=await fixture();const env=await f.request(f.route+'/environments/mutate',{action:'create_environment',expectedEnvironmentRevision:0,input:{name:'Production'}});const environmentId=env.body.environmentId;
  const bind=await f.request(f.route+'/environments/mutate',{action:'bind_secret',expectedEnvironmentRevision:1,input:{environmentId,variableName:'SUPABASE_MANAGEMENT',backend:'vercel_env'}});expect(bind.status).toBe(200);
  const created=await f.request(f.route+'/databases/mutate',{action:'create_database',expectedDatabaseRevision:0,input:{provider:'supabase',label:'Primary DB',environmentId,source:'existing'}});expect(created.status).toBe(200);const databaseId=created.body.databaseId;
  expect(await f.request(f.route+'/databases/mutate',{action:'bind_management_credential',expectedDatabaseRevision:1,input:{databaseId,variableName:'SUPABASE_MANAGEMENT',secretRef:'forbidden'}})).toMatchObject({status:400});
  expect(await f.request(f.route+'/databases/mutate',{action:'bind_management_credential',expectedDatabaseRevision:1,input:{databaseId,variableName:'SUPABASE_MANAGEMENT'}})).toMatchObject({status:200});
  const path=resolveBuildRecordPath(f.root,f.b.buildId);const before=readFileSync(path,'utf8');
  const listed=await f.request(f.route+'/databases');expect(listed.body.items[0]).toMatchObject({label:'Primary DB',credentials:{management:{resolved:true,variableName:'SUPABASE_MANAGEMENT',backend:'vercel_env'}}});expect(JSON.stringify(listed.body)).not.toContain('secretRef');expect(JSON.stringify(listed.body)).not.toContain(f.root);expect(readFileSync(path,'utf8')).toBe(before);
  expect(await f.request(f.route+'/databases/'+databaseId)).toMatchObject({status:200,body:{items:[{databaseId}]}});
  expect(await f.request(f.route+'/databases/mutate',{action:'delete_database',expectedDatabaseRevision:2,input:{databaseId,acknowledgeExternalResourceRetained:false}})).toMatchObject({status:400});
  expect(await f.request(f.route+'/databases/mutate',{action:'delete_database',expectedDatabaseRevision:2,input:{databaseId,acknowledgeExternalResourceRetained:true}})).toMatchObject({status:200});
 });
 it('forbids browser credentials and provider transport in all new planes',async()=>{
  const f=await fixture();for(const plane of ['auth','payments','native'])expect(await f.request(f.route+'/'+plane+'/mutate',{action:'anything',secretRef:'forbidden'})).toMatchObject({status:400});
  const source=readFileSync(new URL('../../scripts/pathcode-cli/build/surface/public/app.js',import.meta.url),'utf8');
  expect(source).not.toMatch(/fetch\([`'"]https:\/\/(?:api\.supabase\.com|api\.stripe\.com)/);
  expect(source).not.toMatch(/localStorage\.setItem\([^\n]*(?:token|secret|key)/i);
 });
 it('does not echo invalid provider input on failed requests',async()=>{
  const f=await fixture();const response=await f.request(f.route+'/auth/mutate',{action:'create_auth',expectedAuthRevision:0,input:{label:'sk_test_SECRET_SENTINEL'}});expect(JSON.stringify(response.body)).not.toContain('SECRET_SENTINEL');
  writeFileSync(join(f.root,'unrelated.txt'),'preserved');
 });
});
