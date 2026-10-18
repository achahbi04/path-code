/** Foreign-origin guard for the local Builder API. Same-origin preview is not isolated. */
export const BUILDER_JSON_LIMIT = 256 * 1024;
export async function guardBuilderApiRequest(req, { port = req.socket.localPort, referenceUpload = false } = {}) {
  const host = req.headers.host;
  if (typeof host !== 'string' || ![`127.0.0.1:${port}`,`localhost:${port}`].includes(host)) return {ok:false,status:403,code:'BUILDER_HOST_FORBIDDEN'};
  const site = req.headers['sec-fetch-site'];
  if (site !== undefined && !['same-origin','none'].includes(site)) return {ok:false,status:403,code:'BUILDER_FETCH_SITE_FORBIDDEN'};
  const method = req.method || 'GET';
  if (method !== 'GET' && req.headers.origin !== undefined && req.headers.origin !== `http://${host}`) return {ok:false,status:403,code:'BUILDER_ORIGIN_FORBIDDEN'};
  if (!['GET','HEAD'].includes(method)) {
    if (referenceUpload) return {ok:true};
    let bytes = 0; const chunks = []; let tooLarge = Number(req.headers['content-length']) > BUILDER_JSON_LIMIT;
    if (tooLarge) { req.resume(); return {ok:false,status:413,code:'BUILDER_JSON_TOO_LARGE'}; }
    try {
      for await (const chunk of req) { bytes += chunk.length; if (bytes > BUILDER_JSON_LIMIT) { tooLarge = true; chunks.length = 0; } else if (!tooLarge) chunks.push(chunk); }
    } catch { return {ok:false,status:400,code:'BUILDER_BODY_INVALID'}; }
    if (tooLarge) return {ok:false,status:413,code:'BUILDER_JSON_TOO_LARGE'};
    if (bytes && !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type'] || '')) return {ok:false,status:415,code:'BUILDER_JSON_CONTENT_TYPE_REQUIRED'};
    req.builderJsonBody = Buffer.concat(chunks).toString('utf8');
  }
  return {ok:true};
}
