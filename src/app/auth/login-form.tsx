"use client";

import { useActionState } from "react";
import { loginParticipant, type AuthState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginParticipant, {} as AuthState);
  return (
    <form action={action} className="auth-card">
      <p className="eyebrow cyan">YA SOY MIEMBRO</p>
      <h1>Volvé a entrar</h1>
      <p>Usá tu usuario actual o uno anterior, junto con el código que guardaste al registrarte.</p>
      <label htmlFor="instagram">Usuario de Instagram</label>
      <div className="input-prefix"><span>@</span><input id="instagram" name="instagram" autoCapitalize="none" autoCorrect="off" placeholder="tu.usuario" required /></div>
      <label htmlFor="recoveryCode">Código de recuperación</label>
      <input className="text-input code-input" id="recoveryCode" name="recoveryCode" autoCapitalize="characters" autoCorrect="off" placeholder="SUPER-XXXXX-XXXXX" required />
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <button className="button primary" disabled={pending}>{pending ? "Ingresando..." : "Ingresar"}</button>
      <a className="text-link" href="/registro">Crear una cuenta</a>
    </form>
  );
}
