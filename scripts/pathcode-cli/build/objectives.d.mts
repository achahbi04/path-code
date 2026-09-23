export function frameEngineerObjective(record: unknown, action?: string): string;
export function currentCreatorRequest(record: unknown): string;
export function explicitCreatorConstraints(text: unknown): string[];
export function isFollowUpCreatorTurn(record: unknown): boolean;
export function wantsWebProduct(record: unknown): boolean;
export function capabilityFromChangedFiles(files: unknown): "web" | null;
export function adoptionAllowedForIntent(
  record: unknown,
  capability?: string | null,
): { ok: boolean; reason: string | null };
