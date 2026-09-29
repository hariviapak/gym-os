-- Migration 004: Member add-ons table
-- For extra charges: PT sessions, merchandise, supplements, locker rental, etc.

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

alter table public.member_addons enable row level security;

create policy "addons_select_own" on public.member_addons
  for select using (gym_id = auth_gym_id());
create policy "addons_insert_own" on public.member_addons
  for insert with check (gym_id = auth_gym_id());
create policy "addons_update_own" on public.member_addons
  for update using (gym_id = auth_gym_id());
