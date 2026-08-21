-- Permite reemplazar de forma auditada a un ganador confirmado que no cumple
-- WhatsApp o que no reclama dentro del plazo, conservando todos los intentos.

alter table public.winners drop constraint if exists winners_draw_unique;
alter table public.winners drop constraint if exists winners_claim_status_check;
alter table public.winners
  add column if not exists superseded_at timestamptz,
  add column if not exists superseded_reason text,
  add column if not exists superseded_by uuid references auth.users(id) on delete set null,
  add constraint winners_claim_status_check
    check (claim_status in ('pending', 'claimed', 'expired', 'fulfilled', 'disqualified')),
  add constraint winners_superseded_reason_check
    check (superseded_reason is null or superseded_reason in ('not_in_whatsapp', 'claim_expired')),
  add constraint winners_superseded_consistency_check
    check ((superseded_at is null and superseded_reason is null) or (superseded_at is not null and superseded_reason is not null));

create unique index if not exists winners_one_active_per_draw_idx
  on public.winners(draw_id) where superseded_at is null;
create index if not exists winners_draw_confirmed_idx
  on public.winners(draw_id, confirmed_at desc);

alter table public.disqualifications drop constraint if exists disqualifications_reason_key_check;
alter table public.disqualifications add constraint disqualifications_reason_key_check
  check (reason_key in ('not_in_whatsapp', 'not_following_instagram', 'story_not_shared', 'invalid_comment', 'false_data', 'claim_expired', 'other'));

drop policy if exists winners_public_read on public.winners;
create policy winners_public_read on public.winners for select to anon, authenticated
using (superseded_at is null);

create or replace function public.admin_reopen_confirmed_winner(
  p_actor_id uuid,
  p_winner_id bigint,
  p_reason_key text
)
returns public.winners
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_winner public.winners;
  v_after public.winners;
  v_draw public.draws;
begin
  if not exists (
    select 1 from private.admin_roles
    where user_id = p_actor_id and active and role in ('owner', 'admin')
  ) then raise exception 'ADMIN_REQUIRED'; end if;

  if p_reason_key not in ('not_in_whatsapp', 'claim_expired') then
    raise exception 'INVALID_REROLL_REASON';
  end if;

  select * into v_winner from public.winners where id = p_winner_id for update;
  if not found then raise exception 'WINNER_NOT_FOUND'; end if;
  select * into v_draw from public.draws where id = v_winner.draw_id for update;

  if v_winner.superseded_at is not null or v_draw.status <> 'completed' then
    raise exception 'WINNER_ALREADY_RESOLVED';
  end if;
  if v_winner.claim_status = 'fulfilled' then
    raise exception 'PRIZE_ALREADY_FULFILLED';
  end if;
  if p_reason_key = 'claim_expired'
    and (v_winner.claim_status not in ('pending', 'expired') or now() < v_winner.claim_deadline) then
    raise exception 'CLAIM_WINDOW_ACTIVE';
  end if;

  insert into public.disqualifications (
    draw_id, attempt_id, participation_id, reason_key, notes, disqualified_by
  ) values (
    v_winner.draw_id, v_winner.attempt_id, v_winner.participation_id,
    p_reason_key,
    case when p_reason_key = 'not_in_whatsapp'
      then 'Ganador confirmado excluido por no permanecer en el grupo de WhatsApp.'
      else 'Ganador confirmado excluido por no reclamar dentro del plazo.' end,
    p_actor_id
  );

  update public.draw_attempts
  set status = 'disqualified', resolved_at = now()
  where id = v_winner.attempt_id;

  update public.participations
  set status = 'disqualified', updated_at = now()
  where id = v_winner.participation_id;

  delete from public.profile_badges
  where profile_id = v_winner.profile_id and draw_id = v_winner.draw_id
    and (metadata ->> 'winner_id')::bigint = v_winner.id;

  update public.winners
  set claim_status = case when p_reason_key = 'claim_expired' then 'expired' else 'disqualified' end,
      superseded_at = now(), superseded_reason = p_reason_key, superseded_by = p_actor_id
  where id = v_winner.id
  returning * into v_after;

  update public.draws
  set status = 'winner_review', completed_at = null, updated_at = now()
  where id = v_winner.draw_id;

  insert into private.audit_log (
    actor_user_id, action, entity_type, entity_id, before_data, after_data
  ) values (
    p_actor_id, 'winner.superseded_for_reroll', 'winner', v_winner.id::text,
    to_jsonb(v_winner),
    jsonb_build_object(
      'winner', to_jsonb(v_after), 'draw_status', 'winner_review',
      'reason_key', p_reason_key, 'participation_excluded', v_winner.participation_id
    )
  );

  return v_after;
end;
$$;

create or replace function public.admin_confirm_winner(p_actor_id uuid, p_attempt_id bigint)
returns public.winners language plpgsql security definer set search_path = '' as $$
declare
  v_draw_id bigint; v_draw public.draws; v_attempt public.draw_attempts;
  v_entry public.draw_snapshot_entries; v_winner public.winners; v_badge_id bigint;
  v_non_winner_points integer; v_prior_non_winner_points integer;
begin
  if not exists (select 1 from private.admin_roles where user_id = p_actor_id and active and role in ('owner', 'admin'))
    then raise exception 'ADMIN_REQUIRED'; end if;
  select draw_id into v_draw_id from public.draw_attempts where id = p_attempt_id;
  if not found then raise exception 'ATTEMPT_NOT_FOUND'; end if;
  select * into v_draw from public.draws where id = v_draw_id for update;
  select * into v_attempt from public.draw_attempts where id = p_attempt_id for update;
  if v_draw.status <> 'winner_review' or v_attempt.status not in ('provisional', 'under_review')
    then raise exception 'ATTEMPT_NOT_CONFIRMABLE'; end if;
  if exists (select 1 from public.winners where draw_id = v_draw_id and superseded_at is null)
    then raise exception 'ACTIVE_WINNER_EXISTS'; end if;
  select * into v_entry from public.draw_snapshot_entries where id = v_attempt.selected_entry_id;
  insert into public.winners (draw_id, attempt_id, participation_id, profile_id, instagram_username, confirmed_by, claim_deadline)
  values (v_draw.id, v_attempt.id, v_entry.participation_id, v_entry.profile_id, v_entry.instagram_username,
    p_actor_id, now() + make_interval(hours => v_draw.claim_window_hours)) returning * into v_winner;
  update public.draw_attempts set status = 'confirmed', resolved_at = now() where id = p_attempt_id;
  update public.participations set status = 'winner_confirmed', updated_at = now() where id = v_entry.participation_id;

  select coalesce(sum(amount), 0)::integer into v_prior_non_winner_points
  from public.points_ledger
  where idempotency_key = 'draw-non-winner:' || v_draw.id || ':' || v_entry.profile_id::text;
  if v_prior_non_winner_points > 0 then
    insert into public.points_ledger (
      profile_id, participation_id, amount, reason_key, description, idempotency_key, created_by
    ) values (
      v_entry.profile_id, v_entry.participation_id, -v_prior_non_winner_points,
      'reroll_winner_adjustment',
      'Ajuste por resultar ganador suplente del sorteo #' || v_draw.edition_number,
      'draw-reroll-winner-adjustment:' || v_draw.id || ':' || v_entry.profile_id::text,
      p_actor_id
    ) on conflict (idempotency_key) do nothing;
  end if;

  v_non_winner_points := greatest(0, coalesce((v_draw.points_config ->> 'non_winner_participation')::integer, 0));
  if v_non_winner_points > 0 then
    insert into public.points_ledger (profile_id, participation_id, amount, reason_key, description, idempotency_key, created_by)
    select snapshot_entry.profile_id, snapshot_entry.participation_id, v_non_winner_points,
      'non_winner_participation',
      'Participación válida en sorteo #' || v_draw.edition_number || ' (no ganador)',
      'draw-non-winner:' || v_draw.id || ':' || snapshot_entry.profile_id::text,
      p_actor_id
    from public.draw_snapshot_entries snapshot_entry
    join public.participations participation on participation.id = snapshot_entry.participation_id
    where snapshot_entry.snapshot_id = v_attempt.snapshot_id
      and snapshot_entry.profile_id <> v_entry.profile_id
      and participation.status <> 'disqualified'
    on conflict (idempotency_key) do nothing;
  end if;

  update public.draws set status = 'completed', completed_at = now(), updated_at = now() where id = v_draw.id;
  select id into v_badge_id from public.badge_definitions where badge_key = 'winner' and active limit 1;
  if v_badge_id is not null then
    insert into public.profile_badges (profile_id, badge_id, draw_id, awarded_by, metadata)
    values (v_entry.profile_id, v_badge_id, v_draw.id, p_actor_id,
      jsonb_build_object('winner_id', v_winner.id, 'attempt_id', v_attempt.id));
  end if;
  insert into private.audit_log (actor_user_id, action, entity_type, entity_id, before_data, after_data)
  values (p_actor_id, 'winner.confirmed', 'winner', v_winner.id::text, null,
    jsonb_build_object('draw_id', v_draw.id, 'attempt_id', v_attempt.id,
      'participation_id', v_entry.participation_id, 'profile_id', v_entry.profile_id,
      'instagram_username', v_entry.instagram_username, 'claim_deadline', v_winner.claim_deadline,
      'non_winner_points', v_non_winner_points, 'reroll_adjustment', v_prior_non_winner_points));
  return v_winner;
end;
$$;

revoke all on function public.admin_reopen_confirmed_winner(uuid, bigint, text) from public, anon, authenticated;
revoke all on function public.admin_confirm_winner(uuid, bigint) from public, anon, authenticated;
grant execute on function public.admin_reopen_confirmed_winner(uuid, bigint, text) to service_role;
grant execute on function public.admin_confirm_winner(uuid, bigint) to service_role;

