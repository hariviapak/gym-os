-- Migration 006: Create member-photos storage bucket with RLS policies
-- Public read (photos are visible to anyone with the URL), authenticated write only
-- File size limit: 300KB (after client-side resize to 400x400 JPEG)
-- Allowed types: JPEG, PNG, WebP

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('member-photos', 'member-photos', true, 307200, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "member_photos_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'member-photos');

CREATE POLICY "member_photos_auth_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'member-photos' AND auth.role() = 'authenticated');

CREATE POLICY "member_photos_auth_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'member-photos' AND auth.role() = 'authenticated');

CREATE POLICY "member_photos_auth_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'member-photos' AND auth.role() = 'authenticated');
