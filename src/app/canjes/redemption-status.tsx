"use client";

import { useEffect, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { RedemptionQr } from "./redemption-qr";

type RedemptionState = "pending" | "confirmed" | "cancelled" | "expired";
type Props = {
  id: string;
  code: string;
  points: number;
  arsValue: number;
  rewardName: string;
  expiresAt: string;
};

export function RedemptionStatus(props: Props) {
  const [status, setStatus] = useState<RedemptionState>("pending");

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    let active = true;
    const pollTimer = setInterval(() => void refresh(), 2500);

    const applyStatus = (nextStatus: RedemptionState) => {
      if (!active) return;
      setStatus(nextStatus);
      if (nextStatus !== "pending") clearInterval(pollTimer);
    };

    const refresh = async () => {
      const { data } = await supabase
        .from("point_redemptions")
        .select("status")
        .eq("id", props.id)
        .maybeSingle();

      if (data?.status) applyStatus(data.status as RedemptionState);
    };

    const channel = supabase
      .channel(`redemption-${props.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "point_redemptions",
          filter: `id=eq.${props.id}`,
        },
        (payload) => applyStatus((payload.new as { status: RedemptionState }).status),
      )
      .subscribe();

    const refreshWhenActive = () => {
      if (document.visibilityState === "visible") void refresh();
    };

    document.addEventListener("visibilitychange", refreshWhenActive);
    window.addEventListener("focus", refreshWhenActive);
    window.addEventListener("online", refreshWhenActive);
    void refresh();

    return () => {
      active = false;
      clearInterval(pollTimer);
      document.removeEventListener("visibilitychange", refreshWhenActive);
      window.removeEventListener("focus", refreshWhenActive);
      window.removeEventListener("online", refreshWhenActive);
      void supabase.removeChannel(channel);
    };
  }, [props.id]);

  if (status === "confirmed") {
    return (
      <section className="redemption-result success" role="status" aria-live="assertive">
        <span>✓</span>
        <h2>Canje realizado correctamente</h2>
        <strong>{props.points} SUPER Puntos descontados</strong>
        <p>Tu saldo ya fue actualizado. Podés volver a tu perfil.</p>
        <a className="button primary" href="/perfil">Volver a mi perfil</a>
      </section>
    );
  }

  if (status !== "pending") {
    return (
      <section className="redemption-result failed" role="status" aria-live="assertive">
        <span>!</span>
        <h2>{status === "expired" ? "El código venció" : "Canje anulado"}</h2>
        <p>No se descontaron puntos. Generá un código nuevo si querés intentarlo otra vez.</p>
        <a className="button secondary" href="/canjes">Generar otro canje</a>
      </section>
    );
  }

  return (
    <section className="redemption-ticket">
      <p className="eyebrow cyan">MOSTRÁ ESTO EN CAJA</p>
      <h2>{props.rewardName}</h2>
      <RedemptionQr code={props.code} />
      <strong>{props.points} puntos · ${Number(props.arsValue).toLocaleString("es-AR")}</strong>
      <p>
        Vence a las {new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit" }).format(new Date(props.expiresAt))}. Esta pantalla cambiará sola cuando Caja confirme.
      </p>
    </section>
  );
}
