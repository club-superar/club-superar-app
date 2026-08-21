import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Eliminación de datos | Club SUPER.AR",
  description: "Instrucciones para solicitar la eliminación de una cuenta y sus datos en Club SUPER.AR.",
};

export default function DataDeletionPage() {
  return (
    <main className="info-shell">
      <header className="topbar">
        <Link className="brand" href="/">SUPER<span className="brand-dot">.</span><span className="brand-ar">AR</span><small>CLUB</small></Link>
        <Link className="profile-back" href="/">← Inicio</Link>
      </header>

      <section className="info-hero">
        <p className="eyebrow cyan">CONTROL DE TUS DATOS</p>
        <h1>Eliminar mi cuenta</h1>
        <p>Podés solicitar la eliminación de tu cuenta de Club SUPER.AR y de los datos asociados.</p>
      </section>

      <section className="rules-card">
        <p className="eyebrow cyan">PASO 1</p>
        <h2>Escribinos desde tu Instagram</h2>
        <p>Enviá un mensaje privado a <strong>@autoserviciosuper.ar</strong> e indicá que querés eliminar tu cuenta de Club SUPER.AR.</p>
      </section>

      <section className="rules-card">
        <p className="eyebrow cyan">PASO 2</p>
        <h2>Verificamos que la cuenta sea tuya</h2>
        <p>Para protegerte, podemos pedirte tu usuario de Instagram y una comprobación sencilla dentro de la aplicación. Nunca te pediremos la contraseña de Instagram.</p>
      </section>

      <section className="rules-card">
        <p className="eyebrow cyan">PASO 3</p>
        <h2>Procesamos la solicitud</h2>
        <p>Eliminaremos o desvincularemos la cuenta y sus datos personales. Podremos conservar únicamente registros mínimos que sean necesarios para prevenir fraude, resolver canjes o premios pendientes y cumplir obligaciones legales.</p>
      </section>

      <section className="help-card">
        <div>
          <p className="eyebrow cyan">SOLICITAR ELIMINACIÓN</p>
          <h2>Contactá al perfil oficial</h2>
          <p>El mensaje se abrirá en Instagram para que puedas enviarlo desde tu propia cuenta.</p>
        </div>
        <a className="button primary" href="https://www.instagram.com/autoserviciosuper.ar/" target="_blank" rel="noreferrer">Ir a @autoserviciosuper.ar</a>
        <Link className="button secondary" href="/privacidad">Leer Política de privacidad</Link>
      </section>
    </main>
  );
}
