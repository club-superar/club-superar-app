Exit code: 0
Wall time: 0.4 seconds
Output:
import Link from "next/link";
import { requireAdminUserId } from "@/lib/auth/admin";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { toggleReward } from "../actions";
import { ConfirmRedemptionForm, RewardForm, RewardSettingsForm } from "./forms";
export const dynamic = "force-dynamic";
type RecentRedemption={id:string;reward_name:string;points:number;status:string;code_suffix:string;profiles:{instagram_username:string}};
export default async function AdminRedemptions() {
  await requireAdminUserId(); const admin=createAdminSupabaseClient();
  const [settingsResult,rewardsResult,recentResult]=await Promise.all([admin.rpc("get_reward_settings"),admin.from("reward_catalog").select("*").order("display_order"),admin.from("point_redemptions").select("id,reward_name,points,status,code_suffix,created_at,profiles!inner(instagram_username)").order("created_at",{ascending:false}).limit(20)]);
  const settings=(settingsResult.data??{}) as Record<string,number>; const recent=(recentResult.data??[]) as unknown as RecentRedemption[];
  return <main className="admin-shell"><header className="admin-topbar"><Link className="brand" href="/admin">SUPER<span className="brand-dot">.</span><span className="brand-ar">AR</span><small>ADMIN</small></Link><Link href="/admin">â† Sorteos</Link></header><section className="admin-heading"><p className="eyebrow cyan">SUPER PUNTOS</p><h1>Canjes</h1><p>ConfigurÃ¡ el valor, publicÃ¡ opciones y validÃ¡ cÃ³digos en caja.</p></section><section className="admin-panel"><h2>Validar en caja</h2><ConfirmRedemptionForm /></section><section className="admin-panel"><h2>ConfiguraciÃ³n</h2><RewardSettingsForm settings={settings}/></section><section className="admin-panel"><h2>CatÃ¡logo</h2><RewardForm/><div className="reward-admin-list">{(rewardsResult.data??[]).map(reward=><article key={reward.id}><div><strong>{reward.name}</strong><small>{reward.points_cost} puntos Â· {reward.active?"Publicado":"Oculto"}</small></div><form action={toggleReward}><input type="hidden" name="id" value={reward.id}/><input type="hidden" name="active" value={String(!reward.active)}/><button>{reward.active?"Ocultar":"Publicar"}</button></form></article>)}</div></section><section className="admin-panel"><h2>Ãšltimos canjes</h2><div className="reward-admin-list">{recent.map(item=><article key={item.id}><div><strong>@{item.profiles.instagram_username} Â· {item.reward_name}</strong><small>â€¢â€¢â€¢â€¢{item.code_suffix} Â· {item.points} puntos</small></div><b>{item.status}</b></article>)}</div></section></main>;
}

