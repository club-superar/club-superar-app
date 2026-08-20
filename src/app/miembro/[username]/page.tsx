import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

type PublicMemberPageProps = { params: Promise<{ username: string }> };

type PublicBadge = {
  id: number;
  awarded_at: string;
  badge_definitions: { badge_key: string; name: string; description: string; icon: string };
};

type PublicWin = {
  id: number;
  confirmed_at: string;
  draws: { edition_number: number; prize_name: string };
  winner_deliveries: { description: string; delivered_at: string; photo_path: string; photo_subject: string } | null;
};

export default async function PublicMemberPage({ params }: PublicMemberPageProps) {
  const normalized = (await params).username.trim().toLowerCase().replace(/^@/, "");
  if (!/^[a-z0-9._]{1,30}$/.test(normalized)) notFound();

  const admin = createAdminSupabaseClient();
  const { data: profileId } = await admin.rpc("resolve_participant_login", { p_username: normalized });
  if (!profileId || typeof profileId !== "string") notFound();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, instagram_username, current_streak, created_at")
    .eq("id", profileId)
    .eq("status", "active")
    .maybeSingle();
  if (!profile) notFound();

  const [{ count: participationCount }, badgeResult, winResult] = await Promise.all([
    admin.from("participations").select("id", { count: "exact", head: true }).eq("profile_id", profile.id),
    admin.from("profile_badges").select("id, awarded_at, badge_definitions!inner(badge_key, name, description, icon)").eq("profile_id", profile.id).order("awarded_at", { ascending: false }),
    admin.from("winners").select("id, confirmed_at, draws!inner(edition_number, prize_name), winner_deliveries(description, delivered_at, photo_path, photo_subject)").eq("profile_id", profile.id).order("confirmed_at", { ascending: false }),
  ]);
  const badges = (badgeResult.data ?? []) as unknown as PublicBadge[];
  const wins = (winResult.data ?? []) as unknown as PublicWin[];

  return (
    <main className="public-member-shell">
      <header className="admin-topbar">
        <Link className="brand" href="/"><span>SUPER</span><span className="brand-dot">.</span><span className="brand-ar">AR</span><small>CLUB</small></Link>
        <Link className="profile-back" href="/#ganadores">← Ganadores</Link>
      </header>

      <section className="public-member-hero">
        <p className="eyebrow cyan">MIEMBRO DEL CLUB</p>
        <div className="public-member-avatar" aria-hidden="true">@</div>
        <h1>@{profile.instagram_username}</h1>
        <p>Actividad pública dentro de Club SUPER.AR</p>
      </section>

      <section className="public-member-stats" aria-label="Resumen público">
        <article><strong>{participationCount ?? 0}</strong><small>Participaciones</small></article>
        <article><strong>{profile.current_streak}</strong><small>Racha actual</small></article>
        <article><strong>{wins.length}</strong><small>Sorteos ganados</small></article>
      </section>

      <section className="profile-panel">
        <div className="profile-section-title"><div><p className="eyebrow cyan">LOGROS PÚBLICOS</p><h2>Insignias</h2></div><span>{badges.length}</span></div>
        {badges.length === 0 ? <p className="profile-empty">Todavía no tiene insignias públicas.</p> : (
          <div className="badge-list">{badges.map((badge) => <article key={badge.id}><span>{badge.badge_definitions.badge_key === "winner" ? "🏆" : badge.badge_definitions.icon}</span><div><strong>{badge.badge_definitions.name}</strong><small>{badge.badge_definitions.description}</small></div></article>)}</div>
        )}
      </section>

      {wins.length > 0 && (
        <section className="profile-panel">
          <div className="profile-section-title"><div><p className="eyebrow cyan">HISTORIAL</p><h2>Sorteos ganados</h2></div><span>{wins.length}</span></div>
          <div className="public-member-wins">{wins.map((win) => <article key={win.id}><div className="public-win-summary"><span>🏆</span><div><small>SORTEO #{String(win.draws.edition_number).padStart(3, "0")}</small><strong>{win.draws.prize_name}</strong></div></div>{win.winner_deliveries && <div className="public-win-delivery"><Image unoptimized width={540} height={360} src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/winner-deliveries/${win.winner_deliveries.photo_path}`} alt={win.winner_deliveries.photo_subject === "winner" ? "Ganador con su premio" : "Premio entregado"} /><div><strong>Premio entregado</strong><p>{win.winner_deliveries.description}</p><small>{new Intl.DateTimeFormat("es-AR").format(new Date(win.winner_deliveries.delivered_at))}</small></div></div>}</article>)}</div>
        </section>
      )}

      <p className="public-privacy-note">Por privacidad, Club SUPER.AR muestra solamente actividad e insignias públicas.</p>
    </main>
  );
}

