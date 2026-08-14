-- Edicion atomica y auditada de sorteos que todavia estan en borrador.

create or replace function public.admin_update_draft_draw(
  p_actor_id uuid,
  p_draw_id bigint,
  p_title text,
  p_prize_name text,
  p_prize_value numeric,
  p_opens_at timestamptz,
  p_closes_at timestamptz,
  p_instagram_profile_url text,
  p_whatsapp_group_url text,
  p_main_publication_url text,
  p_follow_points integer,
  p_whatsapp_points integer,
  p_comment_points integer,
  p_story_points integer,
  p_completion_points integer,
  p_extra_action_points integer,
  p_max_base_chances integer,
  p_max_extra_chances integer,
  p_winner_percent integer,
  p_claim_hours integer
)
returns public.draws
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before public.draws;
  v_after public.draws;
begin
  if not exists (
    select 1 from private.admin_roles
    where user_id = p_actor_id and active and role in ('owner', 'admin')
  ) then
    raise exception 'ADMIN_REQUIRED';
  end if;

  select * into v_before from public.draws where id = p_draw_id for update;
  if not found or v_before.status <> 'draft' then
    raise exception 'DRAW_NOT_DRAFT';
  end if;
  if length(trim(p_title)) < 3 or length(trim(p_prize_name)) < 3 then
    raise exception 'INVALID_DRAW_DATA';
  end if;
  if p_prize_value is not null and p_prize_value < 0 then
    raise exception 'INVALID_PRIZE_VALUE';
  end if;
  if p_opens_at is null or p_closes_at is null or p_closes_at <= p_opens_at then
    raise exception 'INVALID_DRAW_DATES';
  end if;
  if p_instagram_profile_url !~ '^https://' or p_whatsapp_group_url !~ '^https://'
    or p_main_publication_url !~ '^https://' then
    raise exception 'INVALID_ACTION_URL';
  end if;
  if p_follow_points not between 0 and 100 or p_whatsapp_points not between 0 and 100
    or p_comment_points not between 0 and 100 or p_story_points not between 0 and 100
    or p_completion_points not between 0 and 100 or p_extra_action_points not between 0 and 100
    or p_max_base_chances not between 2 and 6 or p_max_extra_chances not between 0 and 2
    or p_winner_percent not between 0 and 100 or p_claim_hours not between 1 and 168 then
    raise exception 'INVALID_DRAW_RULES';
  end if;

  update public.draws set
    title = trim(p_title), prize_name = trim(p_prize_name), prize_value = p_prize_value,
    opens_at = p_opens_at, closes_at = p_closes_at,
    claim_window_hours = p_claim_hours,
    winner_retained_chance_percent = p_winner_percent,
    max_base_chances = p_max_base_chances,
    max_extra_chances = p_max_extra_chances,
    points_config = jsonb_build_object(
      'follow_instagram', p_follow_points,
      'whatsapp_group', p_whatsapp_points,
      'comment_and_tag', p_comment_points,
      'share_story', p_story_points,
      'completion_bonus', p_completion_points,
      'extra_action', p_extra_action_points,
      'max_extra_actions', p_max_extra_chances
    ),
    updated_at = now()
  where id = p_draw_id
  returning * into v_after;

  update public.draw_requirements set
    points = case requirement_key
      when 'follow_instagram' then p_follow_points
      when 'whatsapp_group' then p_whatsapp_points
      when 'comment_and_tag' then p_comment_points
      when 'share_story' then p_story_points
    end,
    action_url = case requirement_key
      when 'follow_instagram' then p_instagram_profile_url
      when 'whatsapp_group' then p_whatsapp_group_url
      else p_main_publication_url
    end
  where draw_id = p_draw_id;

  insert into private.audit_log (
    actor_user_id, action, entity_type, entity_id, before_data, after_data
  ) values (
    p_actor_id, 'draw.updated', 'draw', p_draw_id::text,
    to_jsonb(v_before), to_jsonb(v_after)
  );

  return v_after;
end;
$$;

revoke all on function public.admin_update_draft_draw(uuid, bigint, text, text, numeric, timestamptz, timestamptz, text, text, text, integer, integer, integer, integer, integer, integer, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_update_draft_draw(uuid, bigint, text, text, numeric, timestamptz, timestamptz, text, text, text, integer, integer, integer, integer, integer, integer, integer, integer, integer, integer) to service_role;
