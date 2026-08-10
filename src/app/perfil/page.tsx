import { redirect } from "next/navigation";
import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function ProfilePage() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || !userId) redirect("/ingresar");
  const { data: profile } = await supabase.from("profiles").select("instagram_username, current_streak").eq("id", userId).single();
  if (!profile) redirect("/ingresar");
  return <main className="auth-shell"><Link className="brand auth-brand" href="/"><span>SUPER</span><span className="brand-dot">.</span><span className="brand-ar">AR</span><small>CLUB</small></Link><section className="auth-card"><p className="eyebrow cyan">MI PERFIL</p><h1>@{profile.instagram_username}</h1><p>Tu cuenta ya está lista para participar en los sorteos.</p><div className="profile-stat"><span>Racha actual</span><strong>{profile.current_streak}</strong></div><Link className="button primary" href="/">Ir al inicio</Link><form action={signOut}><button className="button secondary">Cerrar sesión</button></form></section></main>;
}
