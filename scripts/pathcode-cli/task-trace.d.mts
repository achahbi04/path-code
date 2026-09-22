export function appendTaskTrace(entry: {
  taskId: string;
  runtimeRoot?: string;
  type: string;
  engine?: string;
  phase?: string;
  tool?: string;
  path?: string;
  command?: string;
  exitCode?: number | null;
  durationMs?: number;
  detail?: string;
  meta?: Record<string, unknown>;
}): unknown;
