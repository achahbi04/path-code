import { createSupabaseProvisioningAdapter } from "./supabase-provisioning-adapter.mjs";
import { createSupabaseMigrationAdapter } from "./supabase-migration-adapter.mjs";

const provider = createSupabaseProvisioningAdapter();
export const DEFAULT_DATABASE_OPERATION_ADAPTERS = Object.freeze({ supabase: Object.freeze({
  availableRegions: provider.availableRegions,
  createProject: provider.createProject,
  listProjects: provider.listProjects,
  health: provider.health,
  migrations: createSupabaseMigrationAdapter(),
}) });
