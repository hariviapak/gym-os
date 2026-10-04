-- 016: receipt share tokens — token-gated public receipt links so members
-- can view + download their receipt from WhatsApp without an account.
-- Same model as signing tokens: 32-byte random, expiring, regenerable.

begin;

create table if not exists public.receipt_tokens (
  id          uuid primary key default uuid_generate_v4(),
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  receipt_id  uuid not null references public.receipts(id) on delete cascade,
  token       text not null unique,
  expires_at  timestamptz not null,
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz default now()
);

create index if not exists idx_receipt_tokens_gym on public.receipt_tokens(gym_id);
create index if not exists idx_receipt_tokens_receipt on public.receipt_tokens(receipt_id);

alter table public.receipt_tokens enable row level security;

create policy receipt_tokens_select_own on public.receipt_tokens
  for select using (gym_id = auth_gym_id());
create policy receipt_tokens_insert_own on public.receipt_tokens
  for insert with check (gym_id = auth_gym_id());
create policy receipt_tokens_update_own on public.receipt_tokens
  for update using (gym_id = auth_gym_id());
create policy receipt_tokens_delete_own on public.receipt_tokens
  for delete using (gym_id = auth_gym_id());

commit;
