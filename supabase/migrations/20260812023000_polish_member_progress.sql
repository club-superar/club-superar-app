-- Corrige los iconos, oculta motivos internos en movimientos futuros y ajusta Leyenda.

update public.badge_definitions
set icon = chr(128293)
where badge_key = 'loyal';

update public.badge_definitions
set icon = chr(128142)
where badge_key = 'legend';

update private.app_settings
set
  setting_value = jsonb_set(setting_value, '{legend_points}', '1000'::jsonb),
  version = version + 1,
  updated_at = now()
where setting_key = 'badge_thresholds';

update public.badge_definitions
set description = 'Por alcanzar 1000 SUPER Puntos.'
where badge_key = 'legend';

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
    p_profile_id, p_amount, 'admin_adjustment', 'Ajuste de SUPER Puntos',
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

revoke all on function public.admin_adjust_member_points(uuid, uuid, integer, text)
  from public, anon, authenticated;
grant execute on function public.admin_adjust_member_points(uuid, uuid, integer, text)
  to service_role;
