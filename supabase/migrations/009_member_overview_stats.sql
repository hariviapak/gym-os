-- 009: one server-side aggregate for the members list summary strip.
-- Computed in Postgres so the members page stays server-side paginated at any scale.
-- "Today" is the IST date (the app operates in Asia/Kolkata).
create or replace function member_overview_stats(p_gym_id uuid)
returns table(
  total_members  int,
  active_count   int,
  expiring_count int,
  expired_count  int,
  frozen_count   int,
  outstanding    numeric
)
language sql
stable
security definer
set search_path = public
as $$
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
$$;

grant execute on function member_overview_stats(uuid) to authenticated;
