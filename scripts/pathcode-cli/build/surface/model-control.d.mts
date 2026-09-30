export interface BuilderModelControl {
  preferredEngine: "cursor" | "copilot" | "antigravity" | null;
  options: Array<{ value: string; label: string }>;
  value: string | null;
  editable: boolean;
  diagnostic: string | null;
}

export function projectBuilderModelControl(input?: {
  preferredEngine?: string | null;
  projectRoot?: string | null;
  env?: NodeJS.ProcessEnv;
}): BuilderModelControl;

export function writeBuilderModelPreference(input: {
  preferredEngine?: string | null;
  projectRoot: string | null;
  modelId: string;
  env?: NodeJS.ProcessEnv;
}): { ok: boolean; code?: string; message?: string; path?: string };
