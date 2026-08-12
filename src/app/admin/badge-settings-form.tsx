"use client";

import { useActionState } from "react";
import { updateBadgeSettings, type AdminActionState } from "@/app/admin/actions";

export function BadgeSettingsForm({ legendPoints, loyalStreak }: { legendPoints: number; loyalStreak: number }) {
  const [state, action, pending] = useActionState(updateBadgeSettings, {} as AdminActionState);
  return (
    <form action={action} className="badge-settings-form">
      <div className="admin-field"><label htmlFor="loyalStreak">🔥 Fiel: sorteos consecutivos</label><input id="loyalStreak" name="loyalStreak" type="number" min="2" max="50" defaultValue={loyalStreak} required /></div>
      <div className="admin-field"><label htmlFor="legendPoints">💎 Leyenda: SUPER Puntos</label><input id="legendPoints" name="legendPoints" type="number" min="10" max="1000000" defaultValue={legendPoints} required /></div>
      <p>Se entregan una sola vez. Al guardar también se revisan los miembros actuales.</p>
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      {state.success && <p className="form-success" role="status">{state.success}</p>}
      <button type="submit" disabled={pending}>{pending ? "Guardando..." : "Guardar límites"}</button>
    </form>
  );
}
