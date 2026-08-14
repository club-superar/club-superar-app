"use client";

import { useActionState } from "react";
import { updateClubFeatures, type AdminActionState } from "./actions";

export function LaunchSettingsForm({ helpInstagramUrl, redemptionsEnabled }: { helpInstagramUrl: string; redemptionsEnabled: boolean }) {
  const [state, action, pending] = useActionState(updateClubFeatures, {} as AdminActionState);
  return <form action={action} className="branding-admin-form">
    <label>Instagram oficial para ayuda y recuperación<input name="helpInstagramUrl" type="url" defaultValue={helpInstagramUrl} placeholder="https://www.instagram.com/usuario/" required /></label>
    <small>“Olvidé mi código” y los enlaces de ayuda abrirán este perfil.</small>
    <label className="feature-toggle"><input name="redemptionsEnabled" type="checkbox" value="true" defaultChecked={redemptionsEnabled} /><span><strong>Habilitar sistema de canjes</strong><small>Mientras esté apagado, los puntos se acumulan y la gente verá “Próximamente”.</small></span></label>
    {state.error && <p className="form-error" role="alert">{state.error}</p>}
    {state.success && <p className="form-success" role="status">{state.success}</p>}
    <button className="button primary" disabled={pending}>{pending ? "Guardando..." : "Guardar lanzamiento y ayuda"}</button>
  </form>;
}
