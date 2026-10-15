import { createSupabaseManagementAdapter } from "./supabase-management-adapter.mjs";
import { createSupabasePostgresAdapter } from "./supabase-postgres-adapter.mjs";

export const DEFAULT_DATABASE_VERIFICATION_ADAPTERS = Object.freeze({
  supabase: Object.freeze({
    provider: createSupabaseManagementAdapter(),
    connection: createSupabasePostgresAdapter(),
  }),
});
