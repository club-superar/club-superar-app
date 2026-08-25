"use client";
import { useActionState } from "react";
import { reviewTicket, type TicketReviewState } from "./actions";

export function TicketReviewForm({ ticketId }:{ ticketId:string }) {
  const [state, action, pending] = useActionState<TicketReviewState,FormData>(reviewTicket,{});
  return <form action={action} className="ticket-review-form"><input type="hidden" name="ticketId" value={ticketId}/>
    <div className="ticket-fields"><label>CUIT<input name="cuit" inputMode="numeric" placeholder="11 dígitos"/></label><label>Punto de venta<input name="pointOfSale" inputMode="numeric"/></label><label>Número de factura<input name="receiptNumber" inputMode="numeric"/></label><label>Fecha<input name="issuedOn" type="date"/></label><label>Importe total<input name="totalAmount" type="number" inputMode="decimal" min="0.01" step="0.01"/></label><label>CAE<input name="cae" inputMode="numeric" placeholder="14 dígitos"/></label><label>Vencimiento CAE<input name="caeExpiresOn" type="date"/></label></div>
    <button className="button primary" name="decision" value="approved" disabled={pending}>Aprobar y acreditar</button>
    <label>Motivo si se rechaza<input name="rejectionReason" placeholder="Ej.: no es Factura B"/></label>
    <button className="button secondary" name="decision" value="rejected" disabled={pending}>Rechazar ticket</button>
    {state.error&&<p className="form-message error">{state.error}</p>}{state.success&&<p className="form-message success">{state.success}</p>}
  </form>;
}

