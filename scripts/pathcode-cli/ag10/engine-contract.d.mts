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
export function buildEngineCapabilityList(live?: object): unknown[];
export function buildFabricHandoff(input: object): unknown;
export function formatFabricHandoff(packet: unknown): string;
export function withEngineProvenance(turn: object, engine: unknown): object;
