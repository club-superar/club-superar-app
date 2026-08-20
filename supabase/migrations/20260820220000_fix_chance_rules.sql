-- Regla acordada: 4 chances base, hasta 2 extras sociales y hasta 2 por racha.
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
  v_base_chances integer := 4;
  v_code text;
  v_participation public.participations;
begin
  select * into v_profile
  from public.profiles
  where id = p_user_id and status = 'active';

  if not found then raise exception 'PROFILE_NOT_ACTIVE'; end if;

  select * into v_draw
  from public.draws
  where id = p_draw_id
  for update;

  if not found or v_draw.status <> 'open'
    or (v_draw.opens_at is not null and v_draw.opens_at > now())
    or (v_draw.closes_at is not null and v_draw.closes_at <= now()) then
    raise exception 'DRAW_NOT_OPEN';
  end if;

  select participation.streak_number into v_previous_streak
  from public.participations participation
  join public.draws draw on draw.id = participation.draw_id
  where participation.profile_id = p_user_id
    and draw.edition_number = v_draw.edition_number - 1
    and participation.status in ('eligible', 'frozen', 'winner_provisional', 'winner_confirmed')
  limit 1;

  if found then v_streak := v_previous_streak + 1; end if;

  -- La primera edición entrega 4. La segunda consecutiva 5 y desde la tercera 6.
  v_base_chances := least(4 + least(greatest(v_streak - 1, 0), 2), v_draw.max_base_chances);

  loop
    v_code := 'SUPER-' || upper(substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 6));
    exit when not exists (
      select 1 from public.participations
      where draw_id = p_draw_id and participant_code = v_code
    );
  end loop;

  insert into public.participations (
    draw_id, profile_id, participant_code, streak_number, base_chances, final_chances
  ) values (
    p_draw_id, p_user_id, v_code, v_streak, v_base_chances, v_base_chances
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

revoke all on function public.start_draw_participation(uuid, bigint) from public, anon, authenticated;
grant execute on function public.start_draw_participation(uuid, bigint) to service_role;

