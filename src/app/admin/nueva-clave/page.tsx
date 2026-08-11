import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminPasswordForm } from "@/app/admin/nueva-clave/password-form";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function NewAdminPasswordPage() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) redirect("/admin/ingresar");
  return (
    <main className="auth-shell">
      <Link className="brand auth-brand" href="/"><span>SUPER</span><span className="brand-dot">.</span><span className="brand-ar">AR</span><small>CLUB</small></Link>
      <section className="auth-card">
        <p className="eyebrow cyan">CUENTA OFICIAL</p>
        <h1>Crea tu contrasena</h1>
        <p>Esta clave protegera el panel administrativo de Club SUPER.AR.</p>
        <AdminPasswordForm />
      </section>
    </main>
  );
}
