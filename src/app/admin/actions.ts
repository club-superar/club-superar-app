"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { requireAdminUserId } from "@/lib/auth/admin";
import { createAdminSessionSupabaseClient } from "@/lib/supabase/server";

export type AdminActionState = { error?: string; success?: string };

export async function loginAdmin(_: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const email = String(formData.get("email") ?? "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 8) {
    return { error: "Revisa el correo y la contrasena." };
  }

  const supabase = await createAdminSessionSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    if (error?.status === 429) return { error: "Supabase bloqueo temporalmente nuevos intentos. Espera unos minutos." };
    return { error: `Supabase rechazo el acceso (codigo: ${error?.code ?? "sin_codigo"}).` };
  }

  const admin = createAdminSupabaseClient();
  const { data: allowed, error: roleError } = await admin.rpc("is_phase1_admin", {
    p_user_id: data.user.id,
  });
  if (roleError || !allowed) {
    await supabase.auth.signOut();
    return { error: "Esta cuenta no tiene permiso de administracion." };
  }
  redirect("/admin");
}

export async function logoutAdmin() {
  const supabase = await createAdminSessionSupabaseClient();
  await supabase.auth.signOut();
  redirect("/admin/ingresar");
}

export async function setAdminPassword(_: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const password = String(formData.get("password") ?? "");
  const repeatPassword = String(formData.get("repeatPassword") ?? "");
  if (password.length < 12) return { error: "La contrasena debe tener al menos 12 caracteres." };
  if (password !== repeatPassword) return { error: "Las dos contrasenas no coinciden." };

  const supabase = await createAdminSessionSupabaseClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !claimsData?.claims?.sub) return { error: "El enlace vencio. Solicita uno nuevo." };

  const admin = createAdminSupabaseClient();
  const { data: allowed } = await admin.rpc("is_phase1_admin", {
    p_user_id: claimsData.claims.sub,
  });
  if (!allowed) return { error: "Esta cuenta no tiene permiso de administracion." };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "No pudimos guardar la contrasena. Proba con otra mas segura." };
  redirect("/admin");
}

function argentinaDateTimeToIso(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00-03:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function createDraw(_: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const actorId = await requireAdminUserId();
  const title = String(formData.get("title") ?? "").trim();
  const prizeName = String(formData.get("prizeName") ?? "").trim();
  const prizeValueText = String(formData.get("prizeValue") ?? "").trim();
  const prizeValue = prizeValueText === "" ? null : Number(prizeValueText);
  const opensAt = argentinaDateTimeToIso(String(formData.get("opensAt") ?? ""));
  const closesAt = argentinaDateTimeToIso(String(formData.get("closesAt") ?? ""));
  const instagramProfileUrl = String(formData.get("instagramProfileUrl") ?? "").trim();
  const whatsappGroupUrl = String(formData.get("whatsappGroupUrl") ?? "").trim();
  const mainPublicationUrl = String(formData.get("mainPublicationUrl") ?? "").trim();
  const readInteger = (name: string) => Number(String(formData.get(name) ?? ""));
  const rules = {
    follow_instagram: 0,
    whatsapp_group: 0,
    comment_and_tag: 0,
    share_story: 0,
    completion_bonus: 0,
    extra_action: 0,
    non_winner_participation: readInteger("nonWinnerPoints"),
    max_extra_actions: readInteger("maxExtraChances"),
  };
  const maxBaseChances = readInteger("maxBaseChances");
  const maxExtraChances = readInteger("maxExtraChances");
  const winnerPercent = readInteger("winnerPercent");
  const claimHours = readInteger("claimHours");

  if (title.length < 3 || prizeName.length < 3 || !opensAt || !closesAt) {
    return { error: "Completa el nombre, el premio y las dos fechas." };
  }
  if (prizeValue !== null && (!Number.isFinite(prizeValue) || prizeValue < 0)) {
    return { error: "El valor del premio no es valido." };
  }
  if (![instagramProfileUrl, whatsappGroupUrl, mainPublicationUrl].every((url) => /^https:\/\//.test(url))) {
    return { error: "Los tres enlaces deben comenzar con https://" };
  }
  if (!Object.values(rules).every((value) => Number.isInteger(value) && value >= 0 && value <= 100)
    || !Number.isInteger(maxBaseChances) || maxBaseChances < 2 || maxBaseChances > 6
    || !Number.isInteger(maxExtraChances) || maxExtraChances < 0 || maxExtraChances > 2
    || !Number.isInteger(winnerPercent) || winnerPercent < 0 || winnerPercent > 100
    || !Number.isInteger(claimHours) || claimHours < 1 || claimHours > 168) {
    return { error: "Revis谩 las reglas, los puntos y los l铆mites del sorteo." };
  }

  const admin = createAdminSupabaseClient();
  const { data: created, error } = await admin.rpc("admin_create_draw", {
    p_actor_id: actorId,
    p_title: title,
    p_prize_name: prizeName,
    p_prize_value: prizeValue,
    p_opens_at: opensAt,
    p_closes_at: closesAt,
    p_instagram_profile_url: instagramProfileUrl,
    p_whatsapp_group_url: whatsappGroupUrl,
    p_main_publication_url: mainPublicationUrl,
  });
  if (error) return { error: "No pudimos crear el sorteo. Revisa los datos y las fechas." };

  const drawId = (created as { id?: number } | null)?.id;
  if (!drawId) return { error: "El sorteo se cre贸, pero no pudimos recuperar su configuraci贸n." };
  const { error: drawRulesError } = await admin.from("draws").update({
    claim_window_hours: claimHours,
    winner_retained_chance_percent: winnerPercent,
    max_base_chances: maxBaseChances,
    max_extra_chances: maxExtraChances,
    points_config: rules,
  }).eq("id", drawId).eq("status", "draft");
  const requirementUpdates = await Promise.all([
    ["follow_instagram", rules.follow_instagram],
    ["whatsapp_group", rules.whatsapp_group],
    ["comment_and_tag", rules.comment_and_tag],
    ["share_story", rules.share_story],
  ].map(([requirementKey, points]) => admin.from("draw_requirements").update({ points }).eq("draw_id", drawId).eq("requirement_key", requirementKey)));
  if (drawRulesError || requirementUpdates.some((result) => result.error)) {
    await admin.from("draws").delete().eq("id", drawId).eq("status", "draft");
    return { error: "No pudimos guardar todas las reglas. El borrador incompleto fue descartado." };
  }

  revalidatePath("/admin");
  return { success: "Sorteo guardado como borrador." };
}

export async function updateDraftDraw(_: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const actorId = await requireAdminUserId();
  const drawId = Number(formData.get("drawId"));
  const title = String(formData.get("title") ?? "").trim();
  const prizeName = String(formData.get("prizeName") ?? "").trim();
  const prizeValueText = String(formData.get("prizeValue") ?? "").trim();
  const prizeValue = prizeValueText === "" ? null : Number(prizeValueText);
  const opensAt = argentinaDateTimeToIso(String(formData.get("opensAt") ?? ""));
  const closesAt = argentinaDateTimeToIso(String(formData.get("closesAt") ?? ""));
  const instagramProfileUrl = String(formData.get("instagramProfileUrl") ?? "").trim();
  const whatsappGroupUrl = String(formData.get("whatsappGroupUrl") ?? "").trim();
  const mainPublicationUrl = String(formData.get("mainPublicationUrl") ?? "").trim();
  const integer = (name: string) => Number(String(formData.get(name) ?? ""));
  const values = {
    followPoints: 0, whatsappPoints: 0,
    commentPoints: 0, storyPoints: 0,
    completionPoints: 0, extraActionPoints: 0,
    maxBaseChances: integer("maxBaseChances"), maxExtraChances: integer("maxExtraChances"),
    winnerPercent: integer("winnerPercent"), claimHours: integer("claimHours"),
    nonWinnerPoints: integer("nonWinnerPoints"),
  };

  if (!Number.isSafeInteger(drawId) || drawId <= 0 || title.length < 3 || prizeName.length < 3 || !opensAt || !closesAt) {
    return { error: "Revis谩 el nombre, el premio y las fechas." };
  }
  if (new Date(closesAt) <= new Date(opensAt)) return { error: "El cierre debe ser posterior a la apertura." };
  if (prizeValue !== null && (!Number.isFinite(prizeValue) || prizeValue < 0)) return { error: "El valor del premio no es v谩lido." };
  if (![instagramProfileUrl, whatsappGroupUrl, mainPublicationUrl].every((url) => /^https:\/\//.test(url))) {
    return { error: "Los tres enlaces deben comenzar con https://" };
  }
  if (!Number.isInteger(values.maxBaseChances) || values.maxBaseChances < 2 || values.maxBaseChances > 6
    || !Number.isInteger(values.maxExtraChances) || values.maxExtraChances < 0 || values.maxExtraChances > 2
    || !Number.isInteger(values.winnerPercent) || values.winnerPercent < 0 || values.winnerPercent > 100
    || !Number.isInteger(values.claimHours) || values.claimHours < 1 || values.claimHours > 168
    || !Number.isInteger(values.nonWinnerPoints) || values.nonWinnerPoints < 0 || values.nonWinnerPoints > 100) {
    return { error: "Revis谩 los puntos y los l铆mites del sorteo." };
  }

  const admin = createAdminSupabaseClient();
  const { error } = await admin.rpc("admin_update_draft_draw", {
    p_actor_id: actorId, p_draw_id: drawId, p_title: title, p_prize_name: prizeName,
    p_prize_value: prizeValue, p_opens_at: opensAt, p_closes_at: closesAt,
    p_instagram_profile_url: instagramProfileUrl, p_whatsapp_group_url: whatsappGroupUrl,
    p_main_publication_url: mainPublicationUrl, p_follow_points: values.followPoints,
    p_whatsapp_points: values.whatsappPoints, p_comment_points: values.commentPoints,
    p_story_points: values.storyPoints, p_completion_points: values.completionPoints,
    p_extra_action_points: values.extraActionPoints, p_max_base_chances: values.maxBaseChances,
    p_max_extra_chances: values.maxExtraChances, p_winner_percent: values.winnerPercent,
    p_claim_hours: values.claimHours,
  });
  if (error) {
    if (error.message.includes("DRAW_NOT_DRAFT")) return { error: "Este sorteo ya fue abierto y sus reglas est谩n congeladas." };
    return { error: "No pudimos guardar los cambios. Revis谩 los datos." };
  }
  const { error: pointsConfigError } = await admin.from("draws").update({ points_config: {
    follow_instagram: 0, whatsapp_group: 0, comment_and_tag: 0, share_story: 0,
    completion_bonus: 0, extra_action: 0, max_extra_actions: values.maxExtraChances,
    non_winner_participation: values.nonWinnerPoints,
  } }).eq("id", drawId).eq("status", "draft");
  if (pointsConfigError) return { error: "El sorteo se guard贸, pero no pudimos guardar los puntos de participaci贸n." };
  revalidatePath("/admin");
  revalidatePath(`/admin/sorteos/${drawId}`);
  revalidatePath("/");
  return { success: "Cambios guardados correctamente." };
}

export async function openDraw(formData: FormData) {
  const actorId = await requireAdminUserId();
  const drawId = Number(formData.get("drawId"));
  if (!Number.isSafeInteger(drawId) || drawId <= 0) return;

  const admin = createAdminSupabaseClient();
  const { error } = await admin.rpc("admin_open_draw", {
    p_actor_id: actorId,
    p_draw_id: drawId,
  });
  if (error) throw new Error("No pudimos abrir este sorteo.");
  revalidatePath("/");
  revalidatePath("/admin");
}

export async function reviewRequirement(formData: FormData) {
  const actorId = await requireAdminUserId();
  const completionId = Number(formData.get("completionId"));
  const drawId = Number(formData.get("drawId"));
  const decision = String(formData.get("decision") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!Number.isSafeInteger(completionId) || completionId <= 0) return;
  if (!Number.isSafeInteger(drawId) || drawId <= 0) return;
  if (!new Set(["verified", "rejected"]).has(decision)) return;
  if (decision === "rejected" && reason.length < 3) throw new Error("Escribi el motivo del rechazo.");

  const admin = createAdminSupabaseClient();
  const { error } = await admin.rpc("admin_review_requirement", {
    p_actor_id: actorId,
    p_completion_id: completionId,
    p_decision: decision,
    p_reason: reason || null,
  });
  if (error) throw new Error("No pudimos guardar la revision.");
  revalidatePath(`/admin/sorteos/${drawId}`);
  revalidatePath("/");
  revalidatePath("/perfil");
}

export async function freezeDraw(formData: FormData) {
  const actorId = await requireAdminUserId();
  const drawId = Number(formData.get("drawId"));
  if (!Number.isSafeInteger(drawId) || drawId <= 0) return;

  const admin = createAdminSupabaseClient();
  const { error } = await admin.rpc("admin_freeze_draw", {
    p_actor_id: actorId,
    p_draw_id: drawId,
  });
  if (error) {
    if (error.message.includes("NO_ELIGIBLE_PARTICIPANTS")) throw new Error("No hay participantes completos para congelar.");
    throw new Error("No pudimos cerrar este sorteo.");
  }
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath(`/admin/sorteos/${drawId}`);
}

export async function selectProvisionalWinner(formData: FormData) {
  const actorId = await requireAdminUserId();
  const drawId = Number(formData.get("drawId"));
  if (!Number.isSafeInteger(drawId) || drawId <= 0) return;

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc("admin_select_provisional_winner", {
    p_actor_id: actorId,
    p_draw_id: drawId,
  });
  if (error) {
    if (error.message.includes("UNRESOLVED_ATTEMPT")) throw new Error("Ya hay un ganador provisional pendiente de revision.");
    if (error.message.includes("NO_CANDIDATES_LEFT")) throw new Error("No quedan participantes habilitados.");
    throw new Error("No pudimos realizar el sorteo.");
  }

  const attempt = data as { id?: number } | null;
  revalidatePath("/admin");
  revalidatePath(`/admin/sorteos/${drawId}`);
  redirect(`/admin/sorteos/${drawId}?reveal=${attempt?.id ?? ""}`);
}

function readAttemptActionIds(formData: FormData) {
  const drawId = Number(formData.get("drawId"));
  const attemptId = Number(formData.gg蔌谮$z{-躩诐        <code>{snapshot.snapshot_hash}</code>
        </section>
      )}

      {snapshot && ["frozen", "winner_review"].includes(draw.status) && !currentAttempt && (
        <section className="admin-draw-control">
          <p className="eyebrow cyan">LISTA CERRADA</p>
          <h2>{latestAttempt?.status === "disqualified" ? "Listo para volver a sortear" : "Todo listo para sortear"}</h2>
          <p>La eleccion se guarda primero y la animacion solamente revela el resultado.</p>
          <form action={selectProvisionalWinner}>
            <input type="hidden" name="drawId" value={draw.id} />
            <button type="submit">馃幉 {latestAttempt?.status === "disqualified" ? "VOLVER A SORTEAR" : "REALIZAR SORTEO"}</button>
          </form>
        </section>
      )}

      {currentAttempt && (
        <DrawReveal
          animate={revealAttemptId === currentAttempt.id}
          attemptNumber={currentAttempt.attempt_number}
          candidates={candidateNames}
          winner={currentAttempt.draw_snapshot_entries.instagram_username}
        />
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
                  {winner.claim_status === "expired" && "El ganador no reclam贸 dentro del plazo configurado."}
                </p>
                {winner.claim_status === "pending" && (
                  <div>
                    <form action={updateWinnerClaimStatus}><input type="hidden" name="drawId" value={draw.id} /><input type="hidden" name="winnerId" value={winner.id} /><input type="hidden" name="newStatus" value="claimed" /><button type="submit">Marcar como reclamado</button></form>
                    {new Date() >= new Date(winner.claim_deadline) && <form action={updateWinnerClaimStatus}><input type="hidden" name="drawId" value={draw.id} /><input type="hidden" name="winnerId" value={winner.id} /><input type="hidden" name="newStatus" value="expired" /><button className="claim-expired" type="submit">Marcar plazo vencido</button></form>}
                  </div>
                )}
                {winner.claim_status === "claimed" && <form action={updateWinnerClaimStatus}><input type="hidden" name="drawId" value={draw.id} /><input type="hidden" name="winnerId" value={winner.id} /><input type="hidden" name="newStatus" value="fulfilled" /><button type="submit">Confirmar entrega del premio</button></form>}
              </section>
            </>
          )}
        </>
      )}

      {currentAttempt && (
        <section className="winner-review-panel">
          <p className="eyebrow cyan">VALIDACION MANUAL</p>
          <h2>Revisar a @{currentAttempt.draw_snapshot_entries.instagram_username}</h2>
          <p>Comproba Instagram, comentario, historia y permanencia en WhatsApp antes de confirmar.</p>
          <div className="winner-review-actions">
            <form action={confirmWinner}>
              <input type="hidden" name="drawId" value={draw.id} />
              <input type="hidden" name="attemptId" value={currentAttempt.id} />
              <button className="confirm-winner" type="submit">Confirmar ganador</button>
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
              <strong>#{attempt.attempt_number} 路 @{attempt.draw_snapshot_entries.instagram_username}</strong>
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
                <div><code>{item.participant_code}</code><span>{item.final_chances} chances 路 racha {item.streak_number}</span></div>
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
