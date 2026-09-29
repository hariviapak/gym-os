-- 006: Group packages flag (family/team packages priced for the whole group)
alter table public.packages
  add column if not exists is_group_package boolean not null default false;

-- group enrollment timeline events (family packages enrolling multiple members)
alter type public.event_type add value if not exists 'group_enrollment';
