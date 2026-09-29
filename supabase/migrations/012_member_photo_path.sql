-- 012: store the Storage object path alongside the public URL so photo
-- lifecycle (replace/remove) can clean up the exact object without guessing.
alter table public.members add column if not exists photo_path text;

-- Backfill: all existing photos use the deterministic key gymId/memberId.jpg
update public.members
set photo_path = gym_id::text || '/' || id::text || '.jpg'
where photo_url is not null and photo_path is null;
