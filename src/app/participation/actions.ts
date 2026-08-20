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
export async function startParticipation(formData: FormData): Promise<{ ok: boolean }> {
  const userId = await requireUserId();
  const drawId = Number(formData.get("drawId"));
  if (!Number.isSafeInteger(drawId) || drawId <= 0) return { ok: false };

  const admin = createAdminSupabaseClient();
  const { error } = await admin.rpc("start_draw_participation", {
    p_user_id: userId,
    p_draw_id: drawId,
  });
  if (error) {
    console.error("[participation:start] Supabase rejected participation", {
      drawId,
      code: error.code,
      message: error.message,
    });
    return { ok: false };
  }
  revalidatePath("/");
  return { ok: true };
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
  if (error) {
    if (error.message.includes("AUTOMATIC_VERIFICATION_REQUIRED")) {
      throw new Error("Este paso se confirma automaticamente desde Instagram.");
    }
    throw new Error("No pudimos guardar este paso.");
  }
  revalidatePath("/");
  revalidatePath("/perfil");
}
