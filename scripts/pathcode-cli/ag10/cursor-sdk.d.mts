export function probeCursorDispatchReadiness(opts?: {
  env?: Record<string, string | undefined>;
}): {
  ready: boolean;
  node: string;
  execPath: string;
  apiKeyPresent: boolean;
  sdkResolved: boolean;
  reason: string | null;
};
