import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
const load = async (name: string) => import(new URL(`../../scripts/pathcode-cli/build/${name}.mjs`, import.meta.url).href);
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

const VITE = 'VITE_SUPABASE_PUBLISHABLE_KEY', NEXT = 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', ASTRO = 'PUBLIC_SUPABASE_PUBLISHABLE_KEY';
type Kind = 'static' | 'vite' | 'next' | 'astro' | 'unknown';
function projectFor(kind: Kind) {
  const root = mkdtempSync(join(tmpdir(), 'path-static-auth-')); roots.push(root);
  if (kind === 'static') writeFileSync(join(root, 'index.html'), '<html>Static</html>');
  else if (kind !== 'unknown') { writeFileSync(join(root, 'package.json'), JSON.stringify({ dependencies: { [kind]: '1.0.0' } })); mkdirSync(join(root, 'src')); }
  return root;
}
const material = (name: string, over: any = {}) => ({ kind: 'secret', variableName: name, secretRef: randomUUID(), backend: 'local_env_file', bindingState: 'configured', presenceState: 'verified_present', safetyState: 'verified_safe', ...over });
function world(kind: Kind, { variable = VITE, key = {} as any, withKey = true }: { variable?: string; key?: any; withKey?: boolean } = {}) {
  const projectRoot = projectFor(kind);
  const mgmt = material('MGMT'); const environmentId = randomUUID(); const databaseId = randomUUID();
  const variables: any[] = [mgmt]; if (withKey) variables.push(material(variable, key));
  const at = '2026-01-01T00:00:00.000Z';
  const item = {
    authId: randomUUID(), provider: 'supabase', label: 'Static auth', databaseId, environmentId,
    config: { siteUrlSource: 'explicit', domainId: null, siteUrl: 'http://localhost:4184', redirectUrls: ['http://localhost:4184/auth/callback'], signupEnabled: true, emailEnabled: true, emailConfirmationRequired: true, publishableKeyVariableName: variable, socialProviders: [] },
    observation: { state: 'ready', adapterVersion: 'supabase.auth.v1', projectRef: 'projectref', configDigest: 'a'.repeat(64), siteUrl: 'http://localhost:4184', redirectUrlsDigest: 'b'.repeat(64), enabledMethods: ['email'], observedAt: at, failureCode: null, matchesDesired: true },
    createdAt: at, updatedAt: at,
  };
  const record: any = {
    projectBindings: [{ bindingId: 'b', projectRoot }],
    databases: { items: [{ databaseId, environmentId, providerObservation: { state: 'ready' }, connectionObservation: { state: 'ready' }, credentials: { managementSecretRef: mgmt.secretRef } }] },
    environments: { items: [{ environmentId, variables }] },
    auth: { schema: 'pathcode.p14.auth.v1', revision: 1, items: [item], pendingOperation: null, operationHistory: [] },
  };
  return { record, item, projectRoot, databaseId, environmentId };
}
const MISMATCH = 'publishable_variable_framework_mismatch';

describe('P14 Auth readiness for static products', () => {
  it('detects the fixtures as the intended frameworks', async () => {
    const { detectBuildArtifact } = await load('runtime/artifact');
    for (const kind of ['static', 'vite', 'next', 'astro'] as Kind[]) expect(detectBuildArtifact(projectFor(kind)).framework).toBe(kind);
    expect(detectBuildArtifact(projectFor('unknown')).framework).not.toBe('static');
  });
  it.each([VITE, NEXT, ASTRO])('accepts approved public name %s for a static product with verified P9 material', async (name) => {
    const { authReadiness } = await load('auth'); const w = world('static', { variable: name });
    const r = authReadiness(w.record, w.item);
    expect(r.problems).not.toContain(MISMATCH); expect(r.problems).not.toContain('publishable_key_missing');
    expect(r).toMatchObject({ state: 'ready', problems: [] });
  });
  it('stays action_required for a static product with a missing publishable binding', async () => {
    const { authReadiness } = await load('auth'); const w = world('static', { withKey: false });
    expect(authReadiness(w.record, w.item)).toMatchObject({ state: 'action_required', problems: expect.arrayContaining(['publishable_key_missing']) });
  });
  it.each([
    ['unverified presence', { presenceState: 'unknown' }],
    ['verified_missing presence', { presenceState: 'verified_missing' }],
    ['unsafe local file', { safetyState: 'verified_unsafe' }],
    ['unverified safety', { safetyState: 'unknown' }],
    ['unconfigured binding', { bindingState: 'unconfigured' }],
  ])('stays action_required for a static product with %s', async (_label, key) => {
    const { authReadiness } = await load('auth'); const w = world('static', { key });
    expect(authReadiness(w.record, w.item)).toMatchObject({ state: 'action_required', problems: expect.arrayContaining(['publishable_key_missing']) });
  });
  it('rejects a name outside the approved public list for a static product', async () => {
    const { authReadiness } = await load('auth'); const w = world('static', { variable: 'SUPABASE_PUBLISHABLE_KEY' });
    expect(authReadiness(w.record, w.item).problems).toContain(MISMATCH);
  });
  it('keeps the exact Vite, Next and Astro mappings', async () => {
    const { authReadiness } = await load('auth');
    for (const [kind, good, wrong] of [['vite', VITE, [NEXT, ASTRO]], ['next', NEXT, [VITE, ASTRO]], ['astro', ASTRO, [VITE, NEXT]]] as [Kind, string, string[]][]) {
      const ok = world(kind, { variable: good }); expect(authReadiness(ok.record, ok.item)).toMatchObject({ state: 'ready', problems: [] });
      for (const name of wrong) { const w = world(kind, { variable: name }); expect(authReadiness(w.record, w.item)).toMatchObject({ state: 'action_required', problems: expect.arrayContaining([MISMATCH]) }); }
    }
  });
  it('does not become ready for an unknown framework merely because an approved key is bound', async () => {
    const { authReadiness } = await load('auth'); const w = world('unknown');
    expect(authReadiness(w.record, w.item)).toMatchObject({ state: 'action_required', problems: expect.arrayContaining([MISMATCH]) });
    const missing = { ...w.record, projectBindings: [{ bindingId: 'b', projectRoot: join(tmpdir(), 'path-missing-' + randomUUID()) }] };
    expect(authReadiness(missing, w.item).problems).toContain(MISMATCH);
  });
  it('resolves an OAC-14-style static Auth record (observation ready, matchesDesired, verified VITE key) to ready', async () => {
    const { authReadiness } = await load('auth'); const w = world('static');
    expect(w.item.observation).toMatchObject({ state: 'ready', matchesDesired: true });
    expect(authReadiness(w.record, w.item)).toMatchObject({ state: 'ready', problems: [], publishableKeyVariableName: VITE });
  });
  it('still reports provider drift for a static product', async () => {
    const { authReadiness } = await load('auth'); const w = world('static'); w.item.observation.matchesDesired = false;
    expect(authReadiness(w.record, w.item)).toMatchObject({ state: 'action_required', problems: ['auth_configuration_differs'] });
  });
});

describe('P15 payment dependency on a static Auth item', () => {
  const payment = (w: any) => ({ paymentId: randomUUID(), integrationId: randomUUID(), verificationBindingId: randomUUID(), runtimeEnvironmentId: w.environmentId, expectedMode: 'test', urlSource: { kind: 'explicit', domainId: null, explicitBaseUrl: 'http://localhost:4184' }, checkout: { webhookPath: '/api/stripe/webhook' }, dependencies: { authId: w.item.authId, databaseId: w.databaseId }, webhook: { endpointId: null } });
  it('does not report auth_dependency_not_ready solely because the product is static', async () => {
    const { paymentReadiness } = await load('payments'); const w = world('static');
    expect(paymentReadiness(w.record, payment(w)).problems).not.toContain('auth_dependency_not_ready');
  });
  it('still reports auth_dependency_not_ready for a genuinely unready Auth item', async () => {
    const { paymentReadiness } = await load('payments');
    for (const w of [world('static', { withKey: false }), world('unknown')]) expect(paymentReadiness(w.record, payment(w)).problems).toContain('auth_dependency_not_ready');
  });
});
