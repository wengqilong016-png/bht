-- ═══════════════════════════════════════════════════════════════════════════════
-- Security fix: Tighten audit table INSERT policies
-- Date: 2026-05-22
-- Source: SOURCE_AUDIT_20260522.md H2, H3, H4
--
-- H2: support_audit_log allowed ANY authenticated user to insert arbitrary
--     audit records. Restricted to admin only.
-- H3: transaction_audit_log allowed ANY authenticated user to insert arbitrary
--     audit records. Restricted to admin or driver's own driverId.
-- H4: amount_validation_audit allowed ANY authenticated user to insert arbitrary
--     audit records. Restricted to admin only (RPC uses SECURITY DEFINER).
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── H2: support_audit_log ─────────────────────────────────────────────────────
-- Was: FOR INSERT TO authenticated WITH CHECK (true)
-- Now: Admin only. Support audit events are admin-managed operations.
DROP POLICY IF EXISTS support_audit_log_insert ON public.support_audit_log;
CREATE POLICY support_audit_log_insert ON public.support_audit_log
    FOR INSERT TO authenticated
    WITH CHECK (public.is_admin());

-- ── H3: transaction_audit_log ─────────────────────────────────────────────────
-- Was: FOR INSERT TO authenticated WITH CHECK (true)
-- Now: Admin can insert any record; drivers can only insert for their own driverId.
-- Written by the client-side AuditConsumer (auditConsumer.ts) which runs in the
-- driver's browser context.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'transaction_audit_log' AND relkind = 'r') THEN
    DROP POLICY IF EXISTS tx_audit_insert ON public.transaction_audit_log;
    CREATE POLICY tx_audit_insert ON public.transaction_audit_log
        FOR INSERT TO authenticated
        WITH CHECK (
            public.is_admin()
            OR (
                public.get_my_role() = 'driver'
                AND driver_id = public.get_my_driver_id()
            )
        );
  END IF;
END $$;

-- ── H4: amount_validation_audit ───────────────────────────────────────────────
-- Was: FOR INSERT TO authenticated WITH CHECK (true)
-- Now: Admin only. In normal operation this table is written by the
-- log_amount_validation_failure() function called from within submit_collection_v2
-- (a SECURITY DEFINER RPC that bypasses RLS). Direct client INSERT is not needed.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'amount_validation_audit' AND relkind = 'r') THEN
    DROP POLICY IF EXISTS amount_validation_audit_insert ON public.amount_validation_audit;
    CREATE POLICY amount_validation_audit_insert ON public.amount_validation_audit
        FOR INSERT TO authenticated
        WITH CHECK (public.is_admin());
  END IF;
END $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Verification:
--   -- As non-admin driver (should FAIL):
--     INSERT INTO support_audit_log(event_type, actor_id, payload)
--     VALUES ('test','drv-123','{}');
--   -- As admin (should succeed):
--     INSERT INTO support_audit_log(event_type, actor_id, payload)
--     VALUES ('test','admin-id','{}');
--   -- As driver with own driverId (should succeed for transaction_audit_log):
--     INSERT INTO transaction_audit_log(transactionId, transactionType, locationId, driverId, checkedFields, result)
--     VALUES ('tx-123','collection','loc-123','{my-driver-id}','{}','pass');
--   -- As driver with different driverId (should FAIL for transaction_audit_log):
--     INSERT INTO transaction_audit_log(transactionId, transactionType, locationId, driverId, checkedFields, result)
--     VALUES ('tx-456','collection','loc-456','other-driver-id','{}','pass');
-- ═══════════════════════════════════════════════════════════════════════════════
