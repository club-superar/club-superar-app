"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

async function requireUserId() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || !userId) redirect("/ingresar");
  return userId;
}

export async function startParticipation(formData: FormData) {
  const userId = await requireUserId();
  const drawId = Number(formData.get("drawId"));
  if (!Number.isSafeInteger(drawId) || drawId <= 0) return;

  const admin = createAdminSupabaseClient();
  const { error } = await admin.rpc("start_draw_participation", {
    p_user_id: userId,
    p_draw_id: drawId,
  });
  if (error) throw new Error("No pudimos iniciar la participacion.");
  revalidatePath("/");
}

export async function declareRequirement(formData: FormData) {
  const userId = await requireUserId();
  const completionId = Number(formData.get("completionId"));
  if (!Number.isSafeInteger(completionId) || completionId <= 0) return;

  const admin = createAdminSupabaseClient();
  const { error } = await admin.rpc("declare_draw_requirement", {
    p_user_id: userId,
    p_completion_id: completionId,
  });
  if (error) throw new Error("No pudimos guardar este paso.");
  revalidatePath("/");
  revalidatePath("/perfil");
}

export async function declareExtraAction(formData: FormData) {
  const userId = await requireUserId();
  const participationId = Number(formData.get("participationId"));
  const actionType = String(formData.get("actionType") ?? "");
  const value = String(formData.get("value") ?? "").trim();
  if (!Number.isSafeInteger(participationId) || participationId <= 0 || !value) return;
  if (!new Set(["additional_tag", "extra_post_share"]).has(actionType)) return;

  const admin = createAdminSupabaseClient();
  const { error } = await admin.rpc("declare_extra_social_action", {
    p_user_id: userId,
    p_participation_id: participationId,
    p_action_type: actionType,
    p_value: value,
  });
  if (error) {
    if (error.message.includes("EXTRA_ACTION_ALREADY_DECLARED")) throw new Error("Esta accion ya estaba registrada.");
    if (error.message.includes("EXTRA_LIMIT_REACHED")) throw new Error("Ya alcanzaste el maximo de chances extra.");
    throw new Error("No pudimos guardar la chance extra.");
  }
  revalidatePath("/");
  revalidatePath("/perfil");
}
