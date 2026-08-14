-- Verificacion automatica de Instagram y respaldo manual auditable.

alter table public.draws
  add column if not exists instagram_media_id text;

create unique index if not exists draws_instagram_media_id_unique_idx
on public.draws (instagram_media_id)
where instagram_media_id is not null;

alter table public.profiles
  add column if not exists instagram_scoped_user_id text;

create unique index if not exists profiles_instagram_scoped_user_id_unique_idx
on public.profiles (instagram_scoped_user_id)
where instagram_scoped_user_id is not null;

alter table public.requirement_completions
  add column if not exists verification_source text
    check (verification_source in ('participant', 'instagram', 'admin'));

create table if not exists public.meta_webhook_events (
  id bigint generated always as identity primary key,
  external_id text not null unique,
  event_type text not null check (event_type in ('comment', 'story_mention')),
  instagram_user_id text,
  instagram_username_normalized text,
  instagram_media_id text,
  status text not null default 'received'
    check (status in ('received', 'verified', 'ignored', 'unresolved', 'failed')),
  evidence jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists meta_webhook_events_status_received_idx
on public.meta_webhook_events (status, received_at desc);

alter table public.meta_webhook_events enable row level security;
revoke all on public.meta_webhook_events from public, anon, authenticated;
grant select, insert, update on public.meta_webhook_events to service_role;
grant usage, select on sequence public.meta_webhook_events_id_seq to service_role;

create or replace function private.recalculate_participation(p_participation_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_participation public.participations;
  v_draw public.draws;
  v_all_complete boolean;
  v_previous_winner boolean;
  v_final_chances integer;
begin
  select * into v_participation
  from public.participations where id = p_participation_id for update;
  if not found then raise exception 'PARTICIPATION_NOT_FOUND'; end if;

  select * into v_draw from public.draws where id = v_participation.draw_id;

  select not exists (
    select 1
    from public.draw_requirements requirement
    left join public.requirement_completions completion
      on completion.requirement_id = requirement.id
      and completion.participation_id = v_participation.id
    where requirement.draw_id = v_draw.id
      and requirement.required
      and not (
        case
          when requirement.requirement_key in ('comment_and_tag', 'share_story')
            then coalesce(completion.state, 'not_started') = 'verified'
          else coalesce(completion.state, 'not_started') in ('declared', 'verified')
        end
      )
  ) into v_all_complete;

  select exists (
    select 1 from public.winners winner
    join public.draws previous_draw on previous_draw.id = winner.draw_id
    where winner.profile_id = v_participation.profile_id
      and previous_draw.edition_number = v_draw.edition_number - 1
  ) into v_previous_winner;

  v_final_chances := v_participation.base_chances + v_participation.extra_chances;
  if v_previous_winner then
    v_final_chances := greatest(1, ceil(v_final_chances * v_draw.winner_retained_chance_percent / 100.0)::integer);
  end if;

  if v_participation.status in ('started', 'eligible') then
    update public.participations
    set status = case when v_all_complete then 'eligible' else 'started' end,
        completed_at = case when v_all_complete then coalesce(completed_at, now()) else null end,
        final_chances = v_final_chances,
        winner_penalty_applied = v_previous_winner,
        updated_at = now()
    where id = v_participation.id;
  end if;

  if v_all_complete then
    update public.profiles
    set current_streak = v_participation.streak_number,
        longest_streak = greatest(longest_streak, v_participation.streak_number),
        updated_at = now()
    where id = v_participation.profile_id;
  end if;
end;
$$;

revoke all on function private.recalculate_participation(bigint) from public, anon, authenticated;

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
  if v_requirement.requirement_key in ('comment_and_tag', 'share_story') then
    raise exception 'AUTOMATIC_VERIFICATION_REQUIRED';
  end if;

  if v_completion.state in ('not_started', 'rejected') then
    update public.requirement_completions
    set state = 'declared', declared_at = now(), verification_source = 'participant',
        rejection_reason = null, updated_at = now()
    where id = p_completion_id returning * into v_completion;
  end if;

  perform private.recalculate_participation(v_participation.id);
  return v_completion;
end;
$$;

revoke all on function public.declare_draw_requirement(uuid, bigint) from public, anon, authenticated;
grant execute on function public.declare_draw_requirement(uuid, bigint) to service_role;

create or replace function public.record_instagram_comment(
  p_external_id text,
  p_instagram_user_id text,
  p_instagram_username text,
  p_instagram_media_id text,
  p_participant_code text,
  p_mentions text[],
  p_evidence jsonb default '{}'::jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text := lower(trim(leading '@' from coalesce(p_instagram_username, '')));
  v_participation public.participations;
  v_completion public.requirement_completions;
  v_story_completion public.requirement_completions;
  v_action public.social_actions;
  v_target text;
  v_draw public.draws;
  v_awarded_count integer;
  v_pending_story public.meta_webhook_events;
begin
  if trim(coalesce(p_external_id, '')) = '' then raise exception 'EXTERNAL_ID_REQUIRED'; end if;

  insert into public.meta_webhook_events (
    external_id, event_type, instagram_user_id, instagram_username_normalized,
    instagram_media_id, evidence
  ) values (
    p_external_id, 'comment', nullif(trim(p_instagram_user_id), ''), nullif(v_username, ''),
    nullif(trim(p_instagram_media_id), ''), coalesce(p_evidence, '{}'::jsonb)
  ) on conflict (external_id) do nothing;

  if not found then return 'duplicate'; end if;

  select d.* into v_draw from public.draws d
  where d.instagram_media_id = p_instagram_media_id and d.status = 'open'
    and (d.closes_at is null or d.closes_at > now());
  if not found then
    update public.meta_webhook_events set status = 'unresolved', processed_at = now()
    where external_id = p_external_id;
    return 'draw_not_found';
  end if;

  select p.* into v_participation
  from public.participations p
  join public.profiles profile on profile.id = p.profile_id
  where p.draw_id = v_draw.id
    and p.participant_code = upper(trim(p_participant_code))
    and profile.instagram_username_normalized = v_username
  for update of p;
  if not found then
    update public.meta_webhook_events set status = 'unresolved', processed_at = now()
    where external_id = p_external_id;
    return 'participant_not_found';
  end if;

  update public.profiles set instagram_scoped_user_id = coalesce(nullif(trim(p_instagram_user_id), ''), instagram_scoped_user_id)
  where id = v_participation.profile_id
    and (instagram_scoped_user_id is null or instagram_scoped_user_id = p_instagram_user_id);

  -- Si la historia llego antes que el comentario, Meta solo habia enviado el ID interno.
  -- Al vincular ese ID con el usuario, recuperamos la mencion pendiente sin pedirle nada al cliente.
  select * into v_pending_story from public.meta_webhook_events
  where event_type = 'story_mention' and status = 'unresolved'
    and instagram_user_id = p_instagram_user_id
  order by received_at desc limit 1 for update;
  if found then
    select completion.* into v_story_completion
    from public.requirement_completions completion
    join public.draw_requirements requirement on requirement.id = completion.requirement_id
    where completion.participation_id = v_participation.id
      and requirement.requirement_key = 'share_story'
    for update of completion;
    if found and v_story_completion.state <> 'verified' then
      update public.requirement_completions
      set state = 'verified', detected_at = v_pending_story.received_at, verified_at = now(),
          verified_by = null, verification_source = 'instagram', rejection_reason = null,
          evidence = coalesce(evidence, '{}'::jsonb) || v_pending_story.evidence, updated_at = now()
      where id = v_story_completion.id;
      insert into public.social_actions (
        participation_id, action_type, source, external_id, state,
        chance_awarded, occurred_at, metadata
      ) values (
        v_participation.id, 'story_share', 'meta_webhook', v_pending_story.external_id,
        'verified', false, v_pending_story.received_at, v_pending_story.evidence
      ) on conflict (external_id) do nothing;
      update public.meta_webhook_events set status = 'verified', processed_at = now()
      where id = v_pending_story.id;
    end if;
  end if;

  select completion.* into v_completion
  from public.requirement_completions completion
  join public.draw_requirements requirement on requirement.id = completion.requirement_id
  where completion.participation_id = v_participation.id
    and requirement.requirement_key = 'comment_and_tag'
  for update of completion;

  if v_completion.state <> 'verified' and coalesce(array_length(p_mentions, 1), 0) < 2 then
    update public.meta_webhook_events set status = 'ignored', processed_at = now()
    where external_id = p_external_id;
    perform private.recalculate_participation(v_participation.id);
    return 'not_enough_mentions';
  end if;

  if coalesce(array_length(p_mentions, 1), 0) >= 2 and v_completion.state <> 'verified' then
    update public.requirement_completions
    set state = 'verified', detected_at = now(), verified_at = now(), verified_by = null,
        verification_source = 'instagram', rejection_reason = null,
        evidence = coalesce(evidence, '{}'::jsonb) || coalesce(p_evidence, '{}'::jsonb), updated_at = now()
    where id = v_completion.id;

    insert into public.social_actions (
      participation_id, action_type, source, external_id, state,
      chance_awarded, occurred_at, metadata
    ) values (
      v_participation.id, 'base_comment', 'meta_webhook', p_external_id, 'verified',
      false, now(), coalesce(p_evidence, '{}'::jsonb)
    ) on conflict (external_id) do nothing;
  elsif v_completion.state = 'verified' then
    select count(*)::integer into v_awarded_count from public.social_actions
    where participation_id = v_participation.id and chance_awarded;

    select mention into v_target
    from unnest(coalesce(p_mentions, array[]::text[])) mention
    where mention ~ '^[a-z0-9._]{1,30}$'
      and mention <> v_username
      and not exists (
        select 1 from public.social_actions action
        where action.participation_id = v_participation.id
          and action.action_type = 'additional_tag'
          and action.target_instagram_username_normalized = mention
      )
      and not exists (
        select 1 from public.social_actions base_action
        where base_action.participation_id = v_participation.id
          and base_action.action_type = 'base_comment'
          and (base_action.metadata -> 'mentions') ? mention
      )
    limit 1;

    if v_target is not null and v_awarded_count < v_draw.max_extra_chances then
      insert into public.social_actions (
        participation_id, action_type, source, external_id,
        target_instagram_username_normalized, state, chance_awarded, occurred_at, metadata
      ) values (
        v_participation.id, 'additional_tag', 'meta_webhook', p_external_id,
        v_target, 'verified', true, now(), coalesce(p_evidence, '{}'::jsonb)
      ) on conflict do nothing returning * into v_action;

      if v_action.id is not null then
        update public.participations
        set extra_chances = least(v_draw.max_extra_chances, extra_chances + 1), updated_at = now()
        where id = v_participation.id;
      end if;
    end if;
  end if;

  perform private.recalculate_participation(v_participation.id);
  update public.meta_webhook_events set status = 'verified', processed_at = now()
  where external_id = p_external_id;
  return 'verified';
exception when others then
  update public.meta_webhook_events set status = 'failed', processed_at = now()
  where external_id = p_external_id;
  raise;
end;
$$;

create or replace function public.record_instagram_story_mention(
  p_external_id text,
  p_instagram_user_id text,
  p_instagram_username text default null,
  p_evidence jsonb default '{}'::jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text := lower(trim(leading '@' from coalesce(p_instagram_username, '')));
  v_participation public.participations;
  v_completion public.requirement_completions;
  v_draw public.draws;
  v_action public.social_actions;
  v_awarded_count integer;
begin
  insert into public.meta_webhook_events (
    external_id, event_type, instagram_user_id, instagram_username_normalized, evidence
  ) values (
    p_external_id, 'story_mention', nullif(trim(p_instagram_user_id), ''), nullif(v_username, ''),
    coalesce(p_evidence, '{}'::jsonb)
  ) on conflict (external_id) do nothing;
  if not found then return 'duplicate'; end if;

  select p.* into v_participation
  from public.participations p
  join public.draws d on d.id = p.draw_id
  join public.profiles profile on profile.id = p.profile_id
  where d.status = 'open' and (d.closes_at is null or d.closes_at > now())
    and ((nullif(trim(p_instagram_user_id), '') is not null and profile.instagram_scoped_user_id = p_instagram_user_id)
      or (nullif(v_username, '') is not null and profile.instagram_username_normalized = v_username))
  order by d.edition_number desc limit 1 for update of p;

  if not found then
    update public.meta_webhook_events set status = 'unresolved', processed_at = now()
    where external_id = p_external_id;
    return 'participant_not_found';
  end if;

  select * into v_draw from public.draws where id = v_participation.draw_id;

  update public.profiles set instagram_scoped_user_id = coalesce(nullif(trim(p_instagram_user_id), ''), instagram_scoped_user_id)
  where id = v_participation.profile_id
    and (instagram_scoped_user_id is null or instagram_scoped_user_id = p_instagram_user_id);

  select completion.* into v_completion
  from public.requirement_completions completion
  join public.draw_requirements requirement on requirement.id = completion.requirement_id
  where completion.participation_id = v_participation.id
    and requirement.requirement_key = 'share_story'
  for update of completion;

  if v_completion.state <> 'verified' then
    update public.requirement_completions
    set state = 'verified', detected_at = now(), verified_at = now(), verified_by = null,
        verification_source = 'instagram', rejection_reason = null,
        evidence = coalesce(evidence, '{}'::jsonb) || coalesce(p_evidence, '{}'::jsonb), updated_at = now()
    where id = v_completion.id;

    insert into public.social_actions (
      participation_id, action_type, source, external_id, state,
      chance_awarded, occurred_at, metadata
    ) values (
      v_participation.id, 'story_share', 'meta_webhook', p_external_id, 'verified',
      false, now(), coalesce(p_evidence, '{}'::jsonb)
    ) on conflict (external_id) do nothing;
  else
    select count(*)::integer into v_awarded_count from public.social_actions
    where participation_id = v_participation.id and chance_awarded;
    if v_awarded_count < v_draw.max_extra_chances then
      insert into public.social_actions (
        participation_id, action_type, source, external_id, publication_id, state,
        chance_awarded, occurred_at, metadata
      ) values (
        v_participation.id, 'extra_post_share', 'meta_webhook', p_external_id,
        'story:' || p_external_id, 'verified', true, now(), coalesce(p_evidence, '{}'::jsonb)
      ) on conflict do nothing returning * into v_action;
      if v_action.id is not null then
        update public.participations
        set extra_chances = least(v_draw.max_extra_chances, extra_chances + 1), updated_at = now()
        where id = v_participation.id;
      end if;
    end if;
  end if;

  perform private.recalculate_participation(v_participation.id);
  update public.meta_webhook_events set status = 'verified', processed_at = now()
  where external_id = p_external_id;
  return 'verified';
end;
$$;

revoke all on function public.record_instagram_comment(text, text, text, text, text, text[], jsonb)
from public, anon, authenticated;
revoke all on function public.record_instagram_story_mention(text, text, text, jsonb)
from public, anon, authenticated;
grant execute on function public.record_instagram_comment(text, text, text, text, text, text[], jsonb)
to service_role;
grant execute on function public.record_instagram_story_mention(text, text, text, jsonb)
to service_role;

-- La revision manual tambien puede confirmar un evento que Meta no entrego.
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
  v_draw public.draws;
begin
  if not exists (
    select 1 from private.admin_roles
    where user_id = p_actor_id and active and role in ('owner', 'admin')
  ) then raise exception 'ADMIN_REQUIRED'; end if;
  if p_decision not in ('verified', 'rejected') then raise exception 'INVALID_DECISION'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'REVIEW_REASON_REQUIRED'; end if;

  select * into v_before from public.requirement_completions
  where id = p_completion_id for update;
  if not found then raise exception 'COMPLETION_NOT_FOUND'; end if;
  select * into v_participation from public.participations where id = v_before.participation_id for update;
  select * into v_draw from public.draws where id = v_participation.draw_id;
  if v_draw.status in ('completed', 'cancelled') then raise exception 'DRAW_NOT_REVIEWABLE'; end if;

  update public.requirement_completions
  set state = p_decision,
      verified_at = case when p_decision = 'verified' then now() else null end,
      verified_by = p_actor_id,
      verification_source = 'admin',
      rejection_reason = case when p_decision = 'rejected' then trim(p_reason) else null end,
      evidence = coalesce(evidence, '{}'::jsonb) || jsonb_build_object('admin_reason', trim(p_reason)),
      updated_at = now()
  where id = p_completion_id returning * into v_after;

  perform private.recalculate_participation(v_participation.id);
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

-- La declaracion de extras queda cerrada: las chances sociales llegan por Meta o por administracion.
revoke all on function public.declare_extra_social_action(uuid, bigint, text, text)
from public, anon, authenticated, service_role;
