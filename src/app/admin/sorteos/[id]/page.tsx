import Link from "next/link";
import { notFound } from "next/navigation";
import { confirmWinner, disqualifyWinner, markWinnerUnderReview, rerollConfirmedWinner, reviewRequirement, selectProvisionalWinner, updateWinnerClaimStatus, verifyProvisionalWinnerClaim } from "@/app/admin/actions";
import { DrawReveal } from "@/app/admin/sorteos/[id]/draw-reveal";
import { EditDrawForm } from "@/app/admin/sorteos/[id]/edit-draw-form";
import { WinnerCardGenerator } from "@/app/admin/sorteos/[id]/winner-card-generator";
import { WinnerShareTools } from "@/app/admin/sorteos/[id]/winner-share-tools";
import { ProvisionalShareTools } from "@/app/admin/sorteos/[id]/provisional-share-tools";
import { requireAdminUserId } from "@/lib/auth/admin";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

type AdminDrawPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; reveal?: string; notice?: string }>;
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

type DrawAttempt = {
  id: number;
  attempt_number: number;
  status: string;
  created_at: string;
  claim_deadline: string;
  claim_code_verified_at: string | null;
  whatsapp_verified_at: string | null;
  instagram_follow_verified_at: string | null;
  draw_snapshot_entries: { instagram_username: string; participation_id: number };
};

const attemptStatusLabels: Record<string, string> = {
  provisional: "Ganador provisional",
  under_review: "En revision",
  disqualified: "Descalificado",
  confirmed: "Confirmado",
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

  const resolvedSearchParams = await searchParams;
  const query = String(resolvedSearchParams.q ?? "").trim().toLowerCase().replace(/^@/, "");
  const revealAttemptId = Number(resolvedSearchParams.reveal);
  const admin = createAdminSupabaseClient();
  const [{ data: draw }, { data: requirements }, { data: rawParticipations }, { data: snapshot }, { data: attempts }, { data: snapshotEntries }, { data: winner }] = await Promise.all([
    admin.from("draws").select("id, edition_number, title, prize_name, prize_value, currency_code, status, opens_at, closes_at, claim_window_hours, winner_retained_chance_percent, max_base_chances, max_extra_chances, points_config").eq("id", drawId).maybeSingle(),
    admin.from("draw_requirements").select("requirement_key, action_url").eq("draw_id", drawId),
    admin
      .from("participations")
      .select("id, participant_code, status, streak_number, base_chances, extra_chances, final_chances, created_at, profiles!inner(instagram_username, display_name), requirement_completions(id, state, declared_at, draw_requirements(title, requirement_key))")
      .eq("draw_id", drawId)
      .order("created_at", { ascending: false }),
    admin.from("draw_snapshots").select("participant_count, total_chances, snapshot_hash, created_at").eq("draw_id", drawId).order("version", { ascending: false }).limit(1).maybeSingle(),
    admin.from("draw_attempts").select("id, attempt_number, status, created_at, claim_deadline, claim_code_verified_at, whatsapp_verified_at, instagram_follow_verified_at, draw_snapshot_entries!inner(instagram_username, participation_id)").eq("draw_id", drawId).order("attempt_number", { ascending: false }).limit(20),
    admin.from("draw_snapshot_entries").select("instagram_username, participation_id, draw_snapshots!inner(draw_id)").eq("draw_snapshots.draw_id", drawId).order("id", { ascending: true }),
    admin.from("winners").select("id, instagram_username, confirmed_at, claim_deadline, claim_status, claimed_at, fulfilled_at").eq("draw_id", drawId).is("superseded_at", null).maybeSingle(),
  ]);
  if (!draw) notFound();

  const participations = (rawParticipations ?? []) as unknown as Participation[];
  const filtered = query
    ? participations.filter((item) => item.profiles.instagram_username.toLowerCase().includes(query)
      || item.participant_code.toLowerCase().includes(query))
    : participations;
  const drawAttempts = (attempts ?? []) as unknown as DrawAttempt[];
  const latestAttempt = drawAttempts[0];
  const currentAttempt = drawAttempts.find((attempt) => ["provisional", "under_review"].includes(attempt.status));
  const provisionalVerified = Boolean(currentAttempt?.claim_code_verified_at && currentAttempt?.whatsapp_verified_at && currentAttempt?.instagram_follow_verified_at);
  const excludedParticipationIds = new Set(
    participations.filter((item) => item.status === "disqualified").map((item) => item.id),
  );
  const candidateNames = (snapshotEntries ?? [])
    .filter((entry) => !excludedParticipationIds.has(entry.participation_id))
    .map((entry) => entry.instagram_username);
  const requirementUrls = Object.fromEntries((requirements ?? []).map((item) => [item.requirement_key, item.action_url ?? ""]));

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
        <article><strong>{participations.filter((item) => ["eligible", "frozen", "winner_provisional", "winner_confirmed"].includes(item.status)).length}</strong><small>Completos</small></article>
        <article><strong>{participations.reduce((total, item) => total + item.final_chances, 0)}</strong><small>Chances</small></article>
      </section>

      {draw.status === "draft" && draw.opens_at && draw.closes_at && (
        <EditDrawForm
          draw={{
            id: draw.id, title: draw.title, prizeName: draw.prize_name, prizeValue: draw.prize_value,
            opensAt: draw.opens_at, closesAt: draw.closes_at, claimHours: draw.claim_window_hours,
            winnerPercent: Number(draw.winner_retained_chance_percent), maxBaseChances: draw.max_base_chances,
            maxExtraChances: draw.max_extra_chances,
            nonWinnerPoints: Number((draw.points_config as Record<string, number>)?.non_winner_participation ?? 2),
          }}
          urls={requirementUrls}
        />
      )}

      {snapshot && (
        <section className="admin-snapshot">
          <p className="eyebrow cyan">LISTA CONGELADA</p>
          <strong>{snapshot.participant_count} participantes · {Number(snapshot.total_chances)} chances</strong>
        </section>
      )}

      {snapshot && ["frozen", "winner_review"].includes(draw.status) && !currentAttempt && (
        <section className="admin-draw-control">
          <p className="eyebrow cyan">LISTA CERRADA</p>
          <h2>{latestAttempt?.status === "disqualified" ? "Listo para volver a sortear" : "Todo listo para sortear"}</h2>
          <p>La eleccion se guarda primero y la animacion solamente revela el resultado.</p>
          <form action={selectProvisionalWinner}>
            <input type="hidden" name="drawId" value={draw.id} />
            <button type="submit">🎲 {latestAttempt?.status === "disqualified" ? "VOLVER A SORTEAR" : "REALIZAR SORTEO"}</button>
          </form>
        </section>
      )}

      {currentAttempt && (
        <>
          <DrawReveal
            animate={revealAttemptId === currentAttempt.id}
            attemptNumber={currentAttempt.attempt_number}
            candidates={candidateNames}
            winner={currentAttempt.draw_snapshot_entries.instagram_username}
          />
          <ProvisionalShareTools
            claimDeadline={currentAttempt.claim_deadline}
            editionNumber={draw.edition_number}
            username={currentAttempt.draw_snapshot_entries.instagram_username}
          />
        </>
      )}

      {draw.status === "completed" && latestAttempt?.status === "confirmed" && (
        <>
          <DrawReveal
            animate={false}
            attemptNumber={latestAttempt.attempt_number}
            candidates={candidateNames}
            official
            winner={latestAttempt.draw_snapshot_entries.instagram_username}
          />
          {winner && (
            <>
              <WinnerCardGenerator
                editionNumber={draw.edition_number}
                prize={draw.prize_value === null ? draw.prize_name : `${draw.prize_name} - ${new Intl.NumberFormat("es-AR", { style: "currency", currency: draw.currency_code, maximumFractionDigits: 0 }).format(draw.prize_value)}`}
                confirmedAt={winner.confirmed_at}
                username={winner.instagram_username}
              />
              <WinnerShareTools
                claimDeadline={winner.claim_deadline}
                editionNumber={draw.edition_number}
                prize={draw.prize_value === null ? draw.prize_name : `${draw.prize_name} por ${new Intl.NumberFormat("es-AR", { style: "currency", currency: draw.currency_code, maximumFractionDigits: 0 }).format(draw.prize_value)}`}
                username={winner.instagram_username}
              />
              <section className="winner-claim-panel">
                <p className="eyebrow cyan">SEGUIMIENTO DEL PREMIO</p>
                <h2>{winner.claim_status === "pending" ? "Esperando reclamo" : winner.claim_status === "claimed" ? "Premio reclamado" : winner.claim_status === "fulfilled" ? "Premio entregado" : "Plazo vencido"}</h2>
                <p>
                  {winner.claim_status === "pending" && `El ganador tiene tiempo hasta ${new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(winner.claim_deadline))}.`}
                  {winner.claim_status === "claimed" && `Reclamado el ${new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(winner.claimed_at))}.`}
                  {winner.claim_status === "fulfilled" && `Entregado el ${new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(winner.fulfilled_at))}.`}
                  {winner.claim_status === "expired" && "El ganador no reclamó dentro del plazo configurado."}
                </p>
                {winner.claim_status === "pending" && (
                  <div>
                    <form action={updateWinnerClaimStatus}><input type="hidden" name="drawId" value={draw.id} /><input type="hidden" name="winnerId" value={winner.id} /><input type="hidden" name="newStatus" value="claimed" /><button type="submit">Marcar como reclamado</button></form>
                  </div>
                )}
                {winner.claim_status === "claimed" && <form action={updateWinnerClaimStatus}><input type="hidden" name="drawId" value={draw.id} /><input type="hidden" name="winnerId" value={winner.id} /><input type="hidden" name="newStatus" value="fulfilled" /><button type="submit">Confirmar entrega del premio</button></form>}
                {winner.claim_status !== "fulfilled" && (
                  <section className="winner-reroll-panel">
                    <h3>¿El ganador no puede recibir el premio?</h3>
                    <p>Se lo excluirá de esta edición y comenzará inmediatamente un nuevo sorteo entre los demás participantes.</p>
                    <form action={rerollConfirmedWinner}>
                      <input type="hidden" name="drawId" value={draw.id} />
                      <input type="hidden" name="winnerId" value={winner.id} />
                      <input type="hidden" name="reason" value="not_in_whatsapp" />
                      <button className="reroll-winner" type="submit">No está en WhatsApp · volver a sortear</button>
                    </form>
                    {new Date() >= new Date(winner.claim_deadline) && ["pending", "expired"].includes(winner.claim_status) && (
                      <form action={rerollConfirmedWinner}>
                        <input type="hidden" name="drawId" value={draw.id} />
                        <input type="hidden" name="winnerId" value={winner.id} />
                        <input type="hidden" name="reason" value="claim_expired" />
                        <button className="reroll-winner" type="submit">No reclamó en término · volver a sortear</button>
                      </form>
                    )}
                  </section>
                )}
              </section>
            </>
          )}
        </>
      )}

      {currentAttempt && (
        <section className="winner-review-panel">
          <p className="eyebrow cyan">VALIDACION MANUAL</p>
          <h2>Revisar a @{currentAttempt.draw_snapshot_entries.instagram_username}</h2>
          <p>Pedile el código privado por WhatsApp. Después comprobá que el número continúa en el grupo y que la cuenta sigue a SUPER.AR.</p>
          {resolvedSearchParams.notice === "claim-incomplete" && <p className="form-error">Pegá el código y marcá las dos comprobaciones.</p>}
          {resolvedSearchParams.notice === "claim-invalid" && <p className="form-error">El código no coincide con el ganador provisional.</p>}
          {resolvedSearchParams.notice === "claim-expired" && <p className="form-error">El código venció. Corresponde volver a sortear.</p>}
          {resolvedSearchParams.notice === "claim-error" && <p className="form-error">No pudimos verificar el reclamo. Intentá nuevamente.</p>}
          {resolvedSearchParams.notice === "verification-required" && <p className="form-error">Primero completá la verificación del reclamo.</p>}
          {resolvedSearchParams.notice === "claim-verified" && <p className="form-success">Código, Instagram y WhatsApp verificados correctamente.</p>}
          <form action={verifyProvisionalWinnerClaim} className="provisional-verification-form">
            <input type="hidden" name="drawId" value={draw.id} />
            <input type="hidden" name="attemptId" value={currentAttempt.id} />
            <label>Código privado recibido<input name="claimCode" placeholder="PREMIO-XXXXXX" autoCapitalize="characters" autoComplete="off" required disabled={provisionalVerified} /></label>
            <label className="verification-check"><input type="checkbox" name="whatsappVerified" required disabled={provisionalVerified} defaultChecked={Boolean(currentAttempt.whatsapp_verified_at)} /> Confirmé que su número continúa en el grupo de WhatsApp</label>
            <label className="verification-check"><input type="checkbox" name="instagramFollowVerified" required disabled={provisionalVerified} defaultChecked={Boolean(currentAttempt.instagram_follow_verified_at)} /> Confirmé que sigue a SUPER.AR en Instagram</label>
            <button type="submit" disabled={provisionalVerified}>{provisionalVerified ? "Verificación completa ✓" : "Verificar reclamo"}</button>
          </form>
          <div className="winner-review-actions">
            <form action={confirmWinner}>
              <input type="hidden" name="drawId" value={draw.id} />
              <input type="hidden" name="attemptId" value={currentAttempt.id} />
              <button className="confirm-winner" type="submit" disabled={!provisionalVerified}>Confirmar ganador oficial</button>
            </form>
            {currentAttempt.status === "provisional" && (
              <form action={markWinnerUnderReview}>
                <input type="hidden" name="drawId" value={draw.id} />
                <input type="hidden" name="attemptId" value={currentAttempt.id} />
                <button className="hold-winner" type="submit">Dejar en revision</button>
              </form>
            )}
          </div>
          <form action={disqualifyWinner} className="disqualify-form">
            <input type="hidden" name="drawId" value={draw.id} />
            <input type="hidden" name="attemptId" value={currentAttempt.id} />
            <label htmlFor="reason">Si no cumple, selecciona el motivo</label>
            <select id="reason" name="reason" required defaultValue="">
              <option value="" disabled>Elegir motivo</option>
              <option value="not_in_whatsapp">No esta en WhatsApp</option>
              <option value="not_following_instagram">No sigue Instagram</option>
              <option value="story_not_shared">No compartio la historia</option>
              <option value="invalid_comment">Comentario incorrecto</option>
              <option value="false_data">Datos falsos</option>
              <option value="claim_expired">No reclamó dentro del plazo</option>
              <option value="other">Otro</option>
            </select>
            <textarea name="notes" placeholder="Detalle opcional; obligatorio si elegis Otro" rows={3} />
            <button type="submit">No cumple</button>
          </form>
        </section>
      )}

      {drawAttempts.length > 0 && (
        <section className="admin-attempt-history">
          <h2>Historial de intentos</h2>
          {drawAttempts.map((attempt) => (
            <div key={attempt.id}>
              <strong>#{attempt.attempt_number} · @{attempt.draw_snapshot_entries.instagram_username}</strong>
              <span className={`attempt-${attempt.status}`}>{attemptStatusLabels[attempt.status] ?? attempt.status}</span>
            </div>
          ))}
        </section>
      )}

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
                      <div className="review-actions">
                          {completion.state !== "verified" && (
                            <form action={reviewRequirement}>
                              <input type="hidden" name="completionId" value={completion.id} />
                              <input type="hidden" name="drawId" value={draw.id} />
                              <input type="hidden" name="decision" value="verified" />
                              <input name="reason" aria-label={`Motivo para verificar ${completion.draw_requirements.title}`} placeholder="Motivo de la excepción" minLength={3} required />
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
                    </div>
                  ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      {snapshot && (
        <details className="admin-technical-details">
          <summary>Verificación técnica del sorteo</summary>
          <small>Huella SHA-256 de la lista congelada</small>
          <code>{snapshot.snapshot_hash}</code>
        </details>
      )}
    </main>
  );
}

