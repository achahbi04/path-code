/** Supabase Auth's owned configuration only. Never retain broad provider payloads. */
import { executeSupabaseManagementRequest } from './supabase-management-adapter.mjs';
import { exact, safeUrl, text, digest, fail } from './operation-validation.mjs';
export const AUTH_ADAPTER_VERSION = 'supabase.auth.v1';
export const AUTH_PATCH_FIELDS = Object.freeze(['site_url', 'uri_allow_list', 'disable_signup', 'external_email_enabled', 'mailer_autoconfirm', 'external_google_enabled', 'external_google_client_id', 'external_google_secret', 'external_github_enabled', 'external_github_client_id', 'external_github_secret']);
export function reduceAuthConfig(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !safeUrl(raw.site_url) || typeof raw.uri_allow_list !== 'string' || raw.uri_allow_list.length > 16384) return null;
  const result = { site_url: raw.site_url, uri_allow_list: raw.uri_allow_list };
  const redirects = raw.uri_allow_list ? raw.uri_allow_list.split(',') : [];
  if (redirects.length > 32 || redirects.some(u => !safeUrl(u, true))) return null;
  for (const k of ['disable_signup', 'external_email_enabled', 'mailer_autoconfirm', 'external_google_enabled', 'external_github_enabled']) {
    if (typeof raw[k] !== 'boolean') return null;
    result[k] = raw[k];
  }
  for (const p of ['google', 'github']) {
    const client = raw[`external_${p}_client_id`] ?? '';
    if (client !== '' && !text(client, 512)) return null;
    result[`external_${p}_client_id`] = client;
    result[`external_${p}_secret_present`] = typeof raw[`external_${p}_secret`] === 'string' && raw[`external_${p}_secret`].length > 0;
  }
  return result;
}
export function validReducedAuthConfig(c) {
  if (!exact(c, ['site_url','uri_allow_list','disable_signup','external_email_enabled','mailer_autoconfirm','external_google_enabled','external_github_enabled','external_google_client_id','external_google_secret_present','external_github_client_id','external_github_secret_present']) || typeof c.external_google_secret_present !== 'boolean' || typeof c.external_github_secret_present !== 'boolean') return false;
  return !!reduceAuthConfig({...c, external_google_secret:c.external_google_secret_present ? 'present' : null, external_github_secret:c.external_github_secret_present ? 'present' : null});
}
export const authConfigDigest = reduced => digest(Object.fromEntries(Object.keys(reduced).sort().map(k => [k,reduced[k]])));
export function desiredAuthPatch(config, socialSecrets = {}) {
  const result = { site_url: config.siteUrl, uri_allow_list: config.redirectUrls.join(','), disable_signup: !config.signupEnabled,
    external_email_enabled: config.emailEnabled, mailer_autoconfirm: !config.emailConfirmationRequired };
  for (const p of ['google', 'github']) {
    const social = config.socialProviders.find(s => s.provider === p);
    result[`external_${p}_enabled`] = !!social?.enabled;
    result[`external_${p}_client_id`] = social?.clientId || '';
    if (social?.enabled) result[`external_${p}_secret`] = socialSecrets[p];
  }
  return result;
}
export function createSupabaseAuthAdapter({ executor = executeSupabaseManagementRequest } = {}) {
  async function call(input, method, patch) {
    if (!exact(input, ['credential', 'projectRef']) || !/^[a-z0-9]{1,80}$/.test(input.projectRef) || typeof input.credential !== 'string' || !input.credential || input.credential.length > 16384 || /[\r\n\0]/.test(input.credential)) return fail('AUTH_CREDENTIAL_REQUIRED');
    if (patch && (Object.keys(patch).some(k => !AUTH_PATCH_FIELDS.includes(k)) || Object.entries(patch).some(([k, v]) => k.endsWith('_enabled') || ['disable_signup','mailer_autoconfirm'].includes(k) ? typeof v !== 'boolean' : typeof v !== 'string' || v.length > 16384 || /[\r\n\0]/.test(v)))) return fail('AUTH_PATCH_INVALID');
    let response;
    try { response = await executor({ protocol: 'https:', hostname: 'api.supabase.com', port: 443,
      path: `/v1/projects/${input.projectRef}/config/auth`, method, rejectUnauthorized: true,
      headers: { Accept: 'application/json', Authorization: `Bearer ${input.credential}`, ...(patch ? { 'Content-Type': 'application/json' } : {}) },
      ...(patch ? { body: JSON.stringify(patch) } : {}) }); } catch { return fail('AUTH_PROVIDER_UNAVAILABLE'); }
    if (response?.statusCode === 401 || response?.statusCode === 403) return fail('AUTH_PROVIDER_PERMISSION_REQUIRED');
    if (response?.statusCode !== 200) return fail('AUTH_PROVIDER_UNAVAILABLE');
    let reduced;
    try { const b = Buffer.from(response.body); if (b.length > 65536) return fail('AUTH_PROVIDER_RESPONSE_UNSAFE'); reduced = reduceAuthConfig(JSON.parse(b.toString('utf8'))); } catch { return fail('AUTH_PROVIDER_RESPONSE_UNSAFE'); }
    return reduced ? { ok: true, config: reduced, configDigest: authConfigDigest(reduced) } : fail('AUTH_PROVIDER_RESPONSE_UNSAFE');
  }
  return Object.freeze({ adapterVersion: AUTH_ADAPTER_VERSION, observe: input => call(input, 'GET'), patch: (input, patch) => call(input, 'PATCH', patch) });
}
