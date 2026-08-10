const requirements = [
  { label: "Seguir a SUPER.AR", detail: "Cuenta oficial de Instagram", done: true },
  { label: "Grupo de WhatsApp", detail: "ConfirmÃ¡ que seguÃ­s dentro", done: true },
  { label: "Comentar y etiquetar", detail: "UsÃ¡ tu cÃ³digo SUPER-A7K4", done: true },
  { label: "Compartir en tu historia", detail: "MencionÃ¡ a @SUPER.AR", done: false },
];

export default function Home() {
  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#inicio" aria-label="Club SUPER.AR, inicio">
          <span className="brand-super">SUPER</span><span className="brand-dot">.</span><span className="brand-ar">AR</span>
          <small>CLUB</small>
        </a>
        <button className="avatar" type="button" aria-label="Abrir perfil">GA</button>
      </header>

      <section className="hero" id="inicio">
        <p className="eyebrow">HOLA, @GONZA ðŸ‘‹</p>
        <h1>Tu lugar en el<br /><span>Club SUPER.AR</span></h1>
        <p className="hero-copy">ParticipÃ¡, sumÃ¡ puntos y ganÃ¡ con nosotros.</p>
      </section>

      <section className="stats" aria-label="Tu progreso">
        <article><span>â­</span><strong>10</strong><small>SUPER Puntos</small></article>
        <article><span>ðŸ”¥</span><strong>3</strong><small>Racha</small></article>
        <article><span>ðŸŽŸï¸</span><strong>4</strong><small>Chances</small></article>
      </section>

      <section className="draw-card">
        <div className="draw-head">
          <div>
            <p className="eyebrow cyan">SORTEO #001</p>
            <h2>Orden de compra</h2>
          </div>
          <strong className="prize">$50.000</strong>
        </div>
        <div className="countdown" aria-label="Faltan 3 dÃ­as, 12 horas y 48 minutos">
          <div><strong>03</strong><small>DÃAS</small></div><i>:</i>
          <div><strong>12</strong><small>HORAS</small></div><i>:</i>
          <div><strong>48</strong><small>MIN</small></div>
        </div>
      </section>

      <section className="checklist">
        <div className="section-title">
          <div><p className="eyebrow">TU PARTICIPACIÃ“N</p><h2>Te falta 1 paso</h2></div>
          <span>3/4</span>
        </div>
        <div className="progress"><span /></div>

        <div className="requirement-list">
          {requirements.map((item) => (
            <article className={item.done ? "requirement done" : "requirement"} key={item.label}>
              <span className="check" aria-hidden="true">{item.done ? "âœ“" : ""}</span>
              <div><strong>{item.label}</strong><small>{item.detail}</small></div>
              {!item.done && <button type="button">Completar</button>}
            </article>
          ))}
        </div>
      </section>

      <aside className="bonus">
        <span>âš¡</span>
        <div><strong>SumÃ¡ hasta 2 chances extra</strong><small>EtiquetÃ¡ mÃ¡s personas o compartÃ­ otra publicaciÃ³n.</small></div>
        <button type="button" aria-label="Ver chances extra">â†’</button>
      </aside>

      <nav className="bottom-nav" aria-label="NavegaciÃ³n principal">
        <a className="active" href="#inicio"><span>âŒ‚</span>Inicio</a>
        <a href="#sorteos"><span>â—‡</span>Sorteos</a>
        <a href="#ganadores"><span>â™•</span>Ganadores</a>
        <a href="#perfil"><span>â—‹</span>Mi perfil</a>
      </nav>
    </main>
  );
}
