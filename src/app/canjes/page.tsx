import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { RedemptionForm } from "./redemption-form";
import { cancelRedemption } from "./actions";

export const dynamic = "force-dynamic";

type RedemptionHistoryItem = {
  id: string;
  reward_name: string;
  points: number;
  ars_value: number;
  code_suffix: string;
  status: "pending" | "confirmed" | "cancelled" | "expired";
  expires_at: string;
  created_at: string;
};

const statusLabels = {
  pending: "Pendiente",
  confirmed: "Canjeado",
  cancelled: "Anulado",
  expired: "Vencido",
} as const;

export default async function RedemptionsPage() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getClaims();
  const profileId = data?.claims?.sub;
  if (!profileId) redirect("/ingresar");

  const admin = createAdminSupabaseClient();
  const [pointsResult, rewardsResult, settingsResult, historyResult, accessResult] = await Promise.all([
    admin.from("points_ledger").select("amount").eq("profile_id", profileId),
    admin.from("reward_catalog").select("id,name,description,points_cost").eq("active", true).gt("stock_remaining", 0).order("display_order"),
    admin.rpc("get_reward_settings"),
    admin.from("point_redemptions").select("id,reward_name,points,ars_value,code_suffix,status,expires_at,created_at").eq("profile_id", profileId).order("created_at", { ascending: false }).limit(12),
    admin.rpc("can_profile_redeem_points", { p_profile_id: profileId }),
  ]);

  const balance = (pointsResult.data ?? []).reduce((sum, row) => sum + Number(row.amount), 0);
  const settings = (settingsResult.data ?? {}) as Record<string, number>;
  const history = (historyResult.data ?? []) as RedemptionHistoryItem[];
  const canRedeem = accessResult.data === true;

  return (
    <main className="profile-shell">
      <header className="topbar">
        <Link className="brand" href="/">SUPER<span className="brand-dot">.</span><span className="brand-ar">AR</span><small>CLUB</small></Link>
        <Link className="profile-back" href="/perfil">← Mi perfil</Link>
      </header>

      <section className="profile-heading">
        <p className="eyebrow cyan">BENEFICIOS</p>
        <h1>Canjear puntos</h1>
        <p>Tenés <strong>{balance} SUPER Puntos</strong>.</p>
      </section>

      <section className="profile-panel">
        {canRedeem ? (
          <RedemptionForm
            balance={balance}
            minimum={Number(settings.minimum_redemption_points ?? 10)}
            arsPerPoint={Number(settings.ars_per_point ?? 100)}
            rewards={rewardsResult.data ?? []}
          />
        ) : (
          <div className="redemption-locked" role="status">
            <span>🔒</span>
            <h2>Canjes bloqueados</h2>
            <p>Completá tu participación en el sorteo actual para habilitar las misiones y usar todos tus SUPER Puntos.</p>
            <Link className="button primary" href="/">Ir al sorteo actual</Link>
          </div>
        )}
      </section>

      <section className="profile-panel redemption-history">
        <div><p className="eyebrow cyan">MIS MOVIMIENTOS</p><h2>Historial de canjes</h2></div>
        {history.length === 0 ? (
          <p className="redemption-history-empty">Todavía no generaste ningún canje.</p>
        ) : (
          <div className="redemption-history-list">
            {history.map((item) => (
              <article key={item.id}>
                <div>
                  <strong>{item.reward_name}</strong>
                  <small>{item.points} puntos · ${Number(item.ars_value).toLocaleString("es-AR")} · ••••{item.code_suffix}</small>
                </div>
                <div className="redemption-history-status">
                  <b className={`redemption-status ${item.status}`}>{statusLabels[item.status]}</b>
                  {item.status === "pending" && new Date(item.expires_at) > new Date() ? (
                    <form action={cancelRedemption}>
                      <input type="hidden" name="redemptionId" value={item.id} />
                      <button>Anular</button>
                    </form>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
