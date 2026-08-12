"use client";

import { useActionState } from "react";
import { loginAdmin, type AdminActionState } from "@/app/admin/actions";

export function AdminLoginForm() {
  const initialState: AdminActionState = {};
  const [state, action, pending] = useActionState(loginAdmin, initialState);

  return (
    <form action={action} className="admin-form">
      <label htmlFor="admin-email">Correo oficial</label>
      <input
        className="text-input"
        id="admin-email"
        name="email"
        type="email"
        autoComplete="email"
        value="suupeer.ar@gmail.com"
        readOnly
        required
      />
      <label htmlFor="admin-password">Contrasena</label>
      <input className="text-input" id="admin-password" name="password" type="password" autoComplete="current-password" minLength={8} required />
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <button className="button primary" disabled={pending}>{pending ? "Ingresando..." : "Entrar al panel"}</button>
    </form>
  );
}
