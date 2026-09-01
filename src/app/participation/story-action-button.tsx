"use client";

import { useRef } from "react";

export function StoryActionButton({ actionUrl }: { actionUrl: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button type="button" className="requirement-open-button" onClick={() => dialogRef.current?.showModal()}>Abrir</button>
      <dialog className="comment-code-dialog" ref={dialogRef}>
        <button type="button" className="dialog-close" aria-label="Cerrar" onClick={() => dialogRef.current?.close()}>×</button>
        <p className="eyebrow cyan">ANTES DE IR A INSTAGRAM</p>
        <h3>Mantenela durante 24 horas</h3>
        <p>Compartí la publicación y mencioná a @autoserviciosuper.ar. No elimines la historia antes de las 24 horas.</p>
        <p>Si resultás ganador, Administración podrá pedirte una captura del archivo de historias para comprobarla. Si la eliminás antes, podés perder el premio.</p>
        <a className="button primary" href={actionUrl} target="_blank" rel="noreferrer" onClick={() => dialogRef.current?.close()}>Entendido, abrir Instagram</a>
      </dialog>
    </>
  );
}
