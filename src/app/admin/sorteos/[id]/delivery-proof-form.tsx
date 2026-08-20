"use client";

import { useActionState, useState } from "react";
import { saveWinnerDelivery, type DeliveryState } from "@/app/admin/actions";

async function toWebp(file: File) {
  const bitmap = await createImageBitmap(file);
  let maxEdge = 1280;
  let quality = 0.72;

  try {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("No se pudo preparar la foto.");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
      if (blob && blob.size <= 600_000) return new File([blob], "entrega.webp", { type: "image/webp" });
      maxEdge = Math.round(maxEdge * 0.8);
      quality = Math.max(0.45, quality - 0.06);
    }
  } finally {
    bitmap.close();
  }
  throw new Error("La foto es demasiado pesada. Probá con otra imagen.");
}

export function DeliveryProofForm({ drawId, winnerId }: { drawId: number; winnerId: number }) {
  const [state, action, pending] = useActionState(saveWinnerDelivery, {} as DeliveryState);
  const [subject, setSubject] = useState("merchandise");
  const [localError, setLocalError] = useState("");

  async function submit(formData: FormData) {
    setLocalError("");
    try {
      const original = formData.get("photo");
      if (original instanceof File && original.size > 0) formData.set("photo", await toWebp(original));
      action(formData);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "No pudimos preparar la foto.");
    }
  }

  return <section className="winner-claim-panel">
    <p className="eyebrow cyan">ENTREGA DEL PREMIO</p>
    <h2>Publicar comprobante</h2>
    <p>Se guarda una sola foto WebP liviana. Si cargás otra, reemplaza la anterior.</p>
    <form action={submit} className="delivery-proof-form">
      <input type="hidden" name="drawId" value={drawId} />
      <input type="hidden" name="winnerId" value={winnerId} />
      <label>Qué muestra la foto<select name="photoSubject" value={subject} onChange={(event) => setSubject(event.target.value)}><option value="merchandise">Solo el premio o la mercadería</option><option value="winner">El ganador con el premio</option></select></label>
      {subject === "winner" && <label className="consent-check"><input type="checkbox" name="winnerConsent" value="yes" required /> Confirmo que el ganador autorizó publicar su imagen.</label>}
      <label>Descripción<input name="description" minLength={3} maxLength={240} placeholder="Premio entregado en Autoservicio SUPER.AR" required /></label>
      <label>Foto<input name="photo" type="file" accept="image/*" required /></label>
      {(localError || state.error) && <p className="form-error" role="alert">{localError || state.error}</p>}
      {state.success && <p className="admin-notice success" role="status">Comprobante publicado correctamente.</p>}
      <button type="submit" disabled={pending}>{pending ? "Optimizando y guardando…" : "Publicar entrega"}</button>
    </form>
  </section>;
}
