"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  useEffect(() => { console.error("Club SUPER.AR startup error", error); }, [error]);
  const reload = () => window.location.reload();
  const cleanAndReload = async () => {
    if ("caches" in window) await Promise.all((await caches.keys()).map((key) => caches.delete(key)));
    const registration = await navigator.serviceWorker?.getRegistration();
    await registration?.update().catch(() => undefined);
    router.push("/"); router.refresh();
  };
  return (
    <html lang="es"><body className="fatal-error-shell"><main className="fatal-error-card">
      <p className="eyebrow cyan">CLUB SUPER.AR</p><h1>No pudimos abrir la aplicación</h1>
      <p>Tu cuenta y tus puntos siguen guardados. Probá recargar; si continúa, iniciá una recuperación limpia.</p>
      <button className="button primary" onClick={() => { reset(); reload(); }}>Recargar aplicación</button>
      <button className="button secondary" onClick={cleanAndReload}>Recuperar aplicación</button>
    </main></body></html>
  );
}
