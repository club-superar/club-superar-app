import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Política de privacidad | Club SUPER.AR",
  description: "Cómo Club SUPER.AR recopila, utiliza y protege los datos de sus miembros.",
};

export default function PrivacyPage() {
  return (
    <main className="info-shell">
      <header className="topbar">
        <Link className="brand" href="/">SUPER<span className="brand-dot">.</span><span className="brand-ar">AR</span><small>CLUB</small></Link>
        <Link className="profile-back" href="/">← Inicio</Link>
      </header>

      <section className="info-hero">
        <p className="eyebrow cyan">INFORMACIÓN LEGAL</p>
        <h1>Política de privacidad</h1>
        <p>Te explicamos de forma clara qué datos utiliza Club SUPER.AR y para qué.</p>
      </section>

      <section className="rules-card">
        <p className="eyebrow cyan">RESPONSABLE</p>
        <h2>Club SUPER.AR</h2>
        <p>Club SUPER.AR es administrado por Autoservicio SUPER.AR. Esta política se aplica al sitio, los sorteos, los beneficios y las funciones relacionadas con el Club.</p>
      </section>

      <section className="rules-card">
        <p className="eyebrow cyan">DATOS QUE UTILIZAMOS</p>
        <h2>Solo lo necesario para hacer funcionar el Club</h2>
        <ul>
          <li>Usuario de Instagram y datos básicos de la cuenta del Club.</li>
          <li>Participaciones, requisitos completados, chances, rachas, insignias y SUPER Puntos.</li>
          <li>Comentarios y menciones relacionados con los sorteos cuando Instagram los informa a nuestra aplicación.</li>
          <li>Canjes, premios, ganadores, historial y registros mínimos de seguridad y auditoría.</li>
          <li>En la futura validación de compras: comercio, fecha, importe, identificador y datos necesarios del comprobante.</li>
        </ul>
      </section>

      <section className="rules-card">
        <p className="eyebrow cyan">TICKETS</p>
        <h2>Las imágenes serán temporales</h2>
        <p>La foto del ticket se utilizará únicamente para leer y validar el comprobante. Una vez procesada, se eliminará y no se conservará permanentemente.</p>
        <p>Solo quedarán los datos necesarios de la compra y una huella técnica para detectar comprobantes duplicados. No guardamos imágenes ni archivos binarios de tickets dentro de la base de datos.</p>
      </section>

      <section className="rules-card">
        <p className="eyebrow cyan">USO Y PROTECCIÓN</p>
        <h2>Para sorteos, beneficios y prevención de fraude</h2>
        <p>Utilizamos los datos para administrar cuentas, verificar participaciones, calcular chances y puntos, realizar sorteos y canjes, entregar premios, brindar asistencia y prevenir abusos o duplicados.</p>
        <p>No solicitamos ni almacenamos tu contraseña de Instagram. Las claves privadas del sistema se mantienen fuera del navegador y protegidas en los servicios de infraestructura.</p>
      </section>

      <section className="rules-card">
        <p className="eyebrow cyan">SERVICIOS</p>
        <h2>Proveedores que ayudan a operar la plataforma</h2>
        <p>Club SUPER.AR utiliza servicios tecnológicos como Meta/Instagram, Supabase y Cloudflare. Cada proveedor procesa únicamente la información necesaria para prestar su servicio y aplica sus propias condiciones y políticas.</p>
      </section>

      <section className="rules-card">
        <p className="eyebrow cyan">CONSERVACIÓN</p>
        <h2>No guardamos información innecesaria</h2>
        <p>Conservamos los datos de cuenta, participación, puntos, canjes, ganadores y auditoría mientras sean necesarios para operar el Club. Los eventos técnicos temporales y evidencias ya procesadas se eliminan periódicamente.</p>
      </section>

      <section className="help-card">
        <div>
          <p className="eyebrow cyan">TUS DATOS</p>
          <h2>Podés solicitar acceso, corrección o eliminación</h2>
          <p>Consultá las instrucciones para eliminar tu cuenta o escribinos al Instagram oficial.</p>
        </div>
        <Link className="button primary" href="/eliminar-datos">Cómo eliminar mis datos</Link>
        <a className="button secondary" href="https://www.instagram.com/autoserviciosuper.ar/" target="_blank" rel="noreferrer">Contactar a SUPER.AR</a>
      </section>

      <p className="legal-updated">Última actualización: 21 de agosto de 2026.</p>
    </main>
  );
}
