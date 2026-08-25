"use client";

import { useActionState } from "react";
import { submitTicket, type TicketActionState } from "./actions";

const initialState: TicketActionState = {};

export function TicketForm() {
  const [state, action, pending] = useActionState(submitTicket, initialState);
  return <form action={action} className="ticket-upload-form">
    <label htmlFor="ticket-photo">Foto completa de tu Factura B</label>
    <input id="ticket-photo" name="ticket" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" required />
    <small>Que se vean el CUIT, número, fecha, importe y CAE. Máximo 6 MB.</small>
    {state.error && <p className="form-message error" role="alert">{state.error}</p>}
    {state.success && <p className="form-message success" role="status">{state.success}</p>}
    <button className="button primary" disabled={pending}>{pending ? "Enviando…" : "Enviar ticket"}</button>
  </form>;
}
