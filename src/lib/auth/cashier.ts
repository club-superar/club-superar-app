import "server-only";
import { redirect } from "next/navigation";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createCashierSessionSupabaseClient } from "@/lib/supabase/server";

export async function getCashierUserId() {
  const session=await createCashierSessionSupabaseClient(); const {data,error}=await session.auth.getUser();
  if(error||!data.user) return null;
  const {data:allowed}=await createAdminSupabaseClient().rpc("is_cashier",{p_user_id:data.user.id});
  return allowed?data.user.id:null;
}
export async function requireCashierUserId(){const id=await getCashierUserId();if(!id)redirect("/caja/ingresar");return id;}
