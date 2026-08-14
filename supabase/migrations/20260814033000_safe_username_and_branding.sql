-- Alias de acceso, cambio seguro de usuario, recuperacion administrativa y credito publico editable.

alter table public.profiles
  add column if not exists instagram_username_changed_at timestamptz;

create table if not exists private.profile_username_aliases (
  username_normalized text primary key
    check (username_normalized ~ '^[a-z0-9._]{1,30}$'),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists profile_username_aliases_profile_idx
  on private.profile_username_aliases(profile_id);

alter table private.profile_username_aliases enable row level security;
revoke all on table private.profile_username_aliases from public, anon, authenticated;
grant select, insert on table private.profile_username_aliases to service_role;

insert into private.profile_username_aliases(username_normalized, profile_id)
select instagram_username_normalized, id from public.profiles
on conflict (username_normalized) do nothing;

create or replace function public.create_participant_profile(
  p_user_id uuid, p_instagram_username text, p_recovery_code_hash text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from private.profile_username_aliases where username_normalized=p_instagram_username)
    then raise exception 'USERNAME_TAKEN'; end if;
  insert into public.profiles(id,instagram_username,instagram_username_normalized)
  values(p_user_id,p_instagram_username,p_instagram_username);
  insert into private.profile_secrets(profile_id,recovery_code_hash)
  values(p_user_id,p_recovery_code_hash);
  insert into private.profile_username_aliases(username_normalized,profile_id)
  values(p_instagram_username,p_user_id);
end; $$;
revoke all on function public.create_participant_profile(uuid,text,text) from public,anon,authenticated;
grant execute on function public.create_participant_profile(uuid,text,text) to service_role;

insert into private.app_settings(setting_key, setting_value)
values ('public_branding', jsonb_build_object(
  'creator_text', 'Creado por @gonzapuefll',
  'creator_url', 'https://www.instagram.com/gonzapuefll/',
  'visible', true
))
on conflict (setting_key) do nothing;

create or replace function public.resolve_participant_login(p_username text)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v_username text;
begin
  v_username := lower(regexp_replace(trim(coalesce(p_username, '')), '^@+', ''));
  if v_username !~ '^[a-z0-9._]{1,30}$' then return null; end if;
  return (
    select a.profile_id from private.profile_username_aliases a
    join public.profiles p on p.id = a.profile_id
    where a.username_normalized = v_username and p.status = 'active'
  );
end; $$;
revoke all on function public.resolve_participant_login(text) from public, anon, authenticated;
grant execute on function public.resolve_participant_login(text) to service_role;

create or replace function public.change_own_instagram_username(p_new_username text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_profile_id uuid; v_new text; v_old text; v_last timestamptz; v_owner uuid;
begin
  v_profile_id := auth.uid();
  if v_profile_id is null then raise exception 'AUTH_REQUIRED'; end if;
  v_new := lower(regexp_replace(trim(coalesce(p_new_username, '')), '^@+', ''));
  if v_new !~ '^[a-z0-9._]{1,30}$' then raise exception 'INVALID_USERNAME'; end if;

  select instagram_username_normalized, instagram_username_changed_at
  into v_old, v_last from public.profiles where id = v_profile_id and status = 'active' for update;
  if v_old is null then raise exception 'PROFILE_NOT_FOUND'; end if;
  if v_new = v_old then return v_old; end if;
  if v_last is not null and v_last > now() - interval '30 days' then raise exception 'USERNAME_COOLDOWN'; end if;

  select profile_id into v_owner from private.profile_username_aliases where username_normalized = v_new;
  if v_owner is not null and v_owner <> v_profile_id then raise exception 'USERNAME_TAKEN'; end if;

  insert into private.profile_username_aliases(username_normalized, profile_id)
  values (v_old, v_profile_id) on conflict (username_normalized) do nothing;
  insert into private.profile_username_aliases(username_normalized, profile_id)
  values (v_new, v_profile_id) on conflict (username_normalized) do nothing;
  update public.profiles set instagram_username = v_new,
    instagram_username_normalized = v_new, instagram_username_changed_at = now()
  where id = v_profile_id;
  insert into private.audit_log(actor_user_id, action, entity_type, entity_id, before_data, after_data)
  values (v_profile_id, 'profile.instagram_username_changed', 'profile', v_profile_id::text,
    jsonb_build_object('instagram_username', v_old), jsonb_build_object('instagram_username', v_new));
  return v_new;
end; $$;
revoke all on function public.change_own_instagram_username(text) from public, anon, authenticated;
grant execute on function public.change_own_instagram_username(text) to authenticated;

create or replace function public.admin_change_member_instagram_username(
  p_actor_id uuid, p_profile_id uuid, p_new_username text, p_reason text
) returns text language plpgsql security definer set search_path = '' as $$
declare v_new text; v_old text; v_owner uuid;
begin
  if not exists (select 1 from private.admin_roles where user_id=p_actor_id and active and role in ('owner','admin'))
    then raise exception 'ADMIN_REQUIRED'; end if;
  if char_length(trim(coalesce(p_reason,''))) not between 3 and 200 then raise exception 'REASON_REQUIRED'; end if;
  v_new := lower(regexp_replace(trim(coalesce(p_new_username, '')), '^@+', ''));
  if v_new !~ '^[a-z0-9._]{1,30}$' then raise exception 'INVALID_USERNAME'; end if;
  select instagram_username_normalized into v_old from public.profiles where id=p_profile_id for update;
  if v_old is null then raise exception 'PROFILE_NOT_FOUND'; end if;
  if v_new = v_old then return v_old; end if;
  select profile_id into v_owner from private.profile_username_aliases where username_normalized=v_new;
  if v_owner is not null and v_owner <> p_profile_id then raise exception 'USERNAME_TAKEN'; end if;
  insert into private.profile_username_aliases(username_normalized,profile_id) values(v_old,p_profile_id) on conflict do nothing;
  insert into private.profile_username_aliases(username_normalized,profile_id) values(v_new,p_profile_id) on conflict do nothing;
  update public.profiles set instagram_username=v_new, instagram_username_normalized=v_new,
    instagram_username_changed_at=now() where id=p_profile_id;
  insert into private.audit_log(actor_user_id,action,entity_type,entity_id,before_data,after_data)
  values(p_actor_id,'admin.member_instagram_username_changed','profile',p_profile_id::text,
    jsonb_build_object('instagram_username',v_old),
    jsonb_build_object('instagram_username',v_new,'reason',trim(p_reason)));
  return v_new;
end; $$;
revoke all on function public.admin_change_member_instagram_username(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.admin_change_member_instagram_username(uuid,uuid,text,text) to service_role;

create or replace function public.admin_record_recovery_reset(
  p_actor_id uuid, p_profile_id uuid, p_recovery_code_hash text, p_reason text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from private.admin_roles where user_id=p_actor_id and active and role in ('owner','admin'))
    then raise exception 'ADMIN_REQUIRED'; end if;
  if char_length(trim(coalesce(p_reason,''))) not between 3 and 200 then raise exception 'REASON_REQUIRED'; end if;
  if p_recovery_code_hash !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_HASH'; end if;
  update private.profile_secrets set recovery_code_hash=p_recovery_code_hash,
    failed_recovery_attempts=0, locked_until=null, recovery_code_changed_at=now()
  where profile_id=p_profile_id;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
  insert into private.audit_log(actor_user_id,action,entity_type,entity_id,after_data)
  values(p_actor_id,'admin.member_recovery_regenerated','profile',p_profile_id::text,
    jsonb_build_object('reason',trim(p_reason)));
end; $$;
revoke all on function public.admin_record_recovery_reset(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.admin_record_recovery_reset(uuid,uuid,text,text) to service_role;

create or replace function public.get_public_branding()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((select setting_value from private.app_settings where setting_key='public_branding'),
    '{"creator_text":"Creado por @gonzapuefll","creator_url":"https://www.instagram.com/gonzapuefll/","visible":true}'::jsonb);
$$;
revoke all on function public.get_public_branding() from public;
grant execute on function public.get_public_branding() to anon, authenticated, service_role;

create or replace function public.admin_update_public_branding(
  p_actor_id uuid, p_creator_text text, p_creator_url text, p_visible boolean
) returns void language plpgsql security definer set search_path = '' as $$
declare v_before jsonb; v_after jsonb;
begin
  if not exists (select 1 from private.admin_roles where user_id=p_actor_id and active and role in ('owner','admin'))
    then raise exception 'ADMIN_REQUIRED'; end if;
  if char_length(trim(coalesce(p_creator_text,''))) not between 3 and 80 then raise exception 'INVALID_TEXT'; end if;
  if p_creator_url !~ '^https://(www\.)?instagram\.com/[A-Za-z0-9._]+/?$' then raise exception 'INVALID_URL'; end if;
  select setting_value into v_before from private.app_settings where setting_key='public_branding';
  v_after := jsonb_build_object('creator_text',trim(p_creator_text),'creator_url',trim(p_creator_url),'visible',p_visible);
  insert into private.app_settings(setting_key,setting_value,updated_by) values('public_branding',v_after,p_actor_id)
  on conflict(setting_key) do update set setting_value=excluded.setting_value,
    updated_by=excluded.updated_by, updated_at=now(), version=private.app_settings.version+1;
  insert into private.audit_log(actor_user_id,action,entity_type,entity_id,before_data,after_data)
  values(p_actor_id,'admin.public_branding_updated','app_setting','public_branding',v_before,v_after);
end; $$;
revoke all on function public.admin_update_public_branding(uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.admin_update_public_branding(uuid,text,text,boolean) to service_role;
