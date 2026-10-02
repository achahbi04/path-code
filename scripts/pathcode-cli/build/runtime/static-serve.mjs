/**
 * PATH-owned ephemeral static file server for Build preview.
 */

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { resolveSecurePreviewFile } from "./secure-file.mjs";

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
  const server = createServer((req, res) => {
    try {
      const url = new URL(req.url || "/", `http://${host}:${port}`);
      let rel = url.pathname;
      if (rel === "/" || rel === "") rel = "/index.html";
      const target = resolveSecurePreviewFile(root, rel);
      if (!target.ok) {
        if (target.status === 404) {
          const fallback = resolveSecurePreviewFile(root, "/404.html");
          if (fallback.ok) {
            res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
            res.end(readFileSync(fallback.path));
            return;
          }
        }
        res.writeHead(target.status).end(target.status === 403 ? "Forbidden" : "Not found");
        return;
      }
      const type = MIME[extname(target.path).toLowerCase()] || "application/octet-stream";
      res.writeHead(200, {
        "Content-Type": type,
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(readFileSync(target.path));
    } catch {
      res.writeHead(500).end("Preview unavailable");
    }
  });

  return new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const address = server.address();
      const boundPort = typeof address === "object" && address ? address.port : port;
      resolveListen({
        server,
        port: boundPort,
        host,
        url: `http://${host}:${boundPort}/`,
        stop: () =>
          new Promise((resStop) => {
            server.close(() => resStop());
          }),
      });
    });
  });
}
