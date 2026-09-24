export function ensureBuildCoordinator(options: {
  runtimeRoot: string;
  packageRoot: string;
  fakeMode?: boolean;
  preferredEngine?: string | null;
}): Promise<{
  client: {
    hello(role?: string): Promise<{
      ok?: boolean;
      protocolVersion?: number;
      pid?: number;
      packageVersion?: string;
      fakeMode?: boolean;
      identity?: {
        role?: string;
        pid?: number;
        version?: string | null;
        sha?: string | null;
        dirty?: boolean | null;
      };
      gatewayIdentity?: {
        role?: string;
        pid?: number;
        version?: string | null;
        sha?: string | null;
        dirty?: boolean | null;
      } | null;
    }>;
    close(): void;
    shutdown(): Promise<unknown>;
  };
  socketPath: string;
  started: boolean;
  pid?: number | null;
}>;
