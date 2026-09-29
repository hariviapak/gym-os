-- ===========================================================================
-- 792 Fitness Studio — Gym Management System
-- Phase 1 Schema: Core tables, RLS, sequences, triggers
-- Run this in the Supabase SQL Editor (or via `supabase db push`)
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type staff_role as enum ('owner', 'admin', 'manager', 'staff', 'trainer');
create type member_status as enum ('active', 'deactivated', 'blacklisted');
create type package_type as enum ('membership', 'day_pass', 'trial', 'pt');
create type membership_status as enum ('active', 'expired', 'frozen', 'upgraded', 'cancelled');
create type payment_status as enum ('paid', 'partial', 'pending');
create type payment_mode as enum ('cash', 'upi', 'card', 'bank_transfer', 'other');
create type event_type as enum (
  'enrollment', 'renewal', 'upgrade', 'downgrade', 'freeze_start', 'freeze_end',
  'expiry', 'payment', 'receipt_voided', 'status_change', 'profile_update',
  'terms_accepted', 'gift_kit_assigned', 'gift_kit_delivered', 'access_enabled',
  'access_disabled', 'note', 'import', 'contact', 'freeze_requested',
  'freeze_approved', 'freeze_rejected', 'freeze_ended', 'import_enrollment',
  'group_enrollment', 'refund'
);
create type freeze_status as enum ('pending', 'approved', 'rejected', 'active', 'ended');
create type gift_kit_status as enum ('pending', 'assigned', 'delivered', 'not_applicable');
create type import_status as enum ('running', 'completed', 'failed', 'partial');
create type terms_status as enum ('draft', 'active', 'retired');

-- ---------------------------------------------------------------------------
-- Helper: updated_at trigger function
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. gyms — Tenant record
-- ---------------------------------------------------------------------------
create table if not exists public.gyms (
  id              uuid primary key default uuid_generate_v4(),
  name            text not null,
  code            text unique not null,
  address         text,
  phone           text,
  email           text,
  gstin           text,
  logo_url        text,
  digital_kit_url text,
  is_active       boolean default true,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create trigger gyms_updated_at before update on public.gyms
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. gym_settings — Per-gym configuration
-- ---------------------------------------------------------------------------
create table if not exists public.gym_settings (
  gym_id                  uuid primary key references public.gyms(id) on delete cascade,
  grace_period_days       integer default 0 check (grace_period_days between 0 and 3),
  currency_symbol         text default '₹',
  gst_enabled             boolean default true,
  gst_rate                numeric(5,2) default 18.00,
  whatsapp_enabled        boolean default false,
  whatsapp_phone_id       text,
  whatsapp_access_token   text,
  whatsapp_token_iv       text,
  receipt_prefix          text default 'RCT',
  created_at              timestamptz default now(),
  updated_at              timestamptz default now()
);

create trigger gym_settings_updated_at before update on public.gym_settings
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. users — Staff login + role (links to auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  name        text not null,
  email       text not null unique,
  phone       text,
  role        staff_role not null default 'staff',
  is_active   boolean default true,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create trigger users_updated_at before update on public.users
  for each row execute function set_updated_at();

create index idx_users_gym_id on public.users(gym_id);

-- ---------------------------------------------------------------------------
-- Helper: get current user's gym_id (must be after users table exists)
-- ---------------------------------------------------------------------------
create or replace function auth_gym_id()
returns uuid
language sql
stable
security definer
as $$
  select gym_id from public.users where id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Helper: get current user's role
-- ---------------------------------------------------------------------------
create or replace function auth_role()
returns staff_role
language sql
stable
security definer
as $$
  select role from public.users where id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- 3a. member_groups — Generic groups: family / team / school, any size
-- ---------------------------------------------------------------------------
create table if not exists public.member_groups (
  id          uuid primary key default uuid_generate_v4(),
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  name        text not null,
  created_by  uuid references public.users(id),
  created_at  timestamptz default now(),
  unique (gym_id, name)
);

create index if not exists idx_member_groups_gym_id on public.member_groups(gym_id);

-- ---------------------------------------------------------------------------
-- 4. members — Master profile
-- ---------------------------------------------------------------------------
create table if not exists public.members (
  id              uuid primary key default uuid_generate_v4(),
  gym_id          uuid not null references public.gyms(id) on delete cascade,
  first_name      text not null,
  last_name       text,
  phone           text not null,
  email           text,
  gender          text check (gender in ('male', 'female', 'other')),
  date_of_birth   date,
  address         text,
  emergency_contact_name  text,
  emergency_contact_phone text,
  medical_notes   text,
  injury_notes    text,
  photo_url       text,
  photo_path      text,
  status          member_status not null default 'active',
  blacklist_reason text,
  referred_by     text,
  group_id        uuid references public.member_groups(id) on delete set null,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create trigger members_updated_at before update on public.members
  for each row execute function set_updated_at();

create index if not exists idx_members_group_id on public.members(group_id);

create index idx_members_gym_id on public.members(gym_id);
create index idx_members_phone on public.members(gym_id, phone);
create index idx_members_status on public.members(gym_id, status);
create index idx_members_name on public.members using gin (to_tsvector('simple', first_name || ' ' || coalesce(last_name, '')));

-- ---------------------------------------------------------------------------
-- 5. packages — Catalogue
-- ---------------------------------------------------------------------------
create table if not exists public.packages (
  id              uuid primary key default uuid_generate_v4(),
  gym_id          uuid not null references public.gyms(id) on delete cascade,
  name            text not null,
  type            package_type not null default 'membership',
  service_type    text not null default 'gym' check (service_type in ('gym', 'swimming', 'both')),
  duration_days   integer not null check (duration_days > 0),
  amount          numeric(10,2) not null default 0 check (amount >= 0),
  gst_rate        numeric(5,2) default 18.00,
  description     text,
  digital_kit_url text,
  sort_order      integer default 0,
  is_active       boolean default true,
  is_group_package boolean default false,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create trigger packages_updated_at before update on public.packages
  for each row execute function set_updated_at();

create index idx_packages_gym_id on public.packages(gym_id);
create index idx_packages_type on public.packages(gym_id, type);

-- ---------------------------------------------------------------------------
-- 6. memberships — Current + historical, never overwritten
-- ---------------------------------------------------------------------------
create table if not exists public.memberships (
  id                uuid primary key default uuid_generate_v4(),
  gym_id            uuid not null references public.gyms(id) on delete cascade,
  member_id         uuid not null references public.members(id) on delete cascade,
  package_id        uuid not null references public.packages(id),
  package_name      text,
  status            membership_status not null default 'active',
  payment_status    payment_status not null default 'pending',
  start_date        date not null,
  end_date          date not null,
  amount            numeric(10,2) not null default 0,
  gst_amount        numeric(10,2) default 0,
  total_amount      numeric(10,2) not null default 0,
  discount_amount   numeric(10,2) default 0 check (discount_amount >= 0),
  discount_reason   text,
  amount_paid       numeric(10,2) default 0,
  prorated_credit   numeric(10,2) default 0,
  upgraded_from_id  uuid references public.memberships(id),
  created_by        uuid references public.users(id),
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  constraint chk_dates check (end_date >= start_date),
  constraint chk_amounts check (total_amount = amount + gst_amount)
);

create trigger memberships_updated_at before update on public.memberships
  for each row execute function set_updated_at();

create index idx_memberships_gym_id on public.memberships(gym_id);
create index idx_memberships_member_id on public.memberships(member_id);
create index idx_memberships_status on public.memberships(gym_id, status);

-- ---------------------------------------------------------------------------
-- 7. member_events — Single append-only timeline
-- ---------------------------------------------------------------------------
create table if not exists public.member_events (
  id            uuid primary key default uuid_generate_v4(),
  gym_id        uuid not null references public.gyms(id) on delete cascade,
  member_id     uuid not null references public.members(id) on delete cascade,
  event_type    event_type not null,
  title         text not null,
  description   text,
  metadata      jsonb default '{}',
  created_by    uuid references public.users(id),
  created_at    timestamptz default now()
);

create index idx_member_events_gym_id on public.member_events(gym_id);
create index idx_member_events_member_id on public.member_events(member_id, created_at desc);
create index idx_member_events_type on public.member_events(gym_id, event_type);

-- Prevent updates and deletes — append-only. Exception: the audited
-- hard_delete_member RPC sets 'app.hard_delete' for its single transaction
-- so a member hard-delete can cascade through.
create or replace function prevent_member_event_modify()
returns trigger
language plpgsql
as $$
begin
  if current_setting('app.hard_delete', true) = 'on' then
    return old;
  end if;
  raise exception 'member_events is append-only: updates and deletes are not allowed';
end;
$$;

create trigger member_events_no_update before update on public.member_events
  for each row execute function prevent_member_event_modify();

create trigger member_events_no_delete before delete on public.member_events
  for each row execute function prevent_member_event_modify();

-- Hard-delete a member + all related history (owner/admin only, audited)
create or replace function hard_delete_member(p_member_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gym_id uuid;
  v_role text;
begin
  select u.gym_id, u.role into v_gym_id, v_role
  from public.users u
  where u.id = auth.uid();

  if v_role not in ('owner', 'admin') then
    raise exception 'Only owner/admin can delete members';
  end if;

  if not exists (
    select 1 from public.members m
    where m.id = p_member_id and m.gym_id = v_gym_id
  ) then
    return false;
  end if;

  perform set_config('app.hard_delete', 'on', true);

  delete from public.members where id = p_member_id and gym_id = v_gym_id;
  return true;
end;
$$;

grant execute on function hard_delete_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. membership_freezes — Freeze periods + approver
-- ---------------------------------------------------------------------------
create table if not exists public.membership_freezes (
  id              uuid primary key default uuid_generate_v4(),
  gym_id          uuid not null references public.gyms(id) on delete cascade,
  membership_id   uuid not null references public.memberships(id) on delete cascade,
  member_id       uuid not null references public.members(id) on delete cascade,
  start_date      date not null,
  end_date        date not null,
  reason          text,
  status          freeze_status not null default 'pending',
  is_backdated    boolean default false,
  backdated_days  integer default 0,
  requested_by    uuid references public.users(id),
  approved_by     uuid references public.users(id),
  approved_at     timestamptz,
  rejected_reason text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  constraint chk_freeze_dates check (end_date >= start_date),
  constraint chk_backdated_limit check (backdated_days <= 7)
);

create trigger membership_freezes_updated_at before update on public.membership_freezes
  for each row execute function set_updated_at();

create index idx_freezes_gym_id on public.membership_freezes(gym_id);
create index idx_freezes_member_id on public.membership_freezes(member_id);

-- ---------------------------------------------------------------------------
-- 9. payments — Linked to member/membership
-- ---------------------------------------------------------------------------
create table if not exists public.payments (
  id                uuid primary key default uuid_generate_v4(),
  gym_id            uuid not null references public.gyms(id) on delete cascade,
  member_id         uuid not null references public.members(id) on delete cascade,
  membership_id     uuid references public.memberships(id),
  receipt_id        uuid,
  amount            numeric(10,2) not null check (amount >= 0),
  mode              payment_mode not null default 'cash',
  reference_note    text,
  payment_date      date not null default current_date,
  -- Gateway-ready fields (for future online payment integration)
  gateway          text,
  gateway_payment_id text,
  gateway_status   text,
  payment_group_id uuid,
  created_by       uuid references public.users(id),
  created_at       timestamptz default now()
);

create index idx_payments_gym_id on public.payments(gym_id);
create index idx_payments_member_id on public.payments(member_id);
create index idx_payments_membership_id on public.payments(membership_id);
create index if not exists idx_payments_payment_group_id on public.payments(payment_group_id);

-- Group-enrollment memberships link to their payment batch (receipt annexure)
alter table public.memberships
  add column if not exists payment_group_id uuid;

create index if not exists idx_memberships_payment_group_id on public.memberships(payment_group_id);

-- ---------------------------------------------------------------------------
-- 10. receipts — Sequential numbering + void support
-- ---------------------------------------------------------------------------
-- Per-gym receipt number sequences
create table if not exists public.receipts (
  id            uuid primary key default uuid_generate_v4(),
  gym_id        uuid not null references public.gyms(id) on delete cascade,
  receipt_no    integer not null,
  member_id     uuid not null references public.members(id) on delete cascade,
  membership_id uuid references public.memberships(id),
  payment_id    uuid references public.payments(id),
  amount        numeric(10,2) not null,
  gst_amount    numeric(10,2) default 0,
  total_amount  numeric(10,2) not null,
  discount_amount numeric(10,2) default 0 check (discount_amount >= 0),
  discount_reason text,
  voided_at     timestamptz,
  voided_by     uuid references public.users(id),
  void_reason   text,
  payment_group_id uuid,
  billed_to     text,
  created_by    uuid references public.users(id),
  created_at    timestamptz default now(),
  unique (gym_id, receipt_no)
);

create index idx_receipts_gym_id on public.receipts(gym_id);
create index idx_receipts_member_id on public.receipts(member_id);
create index if not exists idx_receipts_payment_group_id on public.receipts(payment_group_id);

-- Add FK from payments.receipt_id to receipts.id (deferred due to circular dependency)
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'payments_receipt_id_fkey'
  ) then
    alter table public.payments
      add constraint payments_receipt_id_fkey
      foreign key (receipt_id) references public.receipts(id);
  end if;
end $$;

-- Sequence for receipt numbers (per gym, via a counter table approach)
-- Using a counter table with row-level locking for gap-resistant numbering
create table if not exists public.receipt_counters (
  gym_id      uuid primary key references public.gyms(id) on delete cascade,
  next_no     integer not null default 1
);

-- Function to get next receipt number atomically
create or replace function get_next_receipt_no(p_gym_id uuid)
returns integer
language plpgsql
security definer
as $$
declare
  v_next integer;
begin
  insert into public.receipt_counters (gym_id, next_no)
  values (p_gym_id, 1)
  on conflict (gym_id) do update
  set next_no = public.receipt_counters.next_no + 1
  returning next_no into v_next;

  return v_next - 1;
end;
$$;

-- Bulk variant: reserve N receipt numbers in one call (used by import)
create or replace function get_next_receipt_nos(p_gym_id uuid, p_count integer)
returns setof integer
language plpgsql
security definer
as $$
declare
  v_next integer;
  v_i integer;
begin
  insert into public.receipt_counters (gym_id, next_no)
  values (p_gym_id, 1)
  on conflict (gym_id) do update
  set next_no = public.receipt_counters.next_no + p_count
  returning next_no into v_next;

  for v_i in 1..p_count loop
    return next v_next - p_count + v_i - 1;
  end loop;
end;
$$;

grant execute on function get_next_receipt_no(p_gym_id uuid) to authenticated;
grant execute on function get_next_receipt_nos(p_gym_id uuid, p_count integer) to authenticated;

-- Members list summary strip (one aggregate call, scales server-side)
create or replace function member_overview_stats(p_gym_id uuid)
returns table(
  total_members  int,
  active_count   int,
  expiring_count int,
  expired_count  int,
  frozen_count   int,
  outstanding    numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with t as (select (current_timestamp at time zone 'Asia/Kolkata')::date as today),
  active_ms as (
    select ms.member_id, ms.total_amount, ms.amount_paid, ms.end_date
    from memberships ms
    join members m on m.id = ms.member_id
    where ms.gym_id = p_gym_id
      and ms.status = 'active'
      and ms.start_date <= (select today from t)
      and ms.end_date >= (select today from t)
      and m.status = 'active'
  ),
  frozen_ids as (
    select distinct f.member_id
    from membership_freezes f
    where f.gym_id = p_gym_id
      and f.status in ('pending', 'active', 'approved')
  ),
  cur as (
    select a.member_id, min(a.end_date) as soonest
    from active_ms a
    group by a.member_id
  )
  select
    (select count(*)::int from members where gym_id = p_gym_id and status = 'active'),
    (select count(*)::int from cur c
      where c.soonest > (select today from t) + 7
        and c.member_id not in (select member_id from frozen_ids)),
    (select count(*)::int from cur c
      where c.soonest <= (select today from t) + 7
        and c.member_id not in (select member_id from frozen_ids)),
    (select count(*)::int from members m
      where m.gym_id = p_gym_id
        and m.status = 'active'
        and m.id not in (select member_id from cur)
        and exists (
          select 1 from memberships ms
          where ms.member_id = m.id and ms.end_date < (select today from t)
        )),
    (select count(*)::int from frozen_ids),
    (select coalesce(sum(greatest(a.total_amount - a.amount_paid, 0)), 0) from active_ms a)
$$;

grant execute on function member_overview_stats(uuid) to authenticated;

-- Per-bucket member ids (derived-status filters, server-side SQL)
create or replace function member_bucket_ids(p_gym_id uuid)
returns table(bucket text, member_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  with t as (select (current_timestamp at time zone 'Asia/Kolkata')::date as today),
  act as (
    select distinct ms.member_id
    from memberships ms
    join members m on m.id = ms.member_id
    where ms.gym_id = p_gym_id
      and ms.status = 'active'
      and ms.start_date <= (select today from t)
      and ms.end_date >= (select today from t)
      and m.status = 'active'
  ),
  act_soonest as (
    select ms.member_id, min(ms.end_date) as soonest
    from memberships ms
    join members m on m.id = ms.member_id
    where ms.gym_id = p_gym_id
      and ms.status = 'active'
      and ms.start_date <= (select today from t)
      and ms.end_date >= (select today from t)
      and m.status = 'active'
    group by ms.member_id
  ),
  frozen_ids as (
    select distinct f.member_id
    from membership_freezes f
    join members m on m.id = f.member_id
    where f.gym_id = p_gym_id
      and f.status in ('pending', 'active', 'approved')
      and m.status = 'active'
  )
  select 'expiring'::text, s.member_id from act_soonest s
    where s.soonest <= (select today from t) + 7
      and s.member_id not in (select member_id from frozen_ids)
  union all
  select 'active'::text, s.member_id from act_soonest s
    where s.soonest > (select today from t) + 7
      and s.member_id not in (select member_id from frozen_ids)
  union all
  select 'frozen'::text, f.member_id from frozen_ids f
  union all
  select 'expired'::text, m.id
    from members m
    where m.gym_id = p_gym_id and m.status = 'active'
      and m.id not in (select member_id from act)
      and exists (
        select 1 from memberships ms
        where ms.member_id = m.id and ms.end_date < (select today from t)
      )
  union all
  select 'cancelled'::text, m.id
    from members m
    where m.gym_id = p_gym_id and m.status = 'active'
      and m.id not in (select member_id from act)
      and exists (
        select 1 from memberships ms
        where ms.member_id = m.id and ms.status = 'cancelled'
      )
$$;

grant execute on function member_bucket_ids(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 11. import_batches — CSV/Excel import runs
-- ---------------------------------------------------------------------------
create table if not exists public.import_batches (
  id              uuid primary key default uuid_generate_v4(),
  gym_id          uuid not null references public.gyms(id) on delete cascade,
  filename        text not null,
  total_rows      integer default 0,
  processed_rows  integer default 0,
  created_rows    integer default 0,
  updated_rows    integer default 0,
  skipped_rows    integer default 0,
  error_rows      integer default 0,
  errors          jsonb default '[]',
  status          import_status not null default 'running',
  column_mapping  jsonb default '{}',
  created_by      uuid references public.users(id),
  created_at      timestamptz default now(),
  completed_at    timestamptz
);

create index idx_import_batches_gym_id on public.import_batches(gym_id);

-- ---------------------------------------------------------------------------
-- 12. terms_versions — Digital T&C, versioned
-- ---------------------------------------------------------------------------
create table if not exists public.terms_versions (
  id          uuid primary key default uuid_generate_v4(),
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  version     text not null,
  title       text not null,
  body        text not null,
  status      terms_status not null default 'draft',
  category    text not null default 'gym' check (category in ('gym', 'swimming')),
  effective_from timestamptz,
  created_by  uuid references public.users(id),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique (gym_id, version, category)
);

create trigger terms_versions_updated_at before update on public.terms_versions
  for each row execute function set_updated_at();

create index idx_terms_versions_gym_id on public.terms_versions(gym_id);

-- ---------------------------------------------------------------------------
-- 13. terms_acceptances — Acceptance records
-- ---------------------------------------------------------------------------
create table if not exists public.terms_acceptances (
  id                  uuid primary key default uuid_generate_v4(),
  gym_id              uuid not null references public.gyms(id) on delete cascade,
  member_id           uuid not null references public.members(id) on delete cascade,
  terms_version_id    uuid not null references public.terms_versions(id),
  accepted_at         timestamptz default now(),
  accepted_by_method  text default 'staff_entry',
  signature_image     text,
  signed_name         text,
  signed_ip           text,
  signed_user_agent   text,
  signed_at           timestamptz,
  created_by          uuid references public.users(id)
);

create index idx_terms_acceptances_gym_id on public.terms_acceptances(gym_id);
create index idx_terms_acceptances_member_id on public.terms_acceptances(member_id);

-- ---------------------------------------------------------------------------
-- 14. gift_kit_tasks — Welcome-kit status
-- ---------------------------------------------------------------------------
create table if not exists public.gift_kit_tasks (
  id              uuid primary key default uuid_generate_v4(),
  gym_id          uuid not null references public.gyms(id) on delete cascade,
  member_id       uuid not null references public.members(id) on delete cascade,
  status          gift_kit_status not null default 'pending',
  assigned_to     uuid references public.users(id),
  assigned_at     timestamptz,
  delivered_at    timestamptz,
  digital_sent_at timestamptz,
  digital_sent_by uuid references public.users(id),
  digital_content_url text,
  delivered_by_method text,
  notes           text,
  created_by      uuid references public.users(id),
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create trigger gift_kit_tasks_updated_at before update on public.gift_kit_tasks
  for each row execute function set_updated_at();

create index idx_gift_kit_tasks_gym_id on public.gift_kit_tasks(gym_id);
create index idx_gift_kit_tasks_member_id on public.gift_kit_tasks(member_id);

-- ---------------------------------------------------------------------------
-- 14b. signing_tokens — Magic links for member T&C signing
-- ---------------------------------------------------------------------------
create table if not exists public.signing_tokens (
  id               uuid primary key default uuid_generate_v4(),
  gym_id           uuid not null references public.gyms(id) on delete cascade,
  member_id        uuid not null references public.members(id) on delete cascade,
  terms_version_id uuid not null references public.terms_versions(id) on delete cascade,
  token            text unique not null,
  expires_at       timestamptz not null,
  used_at          timestamptz,
  created_by       uuid references public.users(id),
  created_at       timestamptz default now()
);

create index idx_signing_tokens_token on public.signing_tokens(token);
create index idx_signing_tokens_member_id on public.signing_tokens(member_id);

-- ---------------------------------------------------------------------------
-- 14b2. refunds — Money returned to members (payments are >= 0 by design)
-- ---------------------------------------------------------------------------
create table if not exists public.refunds (
  id            uuid primary key default uuid_generate_v4(),
  gym_id        uuid not null references public.gyms(id) on delete cascade,
  member_id     uuid not null references public.members(id) on delete cascade,
  membership_id uuid references public.memberships(id) on delete set null,
  payment_id    uuid references public.payments(id) on delete set null,
  amount        numeric(10,2) not null check (amount > 0),
  reason        text,
  created_by    uuid references public.users(id),
  created_at    timestamptz default now()
);

create index if not exists idx_refunds_member_id on public.refunds(member_id);
create index if not exists idx_refunds_gym_id on public.refunds(gym_id);

alter table public.refunds enable row level security;

create policy "refunds_select_own" on public.refunds
  for select using (gym_id = auth_gym_id());

create policy "refunds_insert_manage" on public.refunds
  for insert with check (gym_id = auth_gym_id() and auth_role() in ('owner', 'admin', 'manager'));

-- ---------------------------------------------------------------------------
-- 15. audit_logs — Who changed what, when
-- ---------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id          uuid primary key default uuid_generate_v4(),
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  user_id     uuid references public.users(id),
  action      text not null,
  entity_type text not null,
  entity_id   uuid,
  changes     jsonb default '{}',
  ip_address  inet,
  created_at  timestamptz default now()
);

create index idx_audit_logs_gym_id on public.audit_logs(gym_id);
create index idx_audit_logs_entity on public.audit_logs(gym_id, entity_type, entity_id);
create index idx_audit_logs_created_at on public.audit_logs(gym_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 16a. locker_keys — configurable per-gym key INVENTORY (logs keep history)
-- ---------------------------------------------------------------------------
create table if not exists public.locker_keys (
  id                uuid primary key default uuid_generate_v4(),
  gym_id            uuid not null references public.gyms(id) on delete cascade,
  key_number        text not null,
  locker_number     text,
  status            text not null default 'available' check (status in ('available', 'issued')),
  current_member_id uuid references public.members(id) on delete set null,
  issued_at         timestamptz,
  attention         boolean not null default false,
  notes             text,
  created_at        timestamptz default now(),
  unique (gym_id, key_number)
);

create index if not exists idx_locker_keys_gym_id on public.locker_keys(gym_id);
create index if not exists idx_locker_keys_member on public.locker_keys(current_member_id);

alter table public.locker_keys enable row level security;

create policy "locker_keys_select_own" on public.locker_keys
  for select using (gym_id = auth_gym_id());

create policy "locker_keys_manage_staff" on public.locker_keys
  for insert with check (gym_id = auth_gym_id());

create policy "locker_keys_update_staff" on public.locker_keys
  for update using (gym_id = auth_gym_id());

create policy "locker_keys_delete_admin" on public.locker_keys
  for delete using (gym_id = auth_gym_id() and auth_role() in ('owner', 'admin'));

alter table public.locker_key_logs
  add column if not exists locker_key_id uuid references public.locker_keys(id) on delete set null;

create index if not exists idx_locker_key_logs_key on public.locker_key_logs(locker_key_id);

-- ---------------------------------------------------------------------------
-- 16. locker_key_logs — Track locker key issue/return
-- ---------------------------------------------------------------------------
create table if not exists public.locker_key_logs (
  id          uuid primary key default uuid_generate_v4(),
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  member_id   uuid not null references public.members(id) on delete cascade,
  key_number  text,
  issued_at   timestamptz default now(),
  issued_by   uuid references public.users(id),
  returned_at timestamptz,
  returned_by uuid references public.users(id),
  notes       text
);

create index idx_locker_keys_gym_id on public.locker_key_logs(gym_id);
create index idx_locker_keys_member_id on public.locker_key_logs(member_id);
create index idx_locker_keys_outstanding on public.locker_key_logs(gym_id) where returned_at is null;

-- ---------------------------------------------------------------------------
-- 15b. message_templates — WhatsApp message templates
-- ---------------------------------------------------------------------------
create table if not exists public.message_templates (
  id          uuid primary key default uuid_generate_v4(),
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  name        text not null,
  type        text not null,
  content     text not null,
  is_active   boolean default true,
  created_by  uuid references public.users(id),
  created_at  timestamptz default now()
);

create index idx_message_templates_gym_id on public.message_templates(gym_id);
create index idx_message_templates_type on public.message_templates(gym_id, type);

-- ---------------------------------------------------------------------------
-- 15c. gym_tasks — Operational tasks (maintenance, supply, cleaning)
-- ---------------------------------------------------------------------------
create table if not exists public.gym_tasks (
  id           uuid primary key default uuid_generate_v4(),
  gym_id       uuid not null references public.gyms(id) on delete cascade,
  title        text not null,
  description  text,
  type         text not null default 'custom',
  priority     text not null default 'medium',
  assigned_to  uuid references public.users(id),
  status       text not null default 'pending',
  due_date     date,
  created_by   uuid references public.users(id),
  created_at   timestamptz default now(),
  completed_at timestamptz,
  completed_by uuid references public.users(id),
  notes        text
);

create index idx_gym_tasks_gym_id on public.gym_tasks(gym_id);
create index idx_gym_tasks_status on public.gym_tasks(gym_id, status);

-- ---------------------------------------------------------------------------
-- 16. payment_links — For future online payment (QR scan → buy pass)
-- ---------------------------------------------------------------------------
create table if not exists public.payment_links (
  id              uuid primary key default uuid_generate_v4(),
  gym_id          uuid not null references public.gyms(id) on delete cascade,
  member_id       uuid references public.members(id),
  package_id      uuid not null references public.packages(id),
  amount          numeric(10,2) not null,
  status          text not null default 'pending' check (status in ('pending', 'paid', 'expired', 'cancelled')),
  gateway         text,
  gateway_link_id text,
  expires_at      timestamptz,
  paid_at         timestamptz,
  payment_id      uuid references public.payments(id),
  metadata        jsonb default '{}',
  created_at      timestamptz default now()
);

create index idx_payment_links_gym_id on public.payment_links(gym_id);
create index idx_payment_links_status on public.payment_links(gym_id, status);
create index idx_payment_links_package_id on public.payment_links(package_id);

-- ---------------------------------------------------------------------------
-- 17. devices — eSSL access control devices
-- ---------------------------------------------------------------------------
create table if not exists public.devices (
  id              uuid primary key default uuid_generate_v4(),
  gym_id          uuid not null references public.gyms(id) on delete cascade,
  name            text not null,
  device_model    text,
  serial_number   text,
  location        text,
  ip_address      text,
  port            integer,
  is_active       boolean default true,
  last_synced_at  timestamptz,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create trigger devices_updated_at before update on public.devices
  for each row execute function set_updated_at();

create index idx_devices_gym_id on public.devices(gym_id);

-- ---------------------------------------------------------------------------
-- 18. device_users — Mapping between our members and eSSL users
-- ---------------------------------------------------------------------------
create table if not exists public.device_users (
  id              uuid primary key default uuid_generate_v4(),
  gym_id          uuid not null references public.gyms(id) on delete cascade,
  member_id       uuid not null references public.members(id) on delete cascade,
  device_id       uuid references public.devices(id) on delete cascade,
  device_user_id  text,
  enrollment_status text not null default 'not_enrolled' check (enrollment_status in ('not_enrolled', 'enrolled', 'failed', 'removed')),
  access_enabled  boolean default false,
  face_enrolled   boolean default false,
  card_number     text,
  last_synced_at  timestamptz,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  unique (gym_id, member_id, device_id)
);

create trigger device_users_updated_at before update on public.device_users
  for each row execute function set_updated_at();

create index idx_device_users_gym_id on public.device_users(gym_id);
create index idx_device_users_member_id on public.device_users(member_id);
create index idx_device_users_device_id on public.device_users(device_id);

-- ---------------------------------------------------------------------------
-- 19. device_commands — Access enable/disable command log
-- ---------------------------------------------------------------------------
create table if not exists public.device_commands (
  id              uuid primary key default uuid_generate_v4(),
  gym_id          uuid not null references public.gyms(id) on delete cascade,
  device_id       uuid references public.devices(id) on delete cascade,
  member_id       uuid not null references public.members(id) on delete cascade,
  device_user_id  uuid references public.device_users(id) on delete cascade,
  command         text not null check (command in ('enable_access', 'disable_access', 'create_user', 'delete_user', 'sync_user')),
  status          text not null default 'pending' check (status in ('pending', 'sent', 'success', 'failed', 'retrying')),
  triggered_by    text not null default 'system' check (triggered_by in ('system', 'staff', 'reconciliation')),
  reason          text,
  error_message   text,
  retry_count     integer default 0,
  sent_at         timestamptz,
  completed_at    timestamptz,
  created_by      uuid references public.users(id),
  created_at      timestamptz default now()
);

create index idx_device_commands_gym_id on public.device_commands(gym_id);
create index idx_device_commands_status on public.device_commands(gym_id, status);
create index idx_device_commands_member_id on public.device_commands(member_id);

-- ---------------------------------------------------------------------------
-- 20. connector_heartbeats — eSSL connector health (Phase 2/3)
-- ---------------------------------------------------------------------------
create table if not exists public.connector_heartbeats (
  id              uuid primary key default uuid_generate_v4(),
  gym_id          uuid not null references public.gyms(id) on delete cascade,
  connector_type  text not null default 'essl',
  status          text not null check (status in ('healthy', 'degraded', 'offline')),
  last_ping_at    timestamptz default now(),
  details         jsonb default '{}',
  created_at      timestamptz default now()
);

create index idx_connector_heartbeats_gym_id on public.connector_heartbeats(gym_id);
create index idx_connector_heartbeats_status on public.connector_heartbeats(gym_id, status);

-- ---------------------------------------------------------------------------
-- 21. member_addons — Extra charges (PT, merchandise, supplements, etc.)
-- ---------------------------------------------------------------------------
create table if not exists public.member_addons (
  id            uuid primary key default uuid_generate_v4(),
  gym_id        uuid not null references public.gyms(id) on delete cascade,
  member_id     uuid not null references public.members(id) on delete cascade,
  name          text not null,
  description   text,
  amount        numeric(10,2) not null check (amount >= 0),
  payment_id    uuid references public.payments(id),
  created_by    uuid references public.users(id),
  created_at    timestamptz default now()
);

create index if not exists idx_member_addons_gym_id on public.member_addons(gym_id);
create index if not exists idx_member_addons_member_id on public.member_addons(member_id);

-- ===========================================================================
-- Row Level Security
-- ===========================================================================

alter table public.gyms enable row level security;
alter table public.gym_settings enable row level security;
alter table public.member_groups enable row level security;
alter table public.users enable row level security;
alter table public.members enable row level security;
alter table public.packages enable row level security;
alter table public.memberships enable row level security;
alter table public.member_events enable row level security;
alter table public.membership_freezes enable row level security;
alter table public.payments enable row level security;
alter table public.receipts enable row level security;
alter table public.receipt_counters enable row level security;
alter table public.import_batches enable row level security;
alter table public.terms_versions enable row level security;
alter table public.terms_acceptances enable row level security;
alter table public.gift_kit_tasks enable row level security;
alter table public.audit_logs enable row level security;
alter table public.payment_links enable row level security;
alter table public.devices enable row level security;
alter table public.device_users enable row level security;
alter table public.device_commands enable row level security;
alter table public.connector_heartbeats enable row level security;
alter table public.member_addons enable row level security;

-- ---------------------------------------------------------------------------
-- gyms — public read for login page branding, full access for gym staff
-- ---------------------------------------------------------------------------
create policy "gyms_select_public" on public.gyms
  for select using (true);

create policy "gyms_select_own" on public.gyms
  for select using (id = auth_gym_id());

create policy "gyms_update_own" on public.gyms
  for update using (id = auth_gym_id() and auth_role() in ('owner', 'admin'));

-- ---------------------------------------------------------------------------
-- member_groups — readable by all staff, managed by owner/admin/manager
-- ---------------------------------------------------------------------------
create policy "member_groups_select_own" on public.member_groups
  for select using (gym_id = auth_gym_id());

create policy "member_groups_insert_own" on public.member_groups
  for insert with check (gym_id = auth_gym_id() and auth_role() in ('owner', 'admin', 'manager'));

create policy "member_groups_update_own" on public.member_groups
  for update using (gym_id = auth_gym_id() and auth_role() in ('owner', 'admin', 'manager'));

create policy "member_groups_delete_own" on public.member_groups
  for delete using (gym_id = auth_gym_id() and auth_role() in ('owner', 'admin'));

-- ---------------------------------------------------------------------------
-- gym_settings — readable by all staff, writable by owner/admin
-- ---------------------------------------------------------------------------
create policy "gym_settings_select_own" on public.gym_settings
  for select using (gym_id = auth_gym_id());

create policy "gym_settings_update_own" on public.gym_settings
  for update using (gym_id = auth_gym_id() and auth_role() in ('owner', 'admin'));

-- ---------------------------------------------------------------------------
-- users — readable by all staff, writable by owner/admin
-- ---------------------------------------------------------------------------
create policy "users_select_own" on public.users
  for select using (gym_id = auth_gym_id());

create policy "users_insert_own" on public.users
  for insert with check (gym_id = auth_gym_id() and auth_role() in ('owner', 'admin'));

create policy "users_update_own" on public.users
  for update using (gym_id = auth_gym_id() and auth_role() in ('owner', 'admin'));

-- ---------------------------------------------------------------------------
-- members — full CRUD for all staff within their gym
-- ---------------------------------------------------------------------------
create policy "members_select_own" on public.members
  for select using (gym_id = auth_gym_id());

create policy "members_insert_own" on public.members
  for insert with check (gym_id = auth_gym_id());

create policy "members_update_own" on public.members
  for update using (gym_id = auth_gym_id());

-- Delete restricted to owner/admin (hard delete cascades memberships,
-- payments, receipts, events — the UI double-confirms first)
create policy "members_delete_admin" on public.members
  for delete using (gym_id = auth_gym_id() and auth_role() in ('owner', 'admin'));

-- ---------------------------------------------------------------------------
-- packages — readable by all staff, writable by owner/admin/manager
-- ---------------------------------------------------------------------------
create policy "packages_select_own" on public.packages
  for select using (gym_id = auth_gym_id());

create policy "packages_insert_own" on public.packages
  for insert with check (gym_id = auth_gym_id() and auth_role() in ('owner', 'admin', 'manager'));

create policy "packages_update_own" on public.packages
  for update using (gym_id = auth_gym_id() and auth_role() in ('owner', 'admin', 'manager'));

-- ---------------------------------------------------------------------------
-- memberships — readable by all staff, writable by all staff
-- ---------------------------------------------------------------------------
create policy "memberships_select_own" on public.memberships
  for select using (gym_id = auth_gym_id());

create policy "memberships_insert_own" on public.memberships
  for insert with check (gym_id = auth_gym_id());

create policy "memberships_update_own" on public.memberships
  for update using (gym_id = auth_gym_id());

-- ---------------------------------------------------------------------------
-- member_events — readable by all staff, insert-only (no update/delete)
-- ---------------------------------------------------------------------------
create policy "member_events_select_own" on public.member_events
  for select using (gym_id = auth_gym_id());

create policy "member_events_insert_own" on public.member_events
  for insert with check (gym_id = auth_gym_id());

-- ---------------------------------------------------------------------------
-- membership_freezes — readable by all staff, writable with role checks
-- ---------------------------------------------------------------------------
create policy "freezes_select_own" on public.membership_freezes
  for select using (gym_id = auth_gym_id());

create policy "freezes_insert_own" on public.membership_freezes
  for insert with check (gym_id = auth_gym_id());

create policy "freezes_update_own" on public.membership_freezes
  for update using (gym_id = auth_gym_id());

-- ---------------------------------------------------------------------------
-- payments — readable by all staff, writable by all staff
-- (finance edit restrictions for manager role enforced at app layer + audit)
-- ---------------------------------------------------------------------------
create policy "payments_select_own" on public.payments
  for select using (gym_id = auth_gym_id());

create policy "payments_insert_own" on public.payments
  for insert with check (gym_id = auth_gym_id());

create policy "payments_update_own" on public.payments
  for update using (gym_id = auth_gym_id());

-- ---------------------------------------------------------------------------
-- receipts — readable by all staff, insert by all staff, void by admin/owner
-- ---------------------------------------------------------------------------
create policy "receipts_select_own" on public.receipts
  for select using (gym_id = auth_gym_id());

create policy "receipts_insert_own" on public.receipts
  for insert with check (gym_id = auth_gym_id());

create policy "receipts_update_own" on public.receipts
  for update using (gym_id = auth_gym_id() and auth_role() in ('owner', 'admin', 'manager'));

-- ---------------------------------------------------------------------------
-- receipt_counters — only accessible via the function (security definer)
-- ---------------------------------------------------------------------------
create policy "receipt_counters_no_direct" on public.receipt_counters
  for all using (false) with check (false);

-- ---------------------------------------------------------------------------
-- import_batches — readable by all staff, writable by all staff
-- ---------------------------------------------------------------------------
create policy "import_batches_select_own" on public.import_batches
  for select using (gym_id = auth_gym_id());

create policy "import_batches_insert_own" on public.import_batches
  for insert with check (gym_id = auth_gym_id());

create policy "import_batches_update_own" on public.import_batches
  for update using (gym_id = auth_gym_id());

-- ---------------------------------------------------------------------------
-- terms_versions — readable by all staff, writable by owner/admin
-- ---------------------------------------------------------------------------
create policy "terms_select_own" on public.terms_versions
  for select using (gym_id = auth_gym_id());

create policy "terms_insert_own" on public.terms_versions
  for insert with check (gym_id = auth_gym_id() and auth_role() in ('owner', 'admin'));

create policy "terms_update_own" on public.terms_versions
  for update using (gym_id = auth_gym_id() and auth_role() in ('owner', 'admin'));

-- ---------------------------------------------------------------------------
-- terms_acceptances — readable by all staff, writable by all staff
-- ---------------------------------------------------------------------------
create policy "terms_acceptances_select_own" on public.terms_acceptances
  for select using (gym_id = auth_gym_id());

create policy "terms_acceptances_insert_own" on public.terms_acceptances
  for insert with check (gym_id = auth_gym_id());

-- ---------------------------------------------------------------------------
-- signing_tokens — readable/writable by all staff
-- ---------------------------------------------------------------------------
alter table public.signing_tokens enable row level security;

create policy "signing_tokens_select_own" on public.signing_tokens
  for select using (gym_id = auth_gym_id());

create policy "signing_tokens_insert_own" on public.signing_tokens
  for insert with check (gym_id = auth_gym_id());

create policy "signing_tokens_update_own" on public.signing_tokens
  for update using (gym_id = auth_gym_id());

-- ---------------------------------------------------------------------------
-- gift_kit_tasks — readable by all staff, writable by all staff
-- ---------------------------------------------------------------------------
create policy "gift_kit_select_own" on public.gift_kit_tasks
  for select using (gym_id = auth_gym_id());

create policy "gift_kit_insert_own" on public.gift_kit_tasks
  for insert with check (gym_id = auth_gym_id());

create policy "gift_kit_update_own" on public.gift_kit_tasks
  for update using (gym_id = auth_gym_id());

-- ---------------------------------------------------------------------------
-- audit_logs — readable by owner/admin/manager, insert-only for all
-- ---------------------------------------------------------------------------
create policy "audit_logs_select_own" on public.audit_logs
  for select using (gym_id = auth_gym_id() and auth_role() in ('owner', 'admin', 'manager'));

create policy "audit_logs_insert_own" on public.audit_logs
  for insert with check (gym_id = auth_gym_id());

-- ---------------------------------------------------------------------------
-- locker_key_logs — gym-scoped CRUD
-- ---------------------------------------------------------------------------
alter table public.locker_key_logs enable row level security;

create policy "locker_keys_gym_read" on public.locker_key_logs
  for select using (gym_id = auth_gym_id());

create policy "locker_keys_gym_insert" on public.locker_key_logs
  for insert with check (gym_id = auth_gym_id());

create policy "locker_keys_gym_update" on public.locker_key_logs
  for update using (gym_id = auth_gym_id());

-- ---------------------------------------------------------------------------
-- message_templates — gym-scoped CRUD
-- ---------------------------------------------------------------------------
alter table public.message_templates enable row level security;

create policy "templates_gym_read" on public.message_templates
  for select using (gym_id = auth_gym_id());

create policy "templates_gym_insert" on public.message_templates
  for insert with check (gym_id = auth_gym_id());

create policy "templates_gym_update" on public.message_templates
  for update using (gym_id = auth_gym_id());

create policy "templates_gym_delete" on public.message_templates
  for delete using (gym_id = auth_gym_id());

-- ---------------------------------------------------------------------------
-- gym_tasks — gym-scoped CRUD
-- ---------------------------------------------------------------------------
alter table public.gym_tasks enable row level security;

create policy "gym_tasks_gym_read" on public.gym_tasks
  for select using (gym_id = auth_gym_id());

create policy "gym_tasks_gym_insert" on public.gym_tasks
  for insert with check (gym_id = auth_gym_id());

create policy "gym_tasks_gym_update" on public.gym_tasks
  for update using (gym_id = auth_gym_id());

-- ---------------------------------------------------------------------------
-- payment_links — readable by all staff, writable by all staff
-- (public access for unpaid links is handled via a separate anon route)
-- ---------------------------------------------------------------------------
create policy "payment_links_select_own" on public.payment_links
  for select using (gym_id = auth_gym_id());

create policy "payment_links_insert_own" on public.payment_links
  for insert with check (gym_id = auth_gym_id());

create policy "payment_links_update_own" on public.payment_links
  for update using (gym_id = auth_gym_id());

-- ---------------------------------------------------------------------------
-- devices — readable by all staff, writable by owner/admin/manager
-- ---------------------------------------------------------------------------
create policy "devices_select_own" on public.devices
  for select using (gym_id = auth_gym_id());

create policy "devices_insert_own" on public.devices
  for insert with check (gym_id = auth_gym_id() and auth_role() in ('owner', 'admin', 'manager'));

create policy "devices_update_own" on public.devices
  for update using (gym_id = auth_gym_id() and auth_role() in ('owner', 'admin', 'manager'));

-- ---------------------------------------------------------------------------
-- device_users — readable by all staff, writable by all staff
-- ---------------------------------------------------------------------------
create policy "device_users_select_own" on public.device_users
  for select using (gym_id = auth_gym_id());

create policy "device_users_insert_own" on public.device_users
  for insert with check (gym_id = auth_gym_id());

create policy "device_users_update_own" on public.device_users
  for update using (gym_id = auth_gym_id());

-- ---------------------------------------------------------------------------
-- device_commands — readable by all staff, insert by all staff
-- ---------------------------------------------------------------------------
create policy "device_commands_select_own" on public.device_commands
  for select using (gym_id = auth_gym_id());

create policy "device_commands_insert_own" on public.device_commands
  for insert with check (gym_id = auth_gym_id());

create policy "device_commands_update_own" on public.device_commands
  for update using (gym_id = auth_gym_id());

-- ---------------------------------------------------------------------------
-- connector_heartbeats — readable by owner/admin/manager, insert by system
-- ---------------------------------------------------------------------------
create policy "connector_heartbeats_select_own" on public.connector_heartbeats
  for select using (gym_id = auth_gym_id() and auth_role() in ('owner', 'admin', 'manager'));

create policy "connector_heartbeats_insert_own" on public.connector_heartbeats
  for insert with check (gym_id = auth_gym_id());

create policy "connector_heartbeats_update_own" on public.connector_heartbeats
  for update using (gym_id = auth_gym_id());

-- ---------------------------------------------------------------------------
-- member_addons — readable by all staff, writable by all staff
-- ---------------------------------------------------------------------------
create policy "addons_select_own" on public.member_addons
  for select using (gym_id = auth_gym_id());

create policy "addons_insert_own" on public.member_addons
  for insert with check (gym_id = auth_gym_id());

create policy "addons_update_own" on public.member_addons
  for update using (gym_id = auth_gym_id());

-- ===========================================================================
-- Auto-create user profile on auth signup
-- ===========================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  -- New auth.users rows get a public.users row assigned to the seed gym
  -- Role/gym can be changed later by an admin
  insert into public.users (id, gym_id, email, name, role)
  values (
    new.id,
    '00000000-0000-0000-0000-000000000001',
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data->>'role')::public.staff_role, 'staff')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===========================================================================
-- Seed: default gym (replace with real data in production)
-- ===========================================================================
insert into public.gyms (id, name, code, address, phone, email)
values (
  '00000000-0000-0000-0000-000000000001',
  '792 Fitness Studio',
  '792FIT',
  'To be updated',
  'To be updated',
  'to@be.updated'
)
on conflict (code) do nothing;

insert into public.gym_settings (gym_id)
values ('00000000-0000-0000-0000-000000000001')
on conflict (gym_id) do nothing;

insert into public.receipt_counters (gym_id)
values ('00000000-0000-0000-0000-000000000001')
on conflict (gym_id) do nothing;

-- ---------------------------------------------------------------------------
-- Storage: member-photos bucket
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('member-photos', 'member-photos', true, 307200, ARRAY['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "member_photos_public_read" on storage.objects
  for select using (bucket_id = 'member-photos');

create policy "member_photos_auth_insert" on storage.objects
  for insert with check (bucket_id = 'member-photos' and auth.role() = 'authenticated');

create policy "member_photos_auth_update" on storage.objects
  for update using (bucket_id = 'member-photos' and auth.role() = 'authenticated');

create policy "member_photos_auth_delete" on storage.objects
  for delete using (bucket_id = 'member-photos' and auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- Storage: gym-logos bucket
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gym-logos', 'gym-logos', true, 204800, ARRAY['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "gym_logos_public_read" on storage.objects
  for select using (bucket_id = 'gym-logos');

create policy "gym_logos_auth_insert" on storage.objects
  for insert with check (bucket_id = 'gym-logos' and auth.role() = 'authenticated');

create policy "gym_logos_auth_update" on storage.objects
  for update using (bucket_id = 'gym-logos' and auth.role() = 'authenticated');

create policy "gym_logos_auth_delete" on storage.objects
  for delete using (bucket_id = 'gym-logos' and auth.role() = 'authenticated');
