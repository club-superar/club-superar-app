-- Insignias configurables por racha y SUPER Puntos.

insert into private.app_settings (setting_key, setting_value)
values ('badge_thresholds', '{"loyal_streak":3,"legend_points":100}'::jsonb)
on conflict (setting_key) do nothing;

update public.badge_definitions
set description = 'Por alcanzar una racha de 3 sorteos consecutivos.'
where badge_key = 'loyal';

update public.badge_definitions
set description = 'Por alcanzar 100 SUPER Puntos.'
where badge_key = 'legend';

create or replace function private.award_progress_badges(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_loyal_streak integer;
  v_legend_points integer;
  v_current_streak integer;
  v_points bigint;
  v_badge_id bigint;
begin
  select
    coalesce((setting_value ->> 'loyal_streak')::integer, 3),
    coalesce((setting_value ->> 'legend_points')::integer, 100)
  into v_loyal_streak, v_legend_points
  from private.app_settings
  where setting_key = 'badge_thresholds';

  select current_streak into v_current_streak
  from public.profiles where id = p_profile_id and status = 'active';
  if not found then return; end if;

  if v_current_streak >= v_loyal_streak then
    select id into v_badge_id from public.badge_definitions where badge_key = 'loyal' and active;
    if v_badge_id is not null then
      insert into public.profile_badges (profile_id, badge_id, metadata)
      values (p_profile_id, v_badge_id, jsonb_build_object('threshold', v_loyal_streak, 'value', v_current_streak))
      on conflict (profile_id, badge_id) where draw_id is null do nothing;
    end if;
  end if;

  select coalesce(sum(amount), 0) into v_points
  from public.points_ledger where profile_id = p_profile_id;
  if v_points >= v_legend_points then
    select id into v_badge_id from public.badge_definitions where badge_key = 'legend' and active;
    if v_badge_id is not null then
      insert into public.profile_badges (profile_id, badge_id, metadata)
      values (p_profile_id, v_badge_id, jsonb_build_object('threshold', v_legend_points, 'value', v_points))
      on conflict (profile_id, badge_id) where draw_id is null do nothing;
    end if;
  end if;
end;
$$;

revoke all on function private.award_progress_badges(uuid) from public, anon, authenticated;

create or replace function private.points_badges_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.award_progress_badges(new.profile_id);
  return new;
end;
$$;

create or replace function private.profile_streak_badges_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.current_streak is distinct from old.current_streak then
    perform private.award_progress_badges(new.id);
  end if;
  return new;
end;
$$;

revoke all on function private.points_badges_trigger() from public, anon, authenticated;
revoke all on function private.profile_streak_badges_trigger() from public, anon, authenticated;

create trigger points_ledger_award_badges
after insert on public.points_ledger
for each row execute function private.points_badges_trigger();

create trigger profiles_streak_award_badges
after update of current_streak on public.profiles
for each row execute function private.profile_streak_badges_trigger();

create or replace function public.admin_update_badge_thresholds(
  p_actor_id uuid,
  p_loyal_streak integer,
  p_legend_points integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile record;
  v_before jsonb;
  v_after jsonb;
begin
  if not exists (
    select 1 from private.admin_roles
    where user_id = p_actor_id and active and role in ('owner', 'admin')
  ) then raise exception 'ADMIN_REQUIRED'; end if;
  if p_loyal_streak not between 2 and 50 or p_legend_points not between 10 and 1000000 then
    raise exception 'INVALID_BADGE_THRESHOLDS';
  end if;

  select setting_value into v_before from private.app_settings where setting_key = 'badge_thresholds';
  v_after := jsonb_build_object('loyal_streak', p_loyal_streak, 'legend_points', p_legend_points);
  insert into private.app_settings (setting_key, setting_value, updated_by)
  values ('badge_thresholds', v_after, p_actor_id)
  on conflict (setting_key) do update set
    setting_value = excluded.setting_value,
    version = private.app_settings.version + 1,
    updated_by = excluded.updated_by,
    updated_at = now();

  update public.badge_definitions set description = format('Por alcanzar una racha de %s sorteos consecutivos.', p_loyal_streak) where badge_key = 'loyal';
  update public.badge_definitions set description = format('Por alcanzar %s SUPER Puntos.', p_legend_points) where badge_key = 'legend';

  for v_profile in select id from public.profiles where status = 'active' loop
    perform private.award_progress_badges(v_profile.id);
  end loop;

  insert into private.audit_log (actor_user_id, action, entity_type, entity_id, before_data, after_data)
  values (p_actor_id, 'badge_thresholds.updated', 'app_setting', 'badge_thresholds', v_before, v_after);
  return v_after;
end;
$$;

revoke all on function public.admin_update_badge_thresholds(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_update_badge_thresholds(uuid, integer, integer) to service_role;

create or replace function public.admin_get_badge_thresholds(p_actor_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_settings jsonb;
begin
  if not exists (
    select 1 from private.admin_roles where user_id = p_actor_id and active
  ) then raise exception 'ADMIN_REQUIRED'; end if;
  select setting_value into v_settings from private.app_settings where setting_key = 'badge_thresholds';
  return coalesce(v_settings, '{"loyal_streak":3,"legend_points":100}'::jsonb);
end;
$$;

revoke all on function public.admin_get_badge_thresholds(uuid) from public, anon, authenticated;
grant execute on function public.admin_get_badge_thresholds(uuid) to service_role;

do $$
declare v_profile record;
begin
  for v_profile in select id from public.profiles where status = 'active' loop
    perform private.award_progress_badges(v_profile.id);
  end loop;
end;
$$;
