-- Backfill optional diagnostics columns for older queue_health_reports tables.
-- Some linked production databases predate these columns even though newer
-- functions expect them to exist.

DO $$
BEGIN
    IF to_regclass('public.queue_health_reports') IS NOT NULL THEN
        EXECUTE 'ALTER TABLE public.queue_health_reports ADD COLUMN IF NOT EXISTS last_error TEXT';
        EXECUTE 'ALTER TABLE public.queue_health_reports ADD COLUMN IF NOT EXISTS app_version TEXT';
        EXECUTE 'ALTER TABLE public.queue_health_reports ADD COLUMN IF NOT EXISTS metadata JSONB';
    END IF;
END;
$$;
