-- 013: fix staff/user creation — the auth service was failing with
-- "Database error creating new user" for EVERY new account. Root cause:
-- handle_new_user (the on_auth_user_created trigger) had no pinned
-- search_path, so under the auth service's restricted search_path the
-- unqualified staff_role cast (::staff_role) failed and rolled back the
-- whole auth.users insert. Pin the search path and qualify the type.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public, pg_catalog
as $fn$
begin
  insert into public.users (id, gym_id, email, name, role)
  values (
    new.id,
    '00000000-0000-0000-0000-000000000001',
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data->>'role')::public.staff_role, 'staff')
  )
  on conflict (id) do nothing;
  return new;
end; $fn$;
