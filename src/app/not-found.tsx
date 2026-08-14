import Link from "next/link";

export default function NotFound() {
  return <main className="app-shell"><section className="hero"><p className="eyebrow">CLUB SUPER.AR</p><h1>Página no encontrada</h1><p className="hero-copy">Volvé al inicio para continuar.</p><Link href="/" className="brand">Ir al inicio</Link></section></main>;
}
