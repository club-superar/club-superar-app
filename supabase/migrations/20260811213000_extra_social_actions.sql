-- Club SUPER.AR - Chances extra declaradas por el participante.
-- Solo service_role ejecuta esta funcion; valida propiedad, edicion y topes.

create or replace function public.declare_extra_social_action(
  p_user_id uuid,
  p_participation_id bigint,
  p_action_type text,
  p_value text
)
returns public.social_actions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_participation public.participations;
  v_draw public.draws;
  v_profile public.profiles;
  v_action public.social_actions;
  v_value text := lower(trim(p_value));
  v_publication_id text;
  v_awarded_count integer;
  v_points integer;
  v_final_chances integer;
begin
  select * into v_participation
  from public.participations
  where id = p_participation_id and profile_id = p_user_id
  for update;

  if not found then raise exception 'PARTICIPATION_NOT_FOUND'; end if;

  select * into v_draw from public.draws where id = v_participation.draw_id;
  if v_draw.status <> 'open'
    or (v_draw.closes_at is not null and v_draw.closes_at <= now()) then
    raise exception 'DRAW_NOT_OPEN';
  end if;

  select * into v_profile from public.profiles where id = p_user_id;

  select count(*)::integer into v_awarded_count
  from public.social_actions
  where participation_id = p_participation_id and chance_awarded;

  if v_awarded_count >= v_draw.max_extra_chances then
    raise exception 'EXTRA_LIMIT_REACHED';
  end if;

  v_points := greatest(0, coalesce((v_draw.points_config ->> 'extra_action')::integer, 0));

  if p_action_type = 'additional_tag' then
    v_value := regexp_replace(v_value, '^@', '');
    if v_value !~ '^[a-z0-9._]{1,30}$' then raise exception 'INVALID_INSTAGRAM_USERNAME'; end if;
    if v_value = v_profile.instagram_username_normalized then raise exception 'CANNOT_TAG_SELF'; end if;

    insert into public.social_actions (
      participation_id, action_type, target_instagram_username_normalized,
      chance_awarded, points_awarded, occurred_at
    ) values (
      p_participation_id, 'additional_tag', v_value, true, v_points, now()
    ) returning * into v_action;
  elsif p_action_type = 'extra_post_share' then
    if v_value !~ '^https?://(www\.)?instagram\.com/(p|reel|tv)/[a-z0-9_-]+' then
      raise exception 'INVALID_INSTAGRAM_PUBLICATION';
    end if;
    v_publication_id := (regexp_match(v_value, 'instagram\.com/(?:p|reel|tv)/([a-z0-9_-]+)'))[1];

    insert into public.social_actions (
      participation_id, action_type, publication_id,
      chance_awarded, points_awarded, occurred_at, metadata
    ) values (
      p_participation_id, 'extra_post_share', v_publication_id,
      true, v_points, now(), jsonb_build_object('declared_url', trim(p_value))
    ) returning * into v_action;
  else
    raise exception 'INVALID_EXTRA_ACTION_TYPE';
  end if;

  update public.participations
  set extra_chances = least(v_draw.max_extra_chances, extra_chances + 1), updated_at = now()
  where id = p_participation_id
  returning * into v_participation;

  v_final_chances := v_participation.base_chances + v_participation.extra_chances;
  if v_participation.winner_penalty_applied then
    v_final_chances := greatest(1, ceil(v_final_chances * v_draw.winner_retained_chance_percent / 100.0)::integer);
  end if;
  update public.participations set final_chances = v_final_chances where id = p_participation_id;

  if v_points > 0 then
    insert into public.points_ledger (
      profile_id, participation_id, amount, reason_key, description, idempotency_key
    ) values (
      p_user_id, p_participation_id, v_points, 'extra_action',
      case p_action_type when 'additional_tag' then 'Etiqueta adicional: @' || v_value
        else 'Publicacion adicional compartida' end,
      'social_action:' || v_action.id
    );
  end if;

  return v_action;
exception
  when unique_violation then raise exception 'EXTRA_ACTION_ALREADY_DECLARED';
end;
$$;

revoke all on function public.declare_extra_social_action(uuid, bigint, text, text)
from public, anon, authenticated;
grant execute on function public.declare_extra_social_action(uuid, bigint, text, text)
to service_role;
