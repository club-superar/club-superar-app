import "server-only";

import { redirect } from "next/navigation";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createAdminSessionSupabaseClient } from "@/lib/supabase/server";

export async function getAdminUserId() {
  const supabase = await createAdminSessionSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (error || !userId) return null;

  const admin = createAdminSupabaseClient();
  const { data: allowed, error: roleError } = await admin.rpc("is_phase1_admin", {
    p_user_id: userId,
  });
  if (roleError || !allowed) return null;
  return userId;
}

export async function requireAdminUserId() {
  const userId = await getAdminUserId();
  if (!userId) redirect("/admin/ingresar");
  return userId;
}
