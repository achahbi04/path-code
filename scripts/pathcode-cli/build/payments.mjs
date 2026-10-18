/** P15 hosted Checkout configuration. Stripe owns payment truth and fulfillment. */
import { randomUUID } from 'node:crypto';
import { STRIPE_ADAPTER_VERSION } from './stripe-integration-adapter.mjs';
import { authReadiness } from './auth.mjs';
import { readBuildRecord } from './record.mjs';
import { exact, integer, id, text, iso, variable, stableBase, fail, now } from './operation-validation.mjs';
export const PAYMENTS_SCHEMA = 'pathcode.p15.payments.v1';
export const PAYMENT_EVENTS = Object.freeze({ payment: Object.freeze(['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed']), subscription: Object.freeze(['checkout.session.completed','customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','invoice.paid','invoice.payment_failed']) });
export const emptyBuildPaymentAuthority = () => ({ schema: PAYMENTS_SCHEMA, revision: 0, items: [] });
const path = v => typeof v === 'string' && /^\/(?!\/)[A-Za-z0-9/_-]{0,199}$/.test(v) && !v.split('/').includes('..');
export function validPaymentConfig(i) {
  return exact(i, ['label','integrationId','verificationBindingId','runtimeEnvironmentId','expectedMode','checkout','urlSource','dependencies','webhook']) && text(i.label) && id(i.integrationId) && id(i.verificationBindingId) && id(i.runtimeEnvironmentId) && ['test','live'].includes(i.expectedMode) &&
    exact(i.checkout, ['mode','priceIds','successPath','cancelPath','webhookPath','requiredWebhookEvents']) && ['payment','subscription'].includes(i.checkout.mode) &&
    Array.isArray(i.checkout.priceIds) && i.checkout.priceIds.length >= 1 && i.checkout.priceIds.length <= 20 && new Set(i.checkout.priceIds).size === i.checkout.priceIds.length && i.checkout.priceIds.every(p => typeof p === 'string' && /^price_[A-Za-z0-9]{1,100}$/.test(p)) &&
    ['successPath','cancelPath','webhookPath'].every(k => path(i.checkout[k])) && Array.isArray(i.checkout.requiredWebhookEvents) && i.checkout.requiredWebhookEvents.length === PAYMENT_EVENTS[i.checkout.mode].length && PAYMENT_EVENTS[i.checkout.mode].every(e => i.checkout.requiredWebhookEvents.includes(e)) &&
    exact(i.urlSource, ['kind','domainId','explicitBaseUrl']) && ['explicit','p11_domain'].includes(i.urlSource.kind) && (i.urlSource.kind === 'explicit' ? i.urlSource.domainId === null && (i.urlSource.explicitBaseUrl === null || !!stableBase({}, i.urlSource)) : id(i.urlSource.domainId) && i.urlSource.explicitBaseUrl === null) &&
    exact(i.dependencies, ['authId','databaseId']) && Object.values(i.dependencies).every(v => v === null || id(v)) &&
    exact(i.webhook, ['endpointId','signingSecretVariableName']) && (i.webhook.endpointId === null || typeof i.webhook.endpointId === 'string' && /^we_[A-Za-z0-9]{1,100}$/.test(i.webhook.endpointId)) && i.webhook.signingSecretVariableName === 'STRIPE_WEBHOOK_SECRET';
}
export function readPaymentAuthority(record) {
  if (!record) return fail('BUILD_NOT_FOUND');
  if (!Object.hasOwn(record, 'payments')) return { ok: true, authority: emptyBuildPaymentAuthority() };
  const a = record.payments;
  if (!exact(a, ['schema','revision','items']) || a.schema !== PAYMENTS_SCHEMA || !integer(a.revision) || !Array.isArray(a.items) || a.items.length > 32 || new Set(a.items.map(i => i.paymentId)).size !== a.items.length || a.items.some(i => {
    if (!exact(i, ['paymentId','provider','label','integrationId','verificationBindingId','runtimeEnvironmentId','expectedMode','checkout','urlSource','dependencies','webhook','createdAt','updatedAt'])) return true;
    const { paymentId, provider, createdAt, updatedAt, ...config } = i;
    return !id(paymentId) || provider !== 'stripe' || !iso(createdAt) || !iso(updatedAt) || !validPaymentConfig(config);
  })) return fail('PAYMENTS_INVALID');
  return { ok: true, authority: structuredClone(a) };
}
export function paymentReadiness(record, i) {
  const problems = [];
  const integration = record.integrations?.items?.find(x => x.integrationId === i.integrationId && x.providerKey === 'stripe');
  const binding = integration?.bindings?.find(b => b.bindingId === i.verificationBindingId);
  const environment = record.environments?.items?.find(e => e.environmentId === i.runtimeEnvironmentId);
  if (!integration || !binding || !environment) problems.push('dependency_missing');
  if (i.dependencies.authId && !record.auth?.items?.some(a => a.authId === i.dependencies.authId) || i.dependencies.databaseId && !record.databases?.items?.some(d => d.databaseId === i.dependencies.databaseId)) problems.push('dependency_missing');
  const auth = record.auth?.items?.find(a => a.authId === i.dependencies.authId);
  const database = record.databases?.items?.find(d => d.databaseId === i.dependencies.databaseId);
  if (auth && authReadiness(record,auth).state !== 'ready') problems.push('auth_dependency_not_ready');
  if (database && (database.providerObservation?.state !== 'ready' || database.connectionObservation?.state !== 'ready')) problems.push('database_dependency_not_ready');
  const verificationEnvironment = record.environments?.items?.find(e => e.environmentId === binding?.environmentId);
  const credential = binding?.credentials?.find(c => c.role === 'secret_key');
  const material = verificationEnvironment?.variables?.find(v => v.kind === 'secret' && v.secretRef === credential?.secretRef);
  const verified = binding?.verification?.state === 'ready' && binding.verification.adapterVersion === STRIPE_ADAPTER_VERSION && material?.backend === 'local_env_file' && material.presenceState === 'verified_present' && material.bindingState === 'configured' && material.safetyState === 'verified_safe';
  const modes = ['test','live'].filter(m => binding?.verification?.capabilities?.includes(`stripe.mode.${m}`));
  const mode = verified && modes.length === 1 ? modes[0] : 'unknown';
  if (!verified || mode === 'unknown') problems.push('stripe_verification_required');
  if (mode !== i.expectedMode) problems.push('stripe_mode_mismatch');
  const presence = name => {
    const v = environment?.variables?.find(v => v.kind === 'secret' && v.variableName === name && v.backend === 'vercel_env');
    return v?.bindingState === 'configured' && v.presenceState === 'verified_present' ? 'present' : v?.presenceState === 'verified_missing' || !v ? 'missing' : 'unknown';
  };
  const runtimeSecret = presence('STRIPE_SECRET_KEY'); const webhookSecret = presence('STRIPE_WEBHOOK_SECRET');
  if (runtimeSecret !== 'present') problems.push('runtime_secret_missing');
  if (webhookSecret !== 'present') problems.push('webhook_secret_missing');
  const baseUrl = stableBase(record, i.urlSource);
  if (!baseUrl) problems.push('production_callback_webhook_base_missing');
  if (!i.webhook.endpointId) problems.push('webhook_endpoint_owner_action_required');
  return { state: problems.length ? 'action_required' : 'ready', problems: [...new Set(problems)], verificationIdentity: verified ? 'verified' : 'not_verified', verifiedMode: mode, runtimeSecret, webhookSecret, baseUrl, webhookUrl: baseUrl ? baseUrl + i.checkout.webhookPath : null, webhookEndpointVerification: 'acceptance_pending', crossBackendIdentityProven: false };
}
export function listBuildPayments(runtimeRoot, buildId) {
  const read = readPaymentAuthority(readBuildRecord(runtimeRoot, buildId));
  return read.ok ? { ok: true, buildId, ...read.authority } : read;
}
export function prepareBuildPaymentMutation(runtimeRoot, buildId, request) {
  if (!exact(request, ['action','expectedPaymentRevision','input']) || !integer(request.expectedPaymentRevision)) return fail('PAYMENT_MUTATION_INVALID');
  const record = readBuildRecord(runtimeRoot, buildId), read = readPaymentAuthority(record);
  if (!read.ok) return read;
  if (record.pendingRestore) return fail('RESTORE_PENDING');
  const a = read.authority;
  if (a.revision !== request.expectedPaymentRevision) return fail('PAYMENT_REVISION_STALE');
  const i = request.input; let paymentId;
  if (request.action === 'delete_payment') {
    if (!exact(i, ['paymentId']) || !a.items.some(x => x.paymentId === i.paymentId)) return fail('PAYMENT_NOT_FOUND');
    paymentId = i.paymentId; a.items = a.items.filter(x => x.paymentId !== paymentId);
  } else if (['create_payment','update_payment'].includes(request.action)) {
    if (!i || typeof i !== 'object') return fail('PAYMENT_CONFIG_INVALID');
    const { paymentId: supplied, ...rest } = i;
    const config = request.action === 'create_payment' ? i : rest;
    if (!validPaymentConfig(config)) return fail('PAYMENT_CONFIG_INVALID');
    const integration = record.integrations?.items?.find(x => x.integrationId === i.integrationId && x.providerKey === 'stripe');
    if (!integration?.bindings?.some(b => b.bindingId === i.verificationBindingId) || !record.environments?.items?.some(e => e.environmentId === i.runtimeEnvironmentId) ||
      i.dependencies.authId && !record.auth?.items?.some(x => x.authId === i.dependencies.authId) || i.dependencies.databaseId && !record.databases?.items?.some(x => x.databaseId === i.dependencies.databaseId)) return fail('PAYMENT_DEPENDENCY_MISSING');
    const old = request.action === 'update_payment' ? a.items.find(x => x.paymentId === supplied) : null;
    if (request.action === 'update_payment' && !old) return fail('PAYMENT_NOT_FOUND');
    if (!old && a.items.length >= 32) return fail('PAYMENT_LIMIT');
    paymentId = old?.paymentId || randomUUID();
    a.items = [...a.items.filter(x => x.paymentId !== paymentId), { paymentId, provider: 'stripe', ...structuredClone(config), createdAt: old?.createdAt || now(), updatedAt: now() }];
  } else return fail('PAYMENT_MUTATION_INVALID');
  a.revision++;
  return { ok: true, paymentId, revision: a.revision, record: { ...record, payments: a } };
}
