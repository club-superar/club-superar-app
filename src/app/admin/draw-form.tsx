"use client";

import { useActionState } from "react";
import { createDraw, type AdminActionState } from "@/app/admin/actions";

const initialState: AdminActionState = {};

export function DrawForm() {
  const [state, action, pending] = useActionState(createDraw, initialState);
  return (
    <form action={action} className="draw-admin-form">
      <div className="admin-field full"><label htmlFor="title">Nombre visible del sorteo</label><input id="title" name="title" placeholder="Ej.: Orden de compra" required /></div>
      <div className="admin-field"><label htmlFor="prizeName">Premio</label><input id="prizeName" name="prizeName" placeholder="Ej.: Orden de compra" required /></div>
      <div className="admin-field"><label htmlFor="prizeValue">Valor estimado en pesos</label><input id="prizeValue" name="prizeValue" type="number" min="0" step="1" placeholder="50000" /></div>
      <div className="admin-field"><label htmlFor="opensAt">Apertura (hora Argentina)</label><input id="opensAt" name="opensAt" type="datetime-local" required /></div>
      <div className="admin-field"><label htmlFor="closesAt">Cierre (hora Argentina)</label><input id="closesAt" name="closesAt" type="datetime-local" required /></div>
      <div className="admin-field full"><label htmlFor="instagramProfileUrl">Perfil oficial de Instagram</label><input id="instagramProfileUrl" name="instagramProfileUrl" type="url" placeholder="https://www.instagram.com/..." required /></div>
      <div className="admin-field full"><label htmlFor="whatsappGroupUrl">Enlace del grupo de WhatsApp</label><input id="whatsappGroupUrl" name="whatsappGroupUrl" type="url" placeholder="https://chat.whatsapp.com/..." required /></div>
      <div className="admin-field full"><label htmlFor="mainPublicationUrl">Publicacion principal del sorteo</label><input id="mainPublicationUrl" name="mainPublicationUrl" type="url" placeholder="https://www.instagram.com/p/..." required /></div>
      <fieldset className="admin-rules full">
        <legend>Reglas de esta edición</legend>
        <p>Quedan congeladas en este sorteo. Podés usar otros valores en la próxima edición.</p>
        <div className="admin-rule-grid">
          <p className="admin-rule-note full">Completar los requisitos habilita las chances. Los SUPER Puntos se configurarán aparte y no se entregan por cada paso.</p>
          <div className="admin-field"><label htmlFor="nonWinnerPoints">Puntos por participar y no ganar</label><input id="nonWinnerPoints" name="nonWinnerPoints" type="number" min="0" max="100" defaultValue="2" required /></div>
          <div className="admin-field"><label htmlFor="maxBaseChances">Máximo por racha</label><input id="maxBaseChances" name="maxBaseChances" type="number" min="2" max="6" defaultValue="6" required /></div>
          <div className="admin-field"><label htmlFor="maxExtraChances">Máximo de extras</label><input id="maxExtraChances" name="maxExtraChances" type="number" min="0" max="2" defaultValue="2" required /></div>
          <div className="admin-field"><label htmlFor="winnerPercent">Chances después de ganar (%)</label><input id="winnerPercent" name="winnerPercent" type="number" min="0" max="100" defaultValue="25" required /></div>
          <div className="admin-field"><label htmlFor="claimHours">Horas para reclamar</label><input id="claimHours" name="claimHours" type="number" min="1" max="168" defaultValue="24" required /></div>
        </div>
      </fieldset>
      {state.error && <p className="form-error full" role="alert">{state.error}</p>}
      {state.success && <p className="form-success full" role="status">{state.success}</p>}
      <button className="button primary full" disabled={pending}>{pending ? "Guardando..." : "Guardar borrador"}</button>
    </form>
  );
}
