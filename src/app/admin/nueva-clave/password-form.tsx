"use client";

import { useActionState } from "react";
import { setAdminPassword, type AdminActionState } from "@/app/admin/actions";

const initialState: AdminActionState = {};

export function AdminPasswordForm() {
  const [state, action, pending] = useActionState(setAdminPassword, initialState);
  return (
    <form action={action} className="admin-form">
      <label htmlFor="new-password">Nueva contrasena</label>
      <input className="text-input" id="new-password" name="password" type="password" autoComplete="new-password" minLength={12} required />
      <label htmlFor="repeat-password">Repetir contrasena</label>
      <input className="text-input" id="repeat-password" name="repeatPassword" type="password" autoComplete="new-password" minLength={12} required />
      <small>Usa al menos 12 caracteres y una clave distinta de tus otras cuentas.</small>
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <button className="button primary" disabled={pending}>{pending ? "Guardando..." : "Guardar contrasena"}</button>
    </form>
  );
}
