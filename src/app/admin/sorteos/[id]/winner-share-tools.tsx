"use client";

import { useState } from "react";

type WinnerShareToolsProps = {
  claimDeadline: string;
  editionNumber: number;
  prize: string;
  username: string;
};

export function WinnerShareTools({ claimDeadline, editionNumber, prize, username }: WinnerShareToolsProps) {
  const [copied, setCopied] = useState(false);
  const deadline = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(claimDeadline));
  const message = `🎉 ¡Tenemos ganador del sorteo #${String(editionNumber).padStart(3, "0")}!\n\n🏆 @${username}\n🎁 ${prize}\n\nPara confirmar el premio debe encontrarse actualmente dentro de este grupo y comunicarse por privado con SUPER.AR antes del ${deadline}. Si no cumple los requisitos o no reclama dentro del plazo, se realizará nuevamente el sorteo.`;
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;

  async function copyMessage() {
    await navigator.clipboard.writeText(message);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <section className="winner-share-panel">
      <p className="eyebrow cyan">ANUNCIO PARA WHATSAPP</p>
      <h2>Mensaje listo</h2>
      <pre>{message}</pre>
      <small>Plazo de reclamo: {deadline} (hora Argentina).</small>
      <div><button type="button" onClick={copyMessage}>{copied ? "Copiado ✓" : "Copiar mensaje"}</button><a href={whatsappUrl} target="_blank" rel="noreferrer">Abrir WhatsApp</a></div>
    </section>
  );
}
