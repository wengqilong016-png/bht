-- Stage-9: add CHECK constraints to support_cases and support_audit_log.
--
-- Overview
-- ────────
-- Adds database-level enforcement for the status and event_type columns
-- that were previously validated only at the application layer.
--
-- Constraints:
--   • support_cases.status          must be 'open' or 'closed'
--   • support_audit_log.event_type  must be one of the six documented event types
--
-- This migration is additive and idempotent (uses DO $$ / IF NOT EXISTS).

-- ── support_cases.status ────────────────────────────────────────────────────

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.support_cases'::regclass
          AND conname  = 'support_cases_status_check'
    ) THEN
        ALTER TABLE public.support_cases
            ADD CONSTRAINT support_cases_status_check
            CHECK (status IN ('open', 'closed'));
    END IF;
END$$;

-- ── support_audit_log.event_type ────────────────────────────────────────────

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.support_audit_log'::regclass
          AND conname  = 'support_audit_log_event_type_check'
    ) THEN
        ALTER TABLE public.support_audit_log
            ADD CONSTRAINT support_audit_log_event_type_check
            CHECK (event_type IN (
                'diagnostic_export',
                'health_alert_linked',
                'manual_replay_attempted',
                'manual_replay_succeeded',
                'manual_replay_failed',
                'recovery_action'
            ));
    END IF;
END$$;
