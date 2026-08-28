"use client";

import { useRef } from "react";
import { CopyCodeButton } from "@/app/participation/copy-code-button";

export function CommentActionButton({ actionUrl, code }: { actionUrl: string; code: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button type="button" className="requirement-open-button" onClick={() => dialogRef.current?.showModal()}>Abrir</button>
      <dialog className="comment-code-dialog" ref={dialogRef}>
        <button type="button" className="dialog-close" aria-label="Cerrar" onClick={() => dialogRef.current?.close()}>×</button>
        <p className="eyebrow cyan">ANTES DE IR A INSTAGRAM</p>
        <h3>Copiá tu código</h3>
        <p>Comentá la publicación etiquetando a 2 personas y agregá este código.</p>
        <strong>{code}</strong>
        <CopyCodeButton code={code} />
        <a className="button primary" href={actionUrl} target="_blank" rel="noreferrer" onClick={() => dialogRef.current?.close()}>Continuar a Instagram</a>
      </dialog>
    </>
  );
}
