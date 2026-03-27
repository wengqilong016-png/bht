-- 20260328000000_harden_automation_triggers.sql
-- Hardening patch for 20260310000001_automation_triggers.sql.
-- This file does NOT modify the original migration (which would cause
-- Supabase CLI checksum drift). Instead it uses CREATE OR REPLACE FUNCTION
-- to redefine the three trigger functions with the following fixes:
--
--   Fix 1 – All three SECURITY DEFINER functions now include
--            SET search_path = public, pg_temp to prevent search-path
--            hijacking (matches the pattern used in
--            20260322200001_health_alerts_harden.sql).
--
--   Fix 2 – on_machine_overflow() now skips the INSERT when an unread
--            overflow notification already exists for the same location,
--            preventing the notifications table from being flooded when a
--            machine score hovers at or above 9900.
--            A "relatedLocationId" column is added to notifications to
--            enable a precise, injection-safe equality check.
--
-- This file is idempotent and can be safely re-applied.

-- ─── 0. Schema extension: relatedLocationId on notifications ─────────────────
-- Adds a dedicated column so overflow deduplication uses an exact equality
-- match rather than fragile message-text pattern matching.

ALTER TABLE public.notifications
    ADD COLUMN IF NOT EXISTS "relatedLocationId" TEXT;

-- ─── 1. Transaction anomaly notification (search_path hardened) ───────────────

CREATE OR REPLACE FUNCTION public.on_transaction_anomaly()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    INSERT INTO public.notifications (type, title, message, "relatedTransactionId", "driverId")
    VALUES (
        'anomaly',
        'Transaction anomaly detected',
        COALESCE(NEW.notes, 'Anomaly flagged on transaction ' || NEW.id),
        NEW.id,
        NEW."driverId"
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_on_transaction_anomaly ON public.transactions;
CREATE TRIGGER trigger_on_transaction_anomaly
AFTER INSERT OR UPDATE ON public.transactions
FOR EACH ROW
WHEN (NEW."isAnomaly" IS TRUE)
EXECUTE FUNCTION public.on_transaction_anomaly();

-- ─── 2. Machine score overflow notification (search_path hardened + dedup) ────
-- Skip inserting a new notification when an unread overflow notification for the
-- same location already exists ("isRead" = false, type = 'overflow').

CREATE OR REPLACE FUNCTION public.on_machine_overflow()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Deduplicate: only insert when there is no existing unread overflow
    -- notification for this location (exact equality on relatedLocationId).
    IF NOT EXISTS (
        SELECT 1
          FROM public.notifications
         WHERE type = 'overflow'
           AND "relatedLocationId" = NEW.id::text
           AND "isRead" = false
    ) THEN
        INSERT INTO public.notifications (type, title, message, "relatedLocationId")
        VALUES (
            'overflow',
            'Machine near score overflow',
            'Location "' || NEW.name || '" (id: ' || NEW.id::text || ') lastScore=' || NEW."lastScore"::text || ' is near overflow (≥9900).',
            NEW.id::text
        );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_on_machine_overflow ON public.locations;
CREATE TRIGGER trigger_on_machine_overflow
AFTER UPDATE OF "lastScore" ON public.locations
FOR EACH ROW
WHEN (NEW."lastScore" >= 9900)
EXECUTE FUNCTION public.on_machine_overflow();

-- ─── 3. Reset-lock alert (search_path hardened) ───────────────────────────────

CREATE OR REPLACE FUNCTION public.on_reset_locked()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW."resetLocked" IS TRUE AND (OLD."resetLocked" IS DISTINCT FROM TRUE) THEN
        INSERT INTO public.notifications (type, title, message)
        VALUES (
            'reset_locked',
            'Location locked – approval required',
            'Location "' || NEW.name || '" (id: ' || NEW.id::text || ') has been locked and requires administrator approval to reset.'
        );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_on_reset_locked ON public.locations;
CREATE TRIGGER trigger_on_reset_locked
AFTER UPDATE OF "resetLocked" ON public.locations
FOR EACH ROW
EXECUTE FUNCTION public.on_reset_locked();
