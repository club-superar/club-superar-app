import Link from "next/link";
import { redirect } from "next/navigation";
import { getCashierUserId } from "@/lib/auth/cashier";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { CashierForm } from "./cashier-form";
import { logoutCashier } from "./actions";
export const dynamic = "force-dynamic";

export default async function CajaPage({ searchParams }: { searchParams: Promise<{ code?: string | string[] }> }) {
  const raw = (await searchParams).code;
  const value = (Array.isArray(raw) ? raw[0] : raw ?? "").replace(/[^a-f0-9]/gi, "").toUpperCase();
  const code = /^[A-F0-9]{8}$/.test(value) ? value : "";
  if (!await getCashierUserId()) redirect(code ? `/caja/ingresar?code=${encodeURIComponent(code)}` : "/caja/ingresar");
  const { data: rewards } = await createAdminSupabaseClient().from("reward_catalog").select("id,name,description,points_cost,stock_remaining").eq("active", true).order("display_order");
  return <main className="admin-shell cashier-shell">
    <header className="admin-topbar"><Link className="brand" href="/caja">SUPER<span className="brand-dot">.</span><span className="brand-ar">AR</span><small>CAJA</small></Link><form action={logoutCashier}><button className="cashier-logout">Salir</button></form></header>
    <section className="admin-heading"><p className="eyebrow cyan">ACCESO DE ENCARGADO</p><h1>Validar canje</h1><p>Escaneá el QR o escribí el código del cliente.</p></section>
    <section className="admin-panel"><CashierForm defaultCode={code} /></section>
    <section className="admin-panel cashier-catalog"><div><p className="eyebrow cyan">CATÁLOGO ACTUAL</p><h2>Canjes disponibles</h2><p>Estos productos se administran desde el panel principal.</p></div>
      <div className="cashier-reward-list">{(rewards ?? []).length === 0 ? <p className="admin-empty">Todavía no hay productos publicados.</p> : (rewards ?? []).map(item => <article key={item.id} className={item.stock_remaining === 0 ? "sold-out" : ""}><div><strong>{item.name}</strong><small>{item.description || "Producto del catálogo"}</small></div><div><b>{item.points_cost} puntos</b><span>{item.stock_remaining > 0 ? `${item.stock_remaining} disponibles` : "Agotado"}</span></div></article>)}</div>
    </section>
  </main>;
}
