Exit code: 0
Wall time: 0.4 seconds
Output:
"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export type RedemptionState = { error?: string; redemption?: { code: string; points: number; ars_value: number; reward_name: string; expires_at: string } };

export async function createRedemption(_: RedemptionState, formData: FormData): Promise<RedemptionState> {
  const supabase = await createServerSupabaseClient();
  const { data, error: claimsError } = await supabase.auth.getClaims();
  const profileId = data?.claims?.sub;
  if (claimsError || !profileId) return { error: "Tu sesiÃ³n venciÃ³. VolvÃ© a ingresar." };
  const rewardText = String(formData.get("rewardId") ?? "");
  const rewardId = rewardText ? Number(rewardText) : null;
  const points = Number(formData.get("points") ?? 0);
  if ((rewardId !== null && (!Number.isSafeInteger(rewardId) || rewardId <= 0)) || !Number.isInteger(points) || points < 0) return { error: "RevisÃ¡ el canje elegido." };
  const admin = createAdminSupabaseClient();
  const { data: created, error } = await admin.rpc("create_point_redemption", { p_profile_id: profileId, p_reward_id: rewardId, p_points: points });
  if (error?.message.includes("INSUFFICIENT_POINTS")) return { error: "No tenÃ©s suficientes SUPER Puntos disponibles." };
  if (error?.message.includes("MINIMUM_POINTS")) return { error: "La cantidad estÃ¡ por debajo del mÃ­nimo permitido." };
  if (error) return { error: "No pudimos generar el canje. IntentÃ¡ nuevamente." };
  return { redemption: created as RedemptionState["redemption"] };
}

