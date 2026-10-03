-- 015: reminder snoozes — staff can park a reminder row ("pay me Friday")
-- without touching the underlying data. One snooze per member+section;
-- auto-expires by date; paying/renewing/delivering clears the row anyway.

begin;

create table if not exists public.reminder_snoozes (
  id            uuid primary key default uuid_generate_v4(),
  gym_id        uuid not null references public.gyms(id) on delete cascade,
  member_id     uuid not null references public.members(id) on delete cascade,
  section       text not null,
  snoozed_until date not null,
  note          text,
  created_by    uuid references public.users(id) on delete set null,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create unique index if not exists uq_reminder_snooze_member_section
  on public.reminder_snoozes(member_id, section);
create index if not exists idx_reminder_snoozes_gym on public.reminder_snoozes(gym_id);

alter table public.reminder_snoozes enable row level security;

create policy reminder_snoozes_select_own on public.reminder_snoozes
  for select using (gym_id = auth_gym_id());
create policy reminder_snoozes_insert_own on public.reminder_snoozes
  for insert with check (gym_id = auth_gym_id());
create policy reminder_snoozes_update_own on public.reminder_snoozes
  for update using (gym_id = auth_gym_id());
create policy reminder_snoozes_delete_own on public.reminder_snoozes
  for delete using (gym_id = auth_gym_id());

commit;
