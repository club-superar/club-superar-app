import Link from "next/link";
import Image from "next/image";
import { AdminInviteRedirect } from "@/app/admin/invite-redirect";
import { Countdown } from "@/app/countdown";
import { BottomNav } from "@/app/bottom-nav";
import { AutoStartParticipation } from "@/app/participation/auto-start";
import { declareRequirement } from "@/app/participation/actions";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type Requirement = {
  id: number;
  requirement_key: string;
  title: string;
  instructions: string | null;
  action_url: string | null;
  required: boolean;
  points: number;
  display_order: number;
};

type Draw = {
  id: number;
  edition_number: number;
  title: string;
  prize_name: string;
  prize_value: number | null;
  currency_code: string;
  status: string;
  closes_at: string | null;
  draw_requirements: Requirement[];
};

type Completion = {
  id: number;
  state: string;
  draw_requirements: Requirement;
};

type Participation = {
  id: number;
  participant_code: string;
  status: string;
  streak_number: number;
  base_chances: number;
  extra_chances: number;
  final_chances: number;
  requirement_completions: Completion[];
};

type SocialAction = {
  id: number;
  action_type: "additional_tag" | "extra_post_share";
  target_instagram_username_normalized: string | null;
  publication_id: string | null;
};

type PublicWinner = {
  draw_id: number;
  instagram_username: string;
  confirmed_at: string;
  claim_status: string;
  draws: {
    edition_number: number;
    prize_name: string;
    prize_value: number | null;
    currency_code: string;
  };
  winner_deliveries: { description: string; delivered_at: string; photo_path: string; photo_subject: string } | null;
};

const automaticRequirements = new Set(["comment_and_tag", "share_story"]);

function isRequirementComplete(item: Completion) {
  return automaticRequirements.has(item.draw_requirements.requirement_key)
    ? item.state === "verified"
    : new Set(["declared", "verified"]).has(item.state);
}

function completionStatus(item: Completion) {
  if (item.state === "verified") return { label: "Completado", tone: "complete" };
  if (item.state === "rejected") return { label: "Revisión manual", tone: "review" };
  if (item.state === "declared") return automaticRequirements.has(item.draw_requirements.requirement_key)
    ? { label: "Verificando", tone: "checking" }
    : { label: "Completado", tone: "complete" };
  return automaticRequirements.has(item.draw_requirements.requirement_key)
    ? { label: "Pendiente automático", tone: "pending" }
    : { label: "Pendiente", tone: "pending" };
}

function formatPrize(draw: Draw) {
  if (draw.prize_value === null) return draw.prize_name;
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: draw.currency_code,
    maximumFractionDigits: 0,
  }).format(draw.prize_value);
}

export default async function Home() {
  const supabase = await createServerSupabaseClient();
  const { data: claimData } = await supabase.auth.getClaims();
  const userId = claimData?.claims?.sub;

  const drawPromise = supabase
    .from("draws")
    .select("id, edition_number, title, prize_name, prize_value, currency_code, status, closes_at, draw_requirements(id, requirement_key, title, instructions, action_url, required, points, display_order)")
    .neq("status", "draft")
    .neq("status", "cancelled")
    .order("edition_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const profilePromise = userId
    ? supabase.from("profiles").select("instagram_username, current_streak").eq("id", userId).maybeSingle()
    : Promise.resolve({ data: null });
  const pointsPromise = userId
    ? supabase.from("points_ledger").select("amount").eq("profile_id", userId)
    : Promise.resolve({ data: [] });
  const winnersPromise = supabase
    .from("winners")
    .select("draw_id, instagram_username, confirmed_at, claim_status, draws!inner(edition_number, prize_name, prize_value, currency_code), winner_deliveries(description, delivered_at, photo_path, photo_subject)")
    .order("confirmed_at", { ascending: false })
    .limit(20);
  const brandingPromise = supabase.rpc("get_public_branding");

  const [{ data: rawDraw }, { data: profile }, { data: pointRows }, { data: rawWinners }, { data: rawBranding }] = await Promise.all([
    drawPromise,
    profilePromise,
    pointsPromise,
    winnersPromise,
    brandingPromise,
  ]);
  const draw = rawDraw as Draw | null;
  const winners = (rawWinners ?? []) as unknown as PublicWinner[];
  const branding = (rawBranding ?? { creator_text: "Creado por @gonzapuefll", creator_url: "https://www.instagram.com/gonzapuefll/", visible: true }) as { creator_text: string; creator_url: string; visible: boolean };
  const winnerCounts = winners.reduce<Record<string, number>>((counts, winner) => {
    counts[winner.instagram_username] = (counts[winner.instagram_username] ?? 0) + 1;
    return counts;
  }, {});

  let participation: Participation | null = null;
  let socialActions: SocialAction[] = [];
  if (draw && userId) {
    const { data } = await supabase
      .from("participations")
      .select("id, participant_code, status, streak_number, base_chances, extra_chances, final_chances, requirement_completions(id, state, draw_requirements(id, requirement_key, title, instructions, action_url, required, points, display_order))")
      .eq("draw_id", draw.id)
      .eq("profile_id", userId)
      .maybeSingle();
    participation = data as unknown as Participation | null;
    if (participation) {
      const { data: actionRows } = await supabase
        .from("social_actions")
        .select("id, action_type, target_instagram_username_normalized, publication_id")
        .eq("participation_id", participation.id)
        .in("action_type", ["additional_tag", "extra_post_share"])
        .order("created_at", { ascending: true });
      socialActions = (actionRows ?? []) as SocialAction[];
    }
  }

  const points = (pointRows ?? []).reduce((total, row) => total + Number(row.amount), 0);
  const username = profile?.instagram_username ?? null;
  const initials = username?.slice(0, 2).toUpperCase() ?? "SA";
  const completions = [...(participation?.requirement_completions ?? [])]
    .sort((a, b) => a.draw_requirements.display_order - b.draw_requirements.display_order);
  const completedCount = completions.filter(isRequirementComplete).length;
  const requiredCount = completions.filter((item) => item.draw_requirements.required).length;
  const missingCount = completions.filter((item) => item.draw_requirements.required && !isRequirementComplete(item)).length;
  const progress = requiredCount === 0 ? 0 : Math.round((completedCount / requiredCount) * 100);
  const closesAt = draw?.closes_at ? new Date(draw.closes_at).getTime() : null;
  // This dynamic Server Component needs the request time to avoid offering participation after closing.
  // eslint-disable-next-line react-hooks/purity
  const isOpen = draw?.status === "open" && (closesAt === null || closesAt > Date.now());
  const isClosedPending = Boolean(draw) && !isOpen && draw?.status !== "completed";
  const isCompleted = draw?.status === "completed";

  return (
    <main className="app-shell">
      <AdminInviteRedirect />
      <header className="topbar">
        <Link className="brand" href="/" aria-label="Club SUPER.AR, inicio">
          <span>SUPER</span><span className="brand-dot">.</span><span className="brand-ar">AR</span><small>CLUB</small>
        </Link>
        <Link className="avatar" href={username ? "/perfil" : "/ingresar"} aria-label={username ? "Abrir perfil" : "Ingresar"}>{initials}</Link>
      </header>

      <section className="hero" id="inicio">
        <p className="eyebrow">{username ? `HOLA, @${username.toUpperCase()}` : "BIENVENIDO AL CLUB"}</p>
        <h1>Tu lugar en el<br /><span>Club SUPER.AR</span></h1>
        <p className="hero-copy">Participa, suma puntos y gana con nosotros.</p>
        {!username && (
          <div className="hero-actions">
            <Link className="button primary" href="/registro">Quiero participar</Link>
            <Link className="button secondary" href="/ingresar">Ya tengo cuenta</Link>
          </div>
        )}
      </section>

      <section className="stats" aria-label="Tu progreso">
        <article><span aria-hidden="true">★</span><strong>{points}</strong><small>SUPER Puntos</small></article>
        <article><span aria-hidden="true">🔥</span><strong>{participation?.streak_number ?? profile?.current_streak ?? 0}</strong><small>Racha</small></article>
        <article><span aria-hidden="true">🎟</span><strong>{participation?.final_chances ?? 0}</strong><small>Chances</small></article>
      </section>

      {draw ? (
        <section className="draw-card" id="sorteos">
          <div className="draw-head">
            <div><p className="eyebrow cyan">SORTEO #{String(draw.edition_number).padStart(3, "0")}</p><h2>{draw.title}</h2></div>
            <strong className="prize">{formatPrize(draw)}</strong>
          </div>
          {isOpen && draw.closes_at ? <Countdown closesAt={draw.closes_at} /> : isCompleted ? <p className="draw-closed">Sorteo finalizado. Consultá el ganador en el historial.</p> : isClosedPending ? <p className="draw-closed">Participación cerrada. Estamos preparando el sorteo.</p> : <p className="draw-date-pending">Fecha de cierre a confirmar.</p>}
        </section>
      ) : (
        <section className="draw-card empty-draw" id="sorteos">
          <p className="eyebrow cyan">PROXIMO SORTEO</p>
          <h2>Estamos preparando la nueva edicion</h2>
          <p>Cuando SUPER.AR la publique, aparecera aca con su premio y contador.</p>
        </section>
      )}

      {draw && username && isOpen && !participation && <AutoStartParticipation drawId={draw.id} />}

      {draw && !username && isOpen && (
        <section className="start-card">
          <h2>Ingresa para participar</h2>
          <p>Crea tu cuenta con tu usuario de Instagram o entra con tu codigo de recuperacion.</p>
          <Link className="button primary" href="/registro">Crear mi cuenta</Link>
        </section>
      )}

      {participation && isOpen && (
        <section className="checklist">
          <div className="section-title">
            <div><p className="eyebrow">TU PARTICIPACION</p><h2>{missingCount === 0 ? "¡Estas participando!" : `Te ${missingCount === 1 ? "falta" : "faltan"} ${missingCount} ${missingCount === 1 ? "paso" : "pasos"}`}</h2></div>
            <span>{completedCount}/{requiredCount}</span>
          </div>
          <div className="participant-code"><small>TU CODIGO DE ESTA EDICION</small><strong>{participation.participant_code}</strong><span>Usa siempre este mismo codigo en tus comentarios.</span></div>
          <div className="progress"><span style={{ width: `${progress}%` }} /></div>

          <div className="requirement-list">
            {completions.map((item) => {
              const done = isRequirementComplete(item);
              const status = completionStatus(item);
              const requirement = item.draw_requirements;
              const automatic = automaticRequirements.has(requirement.requirement_key);
              const detail = requirement.requirement_key === "comment_and_tag"
                ? `Comenta, etiqueta a 2 personas y agrega ${participation.participant_code}`
                : requirement.instructions;
              return (
                <article className={done ? "requirement done" : "requirement"} key={item.id}>
                  <span className="check" aria-hidden="true">{done ? "✓" : ""}</span>
                  <div><strong>{requirement.title}</strong><small>{detail}</small><em className={`completion-status ${status.tone}`}>{status.label}</em></div>
                  {!done && (
                    <div className="requirement-actions">
                      {requirement.action_url && <a href={requirement.action_url} target="_blank" rel="noreferrer">Abrir</a>}
                      {automatic ? (
                        <span className="automatic-check">Se confirma automáticamente</span>
                      ) : (
                        <form action={declareRequirement}>
                          <input type="hidden" name="completionId" value={item.id} />
                          <button type="submit">Ya lo hice</button>
                        </form>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
          {missingCount === 0 && <p className="eligible-note">Guardamos tu participacion. Antes de entregar el premio, SUPER.AR comprobara los requisitos del ganador.</p>}
        </section>
      )}

      {participation && isOpen && (
        <aside className="bonus extra-actions">
          <span aria-hidden="true">⚡</span>
          <div className="extra-actions-content">
            <strong>Chances extra: {participation.extra_chances}/2</strong>
            <small>Usa siempre {participation.participant_code}. Cada accion diferente suma 1 chance, hasta un maximo de 2.</small>
            {socialActions.length > 0 && (
              <ul className="extra-action-list">
                {socialActions.map((action) => (
                  <li key={action.id}>✓ {action.action_type === "additional_tag" ? `Etiqueta a @${action.target_instagram_username_normalized}` : `Publicacion ${action.publication_id}`}</li>
                ))}
              </ul>
            )}
            {participation.extra_chances < 2 && <p className="automatic-extra-note">Las chances extra aparecen solas cuando Instagram confirma una etiqueta adicional o una nueva mención en historia.</p>}
          </div>
        </aside>
      )}

      <section className="public-winners" id="ganadores">
        <div className="section-title">
          <div><p className="eyebrow cyan">HISTORIAL PUBLICO</p><h2>Ganadores</h2></div>
          <span>{winners.length}</span>
        </div>
        {winners.length === 0 ? (
          <p className="winners-empty">Todavia no hay ganadores confirmados. El primero aparecera aca.</p>
        ) : (
          <div className="winner-list">
            {winners.map((winner) => (
              <article className="winner-history-card" key={winner.draw_id}>
              <Link className="winner-public-link" href={`/miembro/${encodeURIComponent(winner.instagram_username)}`}>
                <div className="winner-trophy" aria-hidden="true">♕</div>
                <div>
                  <small>SORTEO #{String(winner.draws.edition_number).padStart(3, "0")}</small>
                  <strong>@{winner.instagram_username}</strong>
                  <span>{winner.draws.prize_name}</span>
                </div>
                <div className="winner-medals" aria-label={`${winnerCounts[winner.instagram_username]} sorteos ganados`}>
                  {Array.from({ length: Math.min(winnerCounts[winner.instagram_username], 5) }, (_, index) => <span key={index}>🏆</span>)}
                </div>
              </Link>
              {winner.winner_deliveries && <div className="winner-delivery-proof"><Image unoptimized width={110} height={86} src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/winner-deliveries/${winner.winner_deliveries.photo_path}`} alt={winner.winner_deliveries.photo_subject === "winner" ? `Entrega del premio a @${winner.instagram_username}` : `Premio entregado en el sorteo ${winner.draws.edition_number}`} /><div><strong>Premio entregado</strong><p>{winner.winner_deliveries.description}</p><small>{new Intl.DateTimeFormat("es-AR").format(new Date(winner.winner_deliveries.delivered_at))}</small></div></div>}
              </article>
            ))}
          </div>
        )}
      </section>

      <footer className="club-footer">
        <Link href="/como-funciona">¿Cómo funciona el Club?</Link>
        <span><Link href="/admin/ingresar">Administración</Link>{branding.visible !== false && <a href={branding.creator_url} target="_blank" rel="noreferrer">{branding.creator_text}</a>}</span>
      </footer>

      <BottomNav active="inicio" signedIn={Boolean(username)} />
    </main>
  );
}
