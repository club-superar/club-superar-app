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
    follow_instagram: readInteger("followPoints"),
    whatsapp_group: readInteger("whatsappPoints"),
    comment_and_tag: readInteger("commentPoints"),
    share_story: readInteger("storyPoints"),
    completion_bonus: readInteger("completionPoints"),
    extra_action: readInteger("extraActionPoints"),
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
    return { error: "Revisá las reglas, los puntos y los límites del sorteo." };
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
  if (!drawId) return { error: "El sorteo se creó, pero no pudimos recuperar su configuración." };
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
    followPoints: integer("followPoints"), whatsappPoints: integer("whatsappPoints"),
    commentPoints: integer("commentPoints"), storyPoints: integer("storyPoints"),
    completionPoints: integer("completionPoints"), extraActionPoints: integer("extraActionPoints"),
    maxBaseChances: integer("maxBaseChances"), maxExtraChances: integer("maxExtraChances"),
    winnerPercent: integer("winnerPercent"), claimHours: integer("claimHours"),
  };

  if (!Number.isSafeInteger(drawId) || drawId <= 0 || title.length < 3 || prizeName.length < 3 || !opensAt || !closesAt) {
    return { error: "Revisá el nombre, el premio y las fechas." };
  }
  if (new Date(closesAt) <= new Date(opensAt)) return { error: "El cierre debe ser posterior a la apertura." };
  if (prizeValue !== null && (!Number.isFinite(prizeValue) || prizeValue < 0)) return { error: "El valor del premio no es válido." };
  if (![instagramProfileUrl, whatsappGroupUrl, mainPublicationUrl].every((url) => /^https:\/\//.test(url))) {
    return { error: "Los tres enlaces deben comenzar con https://" };
  }
  const pointValues = [values.followPoints, values.whatsappPoints, values.commentPoints, values.storyPoints, values.completionPoints, values.extraActionPoints];
  if (!pointValues.every((value) => Number.isInteger(value) && value >= 0 && value <= 100)
    || !Number.isInteger(values.maxBaseChances) || values.maxBaseChances < 2 || values.maxBaseChances > 6
    || !Number.isInteger(values.maxExtraChances) || values.maxExtraChances < 0 || values.maxExtraChances > 2
    || !Number.isInteger(values.winnerPercent) || values.winnerPercent < 0 || values.winnerPercent > 100
    || !Number.isInteger(values.claimHours) || values.claimHours < 1 || values.claimHours > 168) {
    return { error: "Revisá los puntos y los límites del sorteo." };
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
    if (error.message.includes("DRAW_NOT_DRAFT")) return { error: "Este sorteo ya fue abierto y sus reglas están congeladas." };
    return { error: "No pudimos guardar los cambios. Revisá los datos." };
  }
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
  const attemptId = Number(formData.get("attemptId"));
  if (!Number.isSafeInteger(drawId) || drawId <= 0) return null;
  if (!Number.isSafeInteger(attemptId) || attemptId <= 0) return null;
  return { drawId, attemptId };
}

export async function markWinnerUnderReview(formData: FormData) {
  const actorId = await requireAdminUserId();
  const ids = readAttemptActionIds(formData);
  if (!ids) return;
  const admin = createAdminSupabaseClient();
  const { error } = await admin.rpc("admin_mark_attempt_under_review", {
    p_actor_id: actorId,
    p_attempt_id: ids.attemptId,
  });
  if (error) throw new Error("No pudimos dejar al ganador en revision.");
  revalidatePath("/admin");
  revalidatePath(`/admin/sorteos/${ids.drawId}`);
}

export async function disqualifyWinner(formData: FormData) {
  const actorId = await requireAdminUserId();
  const ids = readAttemptActionIds(formData);
  if (!ids) return;
  const reason = String(formData.get("reason") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();
  const reasons = new Set(["not_in_whatsapp", "not_following_instagram", "story_not_shared", "invalid_comment", "false_data", "other"]);
  if (!reasons.has(reason)) throw new Error("Selecciona un motivo valido.");
  if (reason === "other" && notes.length < 3) throw new Error("Explica el motivo de la descalificacion.");
  const admin = createAdminSupabaseClient();
  const { error } = await admin.rpc("admin_disqualify_attempt", {
    p_actor_id: actorId,
    p_attempt_id: ids.attemptId,
    p_reason_key: reason,
    p_notes: notes || null,
  });
  if (error) throw new Error("No pudimos descalificar a este participante.");
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath(`/admin/sorteos/${ids.drawId}`);
}

export async function confirmWinner(formData: FormData) {
  const actorId = await requireAdminUserId();
  const ids = readAttemptActionIds(formData);
  if (!ids) return;
  const admin = createAdminSupabaseClient();
  const { error } = await admin.rpc("admin_confirm_winner", {
    p_actor_id: actorId,
    p_attempt_id: ids.attemptId,
  });
  if (error) throw new Error("No pudimos confirmar al ganador.");
  revalidatePath("/");
  revalidatePath("/perfil");
  revalidatePath("/admin");
  revalidatePath(`/admin/sorteos/${ids.drawId}`);
}

export async function updateWinnerClaimStatus(formData: FormData) {
  const actorId = await requireAdminUserId();
  const drawId = Number(formData.get("drawId"));
  const winnerId = Number(formData.get("winnerId"));
  const newStatus = String(formData.get("newStatus") ?? "");
  if (!Number.isSafeInteger(drawId) || drawId <= 0 || !Number.isSafeInteger(winnerId) || winnerId <= 0) return;
  if (!new Set(["claimed", "fulfilled", "expired"]).has(newStatus)) return;

  const admin = createAdminSupabaseClient();
  const { error } = await admin.rpc("admin_update_winner_claim_status", {
    p_actor_id: actorId,
    p_winner_id: winnerId,
    p_new_status: newStatus,
  });
  if (error) {
    if (error.message.includes("INVALID_CLAIM_TRANSITION")) {
      throw new Error("Ese cambio no corresponde al estado actual o el plazo todavía no venció.");
    }
    throw new Error("No pudimos actualizar el estado del premio.");
  }
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath(`/admin/sorteos/${drawId}`);
}

export async function updateBadgeSettings(_: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const actorId = await requireAdminUserId();
  const loyalStreak = Number(formData.get("loyalStreak"));
  const legendPoints = Number(formData.get("legendPoints"));
  if (!Number.isInteger(loyalStreak) || loyalStreak < 2 || loyalStreak > 50
    || !Number.isInteger(legendPoints) || legendPoints < 10 || legendPoints > 1000000) {
    return { error: "Revisá los límites de las insignias." };
  }
  const admin = createAdminSupabaseClient();
  const { error } = await admin.rpc("admin_update_badge_thresholds", {
    p_actor_id: actorId,
    p_loyal_streak: loyalStreak,
    p_legend_points: legendPoints,
  });
  if (error) return { error: "No pudimos actualizar las insignias." };
  revalidatePath("/admin");
  revalidatePath("/perfil");
  revalidatePath("/miembro/[username]", "page");
  revalidatePath("/admin/miembros/[id]", "page");
  return { success: "Límites actualizados y miembros revisados." };
}

function readMemberId(formData: FormData) {
  const profileId = String(formData.get("profileId") ?? "");
  return /^[0-9a-f-]{36}$/i.test(profileId) ? profileId : null;
}

function revalidateMemberProgress(profileId: string, username?: string) {
  revalidatePath(`/admin/miembros/${profileId}`);
  revalidatePath("/admin/miembros");
  revalidatePath("/admin");
  revalidatePath("/perfil");
  if (username) revalidatePath(`/miembro/${username}`);
}

export async function adjustMemberPoints(_: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const actorId = await requireAdminUserId();
  const profileId = readMemberId(formData);
  const amount = Number(formData.get("amount"));
  const reason = String(formData.get("reason") ?? "").trim();
  const username = String(formData.get("username") ?? "").trim();
  if (!profileId || !Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 100000 || reason.length < 3 || reason.length > 200) {
    return { error: "Revisá la cantidad y escribí un motivo breve." };
  }
  const admin = createAdminSupabaseClient();
  const { error } = await admin.rpc("admin_adjust_member_points", {
    p_actor_id: actorId, p_profile_id: profileId, p_amount: amount, p_reason: reason,
  });
  if (error?.message.includes("NEGATIVE_POINTS")) return { error: "El ajuste dejaría los puntos por debajo de cero." };
  if (error) return { error: "No pudimos ajustar los SUPER Puntos." };
  revalidateMemberProgress(profileId, username);
  return { success: `${amount > 0 ? "+" : ""}${amount} SUPER Puntos guardados.` };
}

export async function updateMemberStreak(_: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const actorId = await requireAdminUserId();
  const profileId = readMemberId(formData);
  const currentStreak = Number(formData.get("currentStreak"));
  const longestStreak = Number(formData.get("longestStreak"));
  const reason = String(formData.get("reason") ?? "").trim();
  const username = String(formData.get("username") ?? "").trim();
  if (!profileId || !Number.isInteger(currentStreak) || !Number.isInteger(longestStreak)
    || currentStreak < 0 || longestStreak < currentStreak || longestStreak > 1000
    || reason.length < 3 || reason.length > 200) {
    return { error: "La mejor racha debe ser igual o mayor que la actual. Agregá un motivo." };
  }
  const admin = createAdminSupabaseClient();
  const { error } = await admin.rpc("admin_update_member_streak", {
    p_actor_id: actorId, p_profile_id: profileId, p_current_streak: currentStreak,
    p_longest_streak: longestStreak, p_reason: reason,
  });
  if (error) return { error: "No pudimos actualizar la racha." };
  revalidateMemberProgress(profileId, username);
  return { success: "Racha actualizada." };
}

export async function setMemberBadge(_: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const actorId = await requireAdminUserId();
  const profileId = readMemberId(formData);
  const badgeKey = String(formData.get("badgeKey") ?? "");
  const awarded = String(formData.get("awarded") ?? "") === "true";
  const reason = String(formData.get("reason") ?? "").trim();
  const username = String(formData.get("username") ?? "").trim();
  if (!profileId || !new Set(["loyal", "legend"]).has(badgeKey) || reason.length < 3 || reason.length > 200) {
    return { error: "Elegí Fiel o Leyenda y escribí un motivo." };
  }
  const admin = createAdminSupabaseClient();
  const { error } = await admin.rpc("admin_set_member_badge", {
    p_actor_id: actorId, p_profile_id: profileId, p_badge_key: badgeKey,
    p_awarded: awarded, p_reason: reason,
  });
  if (error) return { error: "No pudimos cambiar la insignia." };
  revalidateMemberProgress(profileId, username);
  return { success: awarded ? "Insignia otorgada." : "Insignia quitada." };
}

