-- Primera misión automática: participar correctamente y no ganar.
-- Se acredita al confirmar el ganador y nunca más de una vez por edición/persona.

update public.draws
set points_config = points_config || jsonb_build_object('non_winner_participation', 2)
where not (points_config ? 'non_winner_participation');

create or replace function public.admin_confirm_winner(p_actor_id uuid, p_attempt_id bigint)
returns public.winners language plpgsql security definer set search_path = '' as $$
declare
  v_draw_id bigint; v_draw public.draws; v_attempt public.draw_attempts;
  v_entry public.draw_snapshot_entries; v_winner public.winners; v_badge_id bigint;
  v_non_winner_points integer;
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
      'non_winner_points', v_non_winner_points));
  return v_winner;
end; $$;

revoke all on function public.admin_confirm_winner(uuid, bigint) from public, anon, authenticated;
grant execute on function public.admin_confirm_winner(uuid, bigint) to service_role;

