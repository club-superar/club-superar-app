-- Limpieza conservadora de datos tecnicos sin borrar cuentas, saldos ni historiales.
-- Se ejecuta en lotes pequenos para reducir bloqueos y crecimiento innecesario.

create extension if not exists pg_cron with schema pg_catalog;

alter table public.point_redemptions
  alter column code_hash drop not null;

create table private.data_retention_policy (
  singleton boolean primary key default true check (singleton),
  instagram_event_payload_days integer not null default 90
    check (instagram_event_payload_days between 30 and 365),
  completed_draw_evidence_days integer not null default 180
    check (completed_draw_evidence_days between 90 and 730),
  redemption_secret_days integer not null default 30
    check (redemption_secret_days between 7 and 365),
  instagram_event_row_days integer not null default 365
    check (instagram_event_row_days between 180 and 1825),
  cleanup_run_log_days integer not null default 365
    check (cleanup_run_log_days between 90 and 1825),
  updated_at timestamptz not null default now()
);

insert into private.data_retention_policy (singleton)
values (true)
on conflict (singleton) do nothing;

create table private.data_retention_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running'
    check (status in ('running', 'completed')),
  details jsonb not null default '{}'::jsonb
);

create index data_retention_runs_started_idx
on private.data_retention_runs (started_at desc);

alter table private.data_retention_policy enable row level security;
alter table private.data_retention_runs enable row level security;
revoke all on private.data_retention_policy, private.data_retention_runs
from public, anon, authenticated;

create index meta_webhook_events_cleanup_idx
on public.meta_webhook_events (processed_at)
where status in ('verified', 'ignored', 'failed', 'unresolved');

create index requirement_completions_evidence_cleanup_idx
on public.requirement_completions (updated_at)
where evidence <> '{}'::jsonb;

create index social_actions_metadata_cleanup_idx
on public.social_actions (created_at)
where metadata <> '{}'::jsonb;

create index point_redemptions_secret_cleanup_idx
on public.point_redemptions (created_at)
where code_hash is not null and status in ('confirmed', 'cancelled', 'expired');

create or replace function private.run_data_retention(p_batch_size integer default 5000)
returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '9min'
set lock_timeout = '5s'
as $$
declare
  v_policy private.data_retention_policy;
  v_run_id bigint;
  v_requirement_evidence integer := 0;
  v_social_metadata integer := 0;
  v_event_payloads integer := 0;
  v_redemption_secrets integer := 0;
  v_event_rows integer := 0;
  v_old_run_rows integer := 0;
  v_details jsonb;
begin
  if p_batch_size not between 100 and 10000 then
    raise exception 'INVALID_RETENTION_BATCH_SIZE';
  end if;

  select * into v_policy
  from private.data_retention_policy
  where singleton = true;
  if not found then raise exception 'RETENTION_POLICY_NOT_FOUND'; end if;

  insert into private.data_retention_runs default values
  returning id into v_run_id;

  with candidates as (
    select completion.id
    from public.requirement_completions completion
    join public.participations participation on participation.id = completion.participation_id
    join public.draws draw on draw.id = participation.draw_id
    where completion.evidence <> '{}'::jsonb
      and draw.status in ('completed', 'cancelled')
      and coalesce(draw.completed_at, draw.updated_at)
        < now() - make_interval(days => v_policy.completed_draw_evidence_days)
    order by completion.id
    limit p_batch_size
  )
  update public.requirement_completions completion
  set evidence = '{}'::jsonb
  from candidates
  where completion.id = candidates.id;
  get diagnostics v_requirement_evidence = row_count;

  with candidates as (
    select action.id
    from public.social_actions action
    join public.participations participation on participation.id = action.participation_id
    join public.draws draw on draw.id = participation.draw_id
    where action.metadata <> '{}'::jsonb
      and draw.status in ('completed', 'cancelled')
      and coalesce(draw.completed_at, draw.updated_at)
        < now() - make_interval(days => v_policy.completed_draw_evidence_days)
    order by action.id
    limit p_batch_size
  )
  update public.social_actions action
  set metadata = '{}'::jsonb
  from candidates
  where action.id = candidates.id;
  get diagnostics v_social_metadata = row_count;

  with candidates as (
    select event.id
    from public.meta_webhook_events event
    where event.evidence <> '{}'::jsonb
      and event.status in ('verified', 'ignored', 'failed')
      and event.processed_at
        < now() - make_interval(days => v_policy.instagram_event_payload_days)
    order by event.id
    limit p_batch_size
  )
  update public.meta_webhook_events event
  set evidence = '{}'::jsonb
  from candidates
  where event.id = candidates.id;
  get diagnostics v_event_payloads = row_count;

  with candidates as (
    select redemption.id
    from public.point_redemptions redemption
    where redemption.code_hash is not null
      and redemption.status in ('confirmed', 'cancelled', 'expired')
      and redemption.created_at
        < now() - make_interval(days => v_policy.redemption_secret_days)
    order by redemption.id
    limit p_batch_size
  )
  update public.point_redemptions redemption
  set code_hash = null
  from candidates
  where redemption.id = candidates.id;
  get diagnostics v_redemption_secrets = row_count;

  with candidates as (
    select event.id
    from public.meta_webhook_events event
    where event.status <> 'received'
      and event.received_at
        < now() - make_interval(days => v_policy.instagram_event_row_days)
    order by event.id
    limit p_batch_size
  )
  delete from public.meta_webhook_events event
  using candidates
  where event.id = candidates.id;
  get diagnostics v_event_rows = row_count;

  with candidates as (
    select run.id
    from private.data_retention_runs run
    where run.id <> v_run_id
      and run.started_at
        < now() - make_interval(days => v_policy.cleanup_run_log_days)
    order by run.id
    limit p_batch_size
  )
  delete from private.data_retention_runs run
  using candidates
  where run.id = candidates.id;
  get diagnostics v_old_run_rows = row_count;

  v_details := jsonb_build_object(
    'requirement_evidence_cleared', v_requirement_evidence,
    'social_metadata_cleared', v_social_metadata,
    'instagram_event_payloads_cleared', v_event_payloads,
    'redemption_secrets_cleared', v_redemption_secrets,
    'instagram_event_rows_deleted', v_event_rows,
    'old_cleanup_runs_deleted', v_old_run_rows,
    'batch_size', p_batch_size
  );

  update private.data_retention_runs
  set finished_at = now(), status = 'completed', details = v_details
  where id = v_run_id;

  return v_details;
end;
$$;

revoke all on function private.run_data_retention(integer)
from public, anon, authenticated;

select cron.schedule(
  'club-superar-data-retention',
  '15 4 * * *',
  $$select private.run_data_retention(5000);$$
);
