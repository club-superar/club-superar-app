-- Permite que el participante avise que completo un requisito social.
-- La declaracion no habilita la participacion: Administracion debe verificarla.
create or replace function public.declare_draw_requirement(
  p_user_id uuid,
  p_completion_id bigint
)
returns public.requirement_completions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_completion public.requirement_completions;
  v_participation public.participations;
  v_requirement public.draw_requirements;
  v_draw public.draws;
begin
  select rc.* into v_completion
  from public.requirement_completions rc
  join public.participations p on p.id = rc.participation_id
  where rc.id = p_completion_id and p.profile_id = p_user_id
  for update of rc;
  if not found then raise exception 'COMPLETION_NOT_FOUND'; end if;

  select * into v_participation from public.participations
  where id = v_completion.participation_id for update;
  select * into v_requirement from public.draw_requirements where id = v_completion.requirement_id;
  select * into v_draw from public.draws where id = v_participation.draw_id;

  if v_draw.status <> 'open' or (v_draw.closes_at is not null and v_draw.closes_at <= now()) then
    raise exception 'DRAW_NOT_OPEN';
  end if;

  if v_completion.state in ('not_started', 'rejected') then
    update public.requirement_completions
    set state = 'declared', declared_at = now(), verification_source = 'participant',
        rejection_reason = null,
        evidence = coalesce(evidence, '{}'::jsonb) || jsonb_build_object(
          'manual_review_requested', true,
          'manual_review_requested_at', now()
        ),
        updated_at = now()
    where id = p_completion_id returning * into v_completion;
  end if;

  perform private.recalculate_participation(v_participation.id);
  return v_completion;
end;
$$;

revoke all on function public.declare_draw_requirement(uuid, bigint)
from public, anon, authenticated;
grant execute on function public.declare_draw_requirement(uuid, bigint)
to service_role;
