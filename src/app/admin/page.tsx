import Link from "next/link";
import { DrawForm } from "@/app/admin/draw-form";
import { freezeDraw, logoutAdmin, openDraw } from "@/app/admin/actions";
import { requireAdminUserId } from "@/lib/auth/admin";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const statusLabels: Record<string, string> = {
  draft: "Borrador", scheduled: "Programado", open: "Abierto", frozen: "Cerrado",
  drawing: "Sorteando", winner_review: "Revisando ganador", completed: "Finalizado", cancelled: "Cancelado",
};

export default async function AdminPage() {
  await requireAdminUserId();
  const admin = createAdminSupabaseClient();
  const { data: draws } = await admin
    .from("draws")
    .select("id, edition_number, title, prize_name, prize_value, status, opens_at, closes_at, created_at")
    .order("edition_number", { ascending: false })
    .limit(12);

  return (
    <main className="admin-shell">
      <header className="admin-topbar">
        <Link className="brand" href="/"><span>SUPER</span><span className="brand-dot">.</span><span className="brand-ar">AR</span><small>ADMIN</small></Link>
        <form action={logoutAdmin}><button className="admin-logout">Salir</button></form>
      </header>
      <section className="admin-heading"><p className="eyebrow cyan">PANEL PRIVADO</p><h1>Sorteos</h1><p>Crea una edicion, revisala y abrila cuando este lista.</p></section>

      <section className="admin-panel"><h2>Crear nuevo sorteo</h2><DrawForm /></section>

      <section className="admin-panel">
        <h2>Ediciones</h2>
        <div className="admin-draw-list">
          {(draws ?? []).length === 0 && <p className="admin-empty">Todavia no hay sorteos cargados.</p>}
          {(draws ?? []).map((draw) => (
            <article className="admin-draw" key={draw.id}>
              <div><small>EDICION #{String(draw.edition_number).padStart(3, "0")}</small><strong>{draw.title}</strong><span>{draw.prize_name}{draw.prize_value !== null ? ` - $${Number(draw.prize_value).toLocaleString("es-AR")}` : ""}</span></div>
              <div className="admin-draw-actions"><span className={`status-pill status-${draw.status}`}>{statusLabels[draw.status] ?? draw.status}</span><Link href={`/admin/sorteos/${draw.id}`}>Participantes</Link>{draw.status === "draft" && <form action={openDraw}><input type="hidden" name="drawId" value={draw.id} /><button type="submit">Abrir sorteo</button></form>}{draw.status === "open" && <form action={freezeDraw}><input type="hidden" name="drawId" value={draw.id} /><button className="freeze-button" type="submit">Cerrar y congelar</button></form>}</div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
