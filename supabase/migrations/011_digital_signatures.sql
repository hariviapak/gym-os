-- Migration 011: Digital Signatures
-- Adds category to terms_versions, signature fields to terms_acceptances, signing_tokens table
-- Run: 2026-09-23

-- 1. Add category to terms_versions (gym | swimming)
ALTER TABLE public.terms_versions
  ADD COLUMN IF NOT EXISTS category text DEFAULT 'gym' CHECK (category IN ('gym', 'swimming'));

-- Change unique constraint from (gym_id, version) to (gym_id, version, category)
ALTER TABLE public.terms_versions DROP CONSTRAINT IF EXISTS terms_versions_gym_id_version_key;
ALTER TABLE public.terms_versions DROP CONSTRAINT IF EXISTS terms_versions_gym_id_version_key1;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'terms_versions_gym_id_version_category_key'
  ) THEN
    ALTER TABLE public.terms_versions ADD CONSTRAINT terms_versions_gym_id_version_category_key UNIQUE (gym_id, version, category);
  END IF;
END $$;

-- 2. Add signature fields to terms_acceptances
ALTER TABLE public.terms_acceptances
  ADD COLUMN IF NOT EXISTS signature_image text,
  ADD COLUMN IF NOT EXISTS signed_name text,
  ADD COLUMN IF NOT EXISTS signed_ip text,
  ADD COLUMN IF NOT EXISTS signed_user_agent text,
  ADD COLUMN IF NOT EXISTS signed_at timestamptz;

-- 3. Signing tokens table (for magic link signing via WhatsApp)
CREATE TABLE IF NOT EXISTS public.signing_tokens (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id           uuid NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  member_id        uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  terms_version_id uuid NOT NULL REFERENCES public.terms_versions(id) ON DELETE CASCADE,
  token            text UNIQUE NOT NULL,
  expires_at       timestamptz NOT NULL,
  used_at          timestamptz,
  created_by       uuid REFERENCES public.users(id),
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signing_tokens_token ON public.signing_tokens(token);
CREATE INDEX IF NOT EXISTS idx_signing_tokens_member_id ON public.signing_tokens(member_id);

-- RLS for signing_tokens
ALTER TABLE public.signing_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "signing_tokens_select_own" ON public.signing_tokens
  FOR SELECT USING (gym_id = auth_gym_id());

CREATE POLICY "signing_tokens_insert_own" ON public.signing_tokens
  FOR INSERT WITH CHECK (gym_id = auth_gym_id());

CREATE POLICY "signing_tokens_update_own" ON public.signing_tokens
  FOR UPDATE USING (gym_id = auth_gym_id());

-- 4. Update existing active terms_versions to category 'gym'
UPDATE public.terms_versions SET category = 'gym' WHERE category IS NULL;
