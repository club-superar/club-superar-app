"use client";

import { useActionState } from "react";
import { updateDraftDraw, type AdminActionState } from "@/app/admin/actions";

type EditDrawFormProps = {
  draw: {
    id: number;
    title: string;
    prizeName: string;
    prizeValue: number | null;
    opensAt: string;
    closesAt: string;
    claimHours: number;
    winnerPercent: number;
    maxBaseChances: number;
    maxExtraChances: number;
    nonWinnerPoints: number;
  };
  urls: Record<string, string>;
};

const initialState: AdminActionState = {};

function argentinaInputValue(value: string) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(value)).replace(" ", "T");
}

export function EditDrawForm({ draw, urls }: EditDrawFormProps) {
  const [state, action, pending] = useActionState(updateDraftDraw, initialState);
  return (
    <details className="admin-edit-draw">
      <summary>Editar configuración del borrador</summary>
      <form action={action} className="draw-admin-form">
        <input type="hidden" name="drawId" value={draw.id} />
        <div className="admin-field full"><label htmlFor="editTitle">Nombre visible</label><input id="editTitle" name="title" defaultValue={draw.title} required /></div>
        <div className="admin-field"><label htmlFor="editPrizeName">Premio</label><input id="editPrizeName" name="prizeName" defaultValue={draw.prizeName} required /></div>
        <div className="admin-field"><label htmlFor="editPrizeValue">Valor estimado en pesos</label><input id="editPrizeValue" name="prizeValue" type="number" min="0" step="1" defaultValue={draw.prizeValue ?? ""} /></div>
        <div className="admin-field"><label htmlFor="editOpensAt">Apertura (hora Argentina)</label><input id="editOpensAt" name="opensAt" type="datetime-local" defaultValue={argentinaInputValue(draw.opensAt)} required /></div>
        <div className="admin-field"><label htmlFor="editClosesAt">Cierre (hora Argentina)</label><input id="editClosesAt" name="closesAt" type="datetime-local" defaultValue={argentinaInputValue(draw.closesAt)} required /></div>
        <div className="admin-field full"><label htmlFor="editInstagramUrl">Perfil oficial de Instagram</label><input id="editInstagramUrl" name="instagramProfileUrl" type="url" defaultValue={urls.follow_instagram} required /></div>
        <div className="admin-field full"><label htmlFor="editWhatsappUrl">Grupo de WhatsApp</label><input id="editWhatsappUrl" name="whatsappGroupUrl" type="url" defaultValue={urls.whatsapp_group} required /></div>
        <div className="admin-field full"><label htmlFor="editPublicationUrl">Publicación principal</label><input id="editPublicationUrl" name="mainPublicationUrl" type="url" defaultValue={urls.comment_and_tag} required /></div>
        <fieldset className="admin-rules full">
          <legend>Chances y límites</legend>
          <div className="admin-rule-grid">
            <p className="admin-rule-note full">Los requisitos y las acciones extra suman chances, no SUPER Puntos.</p>
            <div className="admin-field"><label htmlFor="editNonWinnerPoints">Puntos por participar y no ganar</label><input id="editNonWinnerPoints" name="nonWinnerPoints" type="number" min="0" max="100" defaultValue={draw.nonWinnerPoints} required /><small>Se entregan al finalizar únicamente a quienes completaron el sorteo y no ganaron.</small></div>
            <div className="admin-field"><label htmlFor="editBaseChances">Máximo de chances base con racha</label><input id="editBaseChances" name="maxBaseChances" type="number" min="4" max="6" defaultValue={draw.maxBaseChances} required /><small>Empieza en 4 y puede subir hasta 6 por participar en sorteos consecutivos.</small></div>
            <div className="admin-field"><label htmlFor="editExtraChances">Máximo de chances extras</label><input id="editExtraChances" name="maxExtraChances" type="number" min="0" max="2" defaultValue={draw.maxExtraChances} required /><small>Una por etiqueta adicional y otra por compartir una publicación diferente.</small></div>
            <div className="admin-field"><label htmlFor="editWinnerPercent">Chances conservadas después de ganar (%)</label><input id="editWinnerPercent" name="winnerPercent" type="number" min="0" max="100" defaultValue={draw.winnerPercent} required /><small>El ganador anterior conserva solo este porcentaje en la próxima edición.</small></div>
            <div className="admin-field"><label htmlFor="editClaimHours">Tiempo para reclamar el premio</label><input id="editClaimHours" name="claimHours" type="number" min="1" max="168" defaultValue={draw.claimHours} required /><small>Cantidad de horas antes de poder pasar al ganador suplente.</small></div>
          </div>
        </fieldset>
        {state.error && <p className="form-error full" role="alert">{state.error}</p>}
        {state.success && <p className="form-success full" role="status">{state.success}</p>}
        <button className="button primary full" disabled={pending}>{pending ? "Guardando cambios..." : "Guardar cambios"}</button>
      </form>
    </details>
  );
}

