-- Safe cleanup for a test draw. Profiles and member accounts are preserved.
create or replace function public.admin_delete_test_draw(p_actor_id uuid, p_draw_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare v_draw public.draws;
begin
  if not exists (
    select 1 from private.admin_roles
    where user_id = p_actor_id and active and role = 'owner'
  ) then raise exception 'OWNER_REQUIRED'; end if;

  select * into v_draw from public.draws where id = p_draw_id for update;
  if not found then raise exception 'DRAW_NOT_FOUND'; end if;
  if exists (select 1 from public.winners where draw_id = p_draw_id) then
    raise exception 'DRAW_HAS_WINNER';
  end if;

  insert into private.audit_log(actor_user_id, action, entity_type, entity_id, before_data)
  values (p_actor_id, 'draw.test_deleted', 'draw', p_draw_id::text, to_jsonb(v_draw));

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
end;
$$;

revoke all on function public.admin_delete_test_draw(uuid, bigint) from public, anon, authenticated;
grant execute on function public.admin_delete_test_draw(uuid, bigint) to service_role;
