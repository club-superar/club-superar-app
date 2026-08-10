-- Club SUPER.AR — FASE 1
-- Esquema inicial de sorteos, fidelización y auditoría.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function private.set_updated_at() from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  instagram_username text not null,
  instagram_username_normalized text not null,
  display_name text,
  status text not null default 'active'
    check (status in ('active', 'suspended', 'blocked')),
  current_streak integer not null default 0 check (current_streak >= 0),
  longest_streak integer not null default 0 check (longest_streak >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_instagram_username_normalized_format_check
    check (instagram_username_normalized ~ '^[a-z0-9._]{1,30}$'),
  constraint profiles_instagram_username_normalized_unique
    unique (instagram_username_normalized)
);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create table private.profile_secrets (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  recovery_code_hash text not null,
  failed_recovery_attempts integer not null default 0 check (failed_recovery_attempts >= 0),
  locked_until timestamptz,
  recovery_code_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profile_secrets_set_updated_at
before update on private.profile_secrets
for each row execute function private.set_updated_at();

create table private.admin_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'reviewer')),
  active boolean not null default true,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now()
);

create table public.draws (
  id bigint generated always as identity primary key,
  edition_number integer not null check (edition_number > 0),
  title text not null,
  prize_name text not null,
  prize_value numeric(12,2) check (prize_value is null or prize_value >= 0),
  currency_code text not null default 'ARS' check (currency_code ~ '^[A-Z]{3}$'),
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'open', 'frozen', 'drawing', 'winner_review', 'completed', 'cancelled')),
  opens_at timestamptz,
  closes_at timestamptz,
  frozen_at timestamptz,
  completed_at timestamptz,
  claim_window_hours integer not null default 24 check (claim_window_hours between 1 and 168),
  winner_retained_chance_percent numeric(5,2) not null default 25
    check (winner_retained_chance_percent between 0 and 100),
  max_base_chances integer not null default 6 check (max_base_chances >= 1),
  max_extra_chances integer not null default 2 check (max_extra_chances >= 0),
  points_config jsonb not null default
    '{"follow_instagram":2,"whatsapp_group":2,"comment_and_tag":2,"share_story":2,"completion_bonus":2,"extra_action":3,"max_extra_actions":2}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint draws_edition_number_unique unique (edition_number),
  constraint draws_dates_check check (closes_at is null or opens_at is null or closes_at > opens_at)
);

create unique index draws_single_live_idx on public.draws ((true))
where status in ('open', 'frozen', 'drawing', 'winner_review');

create index draws_status_closes_at_idx on public.draws (status, closes_at);

create trigger draws_set_updated_at
before update on public.draws
for each row execute function private.set_updated_at();

create table public.draw_requirements (
  id bigint generated always as identity primary key,
  draw_id bigint not null references public.draws(id) on delete cascade,
  requirement_key text not null
    check (requirement_key in ('follow_instagram', 'whatsapp_group', 'comment_and_tag', 'share_story')),
  title text not null,
  instructions text,
  action_url text,
  required boolean not null default true,
  points integer not null default 0 check (points >= 0),
  display_order integer not null default 0 check (display_order >= 0),
  created_at timestamptz not null default now(),
  constraint draw_requirements_draw_key_unique unique (draw_id, requirement_key)
);

create index draw_requirements_draw_order_idx
on public.draw_requirements (draw_id, display_order);

create table public.participations (
  id bigint generated always as identity primary key,
  draw_id bigint not null references public.draws(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  participant_code text not null,
  status text not null default 'started'
    check (status in ('started', 'eligible', 'frozen', 'disqualified', 'winner_provisional', 'winner_confirmed')),
  streak_number integer not null default 1 check (streak_number >= 1),
  base_chances integer not null default 2 check (base_chances >= 0),
  extra_chances integer not null default 0 check (extra_chances between 0 and 2),
  winner_penalty_applied boolean not null default false,
  final_chances integer not null default 0 check (final_chances >= 0),
  completed_at timestamptz,
  frozen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint participations_draw_profile_unique unique (draw_id, profile_id),
  constraint participations_draw_code_unique unique (draw_id, participant_code),
  constraint participations_code_format_check check (participant_code ~ '^SUPER-[A-Z0-9]{4,10}$')
);

create index participations_profile_created_idx on public.participations (profile_id, created_at desc);
create index participations_draw_status_idx on public.participations (draw_id, status);

create trigger participations_set_updated_at
before update on public.participations
for each row execute function private.set_updated_at();

create table public.requirement_completions (
  id bigint generated always as identity primary key,
  participation_id bigint not null references public.participations(id) on delete cascade,
  requirement_id bigint not null references public.draw_requirements(id) on delete restrict,
  state text not null default 'not_started'
    check (state in ('not_started', 'declared', 'detected', 'verified', 'rejected')),
  declared_at timestamptz,
  detected_at timestamptz,
  verified_at timestamptz,
  verified_by uuid references auth.users(id) on delete set null,
  rejection_reason text,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint requirement_completions_participation_requirement_unique
    unique (participation_id, requirement_id)
);

create index requirement_completions_requirement_idx on public.requirement_completions (requirement_id);
create index requirement_completions_state_idx on public.requirement_completions (state);

create trigger requirement_completions_set_updated_at
before update on public.requirement_completions
for each row execute function private.set_updated_at();

create table public.social_actions (
  id bigint generated always as identity primary key,
  participation_id bigint not null references public.participations(id) on delete cascade,
  action_type text not null
    check (action_type in ('base_comment', 'additional_tag', 'story_share', 'extra_post_share')),
  source text not null default 'declared'
    check (source in ('declared', 'meta_webhook', 'admin')),
  external_id text,
  target_instagram_username_normalized text,
  publication_id text,
  state text not null default 'declared'
    check (state in ('declared', 'detected', 'verified', 'rejected')),
  chance_awarded boolean not null default false,
  points_awarded integer not null default 0 check (points_awarded >= 0),
  occurred_at timestamptz,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index social_actions_participation_type_idx
on public.social_actions (participation_id, action_type);
create unique index social_actions_external_id_unique_idx
on public.social_actions (external_id) where external_id is not null;
create unique index social_actions_unique_tag_idx
on public.social_actions (participation_id, target_instagram_username_normalized)
where action_type = 'additional_tag' and target_instagram_username_normalized is not null;
create unique index social_actions_unique_extra_post_idx
on public.social_actions (participation_id, publication_id)
where action_type = 'extra_post_share' and publication_id is not null;

create table public.points_ledger (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  participation_id bigint references public.participations(id) on delete restrict,
  amount integer not null check (amount <> 0),
  reason_key text not null,
  description text not null,
  idempotency_key text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint points_ledger_idempotency_key_unique unique (idempotency_key)
);

create index points_ledger_profile_created_idx on public.points_ledger (profile_id, created_at desc);
create index points_ledger_participation_idx on public.points_ledger (participation_id)
where participation_id is not null;

create table public.badge_definitions (
  id bigint generated always as identity primary key,
  badge_key text not null,
  name text not null,
  description text not null,
  icon text not null,
  repeatable boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint badge_definitions_badge_key_unique unique (badge_key)
);

create table public.profile_badges (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  badge_id bigint not null references public.badge_definitions(id) on delete restrict,
  draw_id bigint references public.draws(id) on delete restrict,
  awarded_by uuid references auth.users(id) on delete set null,
  awarded_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index profile_badges_profile_awarded_idx on public.profile_badges (profile_id, awarded_at desc);
create index profile_badges_badge_idx on public.profile_badges (badge_id);
create index profile_badges_draw_idx on public.profile_badges (draw_id) where draw_id is not null;
create unique index profile_badges_nonrepeatable_unique_idx
on public.profile_badges (profile_id, badge_id)
where draw_id is null;

create table public.draw_snapshots (
  id bigint generated always as identity primary key,
  draw_id bigint not null references public.draws(id) on delete restrict,
  version integer not null default 1 check (version > 0),
  participant_count integer not null check (participant_count >= 0),
  total_chances bigint not null check (total_chances >= 0),
  snapshot_hash text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint draw_snapshots_draw_version_unique unique (draw_id, version),
  constraint draw_snapshots_hash_unique unique (snapshot_hash)
);

create table public.draw_snapshot_entries (
  id bigint generated always as identity primary key,
  snapshot_id bigint not null references public.draw_snapshots(id) on delete restrict,
  participation_id bigint not null references public.participations(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  instagram_username text not null,
  final_chances integer not null check (final_chances > 0),
  range_start bigint not null check (range_start > 0),
  range_end bigint not null check (range_end >= range_start),
  created_at timestamptz not null default now(),
  constraint draw_snapshot_entries_snapshot_participation_unique unique (snapshot_id, participation_id),
  constraint draw_snapshot_entries_range_size_check
    check ((range_end - range_start + 1) = final_chances)
);

create index draw_snapshot_entries_profile_idx on public.draw_snapshot_entries (profile_id);
create index draw_snapshot_entries_range_idx on public.draw_snapshot_entries (snapshot_id, range_start, range_end);

create table public.draw_attempts (
  id bigint generated always as identity primary key,
  draw_id bigint not null references public.draws(id) on delete restrict,
  snapshot_id bigint not null references public.draw_snapshots(id) on delete restrict,
  attempt_number integer not null check (attempt_number > 0),
  random_value bigint not null check (random_value > 0),
  selected_entry_id bigint not null references public.draw_snapshot_entries(id) on delete restrict,
  status text not null default 'provisional'
    check (status in ('provisional', 'under_review', 'disqualified', 'confirmed')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint draw_attempts_draw_attempt_unique unique (draw_id, attempt_number)
);

create index draw_attempts_snapshot_idx on public.draw_attempts (snapshot_id);
create index draw_attempts_selected_entry_idx on public.draw_attempts (selected_entry_id);

create table public.disqualifications (
  id bigint generated always as identity primary key,
  draw_id bigint not null references public.draws(id) on delete restrict,
  attempt_id bigint not null references public.draw_attempts(id) on delete restrict,
  participation_id bigint not null references public.participations(id) on delete restrict,
  reason_key text not null
    check (reason_key in ('not_in_whatsapp', 'not_following_instagram', 'story_not_shared', 'invalid_comment', 'false_data', 'other')),
  notes text,
  disqualified_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint disqualifications_draw_participation_unique unique (draw_id, participation_id),
  constraint disqualifications_attempt_unique unique (attempt_id)
);

create index disqualifications_participation_idx on public.disqualifications (participation_id);

create table public.winners (
  id bigint generated always as identity primary key,
  draw_id bigint not null references public.draws(id) on delete restrict,
  attempt_id bigint not null references public.draw_attempts(id) on delete restrict,
  participation_id bigint not null references public.participations(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  instagram_username text not null,
  confirmed_by uuid references auth.users(id) on delete set null,
  confirmed_at timestamptz not null default now(),
  claim_deadline timestamptz not null,
  claim_status text not null default 'pending'
    check (claim_status in ('pending', 'claimed', 'expired', 'fulfilled')),
  claimed_at timestamptz,
  fulfilled_at timestamptz,
  constraint winners_draw_unique unique (draw_id),
  constraint winners_attempt_unique unique (attempt_id)
);

create index winners_profile_confirmed_idx on public.winners (profile_id, confirmed_at desc);

create table public.generated_assets (
  id bigint generated always as identity primary key,
  winner_id bigint not null references public.winners(id) on delete restrict,
  asset_type text not null check (asset_type in ('feed', 'story')),
  storage_path text not null,
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  content_hash text not null,
  created_at timestamptz not null default now(),
  constraint generated_assets_winner_type_unique unique (winner_id, asset_type),
  constraint generated_assets_storage_path_unique unique (storage_path)
);

create table private.audit_log (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  request_id text,
  created_at timestamptz not null default now()
);

create index audit_log_entity_idx on private.audit_log (entity_type, entity_id, created_at desc);
create index audit_log_actor_idx on private.audit_log (actor_user_id, created_at desc)
where actor_user_id is not null;

create table private.app_settings (
  setting_key text primary key,
  setting_value jsonb not null,
  version integer not null default 1 check (version > 0),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.badge_definitions (badge_key, name, description, icon, repeatable)
values
  ('winner', 'Ganador', 'Se obtiene cada vez que gana un sorteo.', '🏆', true),
  ('loyal', 'Fiel', 'Reconoce una racha de participación destacada.', '🔥', false),
  ('legend', 'Leyenda SUPER.AR', 'Reconoce una cantidad importante de SUPER Puntos.', '💎', false);

insert into private.app_settings (setting_key, setting_value)
values (
  'phase1_defaults',
  '{"claim_window_hours":24,"winner_retained_chance_percent":25,"max_base_chances":6,"max_extra_chances":2,"points":{"follow_instagram":2,"whatsapp_group":2,"comment_and_tag":2,"share_story":2,"completion_bonus":2,"extra_action":3,"max_extra_actions":2}}'::jsonb
);

-- Seguridad por fila: todas las tablas del esquema expuesto quedan protegidas.
alter table public.profiles enable row level security;
alter table public.draws enable row level security;
alter table public.draw_requirements enable row level security;
alter table public.participations enable row level security;
alter table public.requirement_completions enable row level security;
alter table public.social_actions enable row level security;
alter table public.points_ledger enable row level security;
alter table public.badge_definitions enable row level security;
alter table public.profile_badges enable row level security;
alter table public.draw_snapshots enable row level security;
alter table public.draw_snapshot_entries enable row level security;
alter table public.draw_attempts enable row level security;
alter table public.disqualifications enable row level security;
alter table public.winners enable row level security;
alter table public.generated_assets enable row level security;
alter table private.profile_secrets enable row level security;
alter table private.admin_roles enable row level security;
alter table private.audit_log enable row level security;
alter table private.app_settings enable row level security;

-- Revocar permisos amplios y conceder sólo las lecturas/escrituras necesarias.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select, insert on public.profiles to authenticated;
grant select on public.draws, public.draw_requirements to anon, authenticated;
grant select on public.participations, public.requirement_completions, public.social_actions,
  public.points_ledger, public.profile_badges to authenticated;
grant select on public.badge_definitions to anon, authenticated;
grant select (draw_id, instagram_username, confirmed_at, claim_status)
  on public.winners to anon, authenticated;

grant usage on schema private to service_role;
grant select, insert, update on private.profile_secrets, private.admin_roles, private.app_settings
  to service_role;
grant select, insert on private.audit_log to service_role;
grant usage, select on all sequences in schema private to service_role;

create policy profiles_select_own
on public.profiles for select to authenticated
using ((select auth.uid()) = id);

create policy profiles_insert_own
on public.profiles for insert to authenticated
with check ((select auth.uid()) = id);

create policy draws_public_read
on public.draws for select to anon, authenticated
using (status in ('scheduled', 'open', 'frozen', 'drawing', 'winner_review', 'completed'));

create policy draw_requirements_public_read
on public.draw_requirements for select to anon, authenticated
using (
  exists (
    select 1 from public.draws
    where draws.id = draw_requirements.draw_id
      and draws.status in ('scheduled', 'open', 'frozen', 'drawing', 'winner_review', 'completed')
  )
);

create policy participations_select_own
on public.participations for select to authenticated
using ((select auth.uid()) = profile_id);

create policy requirement_completions_select_own
on public.requirement_completions for select to authenticated
using (
  exists (
    select 1 from public.participations
    where participations.id = requirement_completions.participation_id
      and participations.profile_id = (select auth.uid())
  )
);

create policy social_actions_select_own
on public.social_actions for select to authenticated
using (
  exists (
    select 1 from public.participations
    where participations.id = social_actions.participation_id
      and participations.profile_id = (select auth.uid())
  )
);

create policy points_ledger_select_own
on public.points_ledger for select to authenticated
using ((select auth.uid()) = profile_id);

create policy badge_definitions_public_read
on public.badge_definitions for select to anon, authenticated
using (active = true);

create policy profile_badges_select_own
on public.profile_badges for select to authenticated
using ((select auth.uid()) = profile_id);

create policy winners_public_read
on public.winners for select to anon, authenticated
using (true);

-- Tablas sin políticas públicas permanecen inaccesibles para clientes.
-- Todas las escrituras sensibles se realizarán desde lógica de servidor auditada.
