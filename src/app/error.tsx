"use client";

import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("Club SUPER.AR page error", error); }, [error]);
  return <main className="fatal-error-shell"><section className="fatal-error-card"><p className="eyebrow cyan">CLUB SUPER.AR</p><h1>Algo no cargó bien</h1><p>No perdiste ningún dato. Volvé a intentar.</p><button className="button primary" onClick={reset}>Volver a intentar</button><button className="button secondary" onClick={() => window.location.reload()}>Recargar aplicación</button></section></main>;
}
