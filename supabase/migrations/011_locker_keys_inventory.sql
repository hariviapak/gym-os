-- 011: Locker key INVENTORY (configurable per gym). locker_key_logs remains
-- the issue/return/transfer history and keeps its own key_number text copy,
-- so removing a key from the inventory never loses history.

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

drop policy if exists "locker_keys_select_own" on public.locker_keys;
create policy "locker_keys_select_own" on public.locker_keys
  for select using (gym_id = auth_gym_id());

drop policy if exists "locker_keys_manage_staff" on public.locker_keys;
create policy "locker_keys_manage_staff" on public.locker_keys
  for insert with check (gym_id = auth_gym_id());

drop policy if exists "locker_keys_update_staff" on public.locker_keys;
create policy "locker_keys_update_staff" on public.locker_keys
  for update using (gym_id = auth_gym_id());

drop policy if exists "locker_keys_delete_admin" on public.locker_keys;
create policy "locker_keys_delete_admin" on public.locker_keys
  for delete using (gym_id = auth_gym_id() and auth_role() in ('owner', 'admin'));

-- link history rows to inventory keys (nullable — legacy logs keep their text)
alter table public.locker_key_logs
  add column if not exists locker_key_id uuid references public.locker_keys(id) on delete set null;

create index if not exists idx_locker_key_logs_key on public.locker_key_logs(locker_key_id);
