-- 20260310000001_automation_triggers.sql
-- Automation triggers: anomaly detection, machine overflow, and reset-lock alerts

-- ─── 1. Transaction anomaly notification ──────────────────────────────────────
-- Fires after a transaction is inserted or updated with isAnomaly = true.
-- Inserts a 'anomaly' notification so admins are alerted.

CREATE OR REPLACE FUNCTION on_transaction_anomaly()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_on_transaction_anomaly ON public.transactions;
CREATE TRIGGER trigger_on_transaction_anomaly
AFTER INSERT OR UPDATE ON public.transactions
FOR EACH ROW
WHEN (NEW."isAnomaly" IS TRUE)
EXECUTE FUNCTION on_transaction_anomaly();

-- ─── 2. Machine score overflow notification ───────────────────────────────────
-- Fires after lastScore is updated on a location and the new value is ≥ 9900.
-- Inserts an 'overflow' notification warning that the machine is near rollover.

CREATE OR REPLACE FUNCTION on_machine_overflow()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.notifications (type, title, message)
    VALUES (
        'overflow',
        'Machine near score overflow',
        'Location "' || NEW.name || '" (id: ' || NEW.id::text || ') lastScore=' || NEW."lastScore"::text || ' is near overflow (≥9900).'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_on_machine_overflow ON public.locations;
CREATE TRIGGER trigger_on_machine_overflow
AFTER UPDATE OF "lastScore" ON public.locations
FOR EACH ROW
WHEN (NEW."lastScore" >= 9900)
EXECUTE FUNCTION on_machine_overflow();

-- ─── 3. Reset-lock alert ──────────────────────────────────────────────────────
-- Fires after resetLocked transitions to true on a location.
-- Inserts a 'reset_locked' notification requesting administrator approval.

CREATE OR REPLACE FUNCTION on_reset_locked()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_on_reset_locked ON public.locations;
CREATE TRIGGER trigger_on_reset_locked
AFTER UPDATE OF "resetLocked" ON public.locations
FOR EACH ROW
EXECUTE FUNCTION on_reset_locked();

