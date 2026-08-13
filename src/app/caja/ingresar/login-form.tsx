"use client";
import { useActionState } from "react";
import { loginCashier, type CashierState } from "../actions";
export function CashierLoginForm({ defaultCode = "" }: { defaultCode?: string }) {
  const [state, action, pending] = useActionState(loginCashier, {} as CashierState);
  return <form action={action} className="admin-form">
    {defaultCode && <input type="hidden" name="code" value={defaultCode} />}
    <label>Correo de Caja</label><input className="text-input" name="email" type="email" autoComplete="username" required />
    <label>Contraseña</label><input className="text-input" name="password" type="password" autoComplete="current-password" required />
    {state.error && <p className="form-error">{state.error}</p>}
    <button className="button primary" disabled={pending}>{pending ? "Ingresando…" : "Entrar a Caja"}</button>
  </form>;
}
