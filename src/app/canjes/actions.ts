"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export type RedemptionState = { error?: string; redemption?: { id: string; code: string; points: number; ars_value: number; reward_name: string; expires_at: string } };

export async function createRedemption(_: RedemptionState, formData: FormData): Promise<RedemptionState> {
  const supabase = await createServerSupabaseClient();
  const { data, error: claimsError } = await supabase.auth.getClaims();
  const profileId = data?.claims?.sub;
  if (claimsError || !profileId) return { error: "Tu sesión venció. Volvé a ingresar." };
  const rewardText = String(formData.get("rewardId") ?? "");
  const rewardId = rewardText ? Number(rewardText) : null;
  const points = Number(formData.get("points") ?? 0);
  if ((rewardId !== null && (!Number.isSafeInteger(rewardId) || rewardId <= 0)) || !Number.isInteger(points) || points < 0) return { error: "Revisá el canje elegido." };
  const admin = createAdminSupabaseClient();
  const { data: created, error } = await admin.rpc("create_point_redemption", { p_profile_id: profileId, p_reward_id: rewardId, p_points: points });
  if (error?.message.includes("INSUFFICIENT_POINTS")) return { error: "No tenés suficientes SUPER Puntos disponibles." };
  if (error?.message.includes("MINIMUM_POINTS")) return { error: "La cantidad está por debajo del mínimo permitido." };
  if (error?.message.includes("REWARD_OUT_OF_STOCK")) return { error: "Ese producto se agotó o tiene todos sus cupos reservados." };
  if (error?.message.includes("PARTICIPATION_REQUIRED")) return { error: "Completá tu participación en el sorteo actual para habilitar los canjes." };
  if (error) return { error: "No pudimos generar el canje. Intentá nuevamente." };
  return { redemption: created as RedemptionState["redemption"] };
}

export async function cancelRedemption(formData: FormData) {
  const redemptionId = String(formData.get("redemptionId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(redemptionId)) return;
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("cancel_own_point_redemption", { p_redemption_id: redemptionId });
  if (!error) revalidatePath("/canjes");
}
