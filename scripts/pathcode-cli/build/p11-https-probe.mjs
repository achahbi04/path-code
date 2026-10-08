/** HTTPS-only P11 probe. Destination is a canonical persisted FQDN, never a URL. */
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { request } from "node:https";
import { checkServerIdentity } from "node:tls";
import { normalizeP11Fqdn } from "./p11-domains.mjs";

const blocked = new BlockList();
for (const [range, prefix] of [["0.0.0.0",8],["10.0.0.0",8],["100.64.0.0",10],["127.0.0.0",8],["169.254.0.0",16],
  ["172.16.0.0",12],["192.0.0.0",24],["192.0.2.0",24],["192.168.0.0",16],["198.18.0.0",15],["198.51.100.0",24],
  ["203.0.113.0",24],["224.0.0.0",4],["240.0.0.0",4]]) blocked.addSubnet(range, prefix, "ipv4");
for (const [range, prefix] of [["::",128],["::1",128],["::ffff:0:0",96],["64:ff9b:1::",48],["100::",64],["2001:db8::",32],
  ["2002::",16],["fc00::",7],["fe80::",10],["ff00::",8]]) blocked.addSubnet(range, prefix, "ipv6");
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");
const blockedV4 = [[0x00000000, 8], [0x0a000000, 8], [0x64400000, 10], [0x7f000000, 8], [0xa9fe0000, 16],
  [0xac100000, 12], [0xc0000000, 24], [0xc0000200, 24], [0xc0586300, 24], [0xc0a80000, 16],
  [0xc6120000, 15], [0xc6336400, 24], [0xcb007100, 24], [0xe0000000, 4], [0xf0000000, 4]];

function isBlockedV4(address) {
  const value = address.split(".").reduce((n, part) => ((n << 8) | Number(part)) >>> 0, 0);
  return blockedV4.some(([network, prefix]) => (value >>> (32 - prefix)) === (network >>> (32 - prefix)));
}

export function isPublicP11Address(address) {
  const family = isIP(address);
  if (!family || (family === 4 ? isBlockedV4(address) : blocked.check(address, "ipv6"))) return false;
  if (family === 6 && !globalV6.check(address, "ipv6")) {
    // Global unicast currently occupies 2000::/3; accepting other unblocked
    // special-use ranges would be an unsafe default.
    return false;
  }
  return true;
}

export async function probeP11Https(fqdn, { resolveImpl = lookup, requestImpl = request, timeoutMs = 8_000, now = () => new Date() } = {}) {
  const canonical = normalizeP11Fqdn(fqdn);
  if (!canonical || canonical !== fqdn) return { ok: false, code: "P11_PROBE_HOST_INVALID" };
  let addresses;
  try { addresses = await resolveImpl(canonical, { all: true, verbatim: true }); }
  catch { return { ok: false, code: "P11_DNS_RESOLUTION_FAILED" }; }
  if (!Array.isArray(addresses) || addresses.length === 0 || addresses.some((entry) => !entry || !isPublicP11Address(entry.address)))
    return { ok: false, code: "P11_PROBE_ADDRESS_UNSAFE" };
  const chosen = addresses[0];
  return new Promise((resolve) => {
    let done = false;
    let timer = null, req;
    const finish = (result) => { if (done) return; done = true; if (timer) clearTimeout(timer); resolve(result); };
    timer = setTimeout(() => { req?.destroy(); finish({ ok: false, code: "P11_TLS_PROBE_TIMEOUT" }); }, timeoutMs);
    try { req = requestImpl({ protocol: "https:", hostname: canonical, port: 443, path: "/", method: "GET",
      agent: false, servername: canonical, rejectUnauthorized: true,
      lookup: (_host, _options, callback) => callback(null, chosen.address, chosen.family),
      checkServerIdentity: (host, cert) => checkServerIdentity(host, cert) }, (res) => {
      const socket = res.socket;
      const cert = socket.getPeerCertificate?.() ?? {};
      const san = typeof cert.subjectaltname === "string" ? cert.subjectaltname.split(/,\s*/).map((item) => item.replace(/^DNS:/, "")) : [];
      const exact = san.includes(canonical);
      const observedAt = now().toISOString();
      res.resume();
      finish({ ok: true, fqdn: canonical, tlsState: exact ? "pending" : "error", handshakeOk: true,
        certificateNames: san, validFrom: cert.valid_from ?? null, validTo: cert.valid_to ?? null,
        certificateHostnameValid: exact, httpStatus: Number.isInteger(res.statusCode) ? res.statusCode : null,
        observedAt });
    });
      req.on("error", (error) => finish({ ok: false, code: error.code === "ERR_TLS_CERT_ALTNAME_INVALID" ? "P11_CERTIFICATE_NAME_INVALID" : "P11_TLS_HANDSHAKE_FAILED" }));
      req.end();
    } catch { finish({ ok: false, code: "P11_TLS_HANDSHAKE_FAILED" }); }
  });
}
