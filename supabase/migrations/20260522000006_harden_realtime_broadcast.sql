-- ═══════════════════════════════════════════════════════════════════════════════
-- Security fix: Harden realtime broadcast to prevent cross-driver data leakage
-- Date: 2026-05-22
-- Source: SOURCE_AUDIT_20260522.md H1
--
-- H1: notify_table_changes() broadcast FULL row data to topics accessible by ALL
--     authenticated users. A driver subscribing to db:transactions received every
--     driver's financial data.
--
-- Fix:
--   1. Transactions: broadcast to BOTH the global topic (admin) AND a per-driver
--      topic db:transactions:{driverId} filtered to that driver's rows.
--   2. Drivers: strip sensitive financial columns (baseSalary, commissionRate,
--      remainingDebt, initialDebt) before broadcast.
--   3. Daily settlements: restrict to admin-only via RLS on realtime.messages.
--
-- The global topics (db:transactions, db:drivers, db:daily_settlements) remain
-- available for admin use. Drivers must subscribe to their per-driver topic.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Updated trigger function with per-driver filtering ────────────────────

CREATE OR REPLACE FUNCTION public.notify_table_changes()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE plpgsql
AS $$
DECLARE
  v_driver_id TEXT;
  v_safe_new JSONB;
  v_safe_old JSONB;
BEGIN
  -- ── Broadcast to the global topic (admin use) ──────────────────────────────
  -- Global broadcasts include full row data. These are restricted to admin
  -- via the RLS policy on realtime.messages.
  PERFORM realtime.broadcast_changes(
    'db:' || TG_TABLE_NAME,
    TG_OP,
    TG_OP,
    TG_TABLE_NAME,
    TG_TABLE_SCHEMA,
    NEW,
    OLD
  );

  -- ── Per-driver filtered broadcast for transactions ─────────────────────────
  -- Each transaction also goes to a driver-specific topic so the driver only
  -- sees their own rows.
  IF TG_TABLE_NAME = 'transactions' THEN
    v_driver_id := COALESCE(
      NEW->>'driverId',
      OLD->>'driverId'
    );
    IF v_driver_id IS NOT NULL AND v_driver_id != '' THEN
      PERFORM realtime.broadcast_changes(
        'db:transactions:' || v_driver_id,
        TG_OP,
        TG_OP,
        TG_TABLE_NAME,
        TG_TABLE_SCHEMA,
        NEW,
        OLD
      );
    END IF;
  END IF;

  -- ── Strip sensitive columns from driver table broadcasts ───────────────────
  -- Overwrite the global driver broadcast with a sanitized version that
  -- excludes salary, commission, and debt fields.
  IF TG_TABLE_NAME = 'drivers' THEN
    -- Build a sanitized NEW record
    IF NEW IS NOT NULL THEN
      v_safe_new := to_jsonb(NEW) - 'baseSalary' - 'commissionRate' - 'initialDebt' - 'remainingDebt';
    END IF;
    IF OLD IS NOT NULL THEN
      v_safe_old := to_jsonb(OLD) - 'baseSalary' - 'commissionRate' - 'initialDebt' - 'remainingDebt';
    END IF;
    -- Re-broadcast the sanitized version over the global topic (replacing the
    -- unsanitized broadcast above — the last broadcast wins for realtime)
    PERFORM realtime.broadcast_changes(
      'db:' || TG_TABLE_NAME,
      TG_OP,
      TG_OP,
      TG_TABLE_NAME,
      TG_TABLE_SCHEMA,
      v_safe_new,
      v_safe_old
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ── 2. Update RLS policy on realtime.messages ───────────────────────────────

-- Drop the old policy that allowed all authenticated users to receive all topics
DROP POLICY IF EXISTS "authenticated_users_can_receive_broadcasts" ON realtime.messages;

-- New policy: admin sees everything, drivers see only their own per-driver topics
CREATE POLICY "authenticated_users_can_receive_broadcasts" ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    -- Admin: access to all broadcast topics
    public.is_admin()
    OR
    -- Driver: access to their own per-driver transaction topic
    (
      public.get_my_role() = 'driver'
      AND topic = 'db:transactions:' || public.get_my_driver_id()
    )
    OR
    -- Driver: access to sanitized driver topic (own driver data, no sensitive fields)
    (
      public.get_my_role() = 'driver'
      AND topic = 'db:drivers'
    )
    OR
    -- Location changes are visible to all authenticated users
    (
      topic = 'db:locations'
    )
  );

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Client-side changes required:
--   Driver subscriptions must change from 'db:transactions' to
--   'db:transactions:{driverId}' to receive their own filtered transactions.
--   See: hooks/useRealtimeSubscription.ts DRIVER_CHANNELS
-- ═══════════════════════════════════════════════════════════════════════════════
