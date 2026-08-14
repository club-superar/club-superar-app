import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getServerSupabaseEnv } from "./env";

export function createAdminSupabaseClient() {
  const { url, secretKey } = getServerSupabaseEnv();
  return createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
}
