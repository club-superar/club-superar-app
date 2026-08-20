"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startParticipation } from "./actions";

export function AutoStartParticipation({ drawId }: { drawId: number }) {
  const started = useRef(false);
  const router = useRouter();
  const [pending, begin] = useTransition();

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const data = new FormData();
    data.set("drawId", String(drawId));
    begin(async () => {
      await startParticipation(data);
      router.refresh();
    });
  }, [drawId, router]);

  return <section className="start-card" role="status"><p className="eyebrow cyan">SORTEO ABIERTO</p><h2>{pending ? "Preparando tus pasos…" : "Activando tu participación…"}</h2><p>Enseguida vas a ver tu código y todos los pasos del sorteo.</p></section>;
}
