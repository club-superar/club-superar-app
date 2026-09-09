-- Permite a Administracion otorgar las chances sociales cuando Meta no entrega el evento.
create or replace function public.admin_grant_extra_chance(
  p_actor_id uuid,
  p_participation_id bigint,
  p_reason text
)
returns public.participations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_participation public.participations;
  v_before public.participations;
  v_draw public.draws;
begin
  if not exists (
    select 1 from private.admin_roles
    where user_id = p_actor_id and active and role in ('owner', 'admin')
  ) then raise exception 'ADMIN_REQUIRED'; end if;

  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'REASON_REQUIRED';
  end if;

  select * into v_participation
  from public.participations
  where id = p_participation_id
  for update;
  if not found then raise exception 'PARTICIPATION_NOT_FOUND'; end if;
  v_before := v_participation;

  select * into v_draw from public.draws where id = v_participation.draw_id;
  if v_draw.status <> 'open' or (v_draw.closes_at is not null and v_draw.closes_at <= now()) then
    raise exception 'DRAW_NOT_OPEN';
  end if;
  if v_participation.extra_chances >= v_draw.max_extra_chances then
    raise exception 'MAX_EXTRA_CHANCES_REACHED';
  end if;

  insert into public.social_actions (
    participation_id, action_type, source, state, chance_awarded, occurred_at, metadata
  ) values (
    v_participation.id, 'additional_tag', 'admin', 'verified', true, now(),
    jsonb_build_object('admin_reason', trim(p_reason), 'manual_extra_chance', true)
  );

  update public.participations
  set extra_chances = least(v_draw.max_extra_chances, extra_chances + 1), updated_at = now()
  where id = v_participation.id
  returning * into v_participation;

  perform private.recalculate_participation(v_participation.id);
  select * into v_participation from public.participations where id = p_participation_id;

  insert into private.audit_log (
    actor_user_id, action, entity_type, entity_id, before_data, after_data
  ) values (
    p_actor_id, 'participation.extra_chance_granted', 'participation', p_participation_id::text,
    to_jsonb(v_before), to_jsonb(v_participation) || jsonb_build_object('reason', trim(p_reason))
  );

  return v_participation;
end;
$$;

revoke all on function public.admin_grant_extra_chance(uuid, bigint, text)
from public, anon, authenticated;
grant execute on function public.admin_grant_extra_chance(uuid, bigint, text)
to service_role;
