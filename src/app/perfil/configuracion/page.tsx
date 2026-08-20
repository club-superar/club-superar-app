import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { UsernameForm } from "../username-form";
import { BottomNav } from "@/app/bottom-nav";

export default async function ProfileSettingsPage() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || !userId) redirect("/ingresar");

  const { data: profile } = await supabase
    .from("profiles")
    .select("instagram_username")
    .eq("id", userId)
    .single();
  if (!profile) redirect("/ingresar");

  return (
    <main className="profile-shell">
      <header className="topbar">
        <Link className="brand" href="/"><span>SUPER</span><span className="brand-dot">.</span><span className="brand-ar">AR</span><small>CLUB</small></Link>
        <Link className="profile-back" href="/perfil">← Mi perfil</Link>
      </header>
      <section className="profile-heading">
        <p className="eyebrow cyan">MI CUENTA</p>
        <h1>Configuración</h1>
        <p>Administrá los datos que usás para ingresar al Club SUPER.AR.</p>
      </section>
      <section className="profile-panel"><UsernameForm currentUsername={profile.instagram_username} /></section>
      <BottomNav active="perfil" signedIn />
    </main>
  );
}
