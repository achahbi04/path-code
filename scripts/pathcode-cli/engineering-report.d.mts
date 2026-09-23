export function resolveEngineeringReportPath(
  taskId: string,
  runtimeRoot?: string,
): string;
export function engineeringReportExists(
  taskId: string,
  runtimeRoot?: string,
): boolean;
export function buildEngineeringReportModel(
  product?: object,
  session?: object,
): object;
export function formatEngineeringReportPlain(model: object): string;
export function writeEngineeringReportFile(
  taskId: string,
  plain: string,
  runtimeRoot?: string,
): string | null;
