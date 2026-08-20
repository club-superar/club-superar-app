"use client";

import { useEffect, useState } from "react";

function remainingUntil(date: string) {
  const milliseconds = Math.max(0, new Date(date).getTime() - Date.now());
  const days = Math.floor(milliseconds / 86_400_000);
  const hours = Math.floor((milliseconds / 3_600_000) % 24);
  const minutes = Math.floor((milliseconds / 60_000) % 60);
  const seconds = Math.floor((milliseconds / 1_000) % 60);
  return { days, hours, minutes, seconds, finished: milliseconds === 0 };
}

export function Countdown({ closesAt }: { closesAt: string }) {
  const [remaining, setRemaining] = useState<ReturnType<typeof remainingUntil> | null>(null);

  useEffect(() => {
    const firstTick = window.setTimeout(() => setRemaining(remainingUntil(closesAt)), 0);
    const timer = window.setInterval(() => setRemaining(remainingUntil(closesAt)), 1_000);
    return () => {
      window.clearTimeout(firstTick);
      window.clearInterval(timer);
    };
  }, [closesAt]);

  if (!remaining) {
    return (
      <div className="countdown" aria-label="Cargando tiempo restante">
        <div><strong>--</strong><small>DIAS</small></div><i>:</i>
        <div><strong>--</strong><small>HORAS</small></div><i>:</i>
        <div><strong>--</strong><small>MIN</small></div><i>:</i>
        <div><strong>--</strong><small>SEG</small></div>
      </div>
    );
  }

  if (remaining.finished) return <p className="draw-closed">Este sorteo ya cerro.</p>;
  const label = `Faltan ${remaining.days} días, ${remaining.hours} horas, ${remaining.minutes} minutos y ${remaining.seconds} segundos`;
  return (
    <div className="countdown" aria-label={label}>
      <div><strong>{String(remaining.days).padStart(2, "0")}</strong><small>DIAS</small></div><i>:</i>
      <div><strong>{String(remaining.hours).padStart(2, "0")}</strong><small>HORAS</small></div><i>:</i>
      <div><strong>{String(remaining.minutes).padStart(2, "0")}</strong><small>MIN</small></div><i>:</i>
      <div><strong>{String(remaining.seconds).padStart(2, "0")}</strong><small>SEG</small></div>
    </div>
  );
}
