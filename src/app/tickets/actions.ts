"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { readTicketWithGemini } from "@/lib/gemini/ticket-reader";

export type TicketActionState = { error?: string; success?: string };
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function submitTicket(_: TicketActionState, formData: FormData): Promise<TicketActionState> {
  const supabase = await createServerSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return { error: "Ingresá a tu cuenta para enviar el ticket." };

  const admin = createAdminSupabaseClient();
  const { data: settings } = await admin.rpc("get_club_public_settings");
  if (!(settings as { tickets_enabled?: boolean } | null)?.tickets_enabled) return { error: "El lector de tickets todavía no está habilitado." };
  const file = formData.get("ticket");
  if (!(file instanceof File) || file.size === 0) return { error: "Elegí una foto del ticket." };
  if (!allowedTypes.has(file.type) || file.size > 6 * 1024 * 1024) return { error: "Usá una imagen JPG, PNG o WEBP de hasta 6 MB." };

  const bytes = Buffer.from(await file.arrayBuffer());
  const extracted = await readTicketWithGemini(bytes, file.type);
  const recognizedFields = [extracted.issuerCuit, extracted.pointOfSale, extracted.receiptNumber, extracted.issuedOn, extracted.totalAmount, extracted.cae, extracted.caeExpiresOn].filter(Boolean).length;
  if (recognizedFields === 0) {
    return { error: "No pudimos leer ningún dato. Sacá otra foto completa, derecha, con buena luz y sin reflejos." };
  }
  const imageHash = createHash("sha256").update(bytes).digest("hex");
  const { data: existing } = await admin.from("purchase_tickets").select("id").eq("image_sha256", imageHash).maybeSingle();
  if (existing) return { error: "Este ticket ya fue enviado anteriormente." };

  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const storagePath = `${userId}/${randomUUID()}.${extension}`;
  const { error: uploadError } = await admin.storage.from("ticket-temp").upload(storagePath, bytes, { contentType: file.type, upsert: false });
  if (uploadError) return { error: "No pudimos subir la foto. Intentá nuevamente." };
  const { error: insertError } = await admin.from("purchase_tickets").insert({
    profile_id: userId,
    storage_path: storagePath,
    image_sha256: imageHash,
    issuer_cuit: extracted.issuerCuit,
    receipt_type: extracted.receiptType,
    point_of_sale: extracted.pointOfSale,
    receipt_number: extracted.receiptNumber,
    issued_on: extracted.issuedOn,
    total_amount: extracted.totalAmount,
    cae: extracted.cae,
    cae_expires_on: extracted.caeExpiresOn,
  });
  if (insertError) {
    await admin.storage.from("ticket-temp").remove([storagePath]);
    return { error: insertError.code === "23505" ? "Este ticket ya fue enviado anteriormente." : "No pudimos registrar el ticket." };
  }
  revalidatePath("/tickets");
  revalidatePath("/admin/tickets");
  return { success: recognizedFields === 7
    ? "Ticket leído correctamente. Quedó pendiente de confirmación."
    : `Ticket recibido. Reconocimos ${recognizedFields} de 7 datos; el resto se revisará manualmente.` };
}
