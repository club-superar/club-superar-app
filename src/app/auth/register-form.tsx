"use client";

import { useActionState, useState } from "react";
import { registerParticipant, type AuthState } from "./actions";

const initialState: AuthState = {};

export function RegisterForm() {
  const [state, action, pending] = useActionState(registerParticipant, initialState);
  const [copied, setCopied] = useState(false);

  if (state.recoveryCode) {
    return (
      <section className="auth-card recovery-card" aria-live="polite">
        <span className="success-mark">✓</span>
        <p className="eyebrow cyan">CUENTA CREADA</p>
        <h1>Guardá este código</h1>
        <p>Lo vas a necesitar para entrar desde otro celular. No se lo compartas a nadie.</p>
        <strong className="recovery-code">{state.recoveryCode}</strong>
        <button className="button secondary" type="button" onClick={async () => {
          await navigator.clipboard.writeText(state.recoveryCode ?? "");
          setCopied(true);
        }}>{copied ? "Copiado" : "Copiar código"}</button>
        <a className="button primary" href="/perfil">Ya lo guardé, continuar</a>
      </section>
    );
  }

  return (
    <form action={action} className="auth-card">
      <p className="eyebrow cyan">NUEVO MIEMBRO</p>
      <h1>Entrá al Club</h1>
      <p>Usamos tu usuario de Instagram para identificar tu participación.</p>
      <label htmlFor="instagram">Tu usuario de Instagram</label>
      <div className="input-prefix"><span>@</span><input id="instagram" name="instagram" autoCapitalize="none" autoCorrect="off" maxLength={31} placeholder="tu.usuario" required /></div>
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <button className="button primary" disabled={pending}>{pending ? "Creando cuenta..." : "Crear mi cuenta"}</button>
      <small>Al continuar aceptás las bases y condiciones del Club SUPER.AR.</small>
      <a className="text-link" href="/ingresar">Ya tengo cuenta</a>
    </form>
  );
}
