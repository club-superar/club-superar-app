"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getAdminUserId, requireAdminUserId } from "@/lib/auth/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type AdminActionState = { error?: string; success?: string };

export async function loginAdmin(_: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 8) {
    return { error: "Revisa el correo y la contrasena." };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "El correo o la contrasena no coinciden." };

  const allowed = await getAdminUserId();
  if (!allowed) {
    await supabase.auth.signOut();
    return { error: "Esta cuenta no tiene permiso de administracion." };
  }
  redirect("/admin");
}

export async function logoutAdmin() {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  redirect("/admin/ingresar");
}

export async function setAdminPassword(_: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const password = String(formData.get("password") ?? "");
  const repeatPassword = String(formData.get("repeatPassword") ?? "");
  if (password.length < 12) return { error: "La contrasena debe tener al menos 12 caracteres." };
  if (password !== repeatPassword) return { error: "Las dos contrasenas no coinciden." };

  const supabase = await createServerSupabaseClient();
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

  if (title.length < 3 || prizeName.length < 3 || !opensAt || !closesAt) {
    return { error: "Completa el nombre, el premio y las dos fechas." };
  }
  if (prizeValue !== null && (!Number.isFinite(prizeValue) || prizeValue < 0)) {
    return { error: "El valor del premio no es valido." };
  }
  if (![instagramProfileUrl, whatsappGroupUrl, mainPublicationUrl].every((url) => /^https:\/\//.test(url))) {
    return { error: "Los tres enlaces deben comenzar con https://" };
  }

  const admin = createAdminSupabaseClient();
  const { error } = await admin.rpc("admin_create_draw", {
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

  revalidatePath("/admin");
  return { success: "Sorteo guardado como borrador." };
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
