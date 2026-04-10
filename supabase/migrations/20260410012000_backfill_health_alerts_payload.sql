-- Backfill payload column for older health_alerts tables so diagnostics
-- functions can insert structured alert metadata.

DO $$
BEGIN
    IF to_regclass('public.health_alerts') IS NOT NULL THEN
        EXECUTE 'ALTER TABLE public.health_alerts ADD COLUMN IF NOT EXISTS payload JSONB';
    END IF;
END;
$$;
