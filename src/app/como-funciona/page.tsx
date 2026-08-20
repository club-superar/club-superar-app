import Link from "next/link";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { BottomNav } from "@/app/bottom-nav";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function HowItWorksPage() {
  const admin = createAdminSupabaseClient();
  const supabase = await createServerSupabaseClient();
  const [{ data: settingsData }, { data: draw }, { data: claimsData }] = await Promise.all([
    admin.rpc("get_club_public_settings"),
    admin.from("draws").select("edition_number,title,prize_name,max_base_chances,max_extra_chances,closes_at").in("status", ["scheduled", "open"]).order("edition_number", { ascending: false }).limit(1).maybeSingle(),
    supabase.auth.getClaims(),
  ]);
  const settings = (settingsData ?? {}) as { loyal_streak?: number; legend_points?: number; help_instagram_url?: string; redemptions_enabled?: boolean };
  const helpUrl = /^https:\/\/(www\.)?instagram\.com\//i.test(settings.help_instagram_url ?? "") ? settings.help_instagram_url! : "https://www.instagram.com/";
  const totalChances = Number(draw?.max_base_chances ?? 4) + Number(draw?.max_extra_chances ?? 1);

  return <main className="info-shell">
    <header className="topbar"><Link className="brand" href="/">SUPER<span className="brand-dot">.</span><span className="brand-ar">AR</span><small>CLUB</small></Link><Link className="profile-back" href="/">← Inicio</Link></header>
    <section className="info-hero"><p className="eyebrow cyan">GUÍA RÁPIDA</p><h1>¿Cómo funciona el Club?</h1><p>Todo lo importante, explicado fácil y sin vueltas.</p></section>
    <section className="info-grid">
      <details open><summary><span>🎟</span><strong>Chances</strong></summary><p>Son tus oportunidades para salir sorteado. Completá todos los pasos para obtener las chances base y sumá extras etiquetando a otra persona o compartiendo otra publicación. En la edición actual podés llegar hasta {totalChances}.</p></details>
      <details><summary><span>🔥</span><strong>Rachas</strong></summary><p>Tu racha aumenta cuando participás correctamente en sorteos consecutivos. Si dejás pasar una edición, la racha vuelve a empezar.</p></details>
      <details><summary><span>★</span><strong>SUPER Puntos</strong></summary><p>Se acumulan al participar y, más adelante, con misiones y compras validadas. Los puntos no reemplazan las chances: sirven para obtener beneficios.</p></details>
      <details><summary><span>🏅</span><strong>Insignias</strong></summary><p>Conseguís “Fiel” al alcanzar {Number(settings.loyal_streak ?? 3)} sorteos consecutivos. “Leyenda SUPER.AR” se obtiene al llegar a {Number(settings.legend_points ?? 1000).toLocaleString("es-AR")} SUPER Puntos.</p></details>
      <details><summary><span>◇</span><strong>Canjes</strong></summary><p>{settings.redemptions_enabled ? "Ya están habilitados. Elegí un beneficio, generá el código y mostralo en caja." : "Todavía dicen Próximamente, pero tus puntos se acumulan desde ahora y no se pierden."}</p></details>
      <details><summary><span>✓</span><strong>Verificación</strong></summary><p>Cada paso muestra su estado: Pendiente, Verificando, Completado o Revisión manual. Si Instagram demora una confirmación, SUPER.AR puede revisarla desde Administración.</p></details>
    </section>
    <section className="rules-card"><p className="eyebrow cyan">REGLAS DEL SORTEO</p>{draw ? <><h2>Sorteo #{String(draw.edition_number).padStart(3, "0")}: {draw.title}</h2><ul><li>Premio: {draw.prize_name}.</li><li>Se necesita completar todos los requisitos obligatorios.</li><li>Máximo de {totalChances} chances según la configuración actual.</li><li>Antes de confirmar al ganador, SUPER.AR vuelve a revisar los requisitos.</li>{draw.closes_at && <li>Cierra el {new Intl.DateTimeFormat("es-AR", { dateStyle: "long", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(draw.closes_at))}.</li>}</ul></> : <><h2>Próxima edición</h2><p>Las fechas, el premio y los límites aparecerán acá cuando se publique el próximo sorteo.</p></>}</section>
    <section className="help-card"><div><p className="eyebrow cyan">AYUDA</p><h2>¿Te quedó alguna duda?</h2><p>Escribinos al Instagram oficial y te ayudamos.</p></div><a className="button primary" href={helpUrl} target="_blank" rel="noreferrer">Contactar a SUPER.AR</a></section>
    <BottomNav active="inicio" signedIn={Boolean(claimsData?.claims?.sub)} />
  </main>;
}
