-- Migration 001: Expenses tables
-- Adds expense_categories and expenses tables with RLS
-- Run: 2026-09-23

create type expense_type as enum ('rent', 'electricity', 'water', 'internet', 'salaries', 'maintenance', 'equipment', 'marketing', 'cleaning', 'miscellaneous', 'one_time');

create table if not exists public.expense_categories (
  id          uuid primary key default uuid_generate_v4(),
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  name        text not null,
  type        expense_type not null default 'miscellaneous',
  is_active   boolean default true,
  created_at  timestamptz default now()
);

create index if not exists idx_expense_categories_gym_id on public.expense_categories(gym_id);

create table if not exists public.expenses (
  id            uuid primary key default uuid_generate_v4(),
  gym_id        uuid not null references public.gyms(id) on delete cascade,
  category_id   uuid references public.expense_categories(id),
  title         text not null,
  description   text,
  amount        numeric(10,2) not null check (amount >= 0),
  expense_date  date not null default current_date,
  is_recurring  boolean default false,
  recurring_frequency text check (recurring_frequency in ('monthly', 'quarterly', 'yearly')),
  created_by    uuid references public.users(id),
  created_at    timestamptz default now()
);

create index if not exists idx_expenses_gym_id on public.expenses(gym_id);
create index if not exists idx_expenses_category_id on public.expenses(category_id);
create index if not exists idx_expenses_date on public.expenses(gym_id, expense_date desc);

alter table public.expense_categories enable row level security;
alter table public.expenses enable row level security;

create policy "expense_cat_select_own" on public.expense_categories
  for select using (gym_id = auth_gym_id());
create policy "expense_cat_insert_own" on public.expense_categories
  for insert with check (gym_id = auth_gym_id() and auth_role() in ('owner', 'admin', 'manager'));
create policy "expense_cat_update_own" on public.expense_categories
  for update using (gym_id = auth_gym_id() and auth_role() in ('owner', 'admin', 'manager'));

create policy "expenses_select_own" on public.expenses
  for select using (gym_id = auth_gym_id() and auth_role() in ('owner', 'admin', 'manager'));
create policy "expenses_insert_own" on public.expenses
  for insert with check (gym_id = auth_gym_id() and auth_role() in ('owner', 'admin', 'manager'));
create policy "expenses_update_own" on public.expenses
  for update using (gym_id = auth_gym_id() and auth_role() in ('owner', 'admin', 'manager'));
create policy "expenses_delete_own" on public.expenses
  for delete using (gym_id = auth_gym_id() and auth_role() in ('owner', 'admin'));

-- Seed default expense categories
insert into public.expense_categories (gym_id, name, type) values
  ('00000000-0000-0000-0000-000000000001', 'Rent', 'rent'),
  ('00000000-0000-0000-0000-000000000001', 'Electricity', 'electricity'),
  ('00000000-0000-0000-0000-000000000001', 'Water', 'water'),
  ('00000000-0000-0000-0000-000000000001', 'Internet', 'internet'),
  ('00000000-0000-0000-0000-000000000001', 'Staff Salaries', 'salaries'),
  ('00000000-0000-0000-0000-000000000001', 'Equipment', 'equipment'),
  ('00000000-0000-0000-0000-000000000001', 'Maintenance', 'maintenance'),
  ('00000000-0000-0000-0000-000000000001', 'Marketing', 'marketing'),
  ('00000000-0000-0000-0000-000000000001', 'Cleaning', 'cleaning'),
  ('00000000-0000-0000-0000-000000000001', 'Miscellaneous', 'miscellaneous')
on conflict do nothing;
