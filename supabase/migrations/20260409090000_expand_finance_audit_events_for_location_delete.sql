-- Expand finance audit event coverage so admin delete/force-clear actions
-- can be recorded without violating the event_type CHECK constraint.

ALTER TABLE public.finance_audit_log
    DROP CONSTRAINT IF EXISTS finance_audit_log_event_type_check;

ALTER TABLE public.finance_audit_log
    ADD CONSTRAINT finance_audit_log_event_type_check
    CHECK (event_type IN (
        'startup_debt_recovery',
        'driver_debt_change',
        'commission_rate_change',
        'startup_debt_edit',
        'floating_coins_change',
        'force_clear_blockers',
        'location_delete'
    ));
