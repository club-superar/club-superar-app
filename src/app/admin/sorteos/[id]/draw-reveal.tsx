"use client";

import { useEffect, useState } from "react";

type DrawRevealProps = {
  animate: boolean;
  attemptNumber: number;
  candidates: string[];
  winner: string;
};

export function DrawReveal({ animate, attemptNumber, candidates, winner }: DrawRevealProps) {
  const [countdown, setCountdown] = useState(animate ? 3 : 0);
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

    const timeouts = [
      window.setTimeout(() => setCountdown(2), 1000),
      window.setTimeout(() => setCountdown(1), 2000),
      window.setTimeout(() => setCountdown(0), 3000),
      window.setTimeout(() => setRevealed(true), 6600),
    ];
    let index = 0;
    const ticker = window.setInterval(() => {
      index = (index + 7) % Math.max(candidates.length, 1);
      setRollingName(candidates[index] ?? winner);
    }, 90);
    const stopTicker = window.setTimeout(() => window.clearInterval(ticker), 6600);

    return () => {
      timeouts.forEach(window.clearTimeout);
      window.clearInterval(ticker);
      window.clearTimeout(stopTicker);
    };
  }, [animate, candidates, winner]);

  return (
    <section className="draw-reveal" aria-live="polite">
      <p className="eyebrow cyan">INTENTO #{attemptNumber}</p>
      {countdown > 0 ? (
        <strong className="draw-countdown">{countdown}</strong>
      ) : revealed ? (
        <div className="draw-winner">
          <span>🎉</span>
          <small>GANADOR PROVISIONAL</small>
          <strong>@{winner}</strong>
          <p>Todavia debe verificarse antes de confirmarlo oficialmente.</p>
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
