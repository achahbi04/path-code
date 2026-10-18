/** Wiring helpers for the existing coordinator, not a separate mutation authority. */
import { readBuildRecord, writeBuildRecord } from './record.mjs';
import { readAuthAuthority, listBuildAuth, authReadiness, prepareBuildAuthMutation } from './auth.mjs';
import { readPaymentAuthority, listBuildPayments, paymentReadiness, prepareBuildPaymentMutation } from './payments.mjs';
import { listBuildNative, nativeReadiness, prepareBuildNativeMutation } from './native.mjs';
import { runAuthOperation } from './auth-operations.mjs';
import { runNativeOperation, removeNativeWorkspace } from './native-operations.mjs';
import { appendBuildEvent } from './events.mjs';
import { exact, fail } from './operation-validation.mjs';
export const PRODUCT_OPERATION_METHODS = Object.freeze(['build.auth.list','build.auth.read','build.auth.mutate','build.auth.observe','build.auth.applyPrepare','build.auth.applyExecute','build.auth.applyObserve','build.payments.list','build.payments.read','build.payments.mutate','build.native.list','build.native.read','build.native.mutate','build.native.prepare','build.native.execute','build.native.observe']);
export function guardProductReferences(record,plane,request) {
  if (!['delete_database','delete_integration','unbind_environment','delete_auth'].includes(request?.action)) return {ok:true};
  const auth = readAuthAuthority(record); const payments = readPaymentAuthority(record);
  if (!auth.ok) return auth; if (!payments.ok) return payments;
  const i = request.input;
  if (!i) return fail('OPERATION_REQUEST_INVALID');
  if (plane === 'databases' && request.action === 'delete_database' && (auth.authority.items.some(a=>a.databaseId===i.databaseId) || payments.authority.items.some(p=>p.dependencies.databaseId===i.databaseId))) return fail('DATABASE_REFERENCED');
  if (plane === 'integrations' && payments.authority.items.some(p=>p.integrationId===i.integrationId && (request.action==='delete_integration' || p.verificationBindingId===i.bindingId))) return fail('INTEGRATION_REFERENCED');
  if (plane === 'auth' && request.action === 'delete_auth' && (payments.authority.items.some(p=>p.dependencies.authId===i.authId) || record.native?.profiles?.some(p=>p.authId===i.authId))) return fail('AUTH_REFERENCED');
  return {ok:true};
}
export async function dispatchProductOperation({method,params,runtimeRoot,exclusive,authAdapter,nativeExecutor,activeOperations}) {
  const [,plane,action] = method.split('.'); const {buildId,...request} = params;
  if (['list','read'].includes(action)) {
    const key={auth:'authId',payments:'paymentId',native:'nativeId'}[plane];
    if (!exact(params,action==='read'?['buildId',key]:['buildId'])) return fail('OPERATION_REQUEST_INVALID');
    const record=readBuildRecord(runtimeRoot,buildId);
    const r={auth:listBuildAuth,payments:listBuildPayments,native:listBuildNative}[plane](runtimeRoot,buildId);
    if(!r.ok) return r;
    if(plane==='auth') r.items=r.items.map(i=>({...i,readiness:authReadiness(record,i)}));
    if(plane==='payments') r.items=r.items.map(i=>({...i,readiness:paymentReadiness(record,i)}));
    if(plane==='native') r.profiles=r.profiles.map(p=>({...p,readiness:nativeReadiness(record,p)}));
    if(action==='read') {
      const item=(plane==='native'?r.profiles:r.items).find(i=>i[key]===params[key]);
      return item?{ok:true,revision:r.revision,[plane==='native'?'profile':plane==='auth'?'auth':'payment']:item}:fail('OPERATION_NOT_FOUND');
    }
    if(plane==='native') r.authoritativeSha=record.authoritativeSha || null;
    return r;
  }
  let result;
  if(action==='mutate') result=await exclusive(buildId,()=>{
    const record=readBuildRecord(runtimeRoot,buildId);
    const guard=guardProductReferences(record,plane,request); if(!guard.ok)return guard;
    const r={auth:prepareBuildAuthMutation,payments:prepareBuildPaymentMutation,native:prepareBuildNativeMutation}[plane](runtimeRoot,buildId,request);
    if(!r.ok)return r;
    for (const artifactId of r.cleanupArtifactIds || []) { const clean=removeNativeWorkspace(runtimeRoot,buildId,artifactId); if(!clean.ok) return clean; }
    writeBuildRecord(runtimeRoot,r.record);
    const {record:_record,cleanupArtifactIds:_cleanup,...out}=r; return out;
  });
  else if(plane==='auth') result=await runAuthOperation({runtimeRoot,buildId,action,params:request,exclusive,adapter:authAdapter});
  else if(plane==='native') result=await runNativeOperation({runtimeRoot,buildId,action,params:request,exclusive,executor:nativeExecutor,activeOperations});
  else return fail('OPERATION_REQUEST_INVALID');
  if(result?.ok) { try { appendBuildEvent(runtimeRoot,buildId,`${plane}.${action}`,{revision:result.revision,...(result.state?{state:result.state}:{})}); } catch { /* record is authority */ } }
  return result;
}
