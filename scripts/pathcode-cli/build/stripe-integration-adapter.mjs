/** One read-only Account request. No Checkout capability is inferred. */
import https from 'node:https';
import { exact, fail } from './operation-validation.mjs';
export const STRIPE_ADAPTER_VERSION = 'stripe.account.v1';
export function reduceStripeAccount(raw, mode) {
  return raw && raw.object === 'account' && typeof raw.id === 'string' && /^acct_[A-Za-z0-9]{1,100}$/.test(raw.id)
    ? { ok: true, providerAccountRef: raw.id, capabilities: ['stripe.account.read', `stripe.mode.${mode}`] }
    : fail('PROVIDER_RESPONSE_UNSAFE');
}
export function createStripeIdentityAdapter({ requestImpl = https.request } = {}) {
  return Object.freeze({ providerKey: 'stripe', adapterVersion: STRIPE_ADAPTER_VERSION,
    async verify(input) {
      if (!exact(input, ['credentials']) || !exact(input.credentials, ['secret_key'])) return fail('PROVIDER_CREDENTIAL_REJECTED');
      const key = input.credentials.secret_key;
      const match = typeof key === 'string' && /^(?:sk|rk)_(test|live)_[A-Za-z0-9]{1,512}$/.exec(key);
      if (!match) return fail('PROVIDER_CREDENTIAL_REJECTED');
      return new Promise(resolve => {
        let done = false, request, timer;
        const finish = value => { if (!done) { done = true; clearTimeout(timer); resolve(value); } };
        try {
          request = requestImpl({ protocol: 'https:', hostname: 'api.stripe.com', port: 443, path: '/v1/account', method: 'GET', rejectUnauthorized: true,
            headers: { Accept: 'application/json', Authorization: `Bearer ${key}` } }, response => {
            if ([401,403].includes(response.statusCode)) { finish(fail('PROVIDER_CREDENTIAL_REJECTED')); response.destroy?.(); return; }
            if (response.statusCode !== 200) { finish(fail('PROVIDER_UNAVAILABLE')); response.destroy?.(); return; }
            const chunks = []; let size = 0;
            response.on('data', chunk => { size += chunk.length; if (size > 65536) { finish(fail('PROVIDER_RESPONSE_UNSAFE')); response.destroy?.(); request.destroy(); } else chunks.push(chunk); });
            response.on('error', () => finish(fail('PROVIDER_UNAVAILABLE')));
            response.on('end', () => { try { finish(reduceStripeAccount(JSON.parse(Buffer.concat(chunks).toString('utf8')), match[1])); } catch { finish(fail('PROVIDER_RESPONSE_UNSAFE')); } });
          });
          timer = setTimeout(() => { finish(fail('PROVIDER_UNAVAILABLE')); request.destroy(); }, 10000);
          request.on('error', () => finish(fail('PROVIDER_UNAVAILABLE'))); request.end();
        } catch { request?.destroy?.(); finish(fail('PROVIDER_UNAVAILABLE')); }
      });
    }
  });
}
