-- Migration 008: Add discount columns to memberships and receipts
-- Allows staff to apply discounts with a reason at enrollment, renewal, and quick-pass

ALTER TABLE public.memberships
  ADD COLUMN IF NOT EXISTS discount_amount numeric(10,2) DEFAULT 0 CHECK (discount_amount >= 0);

ALTER TABLE public.memberships
  ADD COLUMN IF NOT EXISTS discount_reason text;

ALTER TABLE public.receipts
  ADD COLUMN IF NOT EXISTS discount_amount numeric(10,2) DEFAULT 0 CHECK (discount_amount >= 0);

ALTER TABLE public.receipts
  ADD COLUMN IF NOT EXISTS discount_reason text;
