create table if not exists public.winner_deliveries (
  id bigint generated always as identity primary key,
  draw_id bigint not null unique references public.draws(id) on delete restrict,
  winner_id bigint not null unique references public.winners(id) on delete restrict,
  description text not null check (char_length(description) between 3 and 240),
  photo_path text not null,
  photo_subject text not null check (photo_subject in ('winner', 'merchandise')),
  winner_consent_confirmed boolean not null default false,
  delivered_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint winner_delivery_consent_check check (photo_subject = 'merchandise' or winner_consent_confirmed)
);

alter table public.winner_deliveries enable row level security;
create policy "winner deliveries are public" on public.winner_deliveries
for select to anon, authenticated using (true);
grant select on public.winner_deliveries to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('winner-deliveries', 'winner-deliveries', true, 819200, array['image/webp'])
on conflict (id) do update set public = true, file_size_limit = 819200, allowed_mime_types = array['image/webp'];
