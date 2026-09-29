-- ===========================================================================
-- 792 Fitness Studio — Data Cleanup Script
-- Deletes ALL member, payment, and package data.
-- Keeps gym config, settings, staff, terms, templates, and tasks intact.
-- Run this in the Supabase SQL Editor.
-- ===========================================================================

BEGIN;

-- Child tables first (foreign key dependencies)
TRUNCATE TABLE public.payments CASCADE;
TRUNCATE TABLE public.member_addons CASCADE;
TRUNCATE TABLE public.locker_key_logs CASCADE;
TRUNCATE TABLE public.signing_tokens CASCADE;
TRUNCATE TABLE public.terms_acceptances CASCADE;
TRUNCATE TABLE public.gift_kit_tasks CASCADE;
TRUNCATE TABLE public.membership_freezes CASCADE;
TRUNCATE TABLE public.member_events CASCADE;
TRUNCATE TABLE public.memberships CASCADE;
TRUNCATE TABLE public.audit_logs CASCADE;

-- Parent tables
TRUNCATE TABLE public.members CASCADE;
TRUNCATE TABLE public.packages CASCADE;

COMMIT;

-- ===========================================================================
-- Verification queries (run after cleanup to confirm)
-- ===========================================================================
-- SELECT count(*) AS members_remaining FROM public.members;
-- SELECT count(*) AS memberships_remaining FROM public.memberships;
-- SELECT count(*) AS payments_remaining FROM public.payments;
-- SELECT count(*) AS packages_remaining FROM public.packages;
-- 
-- -- These should still have data:
-- SELECT count(*) AS terms_remaining FROM public.terms_versions;
-- SELECT count(*) AS users_remaining FROM public.users;
-- SELECT count(*) AS settings_remaining FROM public.gym_settings;
