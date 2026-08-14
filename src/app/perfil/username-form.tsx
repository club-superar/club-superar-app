"use client";

import { useActionState } from "react";
import { changeInstagramUsername, type UsernameState } from "./actions";

export function UsernameForm({ currentUsername }: { currentUsername: string }) {
  const [state, action, pending] = useActionState(changeInstagramUsername, {} as UsernameState);
  return (
    <form action={action} className="profile-username-form">
      <div><p className="eyebrow cyan">DATOS DE LA CUENTA</p><h2>Usuario de Instagram</h2><p>Si cambiaste tu nombre en Instagram, actualizalo acá. No perdés puntos, racha ni historial.</p></div>
      <label>Usuario actual<div className="input-prefix"><span>@</span><input name="instagram" autoCapitalize="none" autoCorrect="off" defaultValue={state.username ?? currentUsername} maxLength={30} required /></div></label>
      <small>Podés cambiarlo una vez cada 30 días. Tu nombre anterior seguirá sirviendo para ingresar.</small>
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      {state.success && <p className="form-success" role="status">{state.success}</p>}
      <button className="button secondary" disabled={pending}>{pending ? "Guardando..." : "Actualizar usuario"}</button>
    </form>
  );
}
