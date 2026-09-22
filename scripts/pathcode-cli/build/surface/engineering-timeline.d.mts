export function projectEngineeringTimeline(
  build: unknown,
  extras?: {
    traces?: Array<{ taskId?: string; lines?: object[] }>;
    events?: object[];
    projectRoot?: string | null;
    roots?: string[];
  },
): {
  phases: Array<{ id: string; label: string; status: string; count: number }>;
  entries: Array<{
    sequence: number;
    timestamp: string | null;
    taskId: string | null;
    engine: string | null;
    kind: string;
    status: string;
    summary: string;
  }>;
  current: { summary?: string; kind?: string } | null;
};
