/** Engine-neutral product facts; never credentials, refs or operational commands. */
import { secretLike } from './operation-validation.mjs';
export function configuredProductOperationContext(record) {
  const lines = [];
  const safe = value => secretLike(value) ? '[redacted]' : String(value ?? 'not configured').replace(/[\r\n\0]/g,' ').slice(0,2048);
  const environment = id => record.environments?.items?.find(e=>e.environmentId===id);
  for (const d of record.databases?.items || []) {
    const e = environment(d.environmentId);
    const variable = ref => e?.variables?.find(v=>v.kind==='secret' && v.secretRef===ref)?.variableName || 'unresolved';
    lines.push('CONFIGURED DATABASES',`Database: ${safe(d.label)}`,'Provider: Supabase / Postgres',`Environment: ${safe(e?.name)}`,`Project: ${safe(d.providerTarget?.projectRef)}`,`Region: ${safe(d.providerTarget?.region)}`,`Provider: ${safe(d.providerObservation?.state)}`,`Connection: ${safe(d.connectionObservation?.state)} (${safe(d.connectionObservation?.serverVersion)})`,`Migration state: ${safe(d.migrationObservation?.state)}`,`Database credential variable: ${safe(variable(d.credentials?.databaseUrlSecretRef))}`,'');
  }
  for (const a of record.auth?.items || []) {
    const d = record.databases?.items?.find(d=>d.databaseId===a.databaseId);
    lines.push('AUTHENTICATION','Provider: Supabase Auth',`Project URL: ${d?.providerTarget?.projectRef ? 'https://'+safe(d.providerTarget.projectRef)+'.supabase.co' : 'dependency missing'}`,`Client key variable: ${safe(a.config?.publishableKeyVariableName)}`,`Email: ${a.config?.emailEnabled ? 'enabled':'disabled'}`,...(a.config?.socialProviders || []).map(s=>`${safe(s.provider)}: ${s.enabled?'enabled':'disabled'}`),`Site URL: ${safe(a.config?.siteUrl)}`,`Redirect URLs: ${(a.config?.redirectUrls || []).map(safe).join(', ')}`,`Provider config: ${safe(a.observation?.state)}`,'');
  }
  for (const p of record.payments?.items || []) lines.push('PAYMENTS','Provider: Stripe',`Runtime environment: ${safe(environment(p.runtimeEnvironmentId)?.name)}`,'Secret variable: STRIPE_SECRET_KEY',`Expected mode: ${safe(p.expectedMode)}`,`Checkout mode: ${safe(p.checkout?.mode)}`,`Price IDs: ${(p.checkout?.priceIds || []).map(safe).join(', ')}`,`Success path: ${safe(p.checkout?.successPath)}`,`Cancel path: ${safe(p.checkout?.cancelPath)}`,`Webhook path: ${safe(p.checkout?.webhookPath)}`,'Webhook signing variable: STRIPE_WEBHOOK_SECRET',`Required webhook events: ${(p.checkout?.requiredWebhookEvents || []).map(safe).join(', ')}`,`Auth dependency: ${safe(p.dependencies?.authId || 'none')}`,`Database dependency: ${safe(p.dependencies?.databaseId || 'none')}`,'The product server creates hosted Checkout Sessions. Fulfill payments through verified webhook events, never through browser success redirects.','');
  for (const p of record.native?.profiles || []) lines.push('NATIVE PACKAGING',`App: ${safe(p.appName)}`,`App ID: ${safe(p.appId)}`,`Platforms: ${(p.platforms || []).map(safe).join(', ')}`,`Build environment: ${safe(environment(p.buildEnvironmentId)?.name)}`,`Web output: ${safe(p.packagePolicy?.webDir)}`,`Auth callback: ${p.authCallbackScheme ? safe(p.authCallbackScheme)+'://auth-callback':'none'}`,'Generated native projects are operational artifacts. Source changes must use normal candidate/Apply authority.','Hosted Checkout stays web-based; return/deep-link behavior requires acceptance.','');
  return lines.join('\n');
}
