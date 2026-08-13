"use client";

import { useMemo, useState } from "react";
import { qrcode } from "@/lib/qr/qrcode.mjs";

const FALLBACK_ORIGIN = "https://club-superar-app.suupeer-ar.workers.dev";

export function RedemptionQr({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const svg = useMemo(() => {
    const origin = process.env.NEXT_PUBLIC_SITE_URL || FALLBACK_ORIGIN;
    const qr = qrcode(0, "M");
    qr.addData(`${origin}/caja?code=${encodeURIComponent(code)}`);
    qr.make();
    return qr.createSvgTag({ cellSize: 8, margin: 16, scalable: true });
  }, [code]);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return <div className="redemption-qr">
    <div className="redemption-qr-image" role="img" aria-label={`QR del canje ${code}`} dangerouslySetInnerHTML={{ __html: svg }} />
    <p>En caja pueden escanear este QR. Si la cámara no funciona, usá el código de abajo.</p>
    <code>{code}</code>
    <button type="button" onClick={copyCode}>{copied ? "Código copiado" : "Copiar código"}</button>
  </div>;
}
