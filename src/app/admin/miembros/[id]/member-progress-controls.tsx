"use client";

import { useActionState } from "react";
import {
  adjustMemberPoints,
  changeMemberInstagramUsername,
  regenerateMemberRecoveryCode,
  setMemberBadge,
  setMemberRedemptionOverride,
  updateMemberStreak,
  type AdminActionState,
} from "@/app/admin/actions";

type BadgeDefinition = { badge_key: string; name: string; description: string; icon: string };
type MemberProgressControlsProps = {
  profileId: string;
  username: string;
  currentStreak: number;
  longestStreak: number;
  badges: BadgeDefinition[];
  awardedBadgeKeys: string[];
  redemptionOverrideActive: boolean;
};

function Feedback({ state }: { state: AdminActionState }) {
  if (state.error) return <p className="form-error" role="alert">{state.error}</p>;
  if (state.success) return <p className="form-success" role="status">{state.success}</p>;
  return null;
}

function BadgeControl({ profileId, username, badge, awarded }: {
  profileId: string;
  username: string;
  badge: BadgeDefinition;
  awarded: boolean;
}) {
  const [state, action, pending] = useActionState(setMemberBadge, {});
  return (
    <form action={action} className="member-badge-control">
      <input type="hidden" name="profileId" value={profileId} />
      <input type="hidden" name="username" value={username} />
      <input type="hidden" name="badgeKey" value={badge.badge_key} />
      <input type="hidden" name="awarded" value={awarded ? "false" : "true"} />
      <div><span aria-hidden="true">{badge.icon}</span><div><strong>{badge.name}</strong><small>{badge.description}</small></div></div>
      <label>Motivo<input name="reason" maxLength={200} placeholder={awarded ? "Ej.: quitar prueba" : "Ej.: prueba del perfil"} required /></label>
      <button className={awarded ? "danger-soft" : "button primary"} disabled={pending}>
        {pending ? "Guardando..." : awarded ? "Quitar insignia" : "Otorgar insignia"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function MemberProgressControls(props: MemberProgressControlsProps) {
  const [pointsState, pointsAction, pointsPending] = useActionState(adjustMemberPoints, {});
  const [streakState, streakAction, streakPending] = useActionState(updateMemberStreak, {});
  const [redemptionState, redemptionAction, redemptionPending] = useActionState(setMemberRedemptionOverride, {});
  const [usernameState, usernameAction, usernamePending] = useActionState(changeMemberInstagramUsername, {});
  const [recoveryState, recoveryAction, recoveryPending] = useActionState(regenerateMemberRecoveryCode, {});
  const awarded = new Set(props.awardedBadgeKeys);

  return (
    <section className="admin-panel member-progress-controls">
      <div className="admin-panel-title"><h2>Editar progreso</h2><small>CAMBIOS AUDITADOS</small></div>
      <p className="admin-help">Usá estos controles para pruebas o correcciones. Cada cambio necesita un motivo.</p>

      <div className="member-security-grid">
        <form action={usernameAction} className="member-control-form">
          <input type="hidden" name="profileId" value={props.profileId} />
          <input type="hidden" name="username" value={props.username} />
          <h3>Cambiar usuario de Instagram</h3>
          <p>Conserva puntos, rachas, historial y el usuario anterior como acceso alternativo.</p>
          <label>Nuevo usuario<div className="input-prefix"><span>@</span><input name="newUsername" defaultValue={props.username} maxLength={30} required /></div></label>
          <label>Motivo<input name="reason" maxLength={200} placeholder="Ej.: cambió su usuario en Instagram" required /></label>
          <button className="button primary" disabled={usernamePending}>{usernamePending ? "Guardando..." : "Actualizar usuario"}</button>
          <Feedback state={usernameState} />
        </form>

        <form action={recoveryAction} className="member-control-form recovery-reset-form">
          <input type="hidden" name="profileId" value={props.profileId} />
          <h3>Regenerar clave de recuperación</h3>
          <p>La clave anterior dejará de funcionar. Verificá antes la identidad del miembro.</p>
          <label>Motivo<input name="reason" maxLength={200} placeholder="Ej.: perdió su clave" required /></label>
          <button className="danger-soft" disabled={recoveryPending}>{recoveryPending ? "Regenerando..." : "Generar clave nueva"}</button>
          <Feedback state={recoveryState} />
          {recoveryState.recoveryCode && <div className="admin-recovery-code"><small>MOSTRAR UNA SOLA VEZ</small><strong>{recoveryState.recoveryCode}</strong><p>Entregásela únicamente al titular verificado.</p></div>}
        </form>
      </div>

      <form action={redemptionAction} className={`member-redemption-override ${props.redemptionOverrideActive ? "enabled" : ""}`}>
        <input type="hidden" name="profileId" value={props.profileId} />
        <input type="hidden" name="username" value={props.username} />
        <input type="hidden" name="active" value={props.redemptionOverrideActive ? "false" : "true"} />
        <div><p className="eyebrow cyan">EXCEPCIÓN DE CANJE</p><h3>{props.redemptionOverrideActive ? "Canjes habilitados manualmente" : "Habilitar canjes sin participación"}</h3><small>Solo Administración puede activar o quitar este permiso. No modifica puntos, rachas ni participaciones.</small></div>
        <label>Motivo<input name="reason" maxLength={200} placeholder={props.redemptionOverrideActive ? "Ej.: finalizó la prueba" : "Ej.: prueba autorizada"} required /></label>
        <button className={props.redemptionOverrideActive ? "danger-soft" : "button primary"} disabled={redemptionPending}>{redemptionPending ? "Guardando..." : props.redemptionOverrideActive ? "Quitar permiso especial" : "Habilitar canjes"}</button>
        <Feedback state={redemptionState} />
      </form>

      <div className="member-control-grid">
        <form action={pointsAction} className="member-control-form">
          <input type="hidden" name="profileId" value={props.profileId} />
          <input type="hidden" name="username" value={props.username} />
          <h3>SUPER Puntos</h3>
          <label>Ajuste<input name="amount" type="number" min="-100000" max="100000" placeholder="Ej.: 20 o -5" required /></label>
          <small>Escribí un número positivo para sumar o negativo para descontar.</small>
          <label>Motivo<input name="reason" maxLength={200} placeholder="Ej.: prueba del perfil" required /></label>
          <button className="button primary" disabled={pointsPending}>{pointsPending ? "Guardando..." : "Aplicar puntos"}</button>
          <Feedback state={pointsState} />
        </form>

        <form action={streakAction} className="member-control-form">
          <input type="hidden" name="profileId" value={props.profileId} />
          <input type="hidden" name="username" value={props.username} />
          <h3>Racha</h3>
          <label>Racha actual<input name="currentStreak" type="number" min="0" max="1000" defaultValue={props.currentStreak} required /></label>
          <label>Mejor racha<input name="longestStreak" type="number" min="0" max="1000" defaultValue={props.longestStreak} required /></label>
          <label>Motivo<input name="reason" maxLength={200} placeholder="Ej.: prueba del perfil" required /></label>
          <button className="button primary" disabled={streakPending}>{streakPending ? "Guardando..." : "Guardar racha"}</button>
          <Feedback state={streakState} />
        </form>
      </div>

      <div className="member-badge-controls">
        <h3>Insignias manuales</h3>
        {props.badges.map((badge) => (
          <BadgeControl key={badge.badge_key} profileId={props.profileId} username={props.username} badge={badge} awarded={awarded.has(badge.badge_key)} />
        ))}
      </div>
    </section>
  );
}
