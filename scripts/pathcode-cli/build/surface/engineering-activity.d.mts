export interface ActivityStep {
  at: string | null;
  label: string;
  path: string | null;
  command: string | null;
}

export function projectEngineeringActivity(
  build: unknown,
  extras?: {
    projectRoot?: string;
    checkpoint?: unknown;
    traceLines?: object[];
    events?: object[];
  },
): {
  engine: string | null;
  steps: ActivityStep[];
  action: string | null;
  phase: string;
  label: string | null;
};
