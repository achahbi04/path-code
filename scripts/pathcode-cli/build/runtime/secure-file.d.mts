export function resolveSecurePreviewFile(root: string, requestPath: string):
  | { ok: true; path: string }
  | { ok: false; code: string; status: 403 | 404 };
