/** Bounded validation primitives shared by the P14–P16 product planes. */
import { createHash } from 'node:crypto';
import { readP11DomainAuthority } from './p11-domains.mjs';
export const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v) && [Object.prototype, null].includes(Object.getPrototypeOf(v));
export const exact = (v, keys) => plain(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
export const integer = v => Number.isSafeInteger(v) && v >= 0;
export const id = v => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(v);
export const variable = v => typeof v === 'string' && /^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(v);
export const secretLike = v => /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----|\bBearer\s+\S+|\b(?:ghp|github_pat|sk_test|sk_live|rk_test|rk_live|whsec|sb_secret)_[A-Za-z0-9_]+/i.test(String(v));
export const text = (v, max = 80) => typeof v === 'string' && v.trim() === v && v.length > 0 && v.length <= max && !/[\u0000-\u001f\u007f-\u009f]/.test(v) && !secretLike(v);
export const iso = v => typeof v === 'string' && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
export const digest = v => createHash('sha256').update(JSON.stringify(v)).digest('hex');
export const fail = code => ({ ok: false, code });
export const now = () => new Date().toISOString();
export function safeUrl(v, mobile = false) {
  if (!text(v, 2048) || /[\s,\\]/.test(v)) return false;
  try {
    const u = new URL(v);
    if (u.username || u.password || u.hash) return false;
    if (u.protocol === 'https:') return !!u.hostname;
    if (u.protocol === 'http:') return ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
    return mobile && /^[A-Za-z][A-Za-z0-9+.-]*:$/.test(u.protocol) && !['javascript:', 'data:', 'file:', 'ftp:'].includes(u.protocol) && !!u.hostname;
  } catch { return false; }
}
export function stableBase(record, source) {
  if (!exact(source, ['kind', 'domainId', 'explicitBaseUrl'])) return null;
  if (source.kind === 'explicit' && source.domainId === null && safeUrl(source.explicitBaseUrl)) {
    const u = new URL(source.explicitBaseUrl);
    return u.pathname === '/' && !u.search ? u.origin : null;
  }
  if (source.kind !== 'p11_domain' || !id(source.domainId) || source.explicitBaseUrl !== null) return null;
  const read = readP11DomainAuthority(record);
  const d = read.ok && read.authority.domains.find(d => d.domainId === source.domainId);
  return d && d.attachmentState === 'attached' && d.verificationState === 'verified' && d.tlsState === 'ready' && safeUrl(`https://${d.fqdn}`) ? `https://${d.fqdn}` : null;
}
