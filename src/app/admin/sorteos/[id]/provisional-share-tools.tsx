"use client";

import { useState } from "react";

type ProvisionalShareToolsProps = {
  claimDeadline: string;
  editionNumber: number;
  username: string;
};

export function ProvisionalShareTools({ claimDeadline, editionNumber, username }: ProvisionalShareToolsProps) {
  const [copied, setCopied] = useState(false);
  const deadline = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(claimDeadline));
  const message = `🎉 El sorteo #${String(editionNumber).padStart(3, "0")} seleccionó provisionalmente a @${username}.\n\nPara verificar que continúa dentro de este grupo, debe comunicarse por privado con SUPER.AR antes del ${deadline} y enviar el código privado PREMIO que aparece en su cuenta del Club.\n\nLa elección será oficial después de completar la verificación. Si no se comunica dentro del plazo o no cumple los requisitos, volveremos a sortear entre los demás participantes habilitados.`;
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;

  async function copyMessage() {
    await navigator.clipboard.writeText(message);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <section className="winner-share-panel provisional-share-panel">
      <p className="eyebrow cyan">ANUNCIO PROVISIONAL PARA WHATSAPP</p>
      <h2>Pedile que se comunique</h2>
      <pre>{message}</pre>
      <small>No confirmes al ganador hasta validar el código privado, Instagram y WhatsApp.</small>
      <div><button type="button" onClick={copyMessage}>{copied ? "Copiado ✓" : "Copiar anuncio provisional"}</button><a href={whatsappUrl} target="_blank" rel="noreferrer">Abrir WhatsApp</a></div>
    </section>
  );
}
