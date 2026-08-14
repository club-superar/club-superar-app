-- Club SUPER.AR - Revision, descalificacion y confirmacion del ganador.

create or replace function public.admin_mark_attempt_under_review(p_actor_id uuid, p_attempt_id bigint)
returns public.draw_attempts language plpgsql security definer set search_path = '' as $$
declare v_draw_id bigint; v_draw public.draws; v_attempt public.draw_attempts;
begin
  if not exists (select 1 from private.admin_roles where user_id = p_actor_id and active and role in ('owner', 'admin'))
    then raise exception 'ADMIN_REQUIRED'; end if;
  select draw_id into v_draw_id from public.draw_attempts where id = p_attempt_id;
  if not found then raise exception 'ATTEMPT_NOT_FOUND'; end if;
  select * into v_draw from public.draws where id = v_draw_id for update;
  select * into v_attempt from public.draw_attempts where id = p_attempt_id for update;
  if v_draw.status <> 'winner_review' or v_attempt.status <> 'provisional'
    then raise exception 'ATTEMPT_NOT_PROVISIONAL'; end if;
  update public.draw_attempts set status = 'under_review' where id = p_attempt_id returning * into v_attempt;
  insert into private.audit_log (actor_user_id, action, entity_type, entity_id, before_data, after_data)
  values (p_actor_id, 'draw_attempt.under_review', 'draw_attempt', p_attempt_id::text,
    jsonb_build_object('status', 'provisional'), jsonb_build_object('status', 'under_review'));
  return v_attempt;
end; $$;

create or replace function public.admin_disqualify_attempt(
  p_actor_id uuid, p_attempt_id bigint, p_reason_key text, p_notes text default null
)
returns public.draw_attempts language plpgsql security definer set search_path = '' as $$
declare v_draw_id bigint; v_draw public.draws; v_attempt public.draw_attempts; v_entry public.draw_snapshot_entries;
begin
  if not exists (select 1 from private.admin_roles where user_id = p_actor_id and active and role in ('owner', 'admin'))
    then raise exception 'ADMIN_REQUIRED'; end if;
  if p_reason_key not in ('not_in_whatsapp', 'not_following_instagram', 'story_not_shared', 'invalid_comment', 'false_data', 'other')
    then raise exception 'INVALID_REASON'; end if;
  if p_reason_key = 'other' and nullif(trim(coalesce(p_notes, '')), '') is null
    then raise exception 'NOTES_REQUIRED'; end if;
  select draw_id into v_draw_id from public.draw_attempts where id = p_attempt_id;
  if not found then raise exception 'ATTEMPT_NOT_FOUND'; end if;
  select * into v_draw from public.draws where id = v_draw_id for update;
  select * into v_attempt from public.draw_attempts where id = p_attempt_id for update;
  if v_draw.status <> 'winner_review' or v_attempt.status not in ('provisional', 'under_review')
    then raise exception 'ATTEMPT_NOT_REVIEWABLE'; end if;
  select * into v_entry from public.draw_snapshot_entries where id = v_attempt.selected_entry_id;
  insert into public.disqualifications (draw_id, attempt_id, participation_id, reason_key, notes, disqualified_by)
  values (v_draw.id, v_attempt.id, v_entry.participation_id, p_reason_key,
    nullif(trim(coalesce(p_notes, '')), ''), p_actor_id);
  update public.draw_attempts set status = 'disqualified', resolved_at = now()
    where id = p_attempt_id returning * into v_attempt;
  update public.participations set status = 'disqualified', updated_at = now()
    where id = v_entry.participation_id;
  insert into private.audit_log (actor_user_id, action, entity_type, entity_id, before_data, after_data)
  values (p_actor_id, 'draw_attempt.disqualified', 'draw_attempt', p_attempt_id::text,
    jsonb_build_object('status', 'winner_provisional'),
    jsonb_build_object('status', 'disqualified', 'reason_key', p_reason_key, 'notes', p_notes,
      'participation_id', v_entry.participation_id, 'profile_id', v_entry.profile_id));
  return v_attempt;
end; $$;

create or replace function public.admin_confirm_winner(p_actor_id uuid, p_attempt_id bigint)
returns public.winners language plpgsql security definer set search_path = '' as $$
declare
  v_draw_id bigint; v_draw public.draws; v_attempt public.draw_attempts;
  v_entry public.draw_snapshot_entries; v_winner public.winners; v_badge_id bigint;
begin
  if not exists (select 1 from private.admin_roles where user_id = p_actor_id and active and role in ('owner', 'admin'))
    then raise exception 'ADMIN_REQUIRED'; end if;
  select draw_id into v_draw_id from public.draw_attempts where id = p_attempt_id;
  if not found then raise exception 'ATTEMPT_NOT_FOUND'; end if;
  select * into v_draw from public.draws where id = v_draw_id for update;
  select * into v_attempt from public.draw_attempts where id = p_attempt_id for update;
  if v_draw.status <> 'winner_review' or v_attempt.status not in ('provisional', 'under_review')
    then raise exception 'ATTEMPT_NOT_CONFIRMABLE'; end if;
  select * into v_entry from public.draw_snapshot_entries where id = v_attempt.selected_entry_id;
  insert into public.winners (draw_id, attempt_id, participation_id, profile_id, instagram_username, confirmed_by, claim_deadline)
  values (v_draw.id, v_attempt.id, v_entry.participation_id, v_entry.profile_id, v_entry.instagram_username,
    p_actor_id, now() + make_interval(hours => v_draw.claim_window_hours)) returning * into v_winner;
  update public.draw_attempts set status = 'confirmed', resolved_at = now() where id = p_attempt_id;
  update public.participations set status = 'winner_confirmed', updated_at = now() where id = v_entry.participation_id;
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
      'instagram_username', v_entry.instagram_username, 'claim_deadline', v_winner.claim_deadline));
  return v_winner;
end; $$;

revoke all on function public.admin_mark_attempt_under_review(uuid, bigint) from public, anon, authenticated;
revoke all on function public.admin_disqualify_attempt(uuid, bigint, text, text) from public, anon, authenticated;
revoke all on function public.admin_confirm_winner(uuid, bigint) from public, anon, authenticated;
grant execute on function public.admin_mark_attempt_under_review(uuid, bigint) to service_role;
grant execute on function public.admin_disqualify_attempt(uuid, bigint, text, text) to service_role;
grant execute on function public.admin_confirm_winner(uuid, bigint) to service_role;
