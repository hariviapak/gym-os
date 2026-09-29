-- 009b: per-bucket member ids so derived-status filters stay server-side
create or replace function member_bucket_ids(p_gym_id uuid)
returns table(bucket text, member_id uuid)
language sql
stable
security definer
set search_path = public
as $$
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
$$;

grant execute on function member_bucket_ids(uuid) to authenticated;
