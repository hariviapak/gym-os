-- ===========================================================================
-- 792 Fitness Studio — Package Catalog Seed
-- All prices GST-inclusive (gym_settings.gst_mode = 'inclusive', gst_rate 18)
-- ===========================================================================

insert into public.packages (gym_id, name, type, duration_days, amount, gst_rate, service_type, sort_order, is_active, description)
values
  -- Gym (service_type: gym)
  ('00000000-0000-0000-0000-000000000001', 'Trial 1 Day', 'trial', 1, 1000, 18, 'gym', 1, true, 'One-day trial. Extendable once, only on upgrade to Signature or Family.'),
  ('00000000-0000-0000-0000-000000000001', 'Trial 10 Days', 'trial', 10, 5000, 18, 'gym', 2, true, 'Ten-day trial. Extendable once, only on upgrade to Signature or Family.'),
  ('00000000-0000-0000-0000-000000000001', '1 Month Signature', 'membership', 30, 10000, 18, 'gym', 3, true, null),
  ('00000000-0000-0000-0000-000000000001', '3 Months Signature', 'membership', 90, 20000, 18, 'gym', 4, true, null),
  ('00000000-0000-0000-0000-000000000001', '6 Months Signature', 'membership', 180, 30000, 18, 'gym', 5, true, null),
  ('00000000-0000-0000-0000-000000000001', '1 Year Signature', 'membership', 365, 40000, 18, 'gym', 6, true, null),
  -- Family Annual (service_type: gym, group-priced)
  ('00000000-0000-0000-0000-000000000001', 'Family Annual (2 Members)', 'membership', 365, 70000, 18, 'gym', 7, true, 'Total price for 2 family members. Spouse/immediate family. One year each.'),
  ('00000000-0000-0000-0000-000000000001', 'Family Annual (3 Members)', 'membership', 365, 100000, 18, 'gym', 8, true, 'Total price for 3 family members. Spouse/immediate family. One year each.'),
  ('00000000-0000-0000-0000-000000000001', 'Family Annual (4 Members)', 'membership', 365, 130000, 18, 'gym', 9, true, 'Total price for 4 family members. Spouse/immediate family. One year each.'),
  ('00000000-0000-0000-0000-000000000001', 'Family Annual (5 Members)', 'membership', 365, 160000, 18, 'gym', 10, true, 'Total price for 5 family members. Spouse/immediate family. One year each.'),
  -- Swimming — Gym Member add-on (service_type: swimming)
  ('00000000-0000-0000-0000-000000000001', 'Swimming Add-on (1 Day)', 'day_pass', 1, 0, 18, 'swimming', 11, true, 'FREE for existing gym members.'),
  ('00000000-0000-0000-0000-000000000001', 'Swimming Add-on (10 Days)', 'membership', 10, 2000, 18, 'swimming', 12, true, 'For existing gym members.'),
  ('00000000-0000-0000-0000-000000000001', 'Swimming Add-on (1 Month)', 'membership', 30, 4000, 18, 'swimming', 13, true, 'For existing gym members.'),
  ('00000000-0000-0000-0000-000000000001', 'Swimming Add-on (1 Month) Female +10d', 'membership', 40, 4000, 18, 'swimming', 14, true, 'Adult female gym members: 1-month swimming gets +10 days free.'),
  -- Swimming Only — non-gym, age 11+ (service_type: swimming)
  ('00000000-0000-0000-0000-000000000001', 'Swimming Only (1 Day)', 'day_pass', 1, 600, 18, 'swimming', 15, true, 'For non-gym members, age 11+.'),
  ('00000000-0000-0000-0000-000000000001', 'Swimming Only (10 Days)', 'membership', 10, 3000, 18, 'swimming', 16, true, 'For non-gym members, age 11+.'),
  ('00000000-0000-0000-0000-000000000001', 'Swimming Only (1 Month)', 'membership', 30, 6000, 18, 'swimming', 17, true, 'For non-gym members, age 11+.'),
  -- Swim Kids — age ≤10 (service_type: swimming)
  ('00000000-0000-0000-0000-000000000001', 'Swim Kids (1 Day)', 'day_pass', 1, 600, 18, 'swimming', 18, true, 'Children up to 10. Dedicated pool slots. Guardian (18+) may accompany free.'),
  ('00000000-0000-0000-0000-000000000001', 'Swim Kids (10 Days)', 'membership', 10, 3000, 18, 'swimming', 19, true, 'Children up to 10. Dedicated pool slots. Guardian (18+) may accompany free.'),
  ('00000000-0000-0000-0000-000000000001', 'Swim Kids (1 Month)', 'membership', 30, 6000, 18, 'swimming', 20, true, 'Children up to 10. Dedicated pool slots. Solo child requires coach approval.')
on conflict (id) do nothing;

-- Verify
select name, type, duration_days, amount, service_type from public.packages order by sort_order;
