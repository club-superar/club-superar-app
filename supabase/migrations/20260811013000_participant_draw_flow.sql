-- Club SUPER.AR - Inicio de participacion y declaracion de requisitos.
-- Las funciones son endpoints internos: solo service_role puede ejecutarlas.

create or replace function public.start_draw_participation(
  p_user_id uuid,
  p_draw_id bigint
)
returns public.participations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draw public.draws;
  v_profile public.profiles;
  v_previous_streak integer := 0;
  v_streak integer := 1;
  v_code text;
  v_participation public.participations;
begin
  select * into v_profile
  from public.profiles
  where id = p_user_id and status = 'active';

  if not found then
    raise exception 'PROFILE_NOT_ACTIVE';
  end if;

  select * into v_draw
  from public.draws
  where id = p_draw_id
  for update;

  if not found or v_draw.status <> 'open'
    or (v_draw.opens_at is not null and v_draw.opens_at > now())
    or (v_draw.closes_at is not null and v_draw.closes_at <= now()) then
    raise exception 'DRAW_NOT_OPEN';
  end if;

  select p.streak_number into v_previous_streak
  from public.participations p
  join public.draws d on d.id = p.draw_id
  where p.profile_id = p_user_id
    and d.edition_number = v_draw.edition_number - 1
    and p.status in ('eligible', 'frozen', 'winner_provisional', 'winner_confirmed')
  limit 1;

  if found then
    v_streak := v_previous_streak + 1;
  end if;

  loop
    v_code := 'SUPER-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6));
    exit when not exists (
      select 1 from public.participations
      where draw_id = p_draw_id and participant_code = v_code
    );
  end loop;

  insert into public.participations (
    draw_id,
    profile_id,
    participant_code,
    streak_number,
    base_chances,
    final_chances
  ) values (
    p_draw_id,
    p_user_id,
    v_code,
    v_streak,
    least(v_streak + 1, v_draw.max_base_chances),
    least(v_streak + 1, v_draw.max_base_chances)
  )
  on conflict (draw_id, profile_id) do update
    set updated_at = public.participations.updated_at
  returning * into v_participation;

  insert into public.requirement_completions (participation_id, requirement_id)
  select v_participation.id, requirement.id
  from public.draw_requirements requirement
  where requirement.draw_id = p_draw_id
  on conflict (participation_id, requirement_id) do nothing;

  return v_participation;
end;
$$;

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
  v_all_complete boolean;
  v_previous_winner boolean;
  v_final_chances integer;
  v_bonus_points integer;
begin
  select rc.* into v_completion
  from public.requirement_completions rc
  join public.participations p on p.id = rc.participation_id
  where rc.id = p_completion_id and p.profile_id = p_user_id
  for update of rc;

  if not found then
    raise exception 'COMPLETION_NOT_FOUND';
  end if;

  select * into v_participation
  from public.participations
  where id = v_completion.participation_id
  for update;

  select * into v_requirement
  from public.draw_requirements
  where id = v_completion.requirement_id;

  select * into v_draw
  from public.draws
  where id = v_participation.draw_id;

  if v_draw.status <> 'open'
    or (v_draw.closes_at is not null and v_draw.closes_at <= now()) then
    raise exception 'DRAW_NOT_OPEN';
  end if;

  if v_completion.state = 'not_started' then
    update public.requirement_completions
    set state = 'declared', declared_at = now(), updated_at = now()
    where id = p_completion_id
    returning * into v_completion;

    if v_requirement.points > 0 then
      insert into public.points_ledger (
        profile_id, participation_id, amount, reason_key, description, idempotency_key
      ) values (
        p_user_id,
        v_participation.id,
        v_requirement.points,
        v_requirement.requirement_key,
        'Requisito completado: ' || v_requirement.title,
        'requirement:' || p_completion_id
      ) on conflict (idempotency_key) do nothing;
    end if;
  end if;

  select not exists (
    select 1
    from public.draw_requirements requirement
    left join public.requirement_completions completion
      on completion.requirement_id = requirement.id
      and completion.participation_id = v_participation.id
    where requirement.draw_id = v_draw.id
      and requirement.required
      and coalesce(completion.state, 'not_started') not in ('declared', 'detected', 'verified')
  ) into v_all_complete;

  if v_all_complete and v_participation.status = 'started' then
    select exists (
      select 1
      from public.winners winner
      join public.draws previous_draw on previous_draw.id = winner.draw_id
      where winner.profile_id = p_user_id
        and previous_draw.edition_number = v_draw.edition_number - 1
    ) into v_previous_winner;

    v_final_chances := v_participation.base_chances + v_participation.extra_chances;
    if v_previous_winner then
      v_final_chances := greatest(1, ceil(v_final_chances * v_draw.winner_retained_chance_percent / 100.0)::integer);
    end if;

    update public.participations
    set status = 'eligible',
        completed_at = now(),
        final_chances = v_final_chances,
        winner_penalty_applied = v_previous_winner,
        updated_at = now()
    where id = v_participation.id;

    update public.profiles
    set current_streak = v_participation.streak_number,
        longest_streak = greatest(longest_streak, v_participation.streak_number),
        updated_at = now()
    where id = p_user_id;

    v_bonus_points := coalesce((v_draw.points_config ->> 'completion_bonus')::integer, 0);
    if v_bonus_points > 0 then
      insert into public.points_ledger (
        profile_id, participation_id, amount, reason_key, description, idempotency_key
      ) values (
        p_user_id,
        v_participation.id,
        v_bonus_points,
        'completion_bonus',
        'Participacion completa',
        'completion:' || v_participation.id
      ) on conflict (idempotency_key) do nothing;
    end if;
  end if;

  return v_completion;
end;
$$;

revoke all on function public.start_draw_participation(uuid, bigint) from public, anon, authenticated;
revoke all on function public.declare_draw_requirement(uuid, bigint) from public, anon, authenticated;
grant execute on function public.start_draw_participation(uuid, bigint) to service_role;
grant execute on function public.declare_draw_requirement(uuid, bigint) to service_role;

