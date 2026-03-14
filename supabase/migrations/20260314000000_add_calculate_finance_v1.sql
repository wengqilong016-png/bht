-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Add calculate_finance_v1 RPC for server-authoritative finance
-- ═══════════════════════════════════════════════════════════════════════════

-- Returns authoritative finance totals for a single collection visit.
-- Authenticated drivers may call this for their own submissions.
-- SECURITY DEFINER ensures the calculation runs with elevated privileges
-- so it is not subject to per-row RLS while still being callable by anon/driver roles.
--
-- Parameter sign conventions:
--   p_expenses      — positive integer (TZS deducted from net payable). Pass 0 when no expenses.
--   p_coin_exchange — positive integer (TZS added back to net payable from coin float exchange).
--                     ABS() is applied to expenses to guard against accidental negative values.
CREATE OR REPLACE FUNCTION public.calculate_finance_v1(
  p_current_score  INTEGER,
  p_previous_score INTEGER,
  p_commission_rate NUMERIC,
  p_expenses       INTEGER DEFAULT 0,
  p_coin_exchange  INTEGER DEFAULT 0
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_diff             INTEGER;
  v_revenue          INTEGER;
  v_commission       INTEGER;
  v_owner_retention  INTEGER;
  v_net_payable      INTEGER;
BEGIN
  v_diff            := GREATEST(0, p_current_score - p_previous_score);
  v_revenue         := v_diff * 200;                            -- TZS 200 per coin point
  v_commission      := FLOOR(v_revenue * p_commission_rate);
  v_owner_retention := v_revenue - v_commission;
  v_net_payable     := GREATEST(0, v_owner_retention - ABS(p_expenses) + p_coin_exchange);

  RETURN json_build_object(
    'revenue',          v_revenue,
    'commission',       v_commission,
    'owner_retention',  v_owner_retention,
    'net_payable',      v_net_payable
  );
END;
$$;

-- Allow authenticated users (drivers) and anon callers to invoke the function.
GRANT EXECUTE ON FUNCTION public.calculate_finance_v1(INTEGER, INTEGER, NUMERIC, INTEGER, INTEGER)
  TO authenticated, anon;
