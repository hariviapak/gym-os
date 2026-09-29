-- Migration 005: Add RLS update policy on payments table
-- Without this, receipt_id backlinks silently fail

create policy "payments_update_own" on public.payments
  for update using (gym_id = auth_gym_id());
