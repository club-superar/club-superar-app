import Link from "next/link";
import { BottomNav } from "@/app/bottom-nav";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function TicketsPage() {
  const supabase = await createServerSupabaseClient();
  const [{ data: claimsData }, { data: settingsData }] = await Promise.all([
    supabase.auth.getClaims(),
    supabase.rpc("get_club_public_settings"),
  ]);
  const signedIn = Boolean(claimsData?.claims?.sub);
  const settings = (settingsData ?? {}) as { tickets_enabled?: boolean };

  return (
    <main className="profile-shell">
      <header className="topbar">
        <Link className="brand" href="/">SUPER<span className="brand-dot">.</span><span className="brand-ar">AR</span><small>CLUB</small></Link>
        <Link className="profile-back" href="/">← Sorteo</Link>
      </header>
      <section className="profile-heading">
        <p className="eyebrow cyan">SUPER PUNTOS</p>
        <h1>Tickets</h1>
        <p>Convertí tus compras en beneficios dentro del Club.</p>
      </section>
      <section className="coming-soon-card">
        <span aria-hidden="true">▣</span>
        <p className="eyebrow cyan">{settings.tickets_enabled ? "PRUEBA INTERNA" : "MUY PRONTO"}</p>
        <h2>{settings.tickets_enabled ? "El lector está en preparación" : "Tus compras van a sumar"}</h2>
        <p>{settings.tickets_enabled ? "Estamos terminando las validaciones antes de recibir comprobantes reales." : "Pronto vas a poder validar tu ticket y recibir SUPER Puntos. La foto se usará solamente para leerlo y no quedará guardada."}</p>
        {!signedIn && <Link className="button primary" href="/ingresar">Ingresar al Club</Link>}
        <Link className="text-link" href="/como-funciona">Conocer cómo funciona el Club</Link>
      </section>
      <BottomNav active="tickets" signedIn={signedIn} />
    </main>
  );
}
