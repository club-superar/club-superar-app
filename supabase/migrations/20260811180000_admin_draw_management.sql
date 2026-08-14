-- Club SUPER.AR - Administracion segura de ediciones de sorteos.

create or replace function public.is_phase1_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.admin_roles
    where user_id = p_user_id and active
  );
$$;

create or replace function public.admin_create_draw(
  p_actor_id uuid,
  p_title text,
  p_prize_name text,
  p_prize_value numeric,
  p_opens_at timestamptz,
  p_closes_at timestamptz,
  p_instagram_profile_url text,
  p_whatsapp_group_url text,
  p_main_publication_url text
)
returns public.draws
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draw public.draws;
  v_edition integer;
begin
  if not exists (
    select 1 from private.admin_roles
    where user_id = p_actor_id and active and role in ('owner', 'admin')
  ) then
    raise exception 'ADMIN_REQUIRED';
  end if;

  if length(trim(p_title)) < 3 or length(trim(p_prize_name)) < 3 then
    raise exception 'INVALID_DRAW_DATA';
  end if;
  if p_prize_value is not null and p_prize_value < 0 then
    raise exception 'INVALID_PRIZE_VALUE';
  end if;
  if p_opens_at is null or p_closes_at is null or p_closes_at <= p_opens_at then
    raise exception 'INVALID_DRAW_DATES';
  end if;
  if p_instagram_profile_url !~ '^https://' or p_whatsapp_group_url !~ '^https://'
    or p_main_publication_url !~ '^https://' then
    raise exception 'INVALID_ACTION_URL';
  end if;

  select coalesce(max(edition_number), 0) + 1 into v_edition
  from public.draws;

  insert into public.draws (
    edition_number, title, prize_name, prize_value, status,
    opens_at, closes_at, created_by
  ) values (
    v_edition, trim(p_title), trim(p_prize_name), p_prize_value, 'draft',
    p_opens_at, p_closes_at, p_actor_id
  ) returning * into v_draw;

  insert into public.draw_requirements (
    draw_id, requirement_key, title, instructions, action_url, required, points, display_order
  ) values
    (v_draw.id, 'follow_instagram', 'Seguir a SUPER.AR', 'Segui la cuenta oficial de SUPER.AR en Instagram.', p_instagram_profile_url, true, 2, 1),
    (v_draw.id, 'whatsapp_group', 'Grupo de WhatsApp', 'Confirma que seguis dentro del grupo de SUPER.AR.', p_whatsapp_group_url, true, 2, 2),
    (v_draw.id, 'comment_and_tag', 'Comentar y etiquetar', 'Comenta la publicacion, etiqueta a dos personas y agrega tu codigo.', p_main_publication_url, true, 2, 3),
    (v_draw.id, 'share_story', 'Compartir en tu historia', 'Compartila en tu historia y menciona a SUPER.AR.', p_main_publication_url, true, 2, 4);

  insert into private.audit_log (
    actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    p_actor_id, 'draw.created', 'draw', v_draw.id::text, to_jsonb(v_draw)
  );

  return v_draw;
end;
$$;

create or replace function public.admin_open_draw(
  p_actor_id uuid,
  p_draw_id bigint
)
returns public.draws
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before public.draws;
  v_after public.draws;
begin
  if not exists (
    select 1 from private.admin_roles
    where user_id = p_actor_id and active and role in ('owner', 'admin')
  ) then
    raise exception 'ADMIN_REQUIRED';
  end if;

  select * into v_before from public.draws where id = p_draw_id for update;
  if not found or v_before.status <> 'draft' then
    raise exception 'DRAW_NOT_DRAFT';
  end if;
  if v_before.closes_at <= now() then
    raise exception 'DRAW_CLOSE_DATE_PASSED';
  end if;
  if (select count(*) from public.draw_requirements where draw_id = p_draw_id and required) <> 4 then
    raise exception 'DRAW_REQUIREMENTS_INCOMPLETE';
  end if;

  update public.draws
  set status = 'open', opens_at = least(opens_at, now()), updated_at = now()
  where id = p_draw_id
  returning * into v_after;

  insert into private.audit_log (
    actor_user_id, action, entity_type, entity_id, before_data, after_data
  ) values (
    p_actor_id, 'draw.opened', 'draw', p_draw_id::text,
    to_jsonb(v_before), to_jsonb(v_after)
  );

  return v_after;
end;
$$;

revoke all on function public.is_phase1_admin(uuid) from public, anon, authenticated;
revoke all on function public.admin_create_draw(uuid, text, text, numeric, timestamptz, timestamptz, text, text, text) from public, anon, authenticated;
revoke all on function public.admin_open_draw(uuid, bigint) from public, anon, authenticated;
grant execute on function public.is_phase1_admin(uuid) to service_role;
grant execute on function public.admin_create_draw(uuid, text, text, numeric, timestamptz, timestamptz, text, text, text) to service_role;
grant execute on function public.admin_open_draw(uuid, bigint) to service_role;
