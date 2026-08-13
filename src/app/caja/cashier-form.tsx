"use client";
import { useActionState, useState } from "react";
import { confirmCashierRedemption, lookupCashierRedemption, type CashierState } from "./actions";
import { CashierQrScanner } from "./qr-scanner";

export function CashierForm({ defaultCode }: { defaultCode: string }) {
  const [code, setCode] = useState(defaultCode);
  const [lookup, lookupAction, looking] = useActionState(lookupCashierRedemption, {} as CashierState);
  const [confirmed, confirmAction, confirming] = useActionState(confirmCashierRedemption, {} as CashierState);
  return <div className="cashier-flow">
    <CashierQrScanner onCode={setCode} />
    <div className="cashier-divider"><span>o escribí el código</span></div>
    <form action={lookupAction} className="reward-admin-form">
      <label>Código del cliente<input name="code" value={code} onChange={(event) => setCode(event.target.value.replace(/[^a-f0-9]/gi, "").toUpperCase())} maxLength={8} autoCapitalize="characters" inputMode="text" required /></label>
      {code.length === 8 && <p className="scanner-ready">Código listo. Consultá el canje antes de confirmarlo.</p>}
      <button disabled={looking}>{looking ? "Consultando…" : "Consultar canje"}</button>
      {lookup.error && <p className="form-error">{lookup.error}</p>}
    </form>
    {lookup.preview && <section className="cashier-preview"><p className="eyebrow cyan">REVISÁ ANTES DE CONFIRMAR</p><h2>@{lookup.preview.instagram_username}</h2><strong>{lookup.preview.reward_name}</strong><div><b>{lookup.preview.points} puntos</b><span>${Number(lookup.preview.ars_value).toLocaleString("es-AR")}</span></div><small>Saldo actual: {lookup.preview.balance} puntos</small><form action={confirmAction}><input type="hidden" name="code" value={lookup.preview.code} /><button disabled={confirming}>{confirming ? "Confirmando…" : "Confirmar y descontar"}</button></form></section>}
    {confirmed.success && <p className="cashier-success">✓ {confirmed.success}</p>}
    {confirmed.error && <p className="form-error">{confirmed.error}</p>}
  </div>;
}
