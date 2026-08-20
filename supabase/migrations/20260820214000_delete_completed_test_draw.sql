create or replace function public.admin_delete_test_draw(p_actor_id uuid, p_draw_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_draw public.draws;
  v_profile_ids uuid[];
begin
  if not exists (
    select 1 from private.admin_roles
    where user_id = p_actor_id and active and role = 'owner'
  ) then raise exception 'OWNER_REQUIRED'; end if;

  select * into v_draw from public.draws where id = p_draw_id for update;
  if not found then raise exception 'DRAW_NOT_FOUND'; end if;

  select array_agg(distinct profile_id) into v_profile_ids
  from public.participations where draw_id = p_draw_id;

  insert into private.audit_log(actor_user_id, action, entity_type, entity_id, before_data)
  values (p_actor_id, 'draw.test_deleted', 'draw', p_draw_id::text, to_jsonb(v_draw));

  delete from public.winner_deliveries where draw_id = p_draw_id;
  delete from public.winners where draw_id = p_draw_id;
  delete from public.disqualifications where draw_id = p_draw_id;
  delete from public.draw_attempts where draw_id = p_draw_id;
  delete from public.draw_snapshot_entries
    where snapshot_id in (select id from public.draw_snapshots where draw_id = p_draw_id);
  delete from public.draw_snapshots where draw_id = p_draw_id;
  delete from public.profile_badges where draw_id = p_draw_id;
  delete from public.points_ledger
    where participation_id in (select id from public.participations where draw_id = p_draw_id);
  delete from public.participations where draw_id = p_draw_id;
  delete from public.draws where id = p_draw_id;

  if v_profile_ids is not null then
    update public.profiles profile
    set current_streak = coalesce((
          select participation.streak_number
          from public.participations participation
          join public.draws draw on draw.id = participation.draw_id
          where participation.profile_id = profile.id
            and participation.status in ('eligible','frozen','winner_provisional','winner_confirmed')
          order by draw.edition_number desc limit 1
        ), 0),
        longest_streak = coalesce((
          select max(participation.streak_number)
          from public.participations participation
          where participation.profile_id = profile.id
        ), 0),
        updated_at = now()
    where profile.id = any(v_profile_ids);
  end if;
end;
$$;

revoke all on function public.admin_delete_test_draw(uuid,bigint) from public,anon,authenticated;
grant execute on function public.admin_delete_test_draw(uuid,bigint) to service_role;

