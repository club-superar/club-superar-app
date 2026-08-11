"use client";

import { useActionState, useEffect, useState } from "react";
import { setAdminPassword, type AdminActionState } from "@/app/admin/actions";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const initialState: AdminActionState = {};

export function AdminPasswordForm() {
  const [state, action, pending] = useActionState(setAdminPassword, initialState);
  const [linkReady, setLinkReady] = useState(false);
  const [linkError, setLinkError] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    if (!accessToken || !refreshToken) {
      queueMicrotask(() => setLinkError(true));
      return;
    }

    const supabase = createBrowserSupabaseClient();
    supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }).then(({ error }) => {
      if (error) setLinkError(true);
      else {
        window.history.replaceState({}, "", window.location.pathname);
        setLinkReady(true);
      }
    });
  }, []);

  if (linkError) return <p className="form-error">Este enlace no es valido o ya vencio. Solicita una invitacion nueva.</p>;
  if (!linkReady) return <p className="form-success">Comprobando el enlace seguro...</p>;
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
