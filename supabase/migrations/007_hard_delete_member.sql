-- 007: Member hard-delete via audited RPC
-- The member_events append-only trigger blocks cascading deletes; this adds a
-- transaction-local escape hatch used ONLY by the hard_delete_member RPC.

create or replace function public.prevent_member_event_modify()
returns trigger
language plpgsql
as $$
begin
  if current_setting('app.hard_delete', true) = 'on' then
    return old;
  end if;
  raise exception 'member_events is append-only: updates and deletes are not allowed';
end;
$$;

create or replace function public.hard_delete_member(p_member_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gym_id uuid;
  v_role text;
begin
  select u.gym_id, u.role into v_gym_id, v_role
  from public.users u
  where u.id = auth.uid();

  if v_role not in ('owner', 'admin') then
    raise exception 'Only owner/admin can delete members';
  end if;

  if not exists (
    select 1 from public.members m
    where m.id = p_member_id and m.gym_id = v_gym_id
  ) then
    return false;
  end if;

  perform set_config('app.hard_delete', 'on', true);

  delete from public.members where id = p_member_id and gym_id = v_gym_id;
  return true;
end;
$$;

grant execute on function public.hard_delete_member(uuid) to authenticated;
