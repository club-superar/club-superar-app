-- Canjes de SUPER Puntos: catálogo opcional, canje libre y validación de caja.
insert into private.app_settings (setting_key, setting_value)
values ('rewards', '{"earning_percent":5,"ars_per_point":100,"minimum_redemption_points":10,"redemption_expiry_minutes":10}'::jsonb)
on conflict (setting_key) do nothing;

create table public.reward_catalog (
  id bigint generated always as identity primary key,
  name text not null check (length(trim(name)) between 3 and 80),
  description text not null default '' check (length(description) <= 240),
  points_cost integer not null check (points_cost > 0),
  active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.point_redemptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete restrict,
  reward_id bigint references public.reward_catalog(id) on delete restrict,
  reward_name text,
  points integer not null check (points > 0),
  ars_value numeric(12,2) not null check (ars_value >= 0),
  code_hash text not null unique,
  code_suffix text not null check (length(code_suffix) = 4),
  status text not null default 'pending' check (status in ('pending','confirmed','cancelled','expired')),
  expires_at timestamptz not null,
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users(id) on delete set null,
  cancelled_at timestamptz,
  created_at timestamptz not null default now()
);

create index point_redemptions_profile_created_idx on public.point_redemptions(profile_id, created_at desc);
create index point_redemptions_pending_expiry_idx on public.point_redemptions(expires_at) where status = 'pending';

alter table public.reward_catalog enable row level security;
alter table public.point_redemptions enable row level security;
grant select on public.reward_catalog to authenticated;
grant select on public.point_redemptions to authenticated;
grant all on public.reward_catalog, public.point_redemptions to service_role;
grant usage, select on sequence public.reward_catalog_id_seq to service_role;

create policy reward_catalog_active_read on public.reward_catalog for select to authenticated using (active);
create policy point_redemptions_select_own on public.point_redemptions for select to authenticated using ((select auth.uid()) = profile_id);

create or replace function private.expire_point_redemptions()
returns void language sql security invoker set search_path = '' as $$
  update public.point_redemptions set status = 'expired'
  where status = 'pending' and expires_at <= now();
$$;
revoke all on function private.expire_point_redemptions() from public, anon, authenticated;

create or replace function public.create_point_redemption(p_profile_id uuid, p_reward_id bigint, p_points integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_settings jsonb; v_balance bigint; v_reserved bigint; v_cost integer; v_name text; v_code text; v_hash text; v_expiry timestamptz; v_id uuid; v_ars_per_point numeric;
begin
  if not exists(select 1 from public.profiles where id=p_profile_id and status='active') then raise exception 'PROFILE_NOT_ACTIVE'; end if;
  perform private.expire_point_redemptions();
  select setting_value into v_settings from private.app_settings where setting_key='rewards';
  v_ars_per_point := coalesce((v_settings->>'ars_per_point')::numeric,100);
  if p_reward_id is not null then
    select points_cost,name into v_cost,v_name from public.reward_catalog where id=p_reward_id and active for share;
    if v_cost is null then raise exception 'REWARD_NOT_FOUND'; end if;
  else
    v_cost := p_points; v_name := 'Canje libre en el local';
    if v_cost < coalesce((v_settings->>'minimum_redemption_points')::integer,10) then raise exception 'MINIMUM_POINTS'; end if;
  end if;
  select coalesce(sum(amount),0) into v_balance from public.points_ledger where profile_id=p_profile_id;
  select coalesce(sum(points),0) into v_reserved from public.point_redemptions where profile_id=p_profile_id and status='pending' and expires_at>now();
  if v_cost > v_balance-v_reserved then raise exception 'INSUFFICIENT_POINTS'; end if;
  v_code := upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  v_hash := encode(extensions.digest(v_code,'sha256'),'hex');
  v_expiry := now()+make_interval(mins=>coalesce((v_settings->>'redemption_expiry_minutes')::integer,10));
  insert into public.point_redemptions(profile_id,reward_id,reward_name,points,ars_value,code_hash,code_suffix,expires_at)
  values(p_profile_id,p_reward_id,v_name,v_cost,v_cost*v_ars_per_point,v_hash,right(v_code,4),v_expiry) returning id into v_id;
  return jsonb_build_object('id',v_id,'code',v_code,'points',v_cost,'ars_value',v_cost*v_ars_per_point,'reward_name',v_name,'expires_at',v_expiry);
end; $$;

create or replace function public.get_reward_settings()
returns jsonb language sql security definer set search_path = '' stable as $$
  select coalesce((select setting_value from private.app_settings where setting_key='rewards'),'{}'::jsonb);
$$;

create or replace function public.admin_confirm_point_redemption(p_actor_id uuid, p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_item public.point_redemptions; v_hash text; v_balance bigint;
begin
  if not public.is_phase1_admin(p_actor_id) then raise exception 'NOT_ADMIN'; end if;
  perform private.expire_point_redemptions();
  v_hash:=encode(extensions.digest(upper(trim(p_code)),'sha256'),'hex');
  select * into v_item from public.point_redemptions where code_hash=v_hash for update;
  if v_item.id is null then raise exception 'CODE_NOT_FOUND'; end if;
  if v_item.status <> 'pending' then raise exception 'CODE_NOT_PENDING'; end if;
  select coalesce(sum(amount),0) into v_balance from public.points_ledger where profile_id=v_item.profile_id;
  if v_balance < v_item.points then raise exception 'INSUFFICIENT_POINTS'; end if;
  insert into public.points_ledger(profile_id,amount,reason_key,description,idempotency_key,created_by)
  values(v_item.profile_id,-v_item.points,'redemption','Canje exitoso','redemption:'||v_item.id,p_actor_id);
  update public.point_redemptions set status='confirmed',confirmed_at=now(),confirmed_by=p_actor_id where id=v_item.id;
  insert into private.audit_log(actor_user_id,action,entity_type,entity_id,before_data,after_data)
  values(p_actor_id,'points.redemption_confirmed','point_redemption',v_item.id::text,jsonb_build_object('status','pending'),jsonb_build_object('status','confirmed','points',v_item.points));
  return jsonb_build_object('id',v_item.id,'profile_id',v_item.profile_id,'points',v_item.points,'ars_value',v_item.ars_value,'reward_name',v_item.reward_name);
end; $$;

create or replace function public.admin_update_reward_settings(p_actor_id uuid,p_earning_percent numeric,p_ars_per_point numeric,p_minimum integer,p_expiry integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_value jsonb;
begin
  if not public.is_phase1_admin(p_actor_id) then raise exception 'NOT_ADMIN'; end if;
  if p_earning_percent<=0 or p_earning_percent>25 or p_ars_per_point<=0 or p_minimum<1 or p_expiry not between 3 and 60 then raise exception 'INVALID_SETTINGS'; end if;
  v_value:=jsonb_build_object('earning_percent',p_earning_percent,'ars_per_point',p_ars_per_point,'minimum_redemption_points',p_minimum,'redemption_expiry_minutes',p_expiry);
  insert into private.app_settings(setting_key,setting_value,updated_by) values('rewards',v_value,p_actor_id)
  on conflict(setting_key) do update set setting_value=excluded.setting_value,updated_by=p_actor_id,updated_at=now();
  return v_value;
end; $$;

revoke all on function public.create_point_redemption(uuid,bigint,integer) from public,anon,authenticated;
revoke all on function public.admin_confirm_point_redemption(uuid,text) from public,anon,authenticated;
revoke all on function public.admin_update_reward_settings(uuid,numeric,numeric,integer,integer) from public,anon,authenticated;
revoke all on function public.get_reward_settings() from public,anon;
grant execute on function public.create_point_redemption(uuid,bigint,integer) to service_role;
grant execute on function public.admin_confirm_point_redemption(uuid,text) to service_role;
grant execute on function public.admin_update_reward_settings(uuid,numeric,numeric,integer,integer) to service_role;
grant execute on function public.get_reward_settings() to authenticated,service_role;
