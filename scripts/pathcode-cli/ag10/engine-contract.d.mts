export type EngineId = "antigravity" | "copilot" | "cursor";

export function explainEngineSelection(input?: {
  ready?: Partial<Record<EngineId, boolean>>;
  prefer?: string;
  forcePrefer?: boolean;
  preferContinuity?: boolean;
  lastEngine?: string;
  needs?: string[];
  capabilities?: unknown[];
}): {
  engine: EngineId;
  reason: string;
  needs: string[];
  candidates: EngineId[];
  preferredHonored: boolean;
  continuityHonored: boolean;
};

export function normalizeEngineId(value: unknown): EngineId | null;
export function resolvePreferredEngine(input?: object): EngineId | null;
export function inferTurnNeeds(input?: object): string[];
export function selectEngineForTurn(input?: object): EngineId;
export function primaryRotationAttempt(taskId?: string | null): number;
export function selectPrimaryEngine(input?: {
  taskId?: string | null;
  attempt?: number;
  ready?: Partial<Record<EngineId, boolean>>;
  prefer?: string | null;
  lastEngine?: string | null;
  preferContinuity?: boolean;
  needs?: string[];
  capabilities?: unknown[];
  forcePrefer?: boolean;
}): {
  engine: EngineId;
  reason: string;
  needs: string[];
  candidates: EngineId[];
  preferredHonored: boolean;
  continuityHonored: boolean;
};
export function primaryAdapterFor(
  selection: { engine?: EngineId | null },
  ready?: Partial<Record<EngineId, boolean>>,
): EngineId | null;
export function buildEngineCapabilityList(live?: object): unknown[];
export function buildFabricHandoff(input: object): unknown;
export function formatFabricHandoff(packet: unknown): string;
export function resolveMutatingEngineAttempt(input?: {
  preferred?: string | null;
  cursorMode?: string | null;
  fallback?: string | null;
}): {
  selected: string | null;
  fallback: boolean;
  blocked: boolean;
  newTask: boolean;
  reason: string;
};
export function withEngineProvenance(turn: object, engine: unknown): object;
