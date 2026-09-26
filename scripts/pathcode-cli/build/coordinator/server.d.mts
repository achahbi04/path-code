export function resolveBuildCoordinatorSocketPath(runtimeRoot: string): string;
export function resolveBuildCoordinatorPidPath(runtimeRoot: string): string;
export function startBuildCoordinatorServer(options: {
  runtimeRoot: string;
  packageRoot: string;
  fakeMode?: boolean;
  preferredEngine?: string | null;
  socketPath?: string;
}): Promise<{
  server: import("node:net").Server;
  service: unknown;
  socketPath: string;
  pidPath: string;
  stop(): Promise<void>;
}>;
