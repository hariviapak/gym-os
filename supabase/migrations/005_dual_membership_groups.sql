-- ===========================================================================
-- Migration 005: Dual memberships, service types, member groups,
--                 group payments, receipt billing, event enum fixes
-- ===========================================================================

-- 1. Missing event_type enum values (code uses these; inserts were failing silently)
alter type public.event_type add value if not exists 'freeze_requested';
alter type public.event_type add value if not exists 'freeze_approved';
alter type public.event_type add value if not exists 'freeze_rejected';
alter type public.event_type add value if not exists 'freeze_ended';
alter type public.event_type add value if not exists 'import_enrollment';

-- 2. packages.service_type — which facility access the package grants
alter table public.packages
  add column if not exists service_type text not null default 'gym'
  check (service_type in ('gym', 'swimming', 'both'));

-- 3. memberships.package_name — snapshot so package renames never rewrite history
alter table public.memberships
  add column if not exists package_name text;

-- 4. member_groups — generic groups: family / team / school, any size
create table if not exists public.member_groups (
  id          uuid primary key default uuid_generate_v4(),
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  name        text not null,
  created_by  uuid references public.users(id),
  created_at  timestamptz default now(),
  unique (gym_id, name)
);

create index if not exists idx_member_groups_gym_id on public.member_groups(gym_id);

-- 5. members.group_id — one group per member
alter table public.members
  add column if not exists group_id uuid references public.member_groups(id) on delete set null;

create index if not exists idx_members_group_id on public.members(group_id);

-- 6. payments.payment_group_id — shared uuid linking a batch collection
alter table public.payments
  add column if not exists payment_group_id uuid;

create index if not exists idx_payments_payment_group_id on public.payments(payment_group_id);

-- 7. receipts — group receipts + consolidated billing (org name)
alter table public.receipts
  add column if not exists payment_group_id uuid,
  add column if not exists billed_to text;

create index if not exists idx_receipts_payment_group_id on public.receipts(payment_group_id);

-- ---------------------------------------------------------------------------
-- RLS: member_groups
-- ---------------------------------------------------------------------------
alter table public.member_groups enable row level security;

drop policy if exists "member_groups_select_own" on public.member_groups;
create policy "member_groups_select_own" on public.member_groups
  for select using (gym_id = auth_gym_id());

drop policy if exists "member_groups_insert_own" on public.member_groups;
create policy "member_groups_insert_own" on public.member_groups
  for insert with check (gym_id = auth_gym_id() and auth_role() in ('owner', 'admin', 'manager'));

drop policy if exists "member_groups_update_own" on public.member_groups;
create policy "member_groups_update_own" on public.member_groups
  for update using (gym_id = auth_gym_id() and auth_role() in ('owner', 'admin', 'manager'));

drop policy if exists "member_groups_delete_own" on public.member_groups;
create policy "member_groups_delete_own" on public.member_groups
  for delete using (gym_id = auth_gym_id() and auth_role() in ('owner', 'admin'));
