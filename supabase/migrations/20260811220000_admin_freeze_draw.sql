-- Club SUPER.AR - Cierre transaccional y snapshot inmutable del sorteo.

create or replace function public.admin_freeze_draw(
  p_actor_id uuid,
  p_draw_id bigint
)
returns public.draw_snapshots
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draw public.draws;
  v_snapshot public.draw_snapshots;
  v_participant_count integer;
  v_total_chances bigint;
  v_payload text;
  v_hash text;
begin
  if not exists (
    select 1 from private.admin_roles
    where user_id = p_actor_id and active and role in ('owner', 'admin')
  ) then raise exception 'ADMIN_REQUIRED'; end if;

  select * into v_draw from public.draws where id = p_draw_id for update;
  if not found or v_draw.status <> 'open' then raise exception 'DRAW_NOT_OPEN'; end if;

  select count(*)::integer, coalesce(sum(p.final_chances), 0)::bigint,
    string_agg(
      p.id::text || ':' || p.profile_id::text || ':' || profile.instagram_username_normalized || ':' || p.final_chances::text,
      '|' order by p.id
    )
  into v_participant_count, v_total_chances, v_payload
  from public.participations p
  join public.profiles profile on profile.id = p.profile_id
  where p.draw_id = p_draw_id and p.status = 'eligible' and p.final_chances > 0;

  if v_participant_count = 0 or v_total_chances = 0 then
    raise exception 'NO_ELIGIBLE_PARTICIPANTS';
  end if;

  v_hash := encode(extensions.digest(
    p_draw_id::text || '|1|' || v_participant_count::text || '|' || v_total_chances::text || '|' || coalesce(v_payload, ''),
    'sha256'
  ), 'hex');

  insert into public.draw_snapshots (
    draw_id, version, participant_count, total_chances, snapshot_hash, created_by
  ) values (
    p_draw_id, 1, v_participant_count, v_total_chances, v_hash, p_actor_id
  ) returning * into v_snapshot;

  insert into public.draw_snapshot_entries (
    snapshot_id, participation_id, profile_id, instagram_username,
    final_chances, range_start, range_end
  )
  select v_snapshot.id, ranked.participation_id, ranked.profile_id, ranked.instagram_username,
    ranked.final_chances, ranked.range_end - ranked.final_chances + 1, ranked.range_end
  from (
    select p.id as participation_id, p.profile_id,
      profile.instagram_username_normalized as instagram_username,
      p.final_chances,
      sum(p.final_chances) over (order by p.id rows between unbounded preceding and current row)::bigint as range_end
    from public.participations p
    join public.profiles profile on profile.id = p.profile_id
    where p.draw_id = p_draw_id and p.status = 'eligible' and p.final_chances > 0
  ) ranked;

  update public.participations
  set status = 'frozen', frozen_at = now(), updated_at = now()
  where draw_id = p_draw_id and status = 'eligible';

  update public.draws
  set status = 'frozen', frozen_at = now(), updated_at = now()
  where id = p_draw_id;

  insert into private.audit_log (
    actor_user_id, action, entity_type, entity_id, before_data, after_data
  ) values (
    p_actor_id, 'draw.frozen', 'draw', p_draw_id::text, to_jsonb(v_draw),
    jsonb_build_object(
      'snapshot_id', v_snapshot.id,
      'participant_count', v_snapshot.participant_count,
      'total_chances', v_snapshot.total_chances,
      'snapshot_hash', v_snapshot.snapshot_hash
    )
  );

  return v_snapshot;
end;
$$;

revoke all on function public.admin_freeze_draw(uuid, bigint)
from public, anon, authenticated;
grant execute on function public.admin_freeze_draw(uuid, bigint)
to service_role;
