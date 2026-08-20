"use client";

import { useEffect, useState } from "react";

type DrawRevealProps = {
  animate: boolean;
  attemptNumber: number;
  candidates: string[];
  official?: boolean;
  winner: string;
};

export function DrawReveal({ animate, attemptNumber, candidates, official = false, winner }: DrawRevealProps) {
  const [countdown, setCountdown] = useState(animate ? 10 : 0);
  const [rollingName, setRollingName] = useState(candidates[0] ?? winner);
  const [revealed, setRevealed] = useState(!animate);

  useEffect(() => {
    if (!animate) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const revealImmediately = window.setTimeout(() => {
        setCountdown(0);
        setRevealed(true);
      }, 0);
      return () => window.clearTimeout(revealImmediately);
    }

    const countdownTimer = window.setInterval(() => {
      setCountdown((current) => Math.max(0, current - 1));
    }, 1000);
    let index = 0;
    const ticker = window.setInterval(() => {
      index = (index + 7) % Math.max(candidates.length, 1);
      setRollingName(candidates[index] ?? winner);
    }, 90);
    const revealTimer = window.setTimeout(() => {
      window.clearInterval(countdownTimer);
      window.clearInterval(ticker);
      setCountdown(0);
      setRevealed(true);
    }, 10_000);

    return () => {
      window.clearInterval(countdownTimer);
      window.clearInterval(ticker);
      window.clearTimeout(revealTimer);
    };
  }, [animate, candidates, winner]);

  return (
    <section className={`draw-reveal${animate && !revealed ? " is-animating" : ""}`} aria-live="polite">
      <p className="eyebrow cyan">INTENTO #{attemptNumber}</p>
      {countdown > 0 ? (
        <strong className="draw-countdown">{countdown}</strong>
      ) : revealed ? (
        <div className="draw-winner">
          <span>🎉</span>
          <small>{official ? "GANADOR OFICIAL" : "GANADOR PROVISIONAL"}</small>
          <strong>@{winner}</strong>
          <p>{official ? "Resultado confirmado y guardado en el historial." : "Todavia debe verificarse antes de confirmarlo oficialmente."}</p>
        </div>
      ) : (
        <div className="draw-rolling">
          <small>BUSCANDO ENTRE LAS CHANCES...</small>
          <strong>@{rollingName}</strong>
        </div>
      )}
    </section>
  );
}

