"use client";

import { useEffect, useState } from "react";

function remainingUntil(date: string) {
  const milliseconds = Math.max(0, new Date(date).getTime() - Date.now());
  const days = Math.floor(milliseconds / 86_400_000);
  const hours = Math.floor((milliseconds / 3_600_000) % 24);
  const minutes = Math.floor((milliseconds / 60_000) % 60);
  return { days, hours, minutes, finished: milliseconds === 0 };
}

export function Countdown({ closesAt }: { closesAt: string }) {
  const [remaining, setRemaining] = useState(() => remainingUntil(closesAt));

  useEffect(() => {
    const timer = window.setInterval(() => setRemaining(remainingUntil(closesAt)), 30_000);
    return () => window.clearInterval(timer);
  }, [closesAt]);

  if (remaining.finished) return <p className="draw-closed">Este sorteo ya cerro.</p>;
  const label = `Faltan ${remaining.days} dias, ${remaining.hours} horas y ${remaining.minutes} minutos`;
  return (
    <div className="countdown" aria-label={label}>
      <div><strong>{String(remaining.days).padStart(2, "0")}</strong><small>DIAS</small></div><i>:</i>
      <div><strong>{String(remaining.hours).padStart(2, "0")}</strong><small>HORAS</small></div><i>:</i>
      <div><strong>{String(remaining.minutes).padStart(2, "0")}</strong><small>MIN</small></div>
    </div>
  );
}

