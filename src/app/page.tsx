const requirements = [
  { label: "Seguir a SUPER.AR", detail: "Cuenta oficial de Instagram", done: true },
  { label: "Grupo de WhatsApp", detail: "Confirmá que seguís dentro", done: true },
  { label: "Comentar y etiquetar", detail: "Usá tu código SUPER-A7K4", done: true },
  { label: "Compartir en tu historia", detail: "Mencioná a @SUPER.AR", done: false },
];

export default function Home() {
  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#inicio" aria-label="Club SUPER.AR, inicio">
          <span className="brand-super">SUPER</span><span className="brand-dot">.</span><span className="brand-ar">AR</span>
          <small>CLUB</small>
        </a>
        <a className="avatar" href="/perfil" aria-label="Abrir perfil">GA</a>
      </header>

      <section className="hero" id="inicio">
        <p className="eyebrow">HOLA, @GONZA 👋</p>
        <h1>Tu lugar en el<br /><span>Club SUPER.AR</span></h1>
        <p className="hero-copy">Participá, sumá puntos y ganá con nosotros.</p>
        <div className="hero-actions">
          <a className="button primary" href="/registro">Quiero participar</a>
          <a className="button secondary" href="/ingresar">Ya tengo cuenta</a>
        </div>
      </section>

      <section className="stats" aria-label="Tu progreso">
        <article><span>⭐</span><strong>10</strong><small>SUPER Puntos</small></article>
        <article><span>🔥</span><strong>3</strong><small>Racha</small></article>
        <article><span>🎟️</span><strong>4</strong><small>Chances</small></article>
      </section>

      <section className="draw-card">
        <div className="draw-head">
          <div>
            <p className="eyebrow cyan">SORTEO #001</p>
            <h2>Orden de compra</h2>
          </div>
          <strong className="prize">$50.000</strong>
        </div>
        <div className="countdown" aria-label="Faltan 3 días, 12 horas y 48 minutos">
          <div><strong>03</strong><small>DÍAS</small></div><i>:</i>
          <div><strong>12</strong><small>HORAS</small></div><i>:</i>
          <div><strong>48</strong><small>MIN</small></div>
        </div>
      </section>

      <section className="checklist">
        <div className="section-title">
          <div><p className="eyebrow">TU PARTICIPACIÓN</p><h2>Te falta 1 paso</h2></div>
          <span>3/4</span>
        </div>
        <div className="progress"><span /></div>

        <div className="requirement-list">
          {requirements.map((item) => (
            <article className={item.done ? "requirement done" : "requirement"} key={item.label}>
              <span className="check" aria-hidden="true">{item.done ? "✓" : ""}</span>
              <div><strong>{item.label}</strong><small>{item.detail}</small></div>
              {!item.done && <button type="button">Completar</button>}
            </article>
          ))}
        </div>
      </section>

      <aside className="bonus">
        <span>⚡</span>
        <div><strong>Sumá hasta 2 chances extra</strong><small>Etiquetá más personas o compartí otra publicación.</small></div>
        <button type="button" aria-label="Ver chances extra">→</button>
      </aside>

      <nav className="bottom-nav" aria-label="Navegación principal">
        <a className="active" href="#inicio"><span>⌂</span>Inicio</a>
        <a href="#sorteos"><span>◇</span>Sorteos</a>
        <a href="#ganadores"><span>♕</span>Ganadores</a>
        <a href="#perfil"><span>○</span>Mi perfil</a>
      </nav>
    </main>
  );
}
