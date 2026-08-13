import Link from "next/link";
import { CashierLoginForm } from "./login-form";
export default async function CashierLogin({ searchParams }: { searchParams: Promise<{ code?: string | string[] }> }) {
  const raw = (await searchParams).code;
  const value = (Array.isArray(raw) ? raw[0] : raw ?? "").replace(/[^a-f0-9]/gi, "").toUpperCase();
  const code = /^[A-F0-9]{8}$/.test(value) ? value : "";
  return <main className="admin-login-shell"><section className="admin-login-card">
    <Link className="brand" href="/">SUPER<span className="brand-dot">.</span><span className="brand-ar">AR</span><small>CAJA</small></Link>
    <p className="eyebrow cyan">ACCESO LIMITADO</p><h1>Caja</h1>
    <p>Este acceso permite únicamente consultar productos y validar canjes.</p>
    <CashierLoginForm defaultCode={code} />
  </section></main>;
}
