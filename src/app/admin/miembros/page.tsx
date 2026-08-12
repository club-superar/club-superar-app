Exit code: 0
Wall time: 0.6 seconds
Output:
import Link from "next/link";
import { requireAdminUserId } from "@/lib/auth/admin";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type AdminMembersPageProps = { searchParams: Promise<{ q?: string }> };

type MemberRow = {
  id: string;
  instagram_username: string;
  display_name: string | null;
  status: string;
  current_streak: number;
  longest_streak: number;
  created_at: string;
  participationCount: number;
  badgeCount: number;
  winnerCount: number;
};

export default async function AdminMembersPage({ searchParams }: AdminMembersPageProps) {
  await requireAdminUserId();
  const query = String((await searchParams).q ?? "").trim().toLowerCase().replace(/^@/, "").slice(0, 30);
  const admin = createAdminSupabaseClient();
  let request = admin
    .from("profiles")
    .select("id, instagram_username, display_name, status, current_streak, longest_streak, created_at")
    .order("created_at", { ascending: false })
    .limit(30);
  if (query) request = request.ilike("instagram_username_normalized", `%${query}%`);
  const { data, error } = await request;
  if (error) throw new Error(`No pudimos consultar los miembros: ${error.message}`);

  const profiles = data ?? [];
  const profileIds = profiles.map((profile) => profile.id);
  const [participationResult, badgeResult, winnerResult] = profileIds.length
    ? await Promise.all([
        admin.from("participations").select("profile_id").in("profile_id", profileIds),
        admin.from("profile_badges").select("profile_id").in("profile_id", profileIds),
        admin.from("winners").select("profile_id").in("profile_id", profileIds),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  const countByProfile = (rows: Array<{ profile_id: string }> | null | undefined) =>
    (rows ?? []).reduce<Record<string, number>>((counts, row) => {
      counts[row.profile_id] = (counts[row.profile_id] ?? 0) + 1;
      return counts;
    }, {});
  const participationCounts = countByProfile(participationResult.data);
  const badgeCounts = countByProfile(badgeResult.data);
  const winnerCounts = countByProfile(winnerResult.data);
  const members: MemberRow[] = profiles.map((profile) => ({
    ...profile,
    participationCount: participationCounts[profile.id] ?? 0,
    badgeCount: badgeCounts[profile.id] ?? 0,
    winnerCount: winnerCounts[profile.id] ?? 0,
  }));

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
              <div className="admin-member-mini-stats"><span>🔥 {member.current_streak}</span><span>🎟 {member.participationCount}</span><span>🎖 {member.badgeCount}</span><span>🏆 {member.winnerCount}</span></div>
            </Link>
        ))}
      </section>
    </main>
  );
}

