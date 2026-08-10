import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getPublicSupabaseEnv } from "./env";

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  const { url, publishableKey } = getPublicSupabaseEnv();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (items) => {
        try {
          items.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Los Server Components no pueden escribir cookies; proxy.ts las refresca.
        }
      },
    },
  });
}
