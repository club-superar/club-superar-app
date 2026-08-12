-- Ajustes manuales auditables para probar y corregir el progreso de un miembro.

create or replace function public.admin_adjust_member_points(
  p_actor_id uuid,
  p_profile_id uuid,
  p_amount integer,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before bigint;
  v_after bigint;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if not exists (
    select 1 from private.admin_roles
    where user_id = p_actor_id and active and role in ('owner', 'admin')
  ) then raise exception 'ADMIN_REQUIRED'; end if;
  if not exists (select 1 from public.profiles where id = p_profile_id) then
    raise exception 'PROFILE_NOT_FOUND';
  end if;
  if p_amount = 0 or abs(p_amount) > 100000 or length(v_reason) not between 3 and 200 then
    raise exception 'INVALID_ADJUSTMENT';
  end if;

  select coalesce(sum(amount), 0) into v_before
  from public.points_ledger where profile_id = p_profile_id;
  v_after := v_before + p_amount;
  if v_after < 0 then raise exception 'NEGATIVE_POINTS'; end if;

  insert into public.points_ledger (
    profile_id, amount, reason_key, description, idempotency_key, created_by
  ) values (
    p_profile_id, p_amount, 'admin_adjustment', v_reason,
    'admin_points:' || gen_random_uuid()::text, p_actor_id
  );

  insert into private.audit_log (actor_user_id, action, entity_type, entity_id, before_data, after_data)
  values (
    p_actor_id, 'member.points_adjusted', 'profile', p_profile_id::text,
    jsonb_build_object('points', v_before),
    jsonb_build_object('points', v_after, 'amount', p_amount, 'reason', v_reason)
  );
  return jsonb_build_object('points', v_after);
end;
$$;

create or replace function public.admin_update_member_streak(
  p_actor_id uuid,
  p_profile_id uuid,
  p_current_streak integer,
  p_longest_streak integer,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if not exists (
    select 1 from private.admin_roles
    where user_id = p_actor_id and active and role in ('owner', 'admin')
  ) then raise exception 'ADMIN_REQUIRED'; end if;
  if p_current_streak not between 0 and 1000
    or p_longest_streak not between 0 and 1000
    or p_longest_streak < p_current_streak
    or length(v_reason) not between 3 and 200 then
    raise exception 'INVALID_STREAK';
  end if;

  select jsonb_build_object('current_streak', current_streak, 'longest_streak', longest_streak)
  into v_before from public.profiles where id = p_profile_id for update;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;

  update public.profiles set
    current_streak = p_current_streak,
    longest_streak = p_longest_streak
  where id = p_profile_id;
  v_after := jsonb_build_object(
    'current_streak', p_current_streak,
    'longest_streak', p_longest_streak,
    'reason', v_reason
  );

  insert into private.audit_log (actor_user_id, action, entity_type, entity_id, before_data, after_data)
  values (p_actor_id, 'member.streak_updated', 'profile', p_profile_id::text, v_before, v_after);
  return v_after;
end;
$$;

create or replace function public.admin_set_member_badge(
  p_actor_id uuid,
  p_profile_id uuid,
  p_badge_key text,
  p_awarded boolean,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_badge_id bigint;
  v_before boolean;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if not exists (
    select 1 from private.admin_roles
    where user_id = p_actor_id and active and role in ('owner', 'admin')
  ) then raise exception 'ADMIN_REQUIRED'; end if;
  if not exists (select 1 from public.profiles where id = p_profile_id) then
    raise exception 'PROFILE_NOT_FOUND';
  end if;
  if p_badge_key not in ('loyal', 'legend') or length(v_reason) not between 3 and 200 then
    raise exception 'INVALID_BADGE_CHANGE';
  end if;

  select id into v_badge_id
  from public.badge_definitions where badge_key = p_badge_key and active;
  if v_badge_id is null then raise exception 'BADGE_NOT_FOUND'; end if;
  select exists (
    select 1 from public.profile_badges
    where profile_id = p_profile_id and badge_id = v_badge_id and draw_id is null
  ) into v_before;

  if p_awarded then
    insert into public.profile_badges (profile_id, badge_id, awarded_by, metadata)
    values (p_profile_id, v_badge_id, p_actor_id, jsonb_build_object('manual', true, 'reason', v_reason))
    on conflict (profile_id, badge_id) where draw_id is null do update set
      awarded_by = excluded.awarded_by,
      awarded_at = now(),
      metadata = excluded.metadata;
  else
    delete from public.profile_badges
    where profile_id = p_profile_id and badge_id = v_badge_id and draw_id is null;
  end if;

  insert into private.audit_log (actor_user_id, action, entity_type, entity_id, before_data, after_data)
  values (
    p_actor_id, 'member.badge_changed', 'profile', p_profile_id::text,
    jsonb_build_object('badge_key', p_badge_key, 'awarded', v_before),
    jsonb_build_object('badge_key', p_badge_key, 'awarded', p_awarded, 'reason', v_reason)
  );
  return jsonb_build_object('badge_key', p_badge_key, 'awarded', p_awarded);
end;
$$;

revoke all on function public.admin_adjust_member_points(uuid, uuid, integer, text)
  from public, anon, authenticated;
revoke all on function public.admin_update_member_streak(uuid, uuid, integer, integer, text)
  from public, anon, authenticated;
revoke all on function public.admin_set_member_badge(uuid, uuid, text, boolean, text)
  from public, anon, authenticated;
grant execute on function public.admin_adjust_member_points(uuid, uuid, integer, text) to service_role;
grant execute on function public.admin_update_member_streak(uuid, uuid, integer, integer, text) to service_role;
grant execute on function public.admin_set_member_badge(uuid, uuid, text, boolean, text) to service_role;

