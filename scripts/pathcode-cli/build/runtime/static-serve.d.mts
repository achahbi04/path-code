import type { Server } from "node:http";
export function startStaticPreviewServer(root: string, port: number, host?: string): Promise<{
  server: Server;
  port: number;
  host: string;
  url: string;
  stop: () => Promise<void>;
}>;
