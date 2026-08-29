"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import { submitTicket, type TicketActionState } from "./actions";

const initialState: TicketActionState = {};
const MAX_EDGE = 1800;

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No pudimos leer esta imagen."));
    };
    image.src = url;
  });
}

async function prepareTicketPhoto(file: File) {
  const image = await loadImage(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No pudimos preparar la foto.");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
  if (!blob) throw new Error("No pudimos preparar la foto.");
  const baseName = file.name.replace(/\.[^.]+$/, "") || "ticket";
  return new File([blob], baseName + ".jpg", { type: "image/jpeg", lastModified: Date.now() });
}

export function TicketForm() {
  const [state, action, pending] = useActionState(submitTicket, initialState);
  const [preparing, setPreparing] = useState(false);
  const [clientError, setClientError] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!pending) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [pending]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = form.elements.namedItem("ticket") as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) return setClientError("Elegí una foto del ticket.");
    setElapsedSeconds(0);
    setPreparing(true);
    setClientError("");
    try {
      const prepared = await prepareTicketPhoto(file);
      const formData = new FormData(form);
      formData.set("ticket", prepared, prepared.name);
      startTransition(() => action(formData));
    } catch (error) {
      setClientError(error instanceof Error ? error.message : "No pudimos preparar la foto.");
    } finally {
      setPreparing(false);
    }
  }

  const busy = preparing || pending;
  if (state.success) {
    return <div className="ticket-upload-form ticket-upload-complete">
      <p className="form-message success" role="status">{state.success}</p>
      <small>La foto ya fue enviada y quedó pendiente de revisión.</small>
    </div>;
  }

  return <form action={action} className="ticket-upload-form" onSubmit={handleSubmit}>
    <label htmlFor="ticket-photo">Foto completa de tu Factura B</label>
    <input id="ticket-photo" name="ticket" type="file" accept="image/*" capture="environment" required />
    <small>Que se vean el CUIT, número, fecha, importe y CAE. La foto se optimiza automáticamente antes de enviarse.</small>
    {busy && <div className="form-message" role="status" aria-live="polite">
      <strong>{preparing ? "Preparando la foto…" : `Analizando ticket… ${elapsedSeconds} s`}</strong><br/>
      No salgas de esta pantalla. La lectura normalmente puede demorar entre 30 y 75 segundos.
    </div>}
    {!busy && (clientError || state.error) && <p className="form-message error" role="alert">{clientError || state.error}</p>}
    <button className="button primary" disabled={busy}>{preparing ? "Preparando foto…" : pending ? "Analizando ticket…" : "Enviar ticket"}</button>
  </form>;
}
