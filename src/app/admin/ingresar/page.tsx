import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminLoginForm } from "@/app/admin/ingresar/login-form";
import { getAdminUserId } from "@/lib/auth/admin";

export default async function AdminLoginPage() {
  if (await getAdminUserId()) redirect("/admin");
  return (
    <main className="auth-shell">
      <Link className="brand auth-brand" href="/"><span>SUPER</span><span className="brand-dot">.</span><span className="brand-ar">AR</span><small>CLUB</small></Link>
      <section className="auth-card">
        <p className="eyebrow cyan">ACCESO PRIVADO</p>
        <h1>Administracion</h1>
        <p>Este ingreso es solamente para el equipo autorizado de SUPER.AR.</p>
        <AdminLoginForm />
      </section>
    </main>
  );
}
