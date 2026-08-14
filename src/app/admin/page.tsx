import Link from "next/link";
import { DrawForm } from "@/app/admin/draw-form";
import { BadgeSettingsForm } from "@/app/admin/badge-settings-form";
import { BrandingForm } from "@/app/admin/branding-form";
import { freezeDraw, logoutAdmin, openDraw } from "@/app/admin/actions";
import { requireAdminUserId } from "@/lib/auth/admin";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const statusLabels: Record<string, string> = {
  draft: "Borrador", scheduled: "Programado", open: "Abierto", frozen: "Cerrado",
  drawing: "Sorteando", winner_review: "Revisando ganador", completed: "Finalizado", cancelled: "Cancelado",
};

export default async function AdminPage() {
  const actorId = await requireAdminUserId();
  const admin = createAdminSupabaseClient();
  const [drawResult, memberResult, winnerResult, disqualificationResult, streakResult, recentWinnerResult, badgeSettingsResult, brandingResult] = await Promise.all([
    admin.from("draws").select("id, edition_number, title, prize_name, prize_value, status, opens_at, closes_at, created_at").order("edition_number", { ascending: false }).limit(12),
    admin.from("profiles").select("id", { count: "exact", head: true }).eq("status", "active"),
    admin.from("winners").select("id", { count: "exact", head: true }),
    admin.from("disqualifications").select("id", { count: "exact", head: true }),
    admin.from("profiles").select("id, instagram_username, current_streak, longest_streak").eq("status", "active").order("current_streak", { ascending: false }).order("longest_streak", { ascending: false }).limit(5),
    admin.from("winners").select("id, draw_id, instagram_username, confirmed_at, claim_status, draws!inner(edition_number)").order("confirmed_at", { ascending: false }).limit(4),
    admin.rpc("admin_get_badge_thresholds", { p_actor_id: actorId }),
    admin.rpc("get_public_branding"),
  ]);
  const draws = drawResult.data ?? [];
  const activeDraw = draws.find((draw) => ["open", "frozen", "drawing", "winner_review"].includes(draw.status));
  const { data: activeParticipations } = activeDraw
    ? await admin.from("participations").select("id, profile_id, status, final_chances, profiles!inner(created_at)").eq("draw_id", activeDraw.id)
    : { data: [] };
  const participations = (activeParticipations ?? []) as unknown as Array<{ id: number; profile_id: string; status: string; final_chances: number; profiles: { created_at: string } }>;
  const editionStart = activeDraw?.opens_at ?? activeDraw?.created_at;
  const newParticipants = editionStart ? participations.filter((item) => new Date(item.profiles.created_at) >= new Date(editionStart)).length : 0;
  const recurringParticipants = Math.max(0, participations.length - newParticipants);
  const eligibleParticipants = participations.filter((item) => ["eligible", "frozen", "winner_provisional", "winner_confirmed"].includes(item.status)).length;
  const totalChances = participations.reduce((total, item) => total + Number(item.final_chances), 0);
  const recentWinners = (recentWinnerResult.data ?? []) as unknown as Array<{ id: number; draw_id: number; instagram_username: string; confirmed_at: string; claim_status: string; draws: { edition_number: number } }>;
  const claimLabels: Record<string, string> = { pending: "Pendiente de reclamo", claimed: "Reclamado", fulfilled: "Entregado", expired: "Vencido" };
  const badgeSettings = (badgeSettingsResult.data ?? { loyal_streak: 3, legend_points: 100 }) as { loyal_streak?: number; legend_points?: number };
  const branding = (brandingResult.data ?? { creator_text: "Creado por @gonzapuefll", creator_url: "https://www.instagram.com/gonzapuefll/", visible: true }) as { creator_text: string; creator_url: string; visible: boolean };

  return (
    <main className="admin-shell">
      <header className="admin-topbar">
        <Link className="brand" href="/"><span>SUPER</span><span className="brand-dot">.</span><span className="brand-ar">AR</span><small>ADMIN</small></Link>
        <form action={logoutAdmin}><button className="admin-logout">Salir</button></form>
      </header>
      <section className="admin-heading"><p className="eyebrow cyan">PANEL PRIVADO</p><h1>Sorteos</h1><p>Crea una edicion, revisala y abrila cuando este lista.</p><Link className="admin-members-link" href="/admin/miembros">Buscar y revisar miembros →</Link></section>

      <section className="admin-dashboard" aria-label="Resumen general">
        <article><small>MIEMBROS ACTIVOS</small><strong>{memberResult.count ?? 0}</strong><span>Total del Club</span></article>
        <article><small>EDICIÓN ACTUAL</small><strong>{participations.length}</strong><span>Participantes</span></article>
        <article><small>NUEVOS</small><strong>{newParticipants}</strong><span>Primera participación</span></article>
        <article><small>RECURRENTES</small><strong>{recurringParticipants}</strong><span>Ya habían participado</span></article>
        <article><small>COMPLETOS</small><strong>{eligibleParticipants}</strong><span>Habilitados</span></article>
        <article><small>CHANCES</small><strong>{totalChances}</strong><span>En la edición</span></article>
        <article><small>GANADORES</small><strong>{winnerResult.count ?? 0}</strong><span>Histórico</span></article>
        <article><small>DESCALIFICADOS</small><strong>{disqualificationResult.count ?? 0}</strong><span>Histórico</span></article>
      </section>

      <div className="admin-insight-grid">
        <section className="admin-panel admin-insight">
          <div className="admin-panel-title"><h2>Mejores rachas</h2><small>ACTUALES</small></div>
          {(streakResult.data ?? []).length === 0 ? <p className="admin-empty">Todavía no hay rachas registradas.</p> : (
            <div className="admin-ranking">{(streakResult.data ?? []).map((profile, index) => <article key={profile.id}><span>{index + 1}</span><div><strong>@{profile.instagram_username}</strong><small>Máxima histórica: {profile.longest_streak}</small></div><b>🔥 {profile.current_streak}</b></article>)}</div>
          )}
        </section>

        <section className="admin-panel admin-insight">
          <div className="admin-panel-title"><h2>Últimos ganadores</h2><small>SEGUIMIENTO</small></div>
          {recentWinners.length === 0 ? <p className="admin-empty">Todavía no hay ganadores confirmados.</p> : (
            <div className="admin-recent-winners">{recentWinners.map((winner) => <Link href={`/admin/sorteos/${winner.draw_id}`} key={winner.id}><span>🏆</span><div><strong>@{winner.instagram_username}</strong><small>Sorteo #{String(winner.draws.edition_number).padStart(3, "0")}</small></div><b className={`claim-${winner.claim_status}`}>{claimLabels[winner.claim_status] ?? winner.claim_status}</b></Link>)}</div>
          )}
        </section>
      </div>

      <section className="admin-panel admin-rewards-entry"><div><h2>SUPER Puntos y canjes</h2><p>Configurá valores, productos y validá los códigos de caja.</p></div><Link className="button primary" href="/admin/canjes">Administrar canjes</Link><Link className="button secondary" href="/admin/caja">Configurar encargado de Caja</Link></section>
      <section className="admin-panel"><h2>Insignias automáticas</h2><BadgeSettingsForm loyalStreak={Number(badgeSettings.loyal_streak ?? 3)} legendPoints={Number(badgeSettings.legend_points ?? 100)} /></section>
      <section className="admin-panel"><h2>Crédito del creador</h2><p className="admin-help">Este texto aparece junto al acceso de Administración en la página pública.</p><BrandingForm creatorText={branding.creator_text} creatorUrl={branding.creator_url} visible={branding.visible !== false} /></section>

      <section className="admin-panel"><h2>Crear nuevo sorteo</h2><DrawForm /></section>

      <section className="admin-panel">
        <h2>Ediciones</h2>
        <div className="admin-draw-list">
          {(draws ?? []).length === 0 && <p className="admin-empty">Todavia no hay sorteos cargados.</p>}
          {(draws ?? []).map((draw) => (
            <article className="admin-draw" key={draw.id}>
              <div><small>EDICION #{String(draw.edition_number).padStart(3, "0")}</small><strong>{draw.title}</strong><span>{draw.prize_name}{draw.prize_value !== null ? ` - $${Number(draw.prize_value).toLocaleString("es-AR")}` : ""}</span></div>
              <div className="admin-draw-actions"><span className={`status-pill status-${draw.status}`}>{statusLabels[draw.status] ?? draw.status}</span><Link href={`/admin/sorteos/${draw.id}`}>Participantes</Link>{draw.status === "draft" && <form action={openDraw}><input type="hidden" name="drawId" value={draw.id} /><button type="submit">Abrir sorteo</button></form>}{draw.status === "open" && <form action={freezeDraw}><input type="hidden" name="drawId" value={draw.id} /><button className="freeze-button" type="submit">Cerrar y congelar</button></form>}</div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
