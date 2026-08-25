"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAdminUserId } from "@/lib/auth/admin";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { readTicketWithGemini } from "@/lib/gemini/ticket-reader";

export type TicketReviewState = { error?: string; success?: string };

export async function extractPendingTicket(formData: FormData) {
  await requireAdminUserId();
  const ticketId = String(formData.get("ticketId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(ticketId)) return;
  const admin = createAdminSupabaseClient();
  const { data: ticket } = await admin.from("purchase_tickets").select("storage_path,status").eq("id", ticketId).maybeSingle();
  if (!ticket?.storage_path || ticket.status !== "pending") return;
  const { data: image } = await admin.storage.from("ticket-temp").download(ticket.storage_path);
  if (!image) return;
  const bytes = Buffer.from(await image.arrayBuffer());
  const extracted = await readTicketWithGemini(bytes, image.type || "image/jpeg");
  await admin.from("purchase_tickets").update({
    issuer_cuit: extracted.issuerCuit,
    receipt_type: extracted.receiptType,
    point_of_sale: extracted.pointOfSale,
    receipt_number: extracted.receiptNumber,
    issued_on: extracted.issuedOn,
    total_amount: extracted.totalAmount,
    cae: extracted.cae,
    cae_expires_on: extracted.caeExpiresOn,
    updated_at: new Date().toISOString(),
  }).eq("id", ticketId).eq("status", "pending");
  revalidatePath("/admin/tickets");
}

export async function reviewTicket(_: TicketReviewState, formData: FormData): Promise<TicketReviewState> {
  const actorId = await requireAdminUserId();
  const ticketId = String(formData.get("ticketId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const rejectionReason = String(formData.get("rejectionReason") ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(ticketId) || !new Set(["approved", "rejected"]).has(decision)) return { error: "Revisión inválida." };

  const values = {
    cuit: String(formData.get("cuit") ?? "").replace(/\D/g, ""),
    pointOfSale: String(formData.get("pointOfSale") ?? "").replace(/\D/g, ""),
    receiptNumber: String(formData.get("receiptNumber") ?? "").replace(/\D/g, ""),
    issuedOn: String(formData.get("issuedOn") ?? ""),
    totalAmount: Number(formData.get("totalAmount")),
    cae: String(formData.get("cae") ?? "").replace(/\D/g, ""),
    caeExpiresOn: String(formData.get("caeExpiresOn") ?? ""),
  };
  if (decision === "approved" && (values.cuit.length !== 11 || values.pointOfSale.length < 1 || values.receiptNumber.length < 1
    || !/^\d{4}-\d{2}-\d{2}$/.test(values.issuedOn) || !Number.isFinite(values.totalAmount) || values.totalAmount <= 0
    || values.cae.length !== 14 || !/^\d{4}-\d{2}-\d{2}$/.test(values.caeExpiresOn))) {
    return { error: "Para aprobar, completá CUIT, factura, fechas, importe y CAE de 14 dígitos." };
  }
  if (decision === "rejected" && rejectionReason.length < 3) return { error: "Escribí el motivo del rechazo." };

  const canonical = [values.cuit, "FACTURA_B", values.pointOfSale.padStart(5,"0"), values.receiptNumber.padStart(8,"0"), values.issuedOn, values.totalAmount.toFixed(2), values.cae].join("|");
  const fingerprint = createHash("sha256").update(canonical).digest("hex");
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc("admin_review_purchase_ticket", {
    p_actor_id: actorId, p_ticket_id: ticketId, p_decision: decision, p_rejection_reason: rejectionReason || null,
    p_issuer_cuit: values.cuit || null, p_receipt_type: "Factura B", p_point_of_sale: values.pointOfSale || null,
    p_receipt_number: values.receiptNumber || null, p_issued_on: values.issuedOn || null,
    p_total_amount: decision === "approved" ? values.totalAmount : null, p_cae: values.cae || null,
    p_cae_expires_on: values.caeExpiresOn || null, p_fiscal_fingerprint: decision === "approved" ? fingerprint : null,
  });
  if (error?.message.includes("TICKET_ALREADY_REVIEWED")) return { error: "Este ticket ya fue revisado." };
  if (error) return { error: "No pudimos guardar la revisión." };
  const result = data as { status?: string; points?: number; storage_path?: string; profile_id?: string } | null;
  if (result?.storage_path) {
    const { error: removeError } = await admin.storage.from("ticket-temp").remove([result.storage_path]);
    if (!removeError) await admin.from("purchase_tickets").update({ storage_path: null }).eq("id", ticketId);
  }
  revalidatePath("/admin/tickets"); revalidatePath("/tickets"); revalidatePath("/perfil"); revalidatePath("/");
  return result?.status === "duplicate" ? { success: "Duplicado detectado. No se acreditaron puntos." }
    : decision === "approved" ? { success: `Ticket aprobado: +${result?.points ?? 0} SUPER Puntos.` } : { success: "Ticket rechazado y foto eliminada." };
}
