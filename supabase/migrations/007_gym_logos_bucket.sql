-- Migration 007: Create gym-logos storage bucket with RLS policies
-- Public read, authenticated write only
-- File size limit: 200KB (200x200 JPEG)

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('gym-logos', 'gym-logos', true, 204800, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "gym_logos_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'gym-logos');

CREATE POLICY "gym_logos_auth_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'gym-logos' AND auth.role() = 'authenticated');

CREATE POLICY "gym_logos_auth_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'gym-logos' AND auth.role() = 'authenticated');

CREATE POLICY "gym_logos_auth_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'gym-logos' AND auth.role() = 'authenticated');
