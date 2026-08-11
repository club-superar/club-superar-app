-- Club SUPER.AR - Revision manual auditable de requisitos.

create or replace function public.admin_review_requirement(
  p_actor_id uuid,
  p_completion_id bigint,
  p_decision text,
  p_reason text default null
)
returns public.requirement_completions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before public.requirement_completions;
  v_after public.requirement_completions;
  v_participation public.participations;
  v_requirement public.draw_requirements;
  v_draw public.draws;
  v_all_complete boolean;
  v_requirement_current integer;
  v_requirement_target integer;
  v_completion_current integer;
  v_completion_target integer;
  v_delta integer;
begin
  if not exists (
    select 1 from private.admin_roles
    where user_id = p_actor_id and active and role in ('owner', 'admin')
  ) then raise exception 'ADMIN_REQUIRED'; end if;

  if p_decision not in ('verified', 'rejected') then raise exception 'INVALID_DECISION'; end if;
  if p_decision = 'rejected' and length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'REJECTION_REASON_REQUIRED';
  end if;

  select * into v_before from public.requirement_completions
  where id = p_completion_id for update;
  if not found then raise exception 'COMPLETION_NOT_FOUND'; end if;

  select * into v_participation from public.participations
  where id = v_before.participation_id for update;
  select * into v_requirement from public.draw_requirements where id = v_before.requirement_id;
  select * into v_draw from public.draws where id = v_participation.draw_id;

  if v_draw.status in ('completed', 'cancelled') then raise exception 'DRAW_NOT_REVIEWABLE'; end if;
  if v_before.state = 'not_started' then raise exception 'REQUIREMENT_NOT_DECLARED'; end if;

  update public.requirement_completions
  set state = p_decision,
      verified_at = case when p_decision = 'verified' then now() else null end,
      verified_by = p_actor_id,
      rejection_reason = case when p_decision = 'rejected' then trim(p_reason) else null end,
      updated_at = now()
  where id = p_completion_id
  returning * into v_after;

  select coalesce(sum(amount), 0)::integer into v_requirement_current
  from public.points_ledger
  where participation_id = v_participation.id
    and (idempotency_key = 'requirement:' || p_completion_id
      or idempotency_key like 'requirement_review:' || p_completion_id || ':%');
  v_requirement_target := case when p_decision = 'verified' then v_requirement.points else 0 end;
  v_delta := v_requirement_target - v_requirement_current;
  if v_delta <> 0 then
    insert into public.points_ledger (
      profile_id, participation_id, amount, reason_key, description, idempotency_key, created_by
    ) values (
      v_participation.profile_id, v_participation.id, v_delta, 'requirement_review',
      case when v_delta > 0 then 'Puntos restituidos por verificacion: ' else 'Puntos retirados por rechazo: ' end || v_requirement.title,
      'requirement_review:' || p_completion_id || ':' || gen_random_uuid(), p_actor_id
    );
  end if;

  select not exists (
    select 1 from public.draw_requirements requirement
    left join public.requirement_completions completion
      on completion.requirement_id = requirement.id and completion.participation_id = v_participation.id
    where requirement.draw_id = v_draw.id and requirement.required
      and coalesce(completion.state, 'not_started') not in ('declared', 'detected', 'verified')
  ) into v_all_complete;

  select coalesce(sum(amount), 0)::integer into v_completion_current
  from public.points_ledger
  where participation_id = v_participation.id
    and (idempotency_key = 'completion:' || v_participation.id
      or idempotency_key like 'completion_review:' || v_participation.id || ':%');
  v_completion_target := case when v_all_complete
    then greatest(0, coalesce((v_draw.points_config ->> 'completion_bonus')::integer, 0)) else 0 end;
  v_delta := v_completion_target - v_completion_current;
  if v_delta <> 0 then
    insert into public.points_ledger (
      profile_id, participation_id, amount, reason_key, description, idempotency_key, created_by
    ) values (
      v_participation.profile_id, v_participation.id, v_delta, 'completion_review',
      case when v_delta > 0 then 'Bonus de participacion restituido' else 'Bonus de participacion retirado' end,
      'completion_review:' || v_participation.id || ':' || gen_random_uuid(), p_actor_id
    );
  end if;

  if v_participation.status in ('started', 'eligible') then
    update public.participations
    set status = case when v_all_complete then 'eligible' else 'started' end,
        completed_at = case when v_all_complete then coalesce(completed_at, now()) else null end,
        updated_at = now()
    where id = v_participation.id;
  end if;

  insert into private.audit_log (
    actor_user_id, action, entity_type, entity_id, before_data, after_data
  ) values (
    p_actor_id, 'requirement.' || p_decision, 'requirement_completion', p_completion_id::text,
    to_jsonb(v_before), to_jsonb(v_after)
  );

  return v_after;
end;
$$;

revoke all on function public.admin_review_requirement(uuid, bigint, text, text)
from public, anon, authenticated;
grant execute on function public.admin_review_requirement(uuid, bigint, text, text)
to service_role;
