export type EngineId = "antigravity" | "copilot" | "cursor";

export interface EngineReadiness {
  engineId: EngineId;
  installed: boolean;
  available: boolean;
  authenticated: boolean;
  ready: boolean;
  reason: string | null;
  authMethod?: string | null;
  mode?: string | null;
  evidence: string[];
  checkedAt: string;
}

export function detectCopilotAuthArtifacts(
  env?: NodeJS.ProcessEnv,
  opts?: { home?: string },
): {
  authenticated: boolean;
  authMethod?: string | null;
  evidence: string[];
};

export function probeAntigravityReadiness(opts?: {
  env?: NodeJS.ProcessEnv;
  home?: string;
}): EngineReadiness;

export function probeCopilotReadiness(opts?: {
  env?: NodeJS.ProcessEnv;
  home?: string;
}): EngineReadiness;

export function probeCursorReadiness(opts?: {
  env?: NodeJS.ProcessEnv;
}): Promise<EngineReadiness>;

export function probeEngineReadiness(opts?: {
  engine?: EngineId;
  env?: NodeJS.ProcessEnv;
  home?: string;
}): Promise<EngineReadiness[]>;

export function readinessToFabricLive(probes: EngineReadiness[]): {
  ready: Record<string, boolean>;
};

export function invokeCopilotLogin(opts?: object): unknown;
