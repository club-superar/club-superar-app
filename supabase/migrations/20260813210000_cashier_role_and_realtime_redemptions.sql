create table public.cashier_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 2 and 60),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index cashier_accounts_one_active_idx on public.cashier_accounts ((active)) where active;
alter table public.cashier_accounts enable row level security;
grant all on public.cashier_accounts to service_role;

create or replace function public.is_cashier(p_user_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.cashier_accounts where user_id=p_user_id and active);
$$;
revoke all on function public.is_cashier(uuid) from public,anon,authenticated;
grant execute on function public.is_cashier(uuid) to service_role;

create or replace function public.cashier_preview_point_redemption(p_actor_id uuid,p_code text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_item public.point_redemptions; v_username text; v_balance bigint;
begin
  if not (public.is_cashier(p_actor_id) or public.is_phase1_admin(p_actor_id)) then raise exception 'NOT_CASHIER'; end if;
  perform private.expire_point_redemptions();
  select * into v_item from public.point_redemptions where code_hash=encode(extensions.digest(upper(trim(p_code)),'sha256'),'hex');
  if v_item.id is null then raise exception 'CODE_NOT_FOUND'; end if;
  if v_item.status <> 'pending' then raise exception 'CODE_NOT_PENDING'; end if;
  select instagram_username into v_username from public.profiles where id=v_item.profile_id;
  select coalesce(sum(amount),0) into v_balance from public.points_ledger where profile_id=v_item.profile_id;
  return jsonb_build_object('id',v_item.id,'instagram_username',v_username,'reward_name',v_item.reward_name,'points',v_item.points,'ars_value',v_item.ars_value,'balance',v_balance,'expires_at',v_item.expires_at);
end; $$;

create or replace function public.cashier_confirm_point_redemption(p_actor_id uuid,p_code text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_item public.point_redemptions; v_hash text; v_balance bigint;
begin
  if not (public.is_cashier(p_actor_id) or public.is_phase1_admin(p_actor_id)) then raise exception 'NOT_CASHIER'; end if;
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
revoke all on function public.cashier_preview_point_redemption(uuid,text) from public,anon,authenticated;
revoke all on function public.cashier_confirm_point_redemption(uuid,text) from public,anon,authenticated;
grant execute on function public.cashier_preview_point_redemption(uuid,text) to service_role;
grant execute on function public.cashier_confirm_point_redemption(uuid,text) to service_role;

do $$ begin
  alter publication supabase_realtime add table public.point_redemptions;
exception when duplicate_object then null;
end $$;
