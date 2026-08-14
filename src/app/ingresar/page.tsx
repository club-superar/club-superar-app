import { LoginForm } from "@/app/auth/login-form";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import Link from "next/link";

export default async function LoginPage() {
  const supabase = createAdminSupabaseClient();
  const { data } = await supabase.rpc("get_club_public_settings");
  const candidate = (data as { help_instagram_url?: string } | null)?.help_instagram_url ?? "";
  const instagramUrl = /^https:\/\/(www\.)?instagram\.com\//i.test(candidate)
    ? candidate
    : "https://www.instagram.com/";

  return <main className="auth-shell"><Link className="brand auth-brand" href="/"><span className="brand-super">SUPER</span><span className="brand-dot">.</span><span className="brand-ar">AR</span><small>CLUB</small></Link><LoginForm instagramUrl={instagramUrl} /></main>;
}
