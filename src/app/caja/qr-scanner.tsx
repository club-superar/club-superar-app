"use client";

import { useEffect, useRef, useState } from "react";

function extractCode(value: string) {
  try {
    const url = new URL(value);
    const code = url.searchParams.get("code") ?? "";
    return /^[A-F0-9]{8}$/i.test(code) ? code.toUpperCase() : "";
  } catch {
    const clean = value.replace(/[^a-f0-9]/gi, "").toUpperCase();
    return /^[A-F0-9]{8}$/.test(clean) ? clean : "";
  }
}

export function CashierQrScanner({ onCode }: { onCode: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<{ stop(): void; destroy(): void } | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => () => scannerRef.current?.destroy(), []);

  async function start() {
    setError("");
    setOpen(true);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    if (!videoRef.current) return;
    try {
      const { default: QrScanner } = await import("@/lib/qr/qr-scanner.min.js");
      const scanner = new QrScanner(videoRef.current, (result) => {
        const code = extractCode(result.data);
        if (!code) { setError("Ese QR no pertenece a un canje de SUPER.AR."); return; }
        onCode(code);
        scanner.stop();
        setOpen(false);
      }, { preferredCamera: "environment", returnDetailedScanResult: true, highlightScanRegion: true });
      scannerRef.current = scanner;
      await scanner.start();
    } catch {
      setOpen(false);
      setError("No pudimos abrir la cámara. Permití el acceso o escribí el código manualmente.");
    }
  }

  function stop() { scannerRef.current?.stop(); setOpen(false); }

  return <div className="cashier-scanner">
    {!open && <button className="cashier-scan-button" type="button" onClick={start}>Escanear código QR</button>}
    {open && <div className="cashier-camera"><video ref={videoRef} /><div className="cashier-camera-frame" aria-hidden="true" /><p>Apuntá la cámara al QR del cliente.</p><button type="button" onClick={stop}>Cancelar</button></div>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}
