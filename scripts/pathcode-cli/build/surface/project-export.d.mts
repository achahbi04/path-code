export function exportFilename(title: string, sha: string): string;
export function authoritativeTreeFiles(
  projectRoot: string,
  sha: string,
): { ok: boolean; files?: string[]; code?: string; path?: string; message?: string };
export function exportAuthoritativeProject(input: {
  projectRoot: string;
  sha: string;
  title?: string;
}): {
  ok: boolean;
  filename?: string;
  zipPath?: string;
  directory?: string;
  files?: string[];
  sha?: string;
  code?: string;
  path?: string;
  message?: string;
};
export function readExportBytes(zipPath: string): Buffer;
