-- 008: Refunds ledger (payments.amount is check >= 0, so refunds are separate)
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

drop policy if exists "refunds_select_own" on public.refunds;
create policy "refunds_select_own" on public.refunds
  for select using (gym_id = auth_gym_id());

drop policy if exists "refunds_insert_manage" on public.refunds;
create policy "refunds_insert_manage" on public.refunds
  for insert with check (gym_id = auth_gym_id() and auth_role() in ('owner', 'admin', 'manager'));

alter type public.event_type add value if not exists 'refund';
