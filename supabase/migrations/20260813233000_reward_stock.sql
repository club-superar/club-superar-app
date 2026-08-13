-- Cupos de productos y confirmacion atomica desde Caja.
alter table public.reward_catalog
  add column stock_remaining integer not null default 0
  check (stock_remaining >= 0);

create or replace function public.create_point_redemption(p_profile_id uuid, p_reward_id bigint, p_points integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_settings jsonb; v_balance bigint; v_reserved bigint; v_cost integer; v_name text; v_code text; v_hash text; v_expiry timestamptz; v_id uuid; v_ars_per_point numeric; v_stock integer; v_pending integer;
begin
  if not exists(select 1 from public.profiles where id=p_profile_id and status='active') then raise exception 'PROFILE_NOT_ACTIVE'; end if;
  perform private.expire_point_redemptions();
  select setting_value into v_settings from private.app_settings where setting_key='rewards';
  v_ars_per_point := coalesce((v_settings->>'ars_per_point')::numeric,100);
  if p_reward_id is not null then
    select points_cost,name,stock_remaining into v_cost,v_name,v_stock from public.reward_catalog where id=p_reward_id and active for update;
    if v_cost is null then raise exception 'REWARD_NOT_FOUND'; end if;
    select count(*) into v_pending from public.point_redemptions where reward_id=p_reward_id and status='pending' and expires_at>now();
    if v_stock-v_pending <= 0 then raise exception 'REWARD_OUT_OF_STOCK'; end if;
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
  if v_item.reward_id is not null then
    update public.reward_catalog set stock_remaining=stock_remaining-1,updated_at=now()
    where id=v_item.reward_id and active and stock_remaining>0;
    if not found then raise exception 'REWARD_OUT_OF_STOCK'; end if;
  end if;
  select coalesce(sum(amount),0) into v_balance from public.points_ledger where profile_id=v_item.profile_id;
  if v_balance < v_item.points then raise exception 'INSUFFICIENT_POINTS'; end if;
  insert into public.points_ledger(profile_id,amount,reason_key,description,idempotency_key,created_by)
  values(v_item.profile_id,-v_item.points,'redemption','Canje exitoso','redemption:'||v_item.id,p_actor_id);
  update public.point_redemptions set status='confirmed',confirmed_at=now(),confirmed_by=p_actor_id where id=v_item.id;
  insert into private.audit_log(actor_user_id,action,entity_type,entity_id,before_data,after_data)
  values(p_actor_id,'points.redemption_confirmed','point_redemption',v_item.id::text,jsonb_build_object('status','pending'),jsonb_build_object('status','confirmed','points',v_item.points,'reward_id',v_item.reward_id));
  return jsonb_build_object('id',v_item.id,'profile_id',v_item.profile_id,'points',v_item.points,'ars_value',v_item.ars_value,'reward_name',v_item.reward_name);
end; $$;

create or replace function public.admin_confirm_point_redemption(p_actor_id uuid,p_code text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_item public.point_redemptions; v_hash text; v_balance bigint;
begin
  if not public.is_phase1_admin(p_actor_id) then raise exception 'NOT_ADMIN'; end if;
  perform private.expire_point_redemptions();
  v_hash:=encode(extensions.digest(upper(trim(p_code)),'sha256'),'hex');
  select * into v_item from public.point_redemptions where code_hash=v_hash for update;
  if v_item.id is null then raise exception 'CODE_NOT_FOUND'; end if;
  if v_item.status <> 'pending' then raise exception 'CODE_NOT_PENDING'; end if;
  if v_item.reward_id is not null then
    update public.reward_catalog set stock_remaining=stock_remaining-1,updated_at=now()
    where id=v_item.reward_id and active and stock_remaining>0;
    if not found then raise exception 'REWARD_OUT_OF_STOCK'; end if;
  end if;
  select coalesce(sum(amount),0) into v_balance from public.points_ledger where profile_id=v_item.profile_id;
  if v_balance < v_item.points then raise exception 'INSUFFICIENT_POINTS'; end if;
  insert into public.points_ledger(profile_id,amount,reason_key,description,idempotency_key,created_by)
  values(v_item.profile_id,-v_item.points,'redemption','Canje exitoso','redemption:'||v_item.id,p_actor_id);
  update public.point_redemptions set status='confirmed',confirmed_at=now(),confirmed_by=p_actor_id where id=v_item.id;
  insert into private.audit_log(actor_user_id,action,entity_type,entity_id,before_data,after_data)
  values(p_actor_id,'points.redemption_confirmed','point_redemption',v_item.id::text,jsonb_build_object('status','pending'),jsonb_build_object('status','confirmed','points',v_item.points,'reward_id',v_item.reward_id));
  return jsonb_build_object('id',v_item.id,'profile_id',v_item.profile_id,'points',v_item.points,'ars_value',v_item.ars_value,'reward_name',v_item.reward_name);
end; $$;

revoke all on function public.create_point_redemption(uuid,bigint,integer) from public,anon,authenticated;
revoke all on function public.cashier_confirm_point_redemption(uuid,text) from public,anon,authenticated;
revoke all on function public.admin_confirm_point_redemption(uuid,text) from public,anon,authenticated;
grant execute on function public.create_point_redemption(uuid,bigint,integer) to service_role;
grant execute on function public.cashier_confirm_point_redemption(uuid,text) to service_role;
grant execute on function public.admin_confirm_point_redemption(uuid,text) to service_role;
