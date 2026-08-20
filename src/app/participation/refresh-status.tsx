"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const AUTO_REFRESH_COOLDOWN_MS = 10_000;

export function RefreshParticipationStatus() {
  const router = useRouter();
  const lastRefresh = useRef(0);
  const wasHidden = useRef(false);
  const [updated, setUpdated] = useState(false);
  const [pending, startTransition] = useTransition();

  const refresh = useCallback(() => {
    const now = Date.now();
    if (pending || now - lastRefresh.current < 1_000) return;
    lastRefresh.current = now;
    setUpdated(false);
    startTransition(() => {
      router.refresh();
      setUpdated(true);
    });
  }, [pending, router]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        wasHidden.current = true;
        return;
      }

      if (wasHidden.current && Date.now() - lastRefresh.current >= AUTO_REFRESH_COOLDOWN_MS) {
        wasHidden.current = false;
        refresh();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [refresh]);

  return (
    <div className="participation-refresh">
      <button type="button" onClick={refresh} disabled={pending}>
        {pending ? "Actualizando…" : "Actualizar estado"}
      </button>
      <small aria-live="polite">
        {updated ? "Estado actualizado." : "Volvé de Instagram y tocá acá para comprobar tus pasos."}
      </small>
    </div>
  );
}
