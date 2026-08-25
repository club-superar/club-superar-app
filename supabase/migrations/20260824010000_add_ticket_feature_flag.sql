-- Control independiente para publicar el lector de tickets cuando esté validado.
update private.app_settings
set setting_value = setting_value || jsonb_build_object('tickets_enabled', false),
    updated_at = now(),
    version = version + 1
where setting_key = 'club_features'
  and not (setting_value ? 'tickets_enabled');

drop function if exists public.admin_update_club_features(uuid,text,boolean);

create or replace function public.admin_update_club_features(
  p_actor_id uuid,
  p_help_instagram_url text,
  p_redemptions_enabled boolean,
  p_tickets_enabled boolean
)
returns void language plpgsql security definer set search_path='' as $$
declare v_before jsonb; v_after jsonb;
begin
  if not exists(select 1 from private.admin_roles where user_id=p_actor_id and active and role in ('owner','admin')) then raise exception 'ADMIN_REQUIRED'; end if;
  if p_help_instagram_url !~ '^https://(www\.)?instagram\.com/[A-Za-z0-9._]+/?$' then raise exception 'INVALID_HELP_URL'; end if;
  select setting_value into v_before from private.app_settings where setting_key='club_features';
  v_after:=coalesce(v_before,'{}'::jsonb) || jsonb_build_object(
    'help_instagram_url',trim(p_help_instagram_url),
    'redemptions_enabled',p_redemptions_enabled,
    'tickets_enabled',p_tickets_enabled
  );
  insert into private.app_settings(setting_key,setting_value,updated_by) values('club_features',v_after,p_actor_id)
  on conflict(setting_key) do update set setting_value=excluded.setting_value,updated_by=excluded.updated_by,updated_at=now(),version=private.app_settings.version+1;
  insert into private.audit_log(actor_user_id,action,entity_type,entity_id,before_data,after_data)
  values(p_actor_id,'admin.club_features_updated','app_setting','club_features',v_before,v_after);
end; $$;
revoke all on function public.admin_update_club_features(uuid,text,boolean,boolean) from public,anon,authenticated;
grant execute on function public.admin_update_club_features(uuid,text,boolean,boolean) to service_role;
