-- ═══════════════════════════════════════════════════════════════════════════════
-- Security fix: Make storage buckets private
-- Date: 2026-05-22
-- Source: SOURCE_AUDIT_20260522.md H5
--
-- H5: Storage buckets (evidence, kiosk-photos) were marked public = TRUE,
--     allowing anyone with the URL to access evidence photos without auth.
--
-- Fix: Set public = FALSE. Files are now only accessible via signed URLs
--      (created server-side) or through the Supabase API with RLS policies.
--      The client code uses createSignedUrl() with long expiry instead of
--      getPublicUrl().
--
-- Note: Existing public URLs generated before this migration will stop working.
--       New uploads will use signed URLs with 10-year expiry.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- Make evidence bucket private
UPDATE storage.buckets
SET public = FALSE
WHERE id = 'evidence';

-- Make kiosk-photos bucket private
UPDATE storage.buckets
SET public = FALSE
WHERE id = 'kiosk-photos';

-- Add SELECT policies for authenticated users (required now that buckets are private)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Evidence select by authenticated users'
  ) THEN
    CREATE POLICY "Evidence select by authenticated users"
      ON storage.objects
      FOR SELECT
      TO authenticated
      USING (bucket_id = 'evidence');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Kiosk photos select by authenticated users'
  ) THEN
    CREATE POLICY "Kiosk photos select by authenticated users"
      ON storage.objects
      FOR SELECT
      TO authenticated
      USING (bucket_id = 'kiosk-photos');
  END IF;
END $$;

COMMIT;
