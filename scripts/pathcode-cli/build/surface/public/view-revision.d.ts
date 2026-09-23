export function shouldAcceptViewRevision(previous: number, next: number): boolean;
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
}): { action: "keep" | "swap" | "hold" | "empty"; src: string; notice: string };
