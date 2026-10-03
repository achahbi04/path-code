export function resolveBuildCoordinatorSocketPath(runtimeRoot: string): string;
export function resolveBuildCoordinatorPidPath(runtimeRoot: string): string;
export function startBuildCoordinatorServer(options: {
  runtimeRoot: string;
  packageRoot: string;
  fakeMode?: boolean;
  /** Exact-Build P9/P10 control-plane mode; skips startup recovery. */
  scopedBuildId?: string;
  preferredEngine?: string | null;
  socketPath?: string;
}): Promise<{
  server: import("node:net").Server;
  service: unknown;
  socketPath: string;
  pidPath: string;
  stop(): Promise<void>;
}>;
