-- Flujo inicial de tickets: imagen privada temporal, revisión manual y puntos auditables.
create table public.purchase_tickets (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','approved','rejected','duplicate')),
  storage_path text,
  image_sha256 text not null unique check (length(image_sha256) = 64),
  fiscal_fingerprint text unique check (fiscal_fingerprint is null or length(fiscal_fingerprint) = 64),
  issuer_cuit text,
  receipt_type text,
  point_of_sale text,
  receipt_number text,
  issued_on date,
  total_amount numeric(12,2) check (total_amount is null or total_amount > 0),
  cae text,
  cae_expires_on date,
  points_awarded integer not null default 0 check (points_awarded >= 0),
  rejection_reason text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index purchase_tickets_profile_created_idx on public.purchase_tickets(profile_id, created_at desc);
create index purchase_tickets_pending_idx on public.purchase_tickets(created_at) where status = 'pending';
alter table public.purchase_tickets enable row level security;
grant select on public.purchase_tickets to authenticated;
grant all on public.purchase_tickets to service_role;

create policy purchase_tickets_select_own on public.purchase_tickets
for select to authenticated using ((select auth.uid()) = profile_id);

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('ticket-temp','ticket-temp',false,6291456,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=false,file_size_limit=6291456,allowed_mime_types=array['image/jpeg','image/png','image/webp'];

create or replace function public.admin_review_purchase_ticket(
  p_actor_id uuid, p_ticket_id uuid, p_decision text, p_rejection_reason text,
  p_issuer_cuit text, p_receipt_type text, p_point_of_sale text,
  p_receipt_number text, p_issued_on date, p_total_amount numeric,
  p_cae text, p_cae_expires_on date, p_fiscal_fingerprint text
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_ticket public.purchase_tickets; v_settings jsonb; v_points integer;
begin
  if not public.is_phase1_admin(p_actor_id) then raise exception 'NOT_ADMIN'; end if;
  select * into v_ticket from public.purchase_tickets where id=p_ticket_id for update;
  if v_ticket.id is null then raise exception 'TICKET_NOT_FOUND'; end if;
  if v_ticket.status <> 'pending' then raise exception 'TICKET_ALREADY_REVIEWED'; end if;

  if p_decision='rejected' then
    if length(trim(coalesce(p_rejection_reason,''))) < 3 then raise exception 'REJECTION_REASON_REQUIRED'; end if;
    update public.purchase_tickets set status='rejected', rejection_reason=trim(p_rejection_reason),
      reviewed_by=p_actor_id, reviewed_at=now(), updated_at=now()
    where id=p_ticket_id;
    v_points:=0;
  elsif p_decision='approved' then
    if p_total_amount is null or p_total_amount <= 0 or length(p_fiscal_fingerprint) <> 64 then raise exception 'INVALID_TICKET_DATA'; end if;
    if exists(select 1 from public.purchase_tickets where fiscal_fingerprint=p_fiscal_fingerprint and id<>p_ticket_id) then
      update public.purchase_tickets set status='duplicate', rejection_reason='Comprobante ya utilizado',
        fiscal_fingerprint=null, reviewed_by=p_actor_id, reviewed_at=now(), updated_at=now()
      where id=p_ticket_id;
      return jsonb_build_object('status','duplicate','points',0,'profile_id',v_ticket.profile_id,'storage_path',v_ticket.storage_path);
    end if;
    select setting_value into v_settings from private.app_settings where setting_key='rewards';
    v_points:=floor((p_total_amount * coalesce((v_settings->>'earning_percent')::numeric,5) / 100)
      / coalesce((v_settings->>'ars_per_point')::numeric,100));
    v_points:=greatest(v_points,0);
    update public.purchase_tickets set status='approved', issuer_cuit=p_issuer_cuit, receipt_type=p_receipt_type,
      point_of_sale=p_point_of_sale, receipt_number=p_receipt_number, issued_on=p_issued_on,
      total_amount=p_total_amount, cae=p_cae, cae_expires_on=p_cae_expires_on,
      fiscal_fingerprint=p_fiscal_fingerprint, points_awarded=v_points,
      reviewed_by=p_actor_id, reviewed_at=now(), updated_at=now()
    where id=p_ticket_id;
    if v_points > 0 then
      insert into public.points_ledger(profile_id,amount,reason_key,description,idempotency_key,created_by)
      values(v_ticket.profile_id,v_points,'purchase_ticket','Puntos por compra validada','ticket:'||p_ticket_id,p_actor_id)
      on conflict(idempotency_key) do nothing;
    end if;
  else raise exception 'INVALID_DECISION'; end if;

  insert into private.audit_log(actor_user_id,action,entity_type,entity_id,before_data,after_data)
  values(p_actor_id,'ticket.'||p_decision,'purchase_ticket',p_ticket_id::text,
    jsonb_build_object('status','pending'),jsonb_build_object('status',p_decision,'points',v_points));
  return jsonb_build_object('status',p_decision,'points',v_points,'profile_id',v_ticket.profile_id,'storage_path',v_ticket.storage_path);
end; $$;

revoke all on function public.admin_review_purchase_ticket(uuid,uuid,text,text,text,text,text,text,date,numeric,text,date,text)
from public,anon,authenticated;
grant execute on function public.admin_review_purchase_ticket(uuid,uuid,text,text,text,text,text,text,date,numeric,text,date,text)
to service_role;

