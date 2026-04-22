BEGIN;

-- Drop the old permissive policies on queue_health_reports
-- (the tight policies queue_health_driver_insert and queue_health_driver_update are already present from migration 20260423000000)
DROP POLICY IF EXISTS qhr_driver_insert ON public.queue_health_reports;
DROP POLICY IF EXISTS qhr_driver_update ON public.queue_health_reports;

COMMIT;