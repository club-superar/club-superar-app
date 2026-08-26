import Link from "next/link";
import { requireAdminUserId } from "@/lib/auth/admin";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { TicketReviewForm } from "./review-form";
import { extractPendingTicket } from "./actions";

export const dynamic="force-dynamic";
export default async function AdminTicketsPage(){
  await requireAdminUserId(); const admin=createAdminSupabaseClient();
  const [{data},{data:reviewedData}]=await Promise.all([
    admin.from("purchase_tickets").select("id,storage_path,created_at,issuer_cuit,receipt_type,point_of_sale,receipt_number,issued_on,total_amount,cae,cae_expires_on,profiles!inner(instagram_username)").eq("status","pending").order("created_at"),
    admin.from("purchase_tickets").select("id,status,created_at,reviewed_at,total_amount,points_awarded,rejection_reason,profiles!inner(instagram_username)").neq("status","pending").order("reviewed_at",{ascending:false}).limit(100),
  ]);
  const tickets=await Promise.all((data??[]).map(async item=>({ ...item, username:(Array.isArray(item.profiles)?item.profiles[0]:item.profiles)?.instagram_username??"usuario", imageUrl:item.storage_path?(await admin.storage.from("ticket-temp").createSignedUrl(item.storage_path,300)).data?.signedUrl:null })));
  const reviewed=(reviewedData??[]).map(item=>({...item,username:(Array.isArray(item.profiles)?item.profiles[0]:item.profiles)?.instagram_username??"usuario"}));
  const statusLabels:Record<string,string>={approved:"Validado",duplicate:"Duplicado",rejected:"Rechazado"};
  return <main className="admin-shell"><header className="admin-topbar"><Link className="brand" href="/admin">SUPER<span className="brand-dot">.</span><span className="brand-ar">AR</span><small>ADMIN</small></Link><Link href="/admin">← Panel</Link></header>
    <section className="admin-heading"><p className="eyebrow cyan">COMPRAS</p><h1>Tickets pendientes</h1><p>Revisá los datos antes de acreditar puntos. La imagen se elimina al terminar.</p></section>
    {tickets.length===0&&<section className="admin-panel"><p className="admin-empty">No hay tickets pendientes.</p></section>}
    <div className="admin-ticket-list">{tickets.map(ticket=><article className="admin-panel" key={ticket.id}><h2>@{ticket.username}</h2><small>Enviado {new Date(ticket.created_at).toLocaleString("es-AR")}</small>{ticket.imageUrl?<img src={ticket.imageUrl} alt={`Ticket enviado por @${ticket.username}`}/>:<p>No se pudo abrir la imagen.</p>}<form action={extractPendingTicket}><input type="hidden" name="ticketId" value={ticket.id}/><button className="button secondary" type="submit">Leer foto automáticamente</button></form><TicketReviewForm ticketId={ticket.id} initialValues={{cuit:ticket.issuer_cuit,pointOfSale:ticket.point_of_sale,receiptNumber:ticket.receipt_number,issuedOn:ticket.issued_on,totalAmount:ticket.total_amount,cae:ticket.cae,caeExpiresOn:ticket.cae_expires_on}}/></article>)}</div>
    <section className="admin-panel admin-ticket-history-panel"><div className="admin-panel-title"><h2>Historial de tickets</h2><small>ÚLTIMOS {reviewed.length}</small></div>
      {reviewed.length===0?<p className="admin-empty">Todavía no hay tickets revisados.</p>:<div className="admin-ticket-history">{reviewed.map(ticket=><article key={ticket.id}><div><strong>@{ticket.username}</strong><small>{new Date(ticket.reviewed_at??ticket.created_at).toLocaleString("es-AR")}{ticket.total_amount?` · $${Number(ticket.total_amount).toLocaleString("es-AR")}`:""}</small><span>{ticket.rejection_reason??(ticket.status==="approved"?"Comprobante aprobado":"Sin observaciones")}</span></div><div><b className={`ticket-status-${ticket.status}`}>{statusLabels[ticket.status]??ticket.status}</b><small>{ticket.status==="approved"?`+${ticket.points_awarded} puntos`:"0 puntos"}</small></div></article>)}</div>}
    </section>
  </main>;
}

