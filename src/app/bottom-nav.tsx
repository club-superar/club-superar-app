import Link from "next/link";

type BottomNavProps = {
  active: "inicio" | "sorteos" | "canjes" | "perfil";
  signedIn: boolean;
};

export function BottomNav({ active, signedIn }: BottomNavProps) {
  return (
    <nav className="bottom-nav" aria-label="Navegación principal">
      <Link className={active === "inicio" ? "active" : ""} href="/"><span>⌂</span>Inicio</Link>
      <Link className={active === "sorteos" ? "active" : ""} href="/#sorteos"><span>◇</span>Sorteos</Link>
      <Link className={active === "canjes" ? "active" : ""} href={signedIn ? "/canjes" : "/ingresar"}><span>◈</span>Canjes</Link>
      <Link className={active === "perfil" ? "active" : ""} href={signedIn ? "/perfil" : "/ingresar"}><span>○</span>Mi perfil</Link>
    </nav>
  );
}
