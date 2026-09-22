export function remoteKind(url?: string | null): string;
export function detectGitHubCli(): { available: boolean; authenticated: boolean };
export function inspectRepository(projectRoot: string, record?: object | null): {
  state: string;
  validated: boolean;
  kind: string;
  remoteUrl: string | null;
  syncAdopted: boolean;
  lastSyncedSha: string | null;
  lastSyncError: string | null;
  lastSyncedAt: string | null;
  github: { available: boolean; authenticated: boolean };
};
export function connectLocalRemote(
  record: Record<string, unknown>,
  projectRoot: string,
  remoteUrl: string,
): { ok: boolean; code?: string; repository?: object };
export function connectGitHubRepository(
  record: Record<string, unknown>,
  projectRoot: string,
  input: { name: string; visibility?: string },
): { ok: boolean; code?: string; message?: string };
export function setAdoptedSync(
  record: Record<string, unknown>,
  projectRoot: string,
  enabled: boolean,
): { ok: boolean };
export function pushAdoptedRevision(
  record: Record<string, unknown>,
  projectRoot: string,
  requestedSha?: string | null,
): { ok: boolean; code?: string; sha?: string; head?: string | null; message?: string };
export function syncAdoptedRevisionIfEnabled(
  record: Record<string, unknown>,
  projectRoot: string,
): { ok: boolean; skipped?: boolean; code?: string };
export function disconnectRepository(
  record: Record<string, unknown>,
  projectRoot: string,
  confirm: boolean,
): { ok: boolean; code?: string };
