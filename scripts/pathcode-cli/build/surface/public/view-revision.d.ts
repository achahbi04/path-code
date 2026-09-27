export function shouldAcceptViewRevision(previous: number, next: number): boolean;
export function shouldAcceptBuildView(input: {
  previousBuildId?: string | null;
  nextBuildId?: string | null;
  previousRevision?: number;
  nextRevision?: number;
}): boolean;
export function previewFrameSrc(
  embed: string,
  authoritativeSha?: string | null,
): string;
export function previewTransition(input: {
  heldSrc?: string | null;
  nextReady?: boolean;
  nextSrc?: string | null;
  nextFailed?: boolean;
  preparing?: boolean;
  allowCandidateHold?: boolean;
}): { action: "keep" | "swap" | "hold" | "empty"; src: string; notice: string };
export function previewNeedsCommit(
  decision: { action?: string; src?: string },
  currentSrc?: string | null,
): boolean;
