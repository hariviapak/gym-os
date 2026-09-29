-- 010: link group-enrollment memberships to their payment batch so the
-- consolidated receipt can show a per-member annexure
alter table public.memberships
  add column if not exists payment_group_id uuid;

create index if not exists idx_memberships_payment_group_id on public.memberships(payment_group_id);
