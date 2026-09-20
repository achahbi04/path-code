export function resolveEngineeringReportPath(
  taskId: string,
  runtimeRoot?: string,
): string;
export function engineeringReportExists(
  taskId: string,
  runtimeRoot?: string,
): boolean;
export function writeEngineeringReportFile(
  taskId: string,
  plain: string,
  runtimeRoot?: string,
): string | null;
