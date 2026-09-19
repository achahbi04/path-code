/**
 * PATH-owned ephemeral static file server for Build preview.
 */

import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname, resolve, relative, sep } from "node:path";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json",
  ".webmanifest": "application/manifest+json",
};

/**
 * @param {string} root
 * @param {number} port
 * @param {string} [host]
 */
export function startStaticPreviewServer(root, port, host = "127.0.0.1") {
  const base = resolve(root);
  const server = createServer((req, res) => {
    try {
      const url = new URL(req.url || "/", `http://${host}:${port}`);
      let rel = decodeURIComponent(url.pathname);
      if (rel === "/" || rel === "") rel = "/index.html";
      const candidate = resolve(base, "." + rel);
      const relCheck = relative(base, candidate);
      if (relCheck.startsWith("..") || relCheck.includes(`..${sep}`)) {
        res.writeHead(403).end("Forbidden");
        return;
      }
      let filePath = candidate;
      if (!existsSync(filePath) || !statSync(filePath).isFile()) {
        const fallback = join(base, "404.html");
        if (existsSync(fallback)) {
          filePath = fallback;
          res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
          res.end(readFileSync(fallback));
          return;
        }
        res.writeHead(404).end("Not found");
        return;
      }
      const type = MIME[extname(filePath).toLowerCase()] || "application/octet-stream";
      res.writeHead(200, {
        "Content-Type": type,
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(readFileSync(filePath));
    } catch (err) {
      res.writeHead(500).end(err instanceof Error ? err.message : String(err));
    }
  });

  return new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      resolveListen({
        server,
        port,
        host,
        url: `http://${host}:${port}/`,
        stop: () =>
          new Promise((resStop) => {
            server.close(() => resStop());
          }),
      });
    });
  });
}
