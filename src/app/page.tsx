import Link from "next/link";
import { Countdown } from "@/app/countdown";
import { declareRequirement, startParticipation } from "@/app/participation/actions";
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

const completedStates = new Set(["declared", "detected", "verified"]);

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
    .in("status", ["scheduled", "open"])
    .order("edition_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const profilePromise = userId
    ? supabase.from("profiles").select("instagram_username, current_streak").eq("id", userId).maybeSingle()
    : Promise.resolve({ data: null });
  const pointsPromise = userId
    ? supabase.from("points_ledger").select("amount").eq("profile_id", userId)
    : Promise.resolve({ data: [] });

  const [{ data: rawDraw }, { data: profile }, { data: pointRows }] = await Promise.all([
    drawPromise,
    profilePromise,
    pointsPromise,
  ]);
  const draw = rawDraw as Draw | null;

  let participation: Participation | null = null;
  if (draw && userId) {
    const { data } = await supabase
      .from("participations")
      .select("id, participant_code, status, streak_number, base_chances, extra_chances, final_chances, requirement_completions(id, state, draw_requirements(id, requirement_key, title, instructions, action_url, required, points, display_order))")
      .eq("draw_id", draw.id)
      .eq("profile_id", userId)
      .maybeSingle();
    participation = data as unknown as Participation | null;
  }

  const points = (pointRows ?? []).reduce((total, row) => total + Number(row.amount), 0);
  const username = profile?.instagram_username ?? null;
  const initials = username?.slice(0, 2).toUpperCase() ?? "SA";
  const completions = [...(participation?.requirement_completions ?? [])]
    .sort((a, b) => a.draw_requirements.display_order - b.draw_requirements.display_order);
  const completedCount = completions.filter((item) => completedStates.has(item.state)).length;
  const requiredCount = completions.filter((item) => item.draw_requirements.required).length;
  const missingCount = completions.filter((item) => item.draw_requirements.required && !completedStates.has(item.state)).length;
  const progress = requiredCount === 0 ? 0 : Math.round((completedCount / requiredCount) * 100);

  return (
    <main className="app-shell">
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
        <article><span aria-hidden="true">&#9733;</span><strong>{points}</strong><small>SUPER Puntos</small></article>
        <article><span aria-hidden="true">&#128293;</span><strong>{participation?.streak_number ?? profile?.current_streak ?? 0}</strong><small>Racha</small></article>
        <article><span aria-hidden="true">&#127915;</span><strong>{participation?.final_chances ?? 0}</strong><small>Chances</small></article>
      </section>

      {draw ? (
        <section className="draw-card" id="sorteos">
          <div className="draw-head">
            <div><p className="eyebrow cyan">SORTEO #{String(draw.edition_number).padStart(3, "0")}</p><h2>{draw.title}</h2></div>
            <strong className="prize">{formatPrize(draw)}</strong>
          </div>
          {draw.closes_at ? <Countdown closesAt={draw.closes_at} /> : <p className="draw-date-pending">Fecha de cierre a confirmar.</p>}
        </section>
      ) : (
        <section className="draw-card empty-draw" id="sorteos">
          <p className="eyebrow cyan">PROXIMO SORTEO</p>
          <h2>Estamos preparando la nueva edicion</h2>
          <p>Cuando SUPER.AR la publique, aparecera aca con su premio y contador.</p>
        </section>
      )}

      {draw && username && draw.status === "open" && !participation && (
        <section className="start-card">
          <p className="eyebrow cyan">SORTEO ABIERTO</p>
          <h2>Activa tu participacion</h2>
          <p>Te daremos tu codigo unico para esta edicion y podras completar los pasos.</p>
          <form action={startParticipation}>
            <input type="hidden" name="drawId" value={draw.id} />
            <button className="button primary" type="submit">Participar ahora</button>
          </form>
        </section>
      )}

      {draw && !username && draw.status === "open" && (
        <section className="start-card">
          <h2>Ingresa para participar</h2>
          <p>Crea tu cuenta con tu usuario de Instagram o entra con tu codigo de recuperacion.</p>
          <Link className="button primary" href="/registro">Crear mi cuenta</Link>
        </section>
      )}

      {participation && (
        <section className="checklist">
          <div className="section-title">
            <div><p className="eyebrow">TU PARTICIPACION</p><h2>{missingCount === 0 ? "Estas participando" : `Te ${missingCount === 1 ? "falta" : "faltan"} ${missingCount} ${missingCount === 1 ? "paso" : "pasos"}`}</h2></div>
            <span>{completedCount}/{requiredCount}</span>
          </div>
          <div className="participant-code"><small>TU CODIGO DE ESTA EDICION</small><strong>{participation.participant_code}</strong><span>Usa siempre este mismo codigo en tus comentarios.</span></div>
          <div className="progress"><span style={{ width: `${progress}%` }} /></div>

          <div className="requirement-list">
            {completions.map((item) => {
              const done = completedStates.has(item.state);
              const requirement = item.draw_requirements;
              const detail = requirement.requirement_key === "comment_and_tag"
                ? `Comenta, etiqueta a 2 personas y agrega ${participation.participant_code}`
                : requirement.instructions;
              return (
                <article className={done ? "requirement done" : "requirement"} key={item.id}>
                  <span className="check" aria-hidden="true">{done ? "\u2713" : ""}</span>
                  <div><strong>{requirement.title}</strong><small>{detail}</small></div>
                  {!done && (
                    <div className="requirement-actions">
                      {requirement.action_url && <a href={requirement.action_url} target="_blank" rel="noreferrer">Abrir</a>}
                      <form action={declareRequirement}>
                        <input type="hidden" name="completionId" value={item.id} />
                        <button type="submit">Ya lo hice</button>
                      </form>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
          {missingCount === 0 && <p className="eligible-note">Guardamos tu participacion. Antes de entregar el premio, SUPER.AR comprobara los requisitos del ganador.</p>}
        </section>
      )}

      {participation && (
        <aside className="bonus">
          <span aria-hidden="true">&#9889;</span>
          <div><strong>Suma hasta 2 chances extra</strong><small>Las etiquetas y publicaciones adicionales se habilitaran en el siguiente bloque de esta misma fase.</small></div>
        </aside>
      )}

      <nav className="bottom-nav" aria-label="Navegacion principal">
        <Link className="active" href="/"><span>&#8962;</span>Inicio</Link>
        <Link href="/#sorteos"><span>&#9671;</span>Sorteos</Link>
        <Link href="/#ganadores"><span>&#9813;</span>Ganadores</Link>
        <Link href={username ? "/perfil" : "/ingresar"}><span>&#9675;</span>Mi perfil</Link>
      </nav>
    </main>
  );
}
