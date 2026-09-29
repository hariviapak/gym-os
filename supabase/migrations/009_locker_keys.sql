-- Migration 009: Locker key tracking
-- Tracks who has a locker key, when issued, when returned

CREATE TABLE IF NOT EXISTS public.locker_key_logs (
  id          uuid primary key default uuid_generate_v4(),
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  member_id   uuid not null references public.members(id) on delete cascade,
  key_number  text,
  issued_at   timestamptz default now(),
  issued_by   uuid references public.users(id),
  returned_at timestamptz,
  returned_by uuid references public.users(id),
  notes       text
);

ALTER TABLE public.locker_key_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "locker_keys_gym_read" ON public.locker_key_logs
  FOR SELECT USING (gym_id = auth_gym_id());

CREATE POLICY "locker_keys_gym_insert" ON public.locker_key_logs
  FOR INSERT WITH CHECK (gym_id = auth_gym_id());

CREATE POLICY "locker_keys_gym_update" ON public.locker_key_logs
  FOR UPDATE USING (gym_id = auth_gym_id());
