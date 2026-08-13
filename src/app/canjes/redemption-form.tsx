"use client";

import { useActionState, useState } from "react";
import { createRedemption, type RedemptionState } from "./actions";
import { RedemptionStatus } from "./redemption-status";

const initial: RedemptionState = {};

export function RedemptionForm({ balance, minimum, arsPerPoint, rewards }: { balance: number; minimum: number; arsPerPoint: number; rewards: Array<{ id: number; name: string; description: string; points_cost: number }> }) {
  const [state, action, pending] = useActionState(createRedemption, initial);
  const [mode, setMode] = useState<"free" | "reward">("free");
  const [points, setPoints] = useState(minimum);

  if (state.redemption) return <RedemptionStatus id={state.redemption.id} code={state.redemption.code} points={state.redemption.points} arsValue={state.redemption.ars_value} rewardName={state.redemption.reward_name} expiresAt={state.redemption.expires_at}/>;

  return <form action={action} className="redemption-form">
    <div className="redemption-tabs"><button type="button" className={mode==="free"?"active":""} onClick={()=>setMode("free")}>Elegir monto</button><button type="button" className={mode==="reward"?"active":""} onClick={()=>setMode("reward")}>Productos</button></div>
    {mode === "free" ? <label className="redemption-amount-card"><span>Puntos a canjear</span><div className="redemption-amount-input"><input name="points" type="number" inputMode="numeric" min={minimum} max={balance} value={points} onChange={(e)=>setPoints(Number(e.target.value))} required /></div><small><b>{points.toLocaleString("es-AR")} SUPER Puntos</b> equivalen a <strong>${(points*arsPerPoint).toLocaleString("es-AR")}</strong> para usar en el local.</small></label> : <div className="reward-options">{rewards.length===0?<p>Todavía no hay productos publicados.</p>:rewards.map((reward)=><label key={reward.id}><input type="radio" name="rewardId" value={reward.id} required={mode==="reward"}/><span><strong>{reward.name}</strong><small>{reward.description}</small></span><b>{reward.points_cost} pts</b></label>)}</div>}
    {mode === "reward" && <input type="hidden" name="points" value="0"/>}<button className="button primary" disabled={pending||balance<minimum}>{pending?"Generando…":"Generar código"}</button>{state.error&&<p className="form-error">{state.error}</p>}
  </form>;
}
