-- Owner/admin can record historical (fully-past) freezes when capturing a
-- member's real history (the freeze extended their end date back then).
-- The requestFreeze action enforces the 7-day backdate cap role-aware
-- (managers/front-line keep it; owner/admin are uncapped), so the blanket
-- DB constraint no longer matches the rule.
alter table public.membership_freezes
  drop constraint if exists chk_backdated_limit;
