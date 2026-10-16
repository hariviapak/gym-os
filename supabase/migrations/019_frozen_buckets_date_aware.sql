-- Date-aware frozen bucketing. "Frozen" means a freeze OVERLAPPING TODAY
-- (running, or a pending request starting today); historical (fully-past)
-- freezes are record-keeping, not current state. Before this, members with
-- past freezes were subtracted from Active/Expiring and filed under Frozen
-- on the dashboard tiles and the members page pills/tabs.
--
-- Only the frozen_ids CTE gains date bounds; every other computed column is
-- unchanged. Consumers: dashboard page + members page (no app code change).
create or replace function public.member_overview_stats(p_gym_id uuid)
returns table(total_members integer, active_count integer, expiring_count integer, expired_count integer, frozen_count integer, outstanding numeric)
language sql
stable security definer
set search_path = 'public'
as $function$
  with t as (select (current_timestamp at time zone 'Asia/Kolkata')::date as today),
  active_ms as (
    select ms.member_id, ms.total_amount, ms.amount_paid, ms.end_date
    from memberships ms
    join members m on m.id = ms.member_id
    where ms.gym_id = p_gym_id
      and ms.status = 'active'
      and ms.start_date <= (select today from t)
      and ms.end_date >= (select today from t)
      and m.status = 'active'
  ),
  frozen_ids as (
    select distinct f.member_id
    from membership_freezes f
    where f.gym_id = p_gym_id
      and f.status in ('pending', 'active', 'approved')
      and f.start_date <= (select today from t)
      and f.end_date >= (select today from t)
  ),
  cur as (
    select a.member_id, min(a.end_date) as soonest
    from active_ms a
    group by a.member_id
  )
  select
    (select count(*)::int from members where gym_id = p_gym_id and status = 'active'),
    (select count(*)::int from cur c
      where c.soonest > (select today from t) + 7
        and c.member_id not in (select member_id from frozen_ids)),
    (select count(*)::int from cur c
      where c.soonest <= (select today from t) + 7
        and c.member_id not in (select member_id from frozen_ids)),
    (select count(*)::int from members m
      where m.gym_id = p_gym_id
      and m.status = 'active'
      and m.id not in (select member_id from cur)
      and exists (
          select 1 from memberships ms
          where ms.member_id = m.id and ms.end_date < (select today from t)
        )),
    (select count(*)::int from frozen_ids),
    (select coalesce(sum(greatest(a.total_amount - a.amount_paid, 0)), 0) from active_ms a)
$function$;

create or replace function public.member_bucket_ids(p_gym_id uuid)
returns table(bucket text, member_id uuid)
language sql
stable security definer
set search_path = 'public'
as $function$
  with t as (select (current_timestamp at time zone 'Asia/Kolkata')::date as today),
  act as (
    select distinct ms.member_id
    from memberships ms
    join members m on m.id = ms.member_id
    where ms.gym_id = p_gym_id
      and ms.status = 'active'
      and ms.start_date <= (select today from t)
      and ms.end_date >= (select today from t)
      and m.status = 'active'
  ),
  act_soonest as (
    select ms.member_id, min(ms.end_date) as soonest
    from memberships ms
    join members m on m.id = ms.member_id
    where ms.gym_id = p_gym_id
      and ms.status = 'active'
      and ms.start_date <= (select today from t)
      and ms.end_date >= (select today from t)
      and m.status = 'active'
    group by ms.member_id
  ),
  frozen_ids as (
    select distinct f.member_id
    from membership_freezes f
    join members m on m.id = f.member_id
    where f.gym_id = p_gym_id
      and f.status in ('pending', 'active', 'approved')
      and f.start_date <= (select today from t)
      and f.end_date >= (select today from t)
      and m.status = 'active'
  )
  select 'expiring'::text, s.member_id from act_soonest s
    where s.soonest <= (select today from t) + 7
      and s.member_id not in (select member_id from frozen_ids)
  union all
  select 'active'::text, s.member_id from act_soonest s
    where s.soonest > (select today from t) + 7
      and s.member_id not in (select member_id from frozen_ids)
  union all
  select 'frozen'::text, f.member_id from frozen_ids f
  union all
  select 'expired'::text, m.id
    from members m
    where m.gym_id = p_gym_id and m.status = 'active'
      and m.id not in (select member_id from act)
      and exists (
          select 1 from memberships ms
          where ms.member_id = m.id and ms.end_date < (select today from t)
        )
  union all
  select 'cancelled'::text, m.id
    from members m
    where m.gym_id = p_gym_id and m.status = 'active'
      and m.id not in (select member_id from act)
      and exists (
          select 1 from memberships ms
          where ms.member_id = m.id and ms.status = 'cancelled'
      )
$function$;
