import { CopyCodeButton } from "@/app/participation/copy-code-button";

export type ProvisionalClaim = {
  attempt_id: number;
  draw_id: number;
  edition_number: number;
  draw_title: string;
  prize_name: string;
  prize_value: number | null;
  currency_code: string;
  claim_code: string;
  claim_deadline: string;
};

export function ProvisionalClaimAlert({ claim }: { claim: ProvisionalClaim }) {
  const deadline = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(claim.claim_deadline));
  const prizeValue = claim.prize_value === null ? null : new Intl.NumberFormat("es-AR", { style: "currency", currency: claim.currency_code, maximumFractionDigits: 0 }).format(claim.prize_value);
  return (
    <section className="provisional-claim-alert" role="status" aria-live="polite">
      <span aria-hidden="true">🎉</span>
      <p className="eyebrow cyan">RESULTADO EN VALIDACIÓN</p>
      <h2>¡Fuiste seleccionado!</h2>
      <p>Comunicate por privado con SUPER.AR antes del <strong>{deadline}</strong> y enviá este código privado.</p>
      <div className="private-claim-code"><small>TU CÓDIGO DE RECLAMO</small><div><strong>{claim.claim_code}</strong><CopyCodeButton code={claim.claim_code} /></div></div>
      <p className="provisional-prize">Sorteo #{String(claim.edition_number).padStart(3, "0")} · {claim.prize_name}{prizeValue ? ` · ${prizeValue}` : ""}</p>
      <small>No compartas este código públicamente. No es tu código de recuperación.</small>
    </section>
  );
}
