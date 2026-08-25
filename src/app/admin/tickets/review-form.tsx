"use client";
import { useActionState } from "react";
import { reviewTicket, type TicketReviewState } from "./actions";

type InitialValues = { cuit?:string|null; pointOfSale?:string|null; receiptNumber?:string|null; issuedOn?:string|null; totalAmount?:number|null; cae?:string|null; caeExpiresOn?:string|null };

export function TicketReviewForm({ ticketId, initialValues = {} }:{ ticketId:string; initialValues?:InitialValues }) {
  const [state, action, pending] = useActionState<TicketReviewState,FormData>(reviewTicket,{});
  return <form action={action} className="ticket-review-form"><input type="hidden" name="ticketId" value={ticketId}/>
    <div className="ticket-fields"><label>CUIT<input name="cuit" inputMode="numeric" placeholder="11 dígitos" defaultValue={initialValues.cuit??""}/></label><label>Punto de venta<input name="pointOfSale" inputMode="numeric" defaultValue={initialValues.pointOfSale??""}/></label><label>Número de factura<input name="receiptNumber" inputMode="numeric" defaultValue={initialValues.receiptNumber??""}/></label><label>Fecha<input name="issuedOn" type="date" defaultValue={initialValues.issuedOn??""}/></label><label>Importe total<input name="totalAmount" type="number" inputMode="decimal" min="0.01" step="0.01" defaultValue={initialValues.totalAmount??""}/></label><label>CAE<input name="cae" inputMode="numeric" placeholder="14 dígitos" defaultValue={initialValues.cae??""}/></label><label>Vencimiento CAE<input name="caeExpiresOn" type="date" defaultValue={initialValues.caeExpiresOn??""}/></label></div>
    <button className="button primary" name="decision" value="approved" disabled={pending}>Aprobar y acreditar</button>
    <label>Motivo si se rechaza<input name="rejectionReason" placeholder="Ej.: no es Factura B"/></label>
    <button className="button secondary" name="decision" value="rejected" disabled={pending}>Rechazar ticket</button>
    {state.error&&<p className="form-message error">{state.error}</p>}{state.success&&<p className="form-message success">{state.success}</p>}
  </form>;
}
