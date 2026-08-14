"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { requireAdminUserId } from "@/lib/auth/admin";
import { createAdminSessionSupabaseClient } from "@/lib/supabase/server";
import { generateRecoveryCode, hashRecoveryCode, isValidInstagramUsername, normalizeInstagramUsername } from "@/lib/auth/participant";

export type AdminActionState = { error?: string; success?: string; recoveryCode?: string };

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
    followPoints: 0, whatsappPoints: 0,
    commentPoints: 0, storyPoints: 0,
    completionPoints: 0, extraActionPoints: 0,
    maxBaseChances: integer("maxBaseChances"), maxExtraChances: integer("maxExtraChances"),
    winnerPercent: integer("winnerPercent"), claimHours: integer("claimHours"),
    nonWinnerPoints: integer("nonWinnerPoints"),
  };

  if (!Number.isSafeInteger(drawId) || drawId <= 0 || title.length < 3 || prizeName.length < 3 || !opensAt || !closesAt) {
    return { error: "Revisá el nombre, el premio y las fechas." };
  }
  if (new Date(closesAt) <= new Date(opensAt)) return { error: "El cierre debe ser posterior a la apertura." };
  if (prizeValue !== null && (!Number.isFinite(prizeValue) || prizeValue < 0)) return { error: "El valor del premio no es válido." };
  if (![instagramProfileUrl, whatsappGroupUrl, mainPublicationUrl].every((url) => /^https:\/\//.test(url))) {
    return { error: "Los tres enlaces deben comenzar con https://" };
  }
  if (!Number.isInteger(values.maxBaseChances) || values.maxBaseChances < 2 || values.maxBaseChances > 6
    || !Number.isInteger(values.maxExtraChances) || values.maxExtraChances < 0 || values.maxExtraChances > 2
    || !Number.isInteger(values.winnerPercent) || values.winnerPercent < 0 || values.winnerPercent > 100
    || !Number.isInteger(values.claimHours) || values.claimHours < 1 || values.claimHours > 168
    || !Number.isInteger(values.nonWinnerPoints) || values.nonWinnerPoints < 0 || values.nonWinnerPoints > 100) {
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
  const { error: pointsConfigError } = await admin.from("draws").update({ points_config: {
    follow_instagram: 0, whatsapp_group: 0, comment_and_tag: 0, share_story: 0,
    completion_bonus: 0, extra_action: 0, max_extra_actions: values.maxExtraChances,
    non_winner_participation: values.nonWinnerPoints,
  } }).eq("id", drawId).eq("status", "draft");
  if (pointsConfigError) return { error: "El sorteo se guardó, pero no pudimos guardar los puntos de participación." };
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
  if (reason.length < 3) throw new Error("Escribí el motivo de la revisión.");

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

export async function updatePublicBranding(_: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const actorId = await requireAdminUserId();
  const creatorText = String(formData.get("creatorText") ?? "").trim();
  const creatorUrl = String(formData.get("creatorUrl") ?? "").trim();
  const visible = String(formData.get("visible") ?? "") === "true";
  if (creatorText.length < 3 || creatorText.length > 80
    || !/^https:\/\/(www\.)?instagram\.com\/[A-Za-z0-9._]+\/?$/.test(creatorUrl)) {
    return { error: "Revisá el texto y pegá el enlace completo de Instagram." };
  }
  const { error } = await createAdminSupabaseClient().rpc("admin_update_public_branding", {
    p_actor_id: actorId, p_creator_text: creatorText, p_creator_url: creatorUrl, p_visible: visible,
  });
  if (error) return { error: "No pudimos guardar el crédito del creador." };
  revalidatePath("/");
  revalidatePath("/admin");
  return { success: "Crédito público actualizado." };
}

export async function updateClubFeatures(_: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const actorId = await requireAdminUserId();
  const helpInstagramUrl = String(formData.get("helpInstagramUrl") ?? "").trim();
  const redemptionsEnabled = String(formData.get("redemptionsEnabled") ?? "") === "true";
  if (!/^https:\/\/(www\.)?instagram\.com\/[A-Za-z0-9._]+\/?$/.test(helpInstagramUrl)) {
    return { error: "Pegá el enlace completo del Instagram oficial de SUPER.AR." };
  }
  const { error } = await createAdminSupabaseClient().rpc("admin_update_club_features", {
    p_actor_id: actorId, p_help_instagram_url: helpInstagramUrl, p_redemptions_enabled: redemptionsEnabled,
  });
  if (error) return { error: "No pudimos guardar la configuración de lanzamiento." };
  ["/", "/ingresar", "/como-funciona", "/canjes", "/admin"].forEach((path) => revalidatePath(path));
  return { success: redemptionsEnabled ? "Canjes habilitados públicamente." : "Canjes guardados como Próximamente." };
}

export async function setMemberRedemptionOverride(_: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const actorId = await requireAdminUserId();
  const profileId = readMemberId(formData);
  const active = String(formData.get("active") ?? "") === "true";
  const reason = String(formData.get("reason") ?? "").trim();
  const username = String(formData.get("username") ?? "").trim();
  if (!profileId || reason.length < 3 || reason.length > 200) {
    return { error: "Escribí un motivo breve para registrar la excepción." };
  }
  const { error } = await createAdminSupabaseClient().rpc("admin_set_redemption_access_override", {
    p_actor_id: actorId, p_profile_id: profileId, p_active: active, p_reason: reason,
  });
  if (error) return { error: "No pudimos cambiar el permiso especial de canje." };
  revalidateMemberProgress(profileId, username);
  revalidatePath("/canjes");
  return { success: active ? "Canjes habilitados como excepción." : "Excepción de canje desactivada." };
}

export async function changeMemberInstagramUsername(_: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const actorId = await requireAdminUserId();
  const profileId = readMemberId(formData);
  const oldUsername = String(formData.get("username") ?? "").trim();
  const newUsername = normalizeInstagramUsername(String(formData.get("newUsername") ?? ""));
  const reason = String(formData.get("reason") ?? "").trim();
  if (!profileId || !isValidInstagramUsername(newUsername) || reason.length < 3 || reason.length > 200) {
    return { error: "Revisá el usuario y escribí un motivo breve." };
  }
  const { data, error } = await createAdminSupabaseClient().rpc("admin_change_member_instagram_username", {
    p_actor_id: actorId, p_profile_id: profileId, p_new_username: newUsername, p_reason: reason,
  });
  if (error?.message.includes("USERNAME_TAKEN")) return { error: "Ese usuario pertenece a otra cuenta del Club." };
  if (error) return { error: "No pudimos actualizar el usuario." };
  revalidateMemberProgress(profileId, oldUsername);
  revalidatePath(`/miembro/${newUsername}`);
  return { success: `Usuario actualizado a @${typeof data === "string" ? data : newUsername}.` };
}

export async function regenerateMemberRecoveryCode(_: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const actorId = await requireAdminUserId();
  const profileId = readMemberId(formData);
  const reason = String(formData.get("reason") ?? "").trim();
  if (!profileId || reason.length < 3 || reason.length > 200) return { error: "Escribí un motivo breve para regenerar la clave." };
  const recoveryCode = generateRecoveryCode();
  const admin = createAdminSupabaseClient();
  const { error: authError } = await admin.auth.admin.updateUserById(profileId, { password: recoveryCode });
  if (authError) return { error: "No pudimos reemplazar la clave de recuperación." };
  const { error: auditError } = await admin.rpc("admin_record_recovery_reset", {
    p_actor_id: actorId, p_profile_id: profileId,
    p_recovery_code_hash: hashRecoveryCode(recoveryCode), p_reason: reason,
  });
  revalidateMemberProgress(profileId);
  return {
    success: auditError ? "Clave regenerada. Guardala ahora; no se pudo completar el registro de auditoría." : "Clave regenerada. La anterior ya no funciona.",
    recoveryCode,
  };
}

export async function updateRewardSettings(_: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const actorId = await requireAdminUserId();
  const earningPercent = Number(formData.get("earningPercent"));
  const arsPerPoint = Number(formData.get("arsPerPoint"));
  const minimum = Number(formData.get("minimum"));
  const expiry = Number(formData.get("expiry"));
  if (!Number.isFinite(earningPercent) || earningPercent <= 0 || earningPercent > 25 || !Number.isFinite(arsPerPoint) || arsPerPoint <= 0 || !Number.isInteger(minimum) || minimum < 1 || !Number.isInteger(expiry) || expiry < 3 || expiry > 60) return { error: "Revisá los valores del sistema." };
  const { error } = await createAdminSupabaseClient().rpc("admin_update_reward_settings", { p_actor_id: actorId, p_earning_percent: earningPercent, p_ars_per_point: arsPerPoint, p_minimum: minimum, p_expiry: expiry });
  if (error) return { error: "No pudimos guardar la configuración." };
  revalidatePath("/admin/canjes"); revalidatePath("/canjes");
  return { success: "Configuración guardada." };
}

export async function saveReward(_: AdminActionState, formData: FormData): Promise<AdminActionState> {
  await requireAdminUserId();
  const name = String(formData.get("name") ?? "").trim(); const description = String(formData.get("description") ?? "").trim(); const pointsCost = Number(formData.get("pointsCost")); const stock = Number(formData.get("stock"));
  if (name.length < 3 || name.length > 80 || description.length > 240 || !Number.isInteger(pointsCost) || pointsCost < 1 || !Number.isInteger(stock) || stock < 0 || stock > 100000) return { error: "Revisá el nombre, los puntos y el cupo." };
  const { error } = await createAdminSupabaseClient().from("reward_catalog").insert({ name, description, points_cost: pointsCost, stock_remaining: stock });
  if (error) return { error: "No pudimos guardar el producto." };
  revalidatePath("/admin/canjes"); revalidatePath("/canjes"); revalidatePath("/caja");
  return { success: "Producto guardado." };
}

export async function toggleReward(formData: FormData) {
  await requireAdminUserId(); const id = Number(formData.get("id")); const active = String(formData.get("active")) === "true"; if (!Number.isSafeInteger(id) || id <= 0) return;
  await createAdminSupabaseClient().from("reward_catalog").update({ active, updated_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/admin/canjes"); revalidatePath("/canjes"); revalidatePath("/caja");
}

export async function updateRewardStock(formData: FormData) {
  await requireAdminUserId();
  const id = Number(formData.get("id"));
  const stock = Number(formData.get("stock"));
  if (!Number.isSafeInteger(id) || id <= 0 || !Number.isInteger(stock) || stock < 0 || stock > 100000) return;
  await createAdminSupabaseClient().from("reward_catalog").update({ stock_remaining: stock, updated_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/admin/canjes"); revalidatePath("/canjes"); revalidatePath("/caja");
}

export async function confirmPointRedemption(_: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const actorId = await requireAdminUserId(); const code = String(formData.get("code") ?? "").replace(/[^a-f0-9]/gi, "").toUpperCase();
  if (code.length !== 8) return { error: "El código debe tener 8 caracteres." };
  const { data, error } = await createAdminSupabaseClient().rpc("admin_confirm_point_redemption", { p_actor_id: actorId, p_code: code });
  if (error?.message.includes("CODE_NOT_FOUND")) return { error: "Código inexistente." };
  if (error?.message.includes("CODE_NOT_PENDING")) return { error: "Este código venció o ya fue utilizado." };
  if (error?.message.includes("REWARD_OUT_OF_STOCK")) return { error: "Ese producto está agotado. No se descontaron puntos." };
  if (error) return { error: "No pudimos confirmar el canje." };
  revalidatePath("/admin/canjes"); revalidatePath("/perfil");
  return { success: `Canje confirmado: ${(data as { points?: number })?.points ?? 0} puntos descontados.` };
}
