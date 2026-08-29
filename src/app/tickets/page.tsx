import Link from "next/link";
import { BottomNav } from "@/app/bottom-nav";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { TicketForm } from "./ticket-form";

export const dynamic = "force-dynamic";

export default async function TicketsPage() {
  const supabase = await createServerSupabaseClient();
  const [{ data: claimsData }, { data: settingsData }] = await Promise.all([
    supabase.auth.getClaims(),
    supabase.rpc("get_club_public_settings"),
  ]);
  const profileId = claimsData?.claims?.sub as string | undefined;
  const signedIn = Boolean(profileId);
  const settings = (settingsData ?? {}) as { tickets_enabled?: boolean };
  const { data: tickets } = profileId ? await supabase.from("purchase_tickets")
    .select("id,status,points_awarded,rejection_reason,total_amount,created_at")
    .eq("profile_id", profileId).order("created_at", { ascending: false }).limit(20) : { data: [] };
  const statusLabels: Record<string,string> = { pending: "En revisión", approved: "Validado", rejected: "Rechazado", duplicate: "Duplicado" };

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
      {!settings.tickets_enabled && <section className="coming-soon-card">
        <span aria-hidden="true">▣</span>
        <p className="eyebrow cyan">MUY PRONTO</p>
        <h2>Tus compras van a sumar</h2>
        <p>Pronto vas a poder validar tu ticket y recibir SUPER Puntos. La foto se usará solamente para leerlo y no quedará guardada.</p>
        {!signedIn && <Link className="button primary" href="/ingresar">Ingresar al Club</Link>}
        <Link className="text-link" href="/como-funciona">Conocer cómo funciona el Club</Link>
      </section>}
      {settings.tickets_enabled && signedIn && <>
        <section className="profile-card ticket-card"><h2>Escanear mi ticket</h2><p>Por ahora aceptamos Factura B. La imagen es privada y se elimina al aprobarla o rechazarla.</p><TicketForm /></section>
        <section className="profile-card"><p className="eyebrow cyan">MIS COMPRAS</p><h2>Historial de tickets</h2><div className="ticket-history">
          {(tickets ?? []).length === 0 && <p>Todavía no enviaste ningún ticket.</p>}
          {(tickets ?? []).map((ticket) => <article key={ticket.id}><div><strong>{statusLabels[ticket.status] ?? ticket.status}</strong><small>{new Date(ticket.created_at).toLocaleDateString("es-AR")}{ticket.total_amount ? ` · $${Number(ticket.total_amount).toLocaleString("es-AR")}` : ""}</small></div><b>{ticket.status === "approved" ? `+${ticket.points_awarded} puntos` : ticket.rejection_reason ?? "Pendiente"}</b></article>)}
        </div></section>
      </>}
      {settings.tickets_enabled && !signedIn && <section className="coming-soon-card"><h2>Ingresá para escanear</h2><p>Tu ticket quedará asociado a tu cuenta del Club.</p><Link className="button primary" href="/ingresar">Ingresar al Club</Link></section>}
      <BottomNav active="tickets" signedIn={signedIn} />
    </main>
  );
}
