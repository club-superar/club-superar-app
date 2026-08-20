"use client";

import { useActionState } from "react";
import { loginParticipant, type AuthState } from "./actions";

export function LoginForm({ instagramUrl }: { instagramUrl: string }) {
  const [state, action, pending] = useActionState(loginParticipant, {} as AuthState);
  return (
    <form action={action} className="auth-card">
      <p className="eyebrow cyan">YA SOY MIEMBRO</p>
      <h1>Volvé a entrar</h1>
      <p>Usá tu usuario actual o uno anterior, junto con el código que guardaste al registrarte.</p>
      <label htmlFor="instagram">Usuario de Instagram</label>
      <div className="input-prefix"><span>@</span><input id="instagram" name="instagram" autoComplete="username" autoCapitalize="none" autoCorrect="off" placeholder="tu.usuario" required /></div>
      <label htmlFor="recoveryCode">Código de recuperación</label>
      <input className="text-input code-input" id="recoveryCode" name="recoveryCode" autoComplete="current-password" autoCapitalize="characters" autoCorrect="off" placeholder="SUPER-XXXXX-XXXXX" required />
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <button className="button primary" disabled={pending}>{pending ? "Ingresando..." : "Ingresar"}</button>
      <details className="recovery-help">
        <summary>Olvidé mi código de recuperación</summary>
        <p>Solicitá un código nuevo a Autoservicio SUPER.AR. Por seguridad, solamente el administrador puede regenerarlo.</p>
        <a className="text-link" href={instagramUrl} target="_blank" rel="noreferrer">Escribir por Instagram</a>
      </details>
      <a className="text-link" href="/registro">Crear una cuenta</a>
    </form>
  );
}
