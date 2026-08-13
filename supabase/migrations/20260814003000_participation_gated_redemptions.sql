-- Las acciones del sorteo otorgan chances, no SUPER Puntos.
-- Los canjes quedan disponibles solo para participantes habilitados.

update public.draw_requirements set points = 0 where points <> 0;

update public.draws
set points_config = jsonb_build_object(
  'follow_instagram', 0, 'whatsapp_group', 0, 'comment_and_tag', 0,
  'share_story', 0, 'completion_bonus', 0, 'extra_action', 0,
  'max_extra_actions', max_extra_chances
);

-- Conserva el libro contable: revierte con un movimiento compensatorio los
-- puntos de prueba que se habían acreditado bajo la regla incorrecta.
insert into public.points_ledger (profile_id, amount, reason_key, description, idempotency_key)
select profile_id, -sum(amount)::integer, 'rules_correction',
  'Corrección: los pasos del sorteo otorgan chances, no SUPER Puntos',
  'rules-correction:20260814:' || profile_id::text
from public.points_ledger
where reason_key in ('follow_instagram','whatsapp_group','comment_and_tag','share_story','completion_bonus','extra_action')
  and amount > 0
group by profile_id
having sum(amount) > 0
on conflict (idempotency_key) do nothing;

create or replace function public.can_profile_redeem_points(p_profile_id uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_open_draw_id bigint;
begin
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
revoke all on function public.can_profile_redeem_points(uuid) from public,anon,authenticated;
grant execute on function public.can_profile_redeem_points(uuid) to service_role;

create or replace function public.create_point_redemption(p_profile_id uuid, p_reward_id bigint, p_points integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_settings jsonb; v_cost integer; v_name text; v_ars integer; v_balance bigint; v_reserved bigint; v_code text; v_hash text; v_expiry timestamptz; v_item public.point_redemptions; v_stock integer; v_pending integer;
begin
  if not public.can_profile_redeem_points(p_profile_id) then raise exception 'PARTICIPATION_REQUIRED'; end if;
  perform private.expire_point_redemptions();
  select setting_value into v_settings from public.app_settings where setting_key='rewards';
  if p_reward_id is not null then
    select name,points_cost,stock_remaining into v_name,v_cost,v_stock from public.reward_catalog where id=p_reward_id and active for update;
    if v_name is null then raise exception 'REWARD_NOT_AVAILABLE'; end if;
    select count(*) into v_pending from public.point_redemptions where reward_id=p_reward_id and status='pending' and expires_at>now();
    if v_stock <= v_pending then raise exception 'REWARD_OUT_OF_STOCK'; end if;
  else
    v_cost:=p_points; v_name:='Canje libre en el local';
    if v_cost < coalesce((v_settings->>'minimum_redemption_points')::integer,10) then raise exception 'MINIMUM_POINTS'; end if;
  end if;
  select coalesce(sum(amount),0) into v_balance from public.points_ledger where profile_id=p_profile_id;
  select coalesce(sum(points),0) into v_reserved from public.point_redemptions where profile_id=p_profile_id and status='pending' and expires_at>now();
  if v_cost<=0 or v_balance-v_reserved<v_cost then raise exception 'INSUFFICIENT_POINTS'; end if;
  v_ars:=v_cost*coalesce((v_settings->>'ars_per_point')::integer,100);
  v_code:=upper(substr(encode(extensions.gen_random_bytes(8),'hex'),1,8)); v_hash:=encode(extensions.digest(v_code,'sha256'),'hex');
  v_expiry := now()+make_interval(mins=>coalesce((v_settings->>'redemption_expiry_minutes')::integer,10));
  insert into public.point_redemptions(profile_id,reward_id,reward_name,points,ars_value,code_hash,code_suffix,expires_at)
  values(p_profile_id,p_reward_id,v_name,v_cost,v_ars,v_hash,right(v_code,4),v_expiry) returning * into v_item;
  return jsonb_build_object('id',v_item.id,'code',v_code,'points',v_item.points,'ars_value',v_item.ars_value,'reward_name',v_item.reward_name,'expires_at',v_item.expires_at);
end; $$;
revoke all on function public.create_point_redemption(uuid,bigint,integer) from public,anon,authenticated;
grant execute on function public.create_point_redemption(uuid,bigint,integer) to service_role;
