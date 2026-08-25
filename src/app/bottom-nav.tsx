import Link from "next/link";

type BottomNavProps = {
  active: "sorteo" | "tickets" | "canjes" | "perfil";
  signedIn: boolean;
};

export function BottomNav({ active, signedIn }: BottomNavProps) {
  return (
    <nav className="bottom-nav" aria-label="Navegación principal">
      <Link className={active === "sorteo" ? "active" : ""} href="/"><span>◇</span>Sorteo</Link>
      <Link className={active === "tickets" ? "active" : ""} href="/tickets"><span>▣</span>Tickets</Link>
      <Link className={active === "canjes" ? "active" : ""} href={signedIn ? "/canjes" : "/ingresar"}><span>◈</span>Canjes</Link>
      <Link className={active === "perfil" ? "active" : ""} href={signedIn ? "/perfil" : "/ingresar"}><span>○</span>Mi perfil</Link>
    </nav>
  );
}
