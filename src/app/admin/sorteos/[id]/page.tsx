import Link from "next/link";
import { notFound } from "next/navigation";
import { reviewRequirement } from "@/app/admin/actions";
import { requireAdminUserId } from "@/lib/auth/admin";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

type AdminDrawPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string }>;
};

type Completion = {
  id: number;
  state: string;
  declared_at: string | null;
  draw_requirements: { title: string; requirement_key: string };
};

type Participation = {
  id: number;
  participant_code: string;
  status: string;
  streak_number: number;
  base_chances: number;
  extra_chances: number;
  final_chances: number;
  created_at: string;
  profiles: { instagram_username: string; display_name: string | null };
  requirement_completions: Completion[];
};

const stateLabels: Record<string, string> = {
  not_started: "Sin completar",
  declared: "Declarado",
  detected: "Detectado",
  verified: "Verificado",
  rejected: "Rechazado",
};

export default async function AdminDrawParticipantsPage({ params, searchParams }: AdminDrawPageProps) {
  await requireAdminUserId();
  const drawId = Number((await params).id);
  if (!Number.isSafeInteger(drawId) || drawId <= 0) notFound();

  const query = String((await searchParams).q ?? "").trim().toLowerCase().replace(/^@/, "");
  const admin = createAdminSupabaseClient();
  const [{ data: draw }, { data: rawParticipations }] = await Promise.all([
    admin.from("draws").select("id, edition_number, title, prize_name, status").eq("id", drawId).maybeSingle(),
    admin
      .from("participations")
      .select("id, participant_code, status, streak_number, base_chances, extra_chances, final_chances, created_at, profiles!inner(instagram_username, display_name), requirement_completions(id, state, declared_at, draw_requirements(title, requirement_key))")
      .eq("draw_id", drawId)
      .order("created_at", { ascending: false }),
  ]);
  if (!draw) notFound();

  const participations = (rawParticipations ?? []) as unknown as Participation[];
  const filtered = query
    ? participations.filter((item) => item.profiles.instagram_username.toLowerCase().includes(query)
      || item.participant_code.toLowerCase().includes(query))
    : participations;

  return (
    <main className="admin-shell">
      <header className="admin-topbar">
        <Link className="brand" href="/admin"><span>SUPER</span><span className="brand-dot">.</span><span className="brand-ar">AR</span><small>ADMIN</small></Link>
        <Link className="admin-back" href="/admin">← Sorteos</Link>
      </header>

      <section className="admin-heading">
        <p className="eyebrow cyan">EDICION #{String(draw.edition_number).padStart(3, "0")}</p>
        <h1>Participantes</h1>
        <p>{draw.title} · {draw.prize_name}</p>
      </section>

      <section className="admin-participant-summary">
        <article><strong>{participations.length}</strong><small>Totales</small></article>
        <article><strong>{participations.filter((item) => item.status === "eligible").length}</strong><small>Completos</small></article>
        <article><strong>{participations.reduce((total, item) => total + item.final_chances, 0)}</strong><small>Chances</small></article>
      </section>

      <section className="admin-panel">
        <form className="admin-search">
          <label htmlFor="q">Buscar por Instagram o codigo</label>
          <div><input id="q" name="q" defaultValue={query} placeholder="@usuario o SUPER-..." /><button>Buscar</button></div>
        </form>
        <p className="admin-result-count">Mostrando {filtered.length} de {participations.length}</p>
        <div className="admin-participant-list">
          {filtered.length === 0 && <p className="admin-empty">No encontramos participantes con esa busqueda.</p>}
          {filtered.map((item) => (
            <article className="admin-participant" key={item.id}>
              <div className="admin-participant-head">
                <div><strong>@{item.profiles.instagram_username}</strong><small>{item.profiles.display_name || "Sin nombre visible"}</small></div>
                <div><code>{item.participant_code}</code><span>{item.final_chances} chances · racha {item.streak_number}</span></div>
              </div>
              <div className="admin-completion-grid">
                {[...item.requirement_completions]
                  .sort((a, b) => a.draw_requirements.requirement_key.localeCompare(b.draw_requirements.requirement_key))
                  .map((completion) => (
                    <div key={completion.id}>
                      <span className={`review-state review-${completion.state}`}>{stateLabels[completion.state] ?? completion.state}</span>
                      <small>{completion.draw_requirements.title}</small>
                      {completion.state !== "not_started" && (
                        <div className="review-actions">
                          {completion.state !== "verified" && (
                            <form action={reviewRequirement}>
                              <input type="hidden" name="completionId" value={completion.id} />
                              <input type="hidden" name="drawId" value={draw.id} />
                              <input type="hidden" name="decision" value="verified" />
                              <button className="verify" type="submit">Verificar</button>
                            </form>
                          )}
                          {completion.state !== "rejected" && (
                            <form action={reviewRequirement} className="reject-form">
                              <input type="hidden" name="completionId" value={completion.id} />
                              <input type="hidden" name="drawId" value={draw.id} />
                              <input type="hidden" name="decision" value="rejected" />
                              <input name="reason" aria-label={`Motivo para rechazar ${completion.draw_requirements.title}`} placeholder="Motivo" minLength={3} required />
                              <button className="reject" type="submit">Rechazar</button>
                            </form>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
