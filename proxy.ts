import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_AUTH_COOKIE } from "@/lib/supabase/session";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const pendingCookies: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;
  const refreshSession = async (cookieName?: string) => {
    const supabase = createServerClient(url, key, {
      ...(cookieName ? { cookieOptions: { name: cookieName } } : {}),
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (items) => {
          items.forEach(({ name, value }) => request.cookies.set(name, value));
          pendingCookies.push(...items);
        },
      },
    });
    await supabase.auth.getClaims();
  };
  await refreshSession();
  await refreshSession(ADMIN_AUTH_COOKIE);
  response = NextResponse.next({ request });
  pendingCookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"] };

