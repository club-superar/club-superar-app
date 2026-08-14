import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminUserId } from "@/lib/auth/admin";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { MemberProgressControls } from "@/app/admin/miembros/[id]/member-progress-controls";

type AdminMemberPageProps = { params: Promise<{ id: string }> };
type Participation = { id: number; status: string; streak_number: number; base_chances: number; extra_chances: number; final_chances: number; created_at: string; draws: { id: number; edition_number: number; title: string; status: string } };
type Badge = { id: number; awarded_at: string; badge_definitions: { badge_key: string; name: string; description: string; icon: string } };
type BadgeDefinition = { badge_key: string; name: string; description: string; icon: string };
type Movement = { id: number; amount: number; description: string; created_at: string };
type Winner = { id: number; draw_id: number; confirmed_at: string; claim_status: string; draws: { edition_number: number; prize_name: string } };
type Disqualification = { id: number; draw_id: number; reason_key: string; notes: string | null; created_at: string; draws: { edition_number: number } };

const participationLabels: Record<string, string> = { started: "En progreso", eligible: "Completa", frozen: "Congelada", disqualified: "Descalificada", winner_provisional: "Ganador provisional", winner_confirmed: "Ganador confirmado" };
const reasonLabels: Record<string, string> = { not_in_whatsapp: "No estaba en WhatsApp", not_following_instagram: "No seguía Instagram", story_not_shared: "No compartió la historia", invalid_comment: "Comentario inválido", false_data: "Datos falsos", other: "Otro" };

export default async function AdminMemberPage({ params }: AdminMemberPageProps) {
  await requireAdminUserId();
  const id = (await params).id;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const admin = createAdminSupabaseClient();
  const [profileResult, pointsResult, participationResult, badgeResult, movementResult, winnerResult, disqualificationResult, badgeDefinitionsResult, redemptionOverrideResult] = await Promise.all([
    admin.from("profiles").select("id, instagram_username, display_name, status, current_streak, longest_streak, created_at").eq("id", id).maybeSingle(),
    admin.from("points_ledger").select("amount").eq("profile_id", id),
    admin.from("participations").select("id, status, streak_number, base_chances, extra_chances, final_chances, created_at, draws!inner(id, edition_number, title, status)").eq("profile_id", id).order("created_at", { ascending: false }),
    admin.from("profile_badges").select("id, awarded_at, badge_definitions!inner(badge_key, name, description, icon)").eq("profile_id", id).order("awarded_at", { ascending: false }),
    admin.from("points_ledger").select("id, amount, description, created_at").eq("profile_id", id).order("created_at", { ascending: false }).limit(30),
    admin.from("winners").select("id, draw_id, confirmed_at, claim_status, draws!inner(edition_number, prize_name)").eq("profile_id", id).order("confirmed_at", { ascending: false }),
    admin.from("disqualifications").select("id, draw_id, reason_key, notes, created_at, draws!inner(edition_number), participations!inner(profile_id)").eq("participations.profile_id", id).order("created_at", { ascending: false }),
    admin.from("badge_definitions").select("badge_key, name, description, icon").in("badge_key", ["loyal", "legend"]).eq("active", true).order("id"),
    admin.from("redemption_access_overrides").select("active, reason, granted_at").eq("profile_id", id).maybeSingle(),
  ]);
  const profile = profileResult.data;
  if (!profile) notFound();
  const participations = (participationResult.data ?? []) as unknown as Participation[];
  const badges = (badgeResult.data ?? []) as unknown as Badge[];
  const movements = (movementResult.data ?? []) as Movement[];
  const winners = (winnerResult.data ?? []) as unknown as Winner[];
  const disqualifications = (disqualificationResult.data ?? []) as unknown as Disqualification[];
  const badgeDefinitions = (badgeDefinitionsResult.data ?? []) as BadgeDefinition[];
  const points = (pointsResult.data ?? []).reduce((total, row) => total + Number(row.amount), 0);

  return (
    <main className="admin-shell">
      <header className="admin-topbar"><Link className="brand" href="/admin"><span>SUPER</span><span className="brand-dot">.</span><span className="brand-ar">AR</span><small>ADMIN</small></Link><Link className="admin-back" href="/admin/miembros">← Miembros</Link></header>
      <section className="admin-member-heading"><div className="admin-member-avatar" aria-hidden="true">@</div><div><p className="eyebrow cyan">FICHA DEL MIEMBRO</p><h1>@{profile.instagram_username}</h1><span className={`status-pill status-${profile.status}`}>{profile.status === "active" ? "Activo" : profile.status}</span></div></section>

      <section className="admin-member-overview">
        <article><strong>{points}</strong><small>SUPER Puntos</small></article><article><strong>{profile.current_streak}</strong><small>Racha actual</small></article><article><strong>{profile.longest_streak}</strong><small>Mejor racha</small></article><article><strong>{participations.length}</strong><small>Participaciones</small></article><article><strong>{badges.length}</strong><small>Insignias</small></article><article><strong>{winners.length}</strong><small>Ganados</small></article>
      </section>

      <MemberProgressControls
        profileId={profile.id}
        username={profile.instagram_username}
        currentStreak={profile.current_streak}
        longestStreak={profile.longest_streak}
        badges={badgeDefinitions}
        awardedBadgeKeys={badges.map((badge) => badge.badge_definitions.badge_key)}
        redemptionOverrideActive={redemptionOverrideResult.data?.active === true}
      />

      <div className="admin-member-columns">
        <section className="admin-panel"><div className="admin-panel-title"><h2>Participaciones</h2><small>{participations.length}</small></div>{participations.length === 0 ? <p className="admin-empty">Sin participaciones.</p> : <div className="admin-member-history">{participations.map((item) => <Link href={`/admin/sorteos/${item.draws.id}`} key={item.id}><div><small>SORTEO #{String(item.draws.edition_number).padStart(3, "0")}</small><strong>{item.draws.title}</strong><span>{participationLabels[item.status] ?? item.status}</span></div><b>{item.final_chances}<small> chances</small></b></Link>)}</div>}</section>
        <section className="admin-panel"><div className="admin-panel-title"><h2>Insignias</h2><small>{badges.length}</small></div>{badges.length === 0 ? <p className="admin-empty">Sin insignias.</p> : <div className="admin-member-badges">{badges.map((badge) => <article key={badge.id}><span>{badge.badge_definitions.icon}</span><div><strong>{badge.badge_definitions.name}</strong><small>{badge.badge_definitions.description}</small></div></article>)}</div>}</section>
      </div>

      <section className="admin-panel"><div className="admin-panel-title"><h2>Movimientos de puntos</h2><small>ÚLTIMOS {movements.length}</small></div>{movements.length === 0 ? <p className="admin-empty">Sin movimientos.</p> : <div className="point-history">{movements.map((movement) => <article key={movement.id}><div><strong>{movement.description}</strong><small>{new Intl.DateTimeFormat("es-AR").format(new Date(movement.created_at))}</small></div><span className={movement.amount > 0 ? "positive" : "negative"}>{movement.amount > 0 ? "+" : ""}{movement.amount}</span></article>)}</div>}</section>

      {(winners.length > 0 || disqualifications.length > 0) && <section className="admin-panel"><div className="admin-panel-title"><h2>Resultados y revisiones</h2><small>HISTORIAL</small></div><div className="admin-member-results">{winners.map((winner) => <Link href={`/admin/sorteos/${winner.draw_id}`} key={`winner-${winner.id}`}><span>🏆</span><div><strong>Ganador del sorteo #{String(winner.draws.edition_number).padStart(3, "0")}</strong><small>{winner.draws.prize_name} · {winner.claim_status}</small></div></Link>)}{disqualifications.map((item) => <Link href={`/admin/sorteos/${item.draw_id}`} key={`dq-${item.id}`}><span>✕</span><div><strong>Descalificado del sorteo #{String(item.draws.edition_number).padStart(3, "0")}</strong><small>{reasonLabels[item.reason_key] ?? item.reason_key}{item.notes ? ` · ${item.notes}` : ""}</small></div></Link>)}</div></section>}
    </main>
  );
}
