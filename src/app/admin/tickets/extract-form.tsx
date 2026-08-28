"use client";

import { useActionState } from "react";
import { extractPendingTicket, type TicketExtractionState } from "./actions";

export function TicketExtractForm({ ticketId }: { ticketId: string }) {
  const [state, action, pending] = useActionState<TicketExtractionState, FormData>(extractPendingTicket, {});

  return <form action={action} aria-busy={pending}>
    <input type="hidden" name="ticketId" value={ticketId}/>
    <button className="button secondary" type="submit" disabled={pending}>
      {pending ? "Analizando ticket…" : "Leer foto automáticamente"}
    </button>
    {pending && <p className="form-message">Estamos leyendo la foto. Puede tardar unos segundos.</p>}
    {!pending && state.error && <p className="form-message error" role="alert">{state.error}</p>}
    {!pending && state.success && <p className="form-message success" role="status">{state.success}</p>}
  </form>;
}
