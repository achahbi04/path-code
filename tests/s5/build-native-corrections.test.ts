import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import * as fsAsync from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
import { EventEmitter } from 'node:events';
const { executeNativeCommand, inspectNativeFiles, measureNativeWorkspace, NATIVE_LIMITS } = await import(new URL('../../scripts/pathcode-cli/build/native-executor.mjs', import.meta.url).href);

vi.mock('node:fs/promises', async importOriginal => ({...await importOriginal<typeof import('node:fs/promises')>()}));
const roots: string[] = [];
function workspace() { const root=mkdtempSync(join(tmpdir(),'path-native-correction-'));roots.push(root);return root; }
afterEach(()=>{vi.restoreAllMocks();for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true});});

describe('RC-1 bounded native disk monitoring',()=>{
 it('tolerates an actual transient ENOENT between directory enumeration and lstat',async()=>{
  const root=workspace(),file=join(root,'disappearing');writeFileSync(file,'transient');
  const actual=fsAsync.lstat;
  vi.spyOn(fsAsync,'lstat').mockImplementation(async(path:any,...args:any[])=>{
   if(String(path)===file)rmSync(file,{force:true});return (actual as any)(path,...args);
  });
  expect(await measureNativeWorkspace(root)).toMatchObject({bytes:0,count:1});
 });
 it('tolerates a directory removed while traversal is opening it',async()=>{
  const root=workspace(),dir=join(root,'disappearing');mkdirSync(dir);
  const actual=fsAsync.opendir;
  vi.spyOn(fsAsync,'opendir').mockImplementation(async(path:any,...args:any[])=>{
   if(String(path)===dir)rmSync(dir,{recursive:true});
   return (actual as any)(path,...args);
  });
  expect(await measureNativeWorkspace(root)).toMatchObject({bytes:0});
 });
 it('does not classify permission failure as a measured disk overflow',async()=>{
  const root=workspace();writeFileSync(join(root,'unreadable'),'data');
  vi.spyOn(fsAsync,'lstat').mockRejectedValue(Object.assign(new Error('denied'),{code:'EACCES'}));
  await expect(measureNativeWorkspace(root)).rejects.toThrow('NATIVE_WORKSPACE_UNAVAILABLE');
  expect(await executeNativeCommand([process.execPath,'-e','setInterval(()=>{},1000)'],{cwd:root,env:{},limits:{...NATIVE_LIMITS,timeoutMs:5000}})).toEqual({ok:false,code:'NATIVE_WORKSPACE_UNAVAILABLE'});
 });
 it('runs concurrent create/delete and rename churn without a false NATIVE_DISK_LIMIT',async()=>{
  const root=workspace();
  const code=`const fs=require('node:fs');let n=0;const t=setInterval(()=>{for(let i=0;i<60;i++){const p='churn-'+n++;fs.mkdirSync(p);fs.writeFileSync(p+'/a','ordinary');fs.renameSync(p+'/a',p+'/b');fs.rmSync(p,{recursive:true});}},1);setTimeout(()=>{clearInterval(t);},2300);`;
  let ticks=0;const timer=setInterval(()=>ticks++,10);
  try {
   expect(await executeNativeCommand([process.execPath,'-e',code],{cwd:root,env:{},limits:{...NATIVE_LIMITS,diskBytes:1048576,timeoutMs:8000}})).toEqual({ok:true});
   expect(ticks).toBeGreaterThan(20);
  } finally {clearInterval(timer);}
 });
 it('still terminates a real measured workspace byte-cap violation',async()=>{
  const root=workspace();
  expect(await executeNativeCommand([process.execPath,'-e',"require('node:fs').writeFileSync('too-large',Buffer.alloc(2048));setInterval(()=>{},1000)"],{cwd:root,env:{},limits:{...NATIVE_LIMITS,diskBytes:1024,timeoutMs:5000}})).toEqual({ok:false,code:'NATIVE_DISK_LIMIT'});
 });
 it('bounds traversal depth rather than accumulating an unbounded path list',async()=>{
  const root=workspace();let dir=root;for(let n=0;n<130;n++){dir=join(dir,'d');mkdirSync(dir);}
  await expect(measureNativeWorkspace(root)).rejects.toThrow('NATIVE_WORKSPACE_UNAVAILABLE');
 });
 it('rejects escaping and nested escaping links while allowing internal package-manager links',async()=>{
  const root=workspace();writeFileSync(join(root,'module'),'safe');symlinkSync('module',join(root,'internal'));
  expect(await measureNativeWorkspace(root)).toMatchObject({bytes:4});
  symlinkSync('/outside-workspace',join(root,'escape'));
  await expect(measureNativeWorkspace(root)).rejects.toThrow('NATIVE_WORKSPACE_UNSAFE');
  rmSync(join(root,'escape'));mkdirSync(join(root,'nested'));symlinkSync('/outside-workspace',join(root,'nested','escape'));symlinkSync('nested/escape',join(root,'chain'));
  await expect(measureNativeWorkspace(root)).rejects.toThrow('NATIVE_WORKSPACE_UNSAFE');
 });
 it('accepts canonical parent aliases used by macOS temp paths but rejects a linked workspace root',async()=>{
  const root=workspace(),child=join(root,'child'),aliasRoot=workspace();mkdirSync(child);writeFileSync(join(child,'file'),'safe');
  symlinkSync(root,join(aliasRoot,'parent'));
  expect(await measureNativeWorkspace(join(aliasRoot,'parent','child'))).toMatchObject({bytes:4});
  symlinkSync(child,join(aliasRoot,'workspace'));
  await expect(measureNativeWorkspace(join(aliasRoot,'workspace'))).rejects.toThrow('NATIVE_WORKSPACE_UNSAFE');
 });
 it('never invokes a shell and retains command/arguments as separate argv entries',async()=>{
  const root=workspace();const argv=['tool','argument with spaces','$(must-not-execute)'];
  const result=await executeNativeCommand(argv,{cwd:root,env:{PATH:'/safe/bin'},spawnImpl:(command:string,args:string[],options:any)=>{
   expect(command).toBe(process.execPath);expect(args.slice(1)).toEqual(argv);
   expect(options).toMatchObject({shell:false,detached:true,env:{PATH:'/safe/bin'}});
   const child:any=new EventEmitter();child.send=()=>{};queueMicrotask(()=>child.emit('close',0));return child;
  }});
  expect(result).toEqual({ok:true});
 });
 it('continues to enforce timeout and output caps',async()=>{
  const root=workspace();
  expect(await executeNativeCommand([process.execPath,'-e','setInterval(()=>{},1000)'],{cwd:root,env:{},limits:{...NATIVE_LIMITS,timeoutMs:80}})).toEqual({ok:false,code:'NATIVE_TIMEOUT'});
  expect(await executeNativeCommand([process.execPath,'-e','process.stdout.write("x".repeat(4096));setInterval(()=>{},1000)'],{cwd:root,env:{},limits:{...NATIVE_LIMITS,outputBytes:1024,timeoutMs:5000}})).toEqual({ok:false,code:'NATIVE_OUTPUT_LIMIT'});
 });
});

describe('RC-2 artifact private-material detection',()=>{
 it('accepts ordinary Supabase client template text and PEM parser header literals',()=>{
  const root=workspace();
  writeFileSync(join(root,'supabase-client.js'),'class SupabaseClient { headers() { return { Authorization: `Bearer ${this.supabaseKey}` }; } }\nconst parserHeader = "-----BEGIN PRIVATE KEY-----";\nconst rsaHeader = "-----BEGIN RSA PRIVATE KEY-----";');
  expect(inspectNativeFiles(root).checksums).toHaveLength(1);
 });
 it.each(['Supabase private','Stripe test','Stripe live','restricted test','restricted live','webhook','GitHub classic','GitHub fine-grained'])('rejects actual private-prefix material: %s',kind=>{
  const prefixes:Record<string,string>={'Supabase private':'sb_secret_','Stripe test':'sk_test_','Stripe live':'sk_live_','restricted test':'rk_test_','restricted live':'rk_live_','webhook':'whsec_','GitHub classic':'ghp_','GitHub fine-grained':'github_pat_'};
  const root=workspace();writeFileSync(join(root,'bundle.js'),'const credential="'+prefixes[kind]+'SYNTHETIC_SENTINEL123";');
  expect(()=>inspectNativeFiles(root)).toThrow('NATIVE_SECRET_OUTPUT_UNSAFE');
 });
 it.each(['pkcs8','pkcs1'] as const)('rejects real generated PEM private material (%s), including JSON-escaped form',type=>{
  const root=workspace();const {privateKey}=generateKeyPairSync('rsa',{modulusLength:1024});const pem=privateKey.export({type,format:'pem'}).toString();
  for(const data of [pem,JSON.stringify({key:pem})]){
   writeFileSync(join(root,'bundle.js'),data);expect(()=>inspectNativeFiles(root)).toThrow('NATIVE_SECRET_OUTPUT_UNSAFE');
  }
 });
 it('retains exact and encoded selected-private-value detection for unstructured OAuth credentials',()=>{
  const root=workspace();const value='SELECTED_SYNTHETIC_OAUTH_PRIVATE_VALUE';
  for(const data of [value,Buffer.from(value).toString('base64')]){
   writeFileSync(join(root,'bundle.js'),data);expect(()=>inspectNativeFiles(root,{sentinels:[value]})).toThrow('NATIVE_SECRET_OUTPUT_UNSAFE');
  }
 });
});
