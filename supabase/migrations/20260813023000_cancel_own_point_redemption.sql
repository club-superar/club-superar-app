-- Permite liberar de forma segura los puntos reservados por un canje pendiente.
create or replace function public.cancel_own_point_redemption(p_redemption_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
begin
  v_profile_id := auth.uid();
  if v_profile_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  update public.point_redemptions
  set status = 'cancelled', cancelled_at = now()
  where id = p_redemption_id
    and profile_id = v_profile_id
    and status = 'pending'
    and expires_at > now();

  return found;
end;
$$;

revoke all on function public.cancel_own_point_redemption(uuid) from public, anon;
grant execute on function public.cancel_own_point_redemption(uuid) to authenticated;
