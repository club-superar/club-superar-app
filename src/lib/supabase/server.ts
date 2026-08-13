import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getPublicSupabaseEnv } from "./env";
import { ADMIN_AUTH_COOKIE, CASHIER_AUTH_COOKIE } from "./session";

async function createCookieSupabaseClient(cookieName?: string) {
  const cookieStore = await cookies();
  const { url, publishableKey } = getPublicSupabaseEnv();

  return createServerClient(url, publishableKey, {
    ...(cookieName ? { cookieOptions: { name: cookieName } } : {}),
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

export function createServerSupabaseClient() {
  return createCookieSupabaseClient();
}

export function createAdminSessionSupabaseClient() {
  return createCookieSupabaseClient(ADMIN_AUTH_COOKIE);
}
export function createCashierSessionSupabaseClient() { return createCookieSupabaseClient(CASHIER_AUTH_COOKIE); }
