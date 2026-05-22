-- Transaction async audit pipeline (ADR-002)
-- Adds audit_status column to transactions + dedicated audit_log table.
--
-- Audit flow: transaction_built event → AuditConsumer (async)
--   → semantic check + power-law dedup → transaction_audit_log insert
--   → transactions.audit_status updated to 'done' or 'failed'.
-- Failure does not block the main transaction flow.

-- ── 1. Add audit_status column to transactions ────────────────────────────

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS audit_status TEXT
  CHECK (audit_status IN ('pending', 'done', 'failed'))
  DEFAULT 'pending';

COMMENT ON COLUMN public.transactions.audit_status IS
  'Async audit pipeline status (ADR-002): pending → done|failed. Set by AuditConsumer.';

-- ── 2. Create transaction_audit_log table ─────────────────────────────────

CREATE TABLE IF NOT EXISTS public.transaction_audit_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id  TEXT NOT NULL,
    transaction_type TEXT NOT NULL,
    location_id     TEXT NOT NULL,
    driver_id       TEXT NOT NULL,
    checked_fields  TEXT[] NOT NULL DEFAULT '{}',
    result          TEXT NOT NULL CHECK (result IN ('pass', 'fail')),
    failure_reason  TEXT,
    attempt         INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.transaction_audit_log IS
  'Append-only audit log for transaction integrity checks (ADR-002).';

COMMENT ON COLUMN public.transaction_audit_log.checked_fields IS
  'Audit dimensions checked, e.g. {semantic, power-law-dedup}.';

COMMENT ON COLUMN public.transaction_audit_log.attempt IS
  'Retry attempt number (0 = first attempt). Max 3 retries with exponential backoff.';

-- ── 3. Indexes ───────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_tx_audit_log_tx_id
    ON public.transaction_audit_log (transaction_id);

CREATE INDEX IF NOT EXISTS idx_tx_audit_log_driver_location
    ON public.transaction_audit_log (driver_id, location_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tx_audit_log_created
    ON public.transaction_audit_log (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_audit_status
    ON public.transactions (audit_status)
    WHERE audit_status = 'failed';

-- ── 4. RLS ───────────────────────────────────────────────────────────────

ALTER TABLE public.transaction_audit_log ENABLE ROW LEVEL SECURITY;

-- Admin can read all audit entries
CREATE POLICY tx_audit_admin_select ON public.transaction_audit_log
    FOR SELECT TO authenticated
    USING (public.get_my_role() = 'admin');

-- Any authenticated user can insert (audit writes come from frontend after async check)
CREATE POLICY tx_audit_insert ON public.transaction_audit_log
    FOR INSERT TO authenticated
    WITH CHECK (true);

-- Append-only: no UPDATE or DELETE policies
