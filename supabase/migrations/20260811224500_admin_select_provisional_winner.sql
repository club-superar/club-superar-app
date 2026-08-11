-- Club SUPER.AR - Eleccion criptografica y ponderada del ganador provisional.

create or replace function public.admin_select_provisional_winner(
  p_actor_id uuid,
  p_draw_id bigint
)
returns public.draw_attempts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draw public.draws;
  v_snapshot public.draw_snapshots;
  v_attempt public.draw_attempts;
  v_selected public.draw_snapshot_entries;
  v_attempt_number integer;
  v_total_chances bigint;
  v_entropy bigint;
  v_limit bigint;
  v_random_value bigint;
begin
  if not exists (
    select 1 from private.admin_roles
    where user_id = p_actor_id and active and role in ('owner', 'admin')
  ) then raise exception 'ADMIN_REQUIRED'; end if;

  select * into v_draw from public.draws where id = p_draw_id for update;
  if not found or v_draw.status not in ('frozen', 'winner_review') then
    raise exception 'DRAW_NOT_FROZEN';
  end if;

  if exists (
    select 1 from public.draw_attempts
    where draw_id = p_draw_id and status in ('provisional', 'under_review')
  ) then raise exception 'UNRESOLVED_ATTEMPT'; end if;

  select * into v_snapshot
  from public.draw_snapshots
  where draw_id = p_draw_id
  order by version desc
  limit 1;
  if not found then raise exception 'SNAPSHOT_REQUIRED'; end if;

  select coalesce(sum(entry.final_chances), 0)::bigint
  into v_total_chances
  from public.draw_snapshot_entries entry
  where entry.snapshot_id = v_snapshot.id
    and not exists (
      select 1 from public.disqualifications disqualification
      where disqualification.draw_id = p_draw_id
        and disqualification.participation_id = entry.participation_id
    );
  if v_total_chances <= 0 then raise exception 'NO_CANDIDATES_LEFT'; end if;

  -- Rejection sampling over 56 random bits avoids modulo bias.
  v_limit := 72057594037927935 - mod(72057594037927936::numeric, v_total_chances)::bigint;
  loop
    v_entropy := (('x' || encode(extensions.gen_random_bytes(7), 'hex'))::bit(56)::bigint);
    exit when v_entropy <= v_limit;
  end loop;
  v_random_value := mod(v_entropy, v_total_chances) + 1;

  with candidates as (
    select entry.*,
      sum(entry.final_chances) over (order by entry.id rows between unbounded preceding and current row)::bigint
        as remaining_range_end
    from public.draw_snapshot_entries entry
    where entry.snapshot_id = v_snapshot.id
      and not exists (
        select 1 from public.disqualifications disqualification
        where disqualification.draw_id = p_draw_id
          and disqualification.participation_id = entry.participation_id
      )
  )
  select candidates.id, candidates.snapshot_id, candidates.participation_id,
    candidates.profile_id, candidates.instagram_username, candidates.final_chances,
    candidates.range_start, candidates.range_end, candidates.created_at
  into v_selected
  from candidates
  where v_random_value <= candidates.remaining_range_end
  order by candidates.remaining_range_end
  limit 1;
  if not found then raise exception 'SELECTION_FAILED'; end if;

  select coalesce(max(attempt_number), 0) + 1
  into v_attempt_number
  from public.draw_attempts
  where draw_id = p_draw_id;

  insert into public.draw_attempts (
    draw_id, snapshot_id, attempt_number, random_value,
    selected_entry_id, status, created_by
  ) values (
    p_draw_id, v_snapshot.id, v_attempt_number, v_random_value,
    v_selected.id, 'provisional', p_actor_id
  ) returning * into v_attempt;

  update public.participations
  set status = 'winner_provisional', updated_at = now()
  where id = v_selected.participation_id;

  update public.draws
  set status = 'winner_review', updated_at = now()
  where id = p_draw_id;

  insert into private.audit_log (
    actor_user_id, action, entity_type, entity_id, before_data, after_data
  ) values (
    p_actor_id, 'draw.provisional_winner_selected', 'draw_attempt', v_attempt.id::text,
    null,
    jsonb_build_object(
      'draw_id', p_draw_id,
      'snapshot_id', v_snapshot.id,
      'attempt_number', v_attempt_number,
      'eligible_chances', v_total_chances,
      'random_value', v_random_value,
      'selected_entry_id', v_selected.id,
      'participation_id', v_selected.participation_id,
      'profile_id', v_selected.profile_id,
      'instagram_username', v_selected.instagram_username
    )
  );

  return v_attempt;
end;
$$;

revoke all on function public.admin_select_provisional_winner(uuid, bigint)
from public, anon, authenticated;
grant execute on function public.admin_select_provisional_winner(uuid, bigint)
to service_role;
