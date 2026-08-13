import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { RedemptionForm } from "./redemption-form";

export const dynamic = "force-dynamic";
export default async function RedemptionsPage() {
  const supabase=await createServerSupabaseClient(); const {data}=await supabase.auth.getClaims(); const profileId=data?.claims?.sub; if(!profileId) redirect("/ingresar");
  const admin=createAdminSupabaseClient();
  const [pointsResult,rewardsResult,settingsResult]=await Promise.all([admin.from("points_ledger").select("amount").eq("profile_id",profileId),admin.from("reward_catalog").select("id,name,description,points_cost").eq("active",true).order("display_order"),admin.rpc("get_reward_settings")]);
  const balance=(pointsResult.data??[]).reduce((sum,row)=>sum+Number(row.amount),0); const settings=(settingsResult.data??{}) as Record<string,number>;
  return <main className="profile-shell"><header className="topbar"><Link className="brand" href="/">SUPER<span className="brand-dot">.</span><span className="brand-ar">AR</span><small>CLUB</small></Link><Link className="profile-back" href="/perfil">← Mi perfil</Link></header><section className="profile-heading"><p className="eyebrow cyan">BENEFICIOS</p><h1>Canjear puntos</h1><p>Tenés <strong>{balance} SUPER Puntos</strong>.</p></section><section className="profile-panel"><RedemptionForm balance={balance} minimum={Number(settings.minimum_redemption_points??10)} arsPerPoint={Number(settings.ars_per_point??100)} rewards={rewardsResult.data??[]}/></section></main>;
}
