export function deriveDisplayTitle(outcome?: string | null, brief?: { summary?: string } | null): string;
export function isCreatorProjectRoot(projectRoot?: string | null): boolean;
export function isCreatorProject(build?: object | null): boolean;
export function criteriaSummary(criteria?: Array<{ status?: string; required?: boolean }> | null): {
  met: number;
  failed: number;
  pending: number;
  total: number;
};
export function displayTitleFor(build?: object | null): string;
export function creatorStatusLabel(build?: object | null): string;
export function creatorPhase(build?: object | null): string;
export function hasActiveEngineering(build?: object | null): boolean;
export function libraryRow(build?: object | null): {
  buildId: string | null;
  displayTitle: string;
  status: string;
  phase: string;
  updatedAt: string | null;
  repository: string;
  authoritativeSha: string | null;
};
export function creatorConversation<T extends { role?: string; text?: string }>(
  conversation?: T[] | null,
): T[];
export function isUnderstandingPlaceholder(text?: string): boolean;
