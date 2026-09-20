/**
 * Reverse-proxy preview traffic to a Build-owned runtime.
 * Only proxies runtimes owned by the requested buildId.
 */

import { request as httpRequest } from "node:http";

/**
 * Inject element-selection helper + revision marker into HTML responses.
 * @param {string} html
 * @param {string} buildId
 * @param {{ authoritativeSha?: string | null }} [meta]
 */
export function injectPreviewHelpers(html, buildId, meta = {}) {
  const sha = typeof meta.authoritativeSha === "string" ? meta.authoritativeSha : "";
  const metaTag = sha
    ? `<meta name="path-build-revision" content="${sha.replace(/"/g, "")}">`
    : "";
  const snip = `
${metaTag}
<script data-path-build-preview="1">
(function(){
  if (window.__PATH_BUILD_PREVIEW__) return;
  window.__PATH_BUILD_PREVIEW__ = true;
  var BUILD_ID = ${JSON.stringify(buildId)};
  var AUTH_SHA = ${JSON.stringify(sha)};
  window.__PATH_BUILD_REVISION__ = AUTH_SHA || null;
  var selecting = false;
  function cssPath(el){
    if (!el || el.nodeType !== 1) return "";
    var parts = [];
    while (el && el.nodeType === 1 && parts.length < 8) {
      var part = el.tagName.toLowerCase();
      if (el.id) { parts.unshift(part + "#" + el.id); break; }
      var parent = el.parentElement;
      if (parent) {
        var siblings = Array.prototype.filter.call(parent.children, function(c){ return c.tagName === el.tagName; });
        if (siblings.length > 1) {
          var idx = Array.prototype.indexOf.call(siblings, el) + 1;
          part += ":nth-of-type(" + idx + ")";
        }
      }
      parts.unshift(part);
      el = parent;
    }
    return parts.join(" > ");
  }
  function describe(el){
    if (!el) return null;
    var r = el.getBoundingClientRect();
    return {
      buildId: BUILD_ID,
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      className: typeof el.className === "string" ? el.className : "",
      text: (el.innerText || "").trim().slice(0, 240),
      selector: cssPath(el),
      path: cssPath(el),
      rect: { x: r.x, y: r.y, width: r.width, height: r.height },
      dataAttrs: Array.prototype.slice.call(el.attributes || []).filter(function(a){
        return a.name.indexOf("data-") === 0;
      }).reduce(function(acc, a){ acc[a.name]=a.value; return acc; }, {})
    };
  }
  window.addEventListener("message", function(ev){
    var data = ev.data || {};
    if (!data || data.source !== "path-build") return;
    if (data.type === "path-build:select-mode") {
      selecting = !!data.enabled;
      document.documentElement.style.cursor = selecting ? "crosshair" : "";
    }
    if (data.type === "path-build:ping") {
      parent.postMessage({ source: "path-build-preview", type: "path-build:pong", buildId: BUILD_ID }, "*");
    }
  });
  document.addEventListener("click", function(ev){
    if (!selecting) return;
    ev.preventDefault();
    ev.stopPropagation();
    var target = ev.target;
    parent.postMessage({
      source: "path-build-preview",
      type: "path-build:element-selected",
      buildId: BUILD_ID,
      element: describe(target)
    }, "*");
  }, true);
  parent.postMessage({ source: "path-build-preview", type: "path-build:ready", buildId: BUILD_ID }, "*");
})();
</script>`;
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${snip}</body>`);
  }
  return html + snip;
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {{
 *   targetUrl: string,
 *   buildId: string,
 *   stripPrefix: string,
 *   authoritativeSha?: string | null,
 * }} opts
 */
export function proxyPreviewHttp(req, res, opts) {
  const target = new URL(opts.targetUrl);
  const incoming = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
  let path = incoming.pathname;
  if (opts.stripPrefix && path.startsWith(opts.stripPrefix)) {
    path = path.slice(opts.stripPrefix.length) || "/";
  }
  const dest = `${target.origin}${path}${incoming.search}`;

  const headers = { ...req.headers, host: target.host };
  delete headers["accept-encoding"];

  const proxyReq = httpRequest(
    dest,
    { method: req.method, headers },
    (proxyRes) => {
      const ctype = String(proxyRes.headers["content-type"] || "");
      const isHtml = /text\/html/i.test(ctype);
      if (isHtml) {
        const chunks = [];
        proxyRes.on("data", (c) => chunks.push(c));
        proxyRes.on("end", () => {
          let body = Buffer.concat(chunks).toString("utf8");
          body = injectPreviewHelpers(body, opts.buildId, {
            authoritativeSha: opts.authoritativeSha || null,
          });
          const outHeaders = { ...proxyRes.headers };
          delete outHeaders["content-length"];
          delete outHeaders["content-encoding"];
          outHeaders["content-type"] = "text/html; charset=utf-8";
          outHeaders["cache-control"] = "no-store";
          if (opts.authoritativeSha) {
            outHeaders["x-path-build-revision"] = String(opts.authoritativeSha);
          }
          // Allow iframe embedding from same origin builder
          delete outHeaders["x-frame-options"];
          if (outHeaders["content-security-policy"]) {
            delete outHeaders["content-security-policy"];
          }
          res.writeHead(proxyRes.statusCode || 200, outHeaders);
          res.end(body);
        });
        return;
      }
      const outHeaders = { ...proxyRes.headers };
      delete outHeaders["x-frame-options"];
      res.writeHead(proxyRes.statusCode || 200, outHeaders);
      proxyRes.pipe(res);
    },
  );

  proxyReq.on("error", (err) => {
    res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify({
        ok: false,
        code: "PREVIEW_PROXY_ERROR",
        message: err instanceof Error ? err.message : String(err),
      }),
    );
  });

  req.pipe(proxyReq);
}

/**
 * WebSocket upgrade proxy for HMR.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:stream').Duplex} socket
 * @param {Buffer} head
 * @param {{ targetUrl: string }} opts
 */
export function proxyPreviewWs(req, socket, head, opts) {
  const target = new URL(opts.targetUrl);
  const headers = { ...req.headers, host: target.host };
  const proxyReq = httpRequest({
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port,
    path: req.url,
    method: "GET",
    headers,
  });
  proxyReq.on("upgrade", (proxyRes, proxySocket, proxyHead) => {
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\n` +
        Object.entries(proxyRes.headers)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
          .join("\r\n") +
        `\r\n\r\n`,
    );
    if (proxyHead?.length) socket.write(proxyHead);
    proxySocket.pipe(socket);
    socket.pipe(proxySocket);
  });
  proxyReq.on("error", () => {
    try {
      socket.destroy();
    } catch {
      /* ignore */
    }
  });
  proxyReq.end();
}
