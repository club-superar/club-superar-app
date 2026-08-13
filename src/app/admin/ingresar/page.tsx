import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminLoginForm } from "@/app/admin/ingresar/login-form";
import { CashierLoginForm } from "@/app/caja/ingresar/login-form";
import { getAdminUserId } from "@/lib/auth/admin";

export default async function AdminLoginPage() {
  if (await getAdminUserId()) redirect("/admin");
  return <main className="auth-shell access-choice-shell">
    <Link className="brand auth-brand" href="/"><span>SUPER</span><span className="brand-dot">.</span><span className="brand-ar">AR</span><small>CLUB</small></Link>
    <section className="access-choice-heading"><p className="eyebrow cyan">ACCESO DEL EQUIPO</p><h1>Elegí tu panel</h1><p>Cada cuenta entra solamente a las funciones que tiene autorizadas.</p></section>
    <div className="access-choice-grid">
      <section className="auth-card"><p className="eyebrow cyan">CONTROL COMPLETO</p><h2>Panel de administración</h2><p>Para gestionar sorteos, miembros, puntos y productos.</p><AdminLoginForm /></section>
      <section className="auth-card cashier-access-card"><p className="eyebrow cyan">ACCESO LIMITADO</p><h2>Panel de caja</h2><p>Para consultar productos, escanear QR y confirmar canjes.</p><CashierLoginForm /></section>
    </div>
  </main>;
}
