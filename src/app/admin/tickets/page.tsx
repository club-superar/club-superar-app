import Link from "next/link";
import { requireAdminUserId } from "@/lib/auth/admin";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { TicketReviewForm } from "./review-form";

export const dynamic="force-dynamic";
export default async function AdminTicketsPage(){
  await requireAdminUserId(); const admin=createAdminSupabaseClient();
  const {data}=await admin.from("purchase_tickets").select("id,storage_path,created_at,profiles!inner(instagram_username)").eq("status","pending").order("created_at");
  const tickets=await Promise.all((data??[]).map(async item=>({ ...item, username:(Array.isArray(item.profiles)?item.profiles[0]:item.profiles)?.instagram_username??"usuario", imageUrl:item.storage_path?(await admin.storage.from("ticket-temp").createSignedUrl(item.storage_path,300)).data?.signedUrl:null })));
  return <main className="admin-shell"><header className="admin-topbar"><Link className="brand" href="/admin">SUPER<span className="brand-dot">.</span><span className="brand-ar">AR</span><small>ADMIN</small></Link><Link href="/admin">← Panel</Link></header>
    <section className="admin-heading"><p className="eyebrow cyan">COMPRAS</p><h1>Tickets pendientes</h1><p>Revisá los datos antes de acreditar puntos. La imagen se elimina al terminar.</p></section>
    {tickets.length===0&&<section className="admin-panel"><p className="admin-empty">No hay tickets pendientes.</p></section>}
    <div className="admin-ticket-list">{tickets.map(ticket=><article className="admin-panel" key={ticket.id}><h2>@{ticket.username}</h2><small>Enviado {new Date(ticket.created_at).toLocaleString("es-AR")}</small>{ticket.imageUrl?<img src={ticket.imageUrl} alt={`Ticket enviado por @${ticket.username}`}/>:<p>No se pudo abrir la imagen.</p>}<TicketReviewForm ticketId={ticket.id}/></article>)}</div>
  </main>;
}
