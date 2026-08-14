"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { getPublicSupabaseEnv } from "@/lib/supabase/env";

export function AdminPasswordForm() {
  const accessTokenRef = useRef("");
  const initializedRef = useRef(false);
  const [linkReady, setLinkReady] = useState(false);
  const [linkError, setLinkError] = useState(false);
  const [formError, setFormError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    const params = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = params.get("access_token");
    if (!accessToken) {
      queueMicrotask(() => setLinkError(true));
      return;
    }
    accessTokenRef.current = accessToken;
    window.history.replaceState({}, "", window.location.pathname);
    queueMicrotask(() => setLinkReady(true));
  }, []);

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") ?? "");
    const repeatPassword = String(formData.get("repeatPassword") ?? "");
    if (password.length < 12) {
      setFormError("La contrasena debe tener al menos 12 caracteres.");
      return;
    }
    if (password !== repeatPassword) {
      setFormError("Las dos contrasenas no coinciden.");
      return;
    }

    setPending(true);
    try {
      const { url, publishableKey } = getPublicSupabaseEnv();
      const response = await fetch(`${url}/auth/v1/user`, {
        method: "PUT",
        headers: {
          apikey: publishableKey,
          authorization: `Bearer ${accessTokenRef.current}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        setFormError("No pudimos guardar la contrasena. Proba con otra mas segura.");
        return;
      }
      window.location.replace("/admin/ingresar?password=created");
    } catch {
      setFormError("No pudimos guardar la contrasena. Proba con otra mas segura.");
    } finally {
      setPending(false);
    }
  }

  if (linkError) return <p className="form-error">Este enlace no es valido o ya vencio. Solicita uno nuevo.</p>;
  if (!linkReady) return <p className="form-success">Comprobando el enlace seguro...</p>;
  return (
    <form onSubmit={savePassword} className="admin-form">
      <label htmlFor="new-password">Nueva contrasena</label>
      <input className="text-input" id="new-password" name="password" type="password" autoComplete="new-password" minLength={12} required />
      <label htmlFor="repeat-password">Repetir contrasena</label>
      <input className="text-input" id="repeat-password" name="repeatPassword" type="password" autoComplete="new-password" minLength={12} required />
      <small>Usa al menos 12 caracteres y una clave distinta de tus otras cuentas.</small>
      {formError && <p className="form-error" role="alert">{formError}</p>}
      <button className="button primary">{pending ? "Reintentar guardado" : "Guardar contrasena"}</button>
    </form>
  );
}
