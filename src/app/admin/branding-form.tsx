"use client";

import { useActionState } from "react";
import { updatePublicBranding, type AdminActionState } from "./actions";

export function BrandingForm({ creatorText, creatorUrl, visible }: { creatorText: string; creatorUrl: string; visible: boolean }) {
  const [state, action, pending] = useActionState(updatePublicBranding, {} as AdminActionState);
  return (
    <form action={action} className="branding-admin-form">
      <label>Texto visible<input name="creatorText" defaultValue={creatorText} maxLength={80} required /></label>
      <label>Enlace de Instagram<input name="creatorUrl" type="url" defaultValue={creatorUrl} required /></label>
      <label className="branding-visible"><input name="visible" type="checkbox" value="true" defaultChecked={visible} /> Mostrar públicamente</label>
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      {state.success && <p className="form-success" role="status">{state.success}</p>}
      <button className="button primary" disabled={pending}>{pending ? "Guardando..." : "Guardar crédito"}</button>
    </form>
  );
}
