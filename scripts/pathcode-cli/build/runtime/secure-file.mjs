/** Shared static and candidate preview file boundary. */
import { realpathSync, statSync } from "node:fs";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";

const PRIVATE_NAMES = new Set([
  ".git", ".ssh", "credentials.json", "id_rsa", "id_dsa",
  "id_ecdsa", "id_ed25519", "identity", "privatekey", "server.key",
]);
const PRIVATE_SUFFIXES = [".pem", ".key", ".p12", ".pfx", ".jks", ".keystore", ".ppk", ".asc", ".gpg", ".p8"];

function inside(root, target) {
  const rel = relative(root, target);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function sensitive(parts) {
  return parts.some((part) => {
    const name = part.toLowerCase();
    if (name === ".env.example") return false; // Existing scope policy's documentation exception.
    return name === ".env" || name.startsWith(".env.") ||
      PRIVATE_NAMES.has(name) || PRIVATE_SUFFIXES.some((suffix) => name.endsWith(suffix));
  });
}

/**
 * @param {string} root
 * @param {string} requestPath URL path relative to the preview root
 */
export function resolveSecurePreviewFile(root, requestPath) {
  let decoded;
  try { decoded = decodeURIComponent(requestPath); }
  catch { return { ok: false, code: "PREVIEW_PATH_FORBIDDEN", status: 403 }; }
  if (decoded.includes("\0") || decoded.includes("\\")) {
    return { ok: false, code: "PREVIEW_PATH_FORBIDDEN", status: 403 };
  }
  const parts = decoded.split("/").filter(Boolean);
  if (parts.some((part) => part === "." || part === "..") || sensitive(parts)) {
    return { ok: false, code: "PREVIEW_PATH_FORBIDDEN", status: 403 };
  }
  try {
    const canonicalRoot = realpathSync(root);
    const lexical = resolve(canonicalRoot, ...parts);
    if (!inside(canonicalRoot, lexical)) {
      return { ok: false, code: "PREVIEW_PATH_ESCAPE", status: 403 };
    }
    const target = realpathSync(lexical);
    if (!inside(canonicalRoot, target)) {
      return { ok: false, code: "PREVIEW_PATH_ESCAPE", status: 403 };
    }
    if (sensitive(relative(canonicalRoot, target).split(sep)) || sensitive([basename(target)])) {
      return { ok: false, code: "PREVIEW_PATH_FORBIDDEN", status: 403 };
    }
    if (!statSync(target).isFile()) return { ok: false, code: "PREVIEW_NOT_FOUND", status: 404 };
    return { ok: true, path: target };
  } catch {
    return { ok: false, code: "PREVIEW_NOT_FOUND", status: 404 };
  }
}
