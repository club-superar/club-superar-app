-- Reclamo privado y verificación obligatoria del ganador provisional.

alter table public.draw_attempts
  add column if not exists claim_code text,
  add column if not exists claim_deadline timestamptz,
  add column if not exists claim_code_verified_at timestamptz,
  add column if not exists whatsapp_verified_at timestamptz,
  add column if not exists instagram_follow_verified_at timestamptz,
  add column if not exists verification_completed_by uuid references auth.users(id) on delete set null;

create unique index if not exists draw_attempts_claim_code_unique_idx
  on public.draw_attempts (claim_code) where claim_code is not null;
create index if not exists draw_attempts_claim_deadline_idx
  on public.draw_attempts (claim_deadline)
  where status in ('provisional', 'under_review');

create or replace function private.prepare_provisional_claim()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_hours integer;
begin
  select claim_window_hours into v_hours from public.draws where id = new.draw_id;
  loop
    new.claim_code := 'PREMIO-' || upper(substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 6));
    exit when not exists (select 1 from public.draw_attempts where claim_code = new.claim_code);
  end loop;
  new.claim_deadline := now() + make_interval(hours => coalesce(v_hours, 24));
  return new;
end;
$$;

drop trigger if exists draw_attempts_prepare_provisional_claim on public.draw_attempts;
create trigger draw_attempts_prepare_provisional_claim
before insert on public.draw_attempts
for each row execute function private.prepare_provisional_claim();

do $$
declare
  v_attempt record;
  v_code text;
begin
  for v_attempt in
    select attempt.id, draw.claim_window_hours
    from public.draw_attempts attempt
    join public.draws draw on draw.id = attempt.draw_id
    where attempt.status in ('provisional', 'under_review') and attempt.claim_code is null
  loop
    loop
      v_code := 'PREMIO-' || upper(substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 6));
      exit when not exists (select 1 from public.draw_attempts where claim_code = v_code);
    end loop;
    update public.draw_attempts
    set claim_code = v_code,
        claim_deadline = now() + make_interval(hours => v_attempt.claim_window_hours)
    where id = v_attempt.id;
  end loop;
end;
$$;

create or replace function public.get_my_provisional_claim()
returns table (
  attempt_id bigint,
  draw_id bigint,
  edition_number integer,
  draw_title text,
  prize_name text,
  prize_value numeric,
  currency_code text,
  claim_code text,
  claim_deadline timestamptz
)
language sql security definer set search_path = '' stable as $$
  select attempt.id, attempt.draw_id, draw.edition_number, draw.title,
    draw.prize_name, draw.prize_value, draw.currency_code,
    attempt.claim_code, attempt.claim_deadline
  from public.draw_attempts attempt
  join public.draw_snapshot_entries entry on entry.id = attempt.selected_entry_id
  join public.draws draw on draw.id = attempt.draw_id
  where entry.profile_id = (select auth.uid())
    and attempt.status in ('provisional', 'under_review')
    and attempt.claim_code is not null
  order by attempt.created_at desc
  limit 1;
$$;

create or replace function public.admin_verify_provisional_claim(
  p_actor_id uuid,
  p_attempt_id bigint,
  p_claim_code text,
  p_whatsapp_verified boolean,
  p_instagram_follow_verified boolean
)
returns public.draw_attempts
language plpgsql security definer set search_path = '' as $$
declare
  v_before public.draw_attempts;
  v_after public.draw_attempts;
begin
  if not exists (
    select 1 from private.admin_roles
    where user_id = p_actor_id and active and role in ('owner', 'admin')
  ) then raise exception 'ADMIN_REQUIRED'; end if;

  select * into v_before from public.draw_attempts where id = p_attempt_id for update;
  if not found or v_before.status not in ('provisional', 'under_review') then
    raise exception 'ATTEMPT_NOT_VERIFIABLE';
  end if;
  if now() >= v_before.claim_deadline then raise exception 'CLAIM_EXPIRED'; end if;
  if upper(trim(p_claim_code)) <> v_before.claim_code then raise exception 'INVALID_CLAIM_CODE'; end if;
  if not p_whatsapp_verified or not p_instagram_follow_verified then
    raise exception 'MANUAL_CHECKS_REQUIRED';
  end if;

  update public.draw_attempts
  set claim_code_verified_at = now(), whatsapp_verified_at = now(),
      instagram_follow_verified_at = now(), verification_completed_by = p_actor_id
  where id = p_attempt_id returning * into v_after;

  insert into private.audit_log (actor_user_id, action, entity_type, entity_id, before_data, after_data)
  values (p_actor_id, 'draw.provisional_claim_verified', 'draw_attempt', p_attempt_id::text,
    jsonb_build_object('verified', false),
    jsonb_build_object('verified', true, 'whatsapp', true, 'instagram_follow', true));
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
  if v_attempt.claim_code_verified_at is null or v_attempt.whatsapp_verified_at is null
    or v_attempt.instagram_follow_verified_at is null then
    raise exception 'PROVISIONAL_VERIFICATION_REQUIRED';
  end if;
  if exists (select 1 from public.winners where draw_id = v_draw_id and superseded_at is null)
    then raise exception 'ACTIVE_WINNER_EXISTS'; end if;
  select * into v_entry from public.draw_snapshot_entries where id = v_attempt.selected_entry_id;
  insert into public.winners (
    draw_id, attempt_id, participation_id, profile_id, instagram_username, confirmed_by,
    claim_deadline, claim_status, claimed_at
  ) values (
    v_draw.id, v_attempt.id, v_entry.participation_id, v_entry.profile_id, v_entry.instagram_username,
    p_actor_id, v_attempt.claim_deadline, 'claimed', now()
  ) returning * into v_winner;
  update public.draw_attempts
  set status = 'confirmed', resolved_at = now(), claim_code = null
  where id = p_attempt_id;
  update public.participations set status = 'winner_confirmed', updated_at = now() where id = v_entry.participation_id;

  select coalesce(sum(amount), 0)::integer into v_prior_non_winner_points
  from public.points_ledger
  where idempotency_key = 'draw-non-winner:' || v_draw.id || ':' || v_entry.profile_id::text;
  if v_prior_non_winner_points > 0 then
    insert into public.points_ledger (
      profile_id, participation_id, amount, reason_key, description, idempotency_key, created_by
    ) values (
      v_entry.profile_id, v_entry.participation_id, -v_prior_non_winner_points,
      'reroll_winner_adjustment', 'Ajuste por resultar ganador suplente del sorteo #' || v_draw.edition_number,
      'draw-reroll-winner-adjustment:' || v_draw.id || ':' || v_entry.profile_id::text, p_actor_id
    ) on conflict (idempotency_key) do nothing;
  end if;

  v_non_winner_points := greatest(0, coalesce((v_draw.points_config ->> 'non_winner_participation')::integer, 0));
  if v_non_winner_points > 0 then
    insert into public.points_ledger (profile_id, participation_id, amount, reason_key, description, idempotency_key, created_by)
    select snapshot_entry.profile_id, snapshot_entry.participation_id, v_non_winner_points,
      'non_winner_participation', 'Participación válida en sorteo #' || v_draw.edition_number || ' (no ganador)',
      'draw-non-winner:' || v_draw.id || ':' || snapshot_entry.profile_id::text, p_actor_id
    from public.draw_snapshot_entries snapshot_entry
    join public.participations participation on participation.id = snapshot_entry.participation_id
    where snapshot_entry.snapshot_id = v_attempt.snapshot_id
      and snapshot_entry.profile_id <> v_entry.profile_id and participation.status <> 'disqualified'
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
      'non_winner_points', v_non_winner_points, 'reroll_adjustment', v_prior_non_winner_points,
      'provisional_claim_verified', true));
  return v_winner;
end;
$$;

update public.badge_definitions set icon = '🏆' where badge_key = 'winner';

revoke all on function private.prepare_provisional_claim() from public, anon, authenticated;
revoke all on function public.get_my_provisional_claim() from public, anon;
revoke all on function public.admin_verify_provisional_claim(uuid, bigint, text, boolean, boolean) from public, anon, authenticated;
revoke all on function public.admin_confirm_winner(uuid, bigint) from public, anon, authenticated;
grant execute on function public.get_my_provisional_claim() to authenticated;
grant execute on function public.admin_verify_provisional_claim(uuid, bigint, text, boolean, boolean) to service_role;
grant execute on function public.admin_confirm_winner(uuid, bigint) to service_role;
