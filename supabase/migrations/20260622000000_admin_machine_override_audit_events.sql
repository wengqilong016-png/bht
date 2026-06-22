-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: Add admin machine-override audit event types
-- Date: 2026-06-22
--
-- The admin machine editor (SitesTab) and the manual collection entry now let an
-- admin directly write machine data with relaxed driver-style rules. Every such
-- write records a fire-and-forget finance_audit_log entry. Extend the event_type
-- CHECK constraint so those inserts are not rejected.
--
-- New event types:
--   dividend_balance_edit  — admin edited a location's dividend balance
--   last_score_edit        — admin edited a machine's last/baseline reading
--   location_status_change — admin changed a machine's status (active/maintenance/broken)
--   admin_machine_note     — admin wrote a free-text note (stored in payload.note)
--   admin_override_entry   — admin submitted a manual collection bypassing driver rules
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.finance_audit_log DROP CONSTRAINT IF EXISTS finance_audit_log_event_type_check;
ALTER TABLE public.finance_audit_log ADD CONSTRAINT finance_audit_log_event_type_check
  CHECK (event_type IN (
    'startup_debt_recovery',
    'driver_debt_change',
    'commission_rate_change',
    'startup_debt_edit',
    'floating_coins_change',
    'force_clear_blockers',
    'location_delete',
    'driver_salary_change',
    'driver_commission_change',
    'driver_debt_edit',
    'driver_status_change',
    'collection_submission',
    'dividend_balance_edit',
    'last_score_edit',
    'location_status_change',
    'admin_machine_note',
    'admin_override_entry'
  ));

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Verification:
--   1. Admin edits a machine's dividend balance / last reading / status, or writes
--      a note → check finance_audit_log.
--   2. SELECT event_type, entity_name, old_value, new_value, payload, created_at
--        FROM finance_audit_log
--        WHERE event_type IN ('dividend_balance_edit','last_score_edit',
--                             'location_status_change','admin_machine_note',
--                             'admin_override_entry')
--        ORDER BY created_at DESC LIMIT 10;
-- ═══════════════════════════════════════════════════════════════════════════════
