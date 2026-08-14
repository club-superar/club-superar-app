-- Excepción manual, reversible y auditada para habilitar canjes sin participación.

create table if not exists public.redemption_access_overrides (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  active boolean not null default true,
  reason text not null check (char_length(reason) between 3 and 200),
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.redemption_access_overrides enable row level security;
revoke all on table public.redemption_access_overrides from public, anon, authenticated;
grant select, insert, update on table public.redemption_access_overrides to service_role;

create or replace function public.can_profile_redeem_points(p_profile_id uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_open_draw_id bigint;
begin
  if exists (
    select 1 from public.redemption_access_overrides
    where profile_id = p_profile_id and active
  ) then return true; end if;

  select id into v_open_draw_id from public.draws
  where status = 'open' and (opens_at is null or opens_at <= now())
    and (closes_at is null or closes_at > now())
  order by edition_number desc limit 1;
  if v_open_draw_id is not null then
    return exists (select 1 from public.participations
      where draw_id = v_open_draw_id and profile_id = p_profile_id
        and status = 'eligible' and completed_at is not null);
  end if;
  return exists (select 1 from public.participations
    where profile_id = p_profile_id and completed_at is not null
      and status in ('eligible','frozen','winner_provisional','winner_confirmed'));
end; $$;
revoke all on function public.can_profile_redeem_points(uuid) from public, anon, authenticated;
grant execute on function public.can_profile_redeem_points(uuid) to service_role;

create or replace function public.admin_set_redemption_access_override(
  p_actor_id uuid, p_profile_id uuid, p_active boolean, p_reason text
) returns void language plpgsql security definer set search_path = '' as $$
declare v_before public.redemption_access_overrides;
begin
  if not exists (
    select 1 from private.admin_roles
    where user_id = p_actor_id and active and role in ('owner', 'admin')
  ) then raise exception 'ADMIN_REQUIRED'; end if;
  if not exists (select 1 from public.profiles where id = p_profile_id)
    then raise exception 'PROFILE_NOT_FOUND'; end if;
  if char_length(trim(coalesce(p_reason, ''))) not between 3 and 200
    then raise exception 'REASON_REQUIRED'; end if;

  select * into v_before from public.redemption_access_overrides where profile_id = p_profile_id;
  insert into public.redemption_access_overrides(profile_id, active, reason, granted_by, granted_at, updated_at)
  values (p_profile_id, p_active, trim(p_reason), p_actor_id, now(), now())
  on conflict (profile_id) do update set
    active = excluded.active, reason = excluded.reason, granted_by = excluded.granted_by,
    granted_at = case when excluded.active then now() else public.redemption_access_overrides.granted_at end,
    updated_at = now();

  insert into private.audit_log(actor_user_id, action, entity_type, entity_id, before_data, after_data)
  values (p_actor_id, case when p_active then 'redemption.override_enabled' else 'redemption.override_disabled' end,
    'profile', p_profile_id::text, to_jsonb(v_before),
    jsonb_build_object('active', p_active, 'reason', trim(p_reason)));
end; $$;
revoke all on function public.admin_set_redemption_access_override(uuid, uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.admin_set_redemption_access_override(uuid, uuid, boolean, text) to service_role;
