-- handle_new_user hardcoded the 792 gym for every signup. Admin-created
-- users (auth admin API with gym_id in metadata — e.g. the QA test gym
-- accounts and e2e throwaway roles) now land in their intended gym; public
-- self-signups keep the default (account-pending flow assigns a gym).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_catalog'
as $function$
begin
  insert into public.users (id, gym_id, email, name, role)
  values (
    new.id,
    coalesce((new.raw_user_meta_data->>'gym_id')::uuid, '00000000-0000-0000-0000-000000000001'::uuid),
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data->>'role')::public.staff_role, 'staff')
  )
  on conflict (id) do nothing;
  return new;
end;
$function$;
