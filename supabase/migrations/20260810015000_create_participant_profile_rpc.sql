-- Crea el perfil público y su secreto privado en una sola operación.
-- Sólo puede invocarse con la clave secreta del servidor.
create or replace function public.create_participant_profile(
  p_user_id uuid,
  p_instagram_username text,
  p_recovery_code_hash text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (
    id,
    instagram_username,
    instagram_username_normalized
  ) values (
    p_user_id,
    p_instagram_username,
    p_instagram_username
  );

  insert into private.profile_secrets (
    profile_id,
    recovery_code_hash
  ) values (
    p_user_id,
    p_recovery_code_hash
  );
end;
$$;

revoke all on function public.create_participant_profile(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.create_participant_profile(uuid, text, text)
  to service_role;
