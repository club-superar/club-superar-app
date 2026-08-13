Exit code: 0
Wall time: 0.4 seconds
Output:
"use client";

import { useActionState, useState } from "react";
import { createRedemption, type RedemptionState } from "./actions";

const initial: RedemptionState = {};
export function RedemptionForm({ balance, minimum, arsPerPoint, rewards }: { balance: number; minimum: number; arsPerPoint: number; rewards: Array<{ id: number; name: string; description: string; points_cost: number }> }) {
  const [state, action, pending] = useActionState(createRedemption, initial);
  const [mode, setMode] = useState<"free" | "reward">("free");
  const [points, setPoints] = useState(minimum);
  if (state.redemption) return <section className="redemption-ticket"><p className="eyebrow cyan">MOSTRÃ ESTO EN CAJA</p><h2>{state.redemption.reward_name}</h2><code>{state.redemption.code}</code><strong>{state.redemption.points} puntos Â· ${Number(state.redemption.ars_value).toLocaleString("es-AR")}</strong><p>Vence a las {new Intl.DateTimeFormat("es-AR",{hour:"2-digit",minute:"2-digit"}).format(new Date(state.redemption.expires_at))}. Los puntos se descuentan solamente cuando la caja confirma.</p></section>;
  return <form action={action} className="redemption-form">
    <div className="redemption-tabs"><button type="button" className={mode==="free"?"active":""} onClick={()=>setMode("free")}>Elegir monto</button><button type="button" className={mode==="reward"?"active":""} onClick={()=>setMode("reward")}>Productos</button></div>
    {mode === "free" ? <label>Puntos a canjear<input name="points" type="number" min={minimum} max={balance} value={points} onChange={(e)=>setPoints(Number(e.target.value))} required /><small>Equivale a ${(points*arsPerPoint).toLocaleString("es-AR")} para usar en el local.</small></label> : <div className="reward-options">{rewards.length===0?<p>TodavÃ­a no hay productos publicados.</p>:rewards.map((reward)=><label key={reward.id}><input type="radio" name="rewardId" value={reward.id} required={mode==="reward"}/><span><strong>{reward.name}</strong><small>{reward.description}</small></span><b>{reward.points_cost} pts</b></label>)}</div>}
    {mode === "reward" && <input type="hidden" name="points" value="0"/>}<button className="button primary" disabled={pending||balance<minimum}>{pending?"Generandoâ€¦":"Generar cÃ³digo"}</button>{state.error&&<p className="form-error">{state.error}</p>}
  </form>;
}

