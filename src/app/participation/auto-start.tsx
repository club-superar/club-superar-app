"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startParticipation } from "./actions";

export function AutoStartParticipation({ drawId }: { drawId: number }) {
  const started = useRef(false);
  const router = useRouter();
  const [pending, begin] = useTransition();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const data = new FormData();
    data.set("drawId", String(drawId));
    begin(async () => {
      const result = await startParticipation(data);
      if (!result.ok) {
        setFailed(true);
        return;
      }
      router.refresh();
    });
  }, [drawId, router]);

  if (failed) {
    return <section className="start-card" role="alert"><p className="eyebrow cyan">SORTEO ABIERTO</p><h2>No pudimos activar tu participación</h2><p>Tu cuenta y tus datos siguen seguros. Recargá la página para volver a intentar.</p></section>;
  }

  return <section className="start-card" role="status"><p className="eyebrow cyan">SORTEO ABIERTO</p><h2>{pending ? "Preparando tus pasos…" : "Activando tu participación…"}</h2><p>Enseguida vas a ver tu código y todos los pasos del sorteo.</p></section>;
}
