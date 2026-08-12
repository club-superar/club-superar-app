import Link from "next/link";
import { requireAdminUserId } from "@/lib/auth/admin";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

type AdminMembersPageProps = { searchParams: Promise<{ q?: string }> };

type MemberRow = {
  id: string;
  instagram_username: string;
  display_name: string | null;
  status: string;
  current_streak: number;
  longest_streak: number;
  created_at: string;
  participations: { id: number }[];
  profile_badges: { id: number }[];
  winners: { id: number }[];
};

export default async function AdminMembersPage({ searchParams }: AdminMembersPageProps) {
  await requireAdminUserId();
  const query = String((await searchParams).q ?? "").trim().toLowerCase().replace(/^@/, "").slice(0, 30);
  const admin = createAdminSupabaseClient();
  let request = admin
    .from("profiles")
    .select("id, instagram_username, display_name, status, current_streak, longest_streak, created_at, participations(id), profile_badges(id), winners(id)")
    .order("created_at", { ascending: false })
    .limit(30);
  if (query) request = request.ilike("instagram_username_normalized", `%${query}%`);
  const { data } = await request;
  const members = (data ?? []) as unknown as MemberRow[];

  return (
    <main className="admin-shell">
      <header className="admin-topbar">
        <Link className="brand" href="/admin"><span>SUPER</span><span className="brand-dot">.</span><span className="brand-ar">AR</span><small>ADMIN</small></Link>
        <Link className="admin-back" href="/admin">← Panel</Link>
      </header>
      <section className="admin-heading"><p className="eyebrow cyan">GESTIÓN DEL CLUB</p><h1>Miembros</h1><p>Buscá una cuenta y consultá toda su actividad.</p></section>

      <form className="admin-member-search" method="get">
        <label htmlFor="member-query">Usuario de Instagram</label>
        <div><span>@</span><input id="member-query" name="q" defaultValue={query} autoCapitalize="none" autoCorrect="off" placeholder="usuario" maxLength={30} /><button type="submit">Buscar</button></div>
      </form>

      <p className="admin-result-count">{members.length} {members.length === 1 ? "miembro encontrado" : "miembros encontrados"}{query ? ` para @${query}` : " recientes"}.</p>
      <section className="admin-member-list">
        {members.length === 0 && <p className="admin-empty">No encontramos ningún miembro con ese usuario.</p>}
        {members.map((member) => (
            <Link href={`/admin/miembros/${member.id}`} key={member.id}>
              <div className="admin-member-avatar" aria-hidden="true">@</div>
              <div><strong>@{member.instagram_username}</strong><small>{member.display_name || `Registrado el ${new Intl.DateTimeFormat("es-AR").format(new Date(member.created_at))}`}</small></div>
              <div className="admin-member-mini-stats"><span>🔥 {member.current_streak}</span><span>🎟 {member.participations.length}</span><span>🎖 {member.profile_badges.length}</span><span>🏆 {member.winners.length}</span></div>
            </Link>
        ))}
      </section>
    </main>
  );
}
