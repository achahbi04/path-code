export function launchPathCodeInTerminal(input: {
  projectRoot: string;
  nodePath: string;
  launcherPath: string;
  env?: NodeJS.ProcessEnv;
}): Promise<
  | { ok: false; code: string; message: string }
  | {
      ok: true;
      method: string;
      pid: number | null;
      projectRoot: string;
      command: string;
      warning?: string;
    }
>;
