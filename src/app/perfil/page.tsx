Exit code: 0
Wall time: 0.4 seconds
Output:
import { redirect } from "next/navigation";
import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type ParticipationHistory = {
  id: number;
  status: string;
  streak_number: number;
  final_chances: number;
  created_at: string;
  draws: { edition_number: number; title: string; status: string };
};

type ProfileBadge = {
  id: number;
  awarded_at: string;
  badge_definitions: { badge_key: string; name: string; description: string; icon: string };
};

type PointMovement = { id: number; amount: number; reason_key: string; description: string; created_at: string };

function movementLabel(movement: PointMovement) {
  if (movement.reason_key === "admin_adjustment") return "Ajuste de SUPER Puntos";
  return movement.description;
}

const participationLabels: Record<string, string> = {
  started: "En progreso",
  eligible: "ParticipaciÃ³n completa",
  frozen: "Incluido en el sorteo",
  disqualified: "Descalificado",
  winner_confirmed: "Ganador confirmado",
};

export default async function ProfilePage() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || !userId) redirect("/ingresar");

  const [profileResult, pointsResult, participationResult, badgeResult, movementsResult] = await Promise.all([
    supabase.from("profiles").select("instagram_username, display_name, current_streak").eq("id", userId).single(),
    supabase.from("points_ledger").select("amount").eq("profile_id", userId),
    supabase
      .from("participations")
      .select("id, status, streak_number, final_chances, created_at, draws!inner(edition_number, title, status)")
      .eq("profile_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("profile_badges")
      .select("id, awarded_at, badge_definitions!inner(badge_key, name, description, icon)")
      .eq("profile_id", userId)
      .order("awarded_at", { ascending: false }),
    supabase
      .from("points_ledger")
      .select("id, amount, reason_key, description, created_at")
      .eq("profile_id", userId)
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  const profile = profileResult.data;
  if (!profile) redirect("/ingresar");
  const participations = (participationResult.data ?? []) as unknown as ParticipationHistory[];
  const badges = (badgeResult.data ?? []) as unknown as ProfileBadge[];
  const movements = (movementsResult.data ?? []) as PointMovement[];
  const points = (pointsResult.data ?? []).reduce((total, row) => total + Number(row.amount), 0);
  const currentParticipation = participations.find((item) => ["scheduled", "open"].includes(item.draws.status));
  const winnerCount = badges.filter((item) => item.badge_definitions.badge_key === "winner").length;

  return (
    <main className="profile-shell">
      <header className="topbar">
        <Link className="brand" href="/"><span>SUPER</span><span className="brand-dot">.</span><span className="brand-ar">AR</span><small>CLUB</small></Link>
        <Link className="profile-back" href="/">â† Inicio</Link>
      </header>

      <section className="profile-heading">
        <p className="eyebrow cyan">MI PERFIL</p>
        <h1>@{profile.instagram_username}</h1>
        {profile.display_name && <p>{profile.display_name}</p>}
      </section>

      <section className="profile-overview" aria-label="Tu progreso">
        <article><span>â˜…</span><strong>{points}</strong><small>SUPER Puntos</small></article>
        <article><span>ðŸ”¥</span><strong>{currentParticipation?.streak_number ?? profile.current_streak}</strong><small>Racha</small></article>
        <article><span>ðŸŽŸ</span><strong>{currentParticipation?.final_chances ?? 0}</strong><small>Chances actuales</small></article>
        <article><span>ðŸ†</span><strong>{winnerCount}</strong><small>Sorteos ganados</small></article>
      </section>

      <section className="profile-panel">
        <div className="profile-section-title"><div><p className="eyebrow cyan">LOGROS</p><h2>Mis insignias</h2></div><span>{badges.length}</span></div>
        {badges.length === 0 ? <p className="profile-empty">TodavÃ­a no obtuviste insignias. ParticipÃ¡ y mantenÃ© tu racha para desbloquearlas.</p> : (
          <div className="badge-list">{badges.map((badge) => <article key={badge.id}><span>{badge.badge_definitions.icon}</span><div><strong>{badge.badge_definitions.name}</strong><small>{badge.badge_definitions.description}</small></div></article>)}</div>
        )}
      </section>

      <section className="profile-panel">
        <div className="profile-section-title"><div><p className="eyebrow cyan">ACTIVIDAD</p><h2>Mis sorteos</h2></div><span>{participations.length}</span></div>
        {participations.length === 0 ? <p className="profile-empty">TodavÃ­a no participaste en ningÃºn sorteo.</p> : (
          <div className="participation-history">{participations.map((item) => <article key={item.id}><div><small>SORTEO #{String(item.draws.edition_number).padStart(3, "0")}</small><strong>{item.draws.title}</strong><span>{participationLabels[item.status] ?? item.status}</span></div><div><strong>{item.final_chances}</strong><small>chances</small></div></article>)}</div>
        )}
      </section>

      <section className="profile-panel">
        <div className="profile-section-title"><div><p className="eyebrow cyan">SUPER PUNTOS</p><h2>Ãšltimos movimientos</h2></div></div>
        {movements.length === 0 ? <p className="profile-empty">Tus puntos aparecerÃ¡n acÃ¡ cuando completes acciones.</p> : (
          <div className="point-history">{movements.map((movement) => <article key={movement.id}><div><strong>{movementLabel(movement)}</strong><small>{new Intl.DateTimeFormat("es-AR").format(new Date(movement.created_at))}</small></div><span className={movement.amount > 0 ? "positive" : "negative"}>{movement.amount > 0 ? "+" : ""}{movement.amount}</span></article>)}</div>
        )}
      </section>

      <section className="profile-panel redemption-entry"><div><p className="eyebrow cyan">BENEFICIOS</p><h2>Usar mis SUPER Puntos</h2><p>GenerÃ¡ un QR o cÃ³digo y mostralo en caja. Solo se descuentan cuando el canje se confirma.</p></div><Link className="button primary" href="/canjes">Ver canjes</Link></section>
      <div className="profile-actions"><Link className="button primary" href="/">Ir al sorteo actual</Link><form action={signOut}><button className="button secondary">Cerrar sesiÃ³n</button></form></div>
    </main>
  );
}

