-- Seguimiento auditado del reclamo y entrega del premio.

create or replace function public.admin_update_winner_claim_status(
  p_actor_id uuid,
  p_winner_id bigint,
  p_new_status text
)
returns public.winners
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before public.winners;
  v_after public.winners;
begin
  if not exists (
    select 1 from private.admin_roles
    where user_id = p_actor_id and active and role in ('owner', 'admin')
  ) then
    raise exception 'ADMIN_REQUIRED';
  end if;

  select * into v_before from public.winners where id = p_winner_id for update;
  if not found then raise exception 'WINNER_NOT_FOUND'; end if;

  if p_new_status = 'claimed' and v_before.claim_status = 'pending' then
    update public.winners set claim_status = 'claimed', claimed_at = now()
    where id = p_winner_id returning * into v_after;
  elsif p_new_status = 'fulfilled' and v_before.claim_status = 'claimed' then
    update public.winners set claim_status = 'fulfilled', fulfilled_at = now()
    where id = p_winner_id returning * into v_after;
  elsif p_new_status = 'expired' and v_before.claim_status = 'pending' and now() >= v_before.claim_deadline then
    update public.winners set claim_status = 'expired'
    where id = p_winner_id returning * into v_after;
  else
    raise exception 'INVALID_CLAIM_TRANSITION';
  end if;

  insert into private.audit_log (
    actor_user_id, action, entity_type, entity_id, before_data, after_data
  ) values (
    p_actor_id, 'winner.claim_status_changed', 'winner', p_winner_id::text,
    to_jsonb(v_before), to_jsonb(v_after)
  );

  return v_after;
end;
$$;

revoke all on function public.admin_update_winner_claim_status(uuid, bigint, text) from public, anon, authenticated;
grant execute on function public.admin_update_winner_claim_status(uuid, bigint, text) to service_role;
