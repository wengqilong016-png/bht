-- ============================================================================
-- Migration: Add p_timestamp support to submit_collection_v2 RPC
-- Purpose: Enable admin back-dating of collection entries to past dates.
-- Usage: Run in Supabase SQL Editor (https://app.supabase.com)
-- 
-- WARNING: This replaces the existing function. If your production function
-- has diverged from the original, compare the source first.
-- ============================================================================

-- Drop existing function (CASCADE to drop dependent triggers/rules if any)
DROP FUNCTION IF EXISTS submit_collection_v2(
  p_tx_id TEXT,
  p_location_id TEXT,
  p_driver_id TEXT,
  p_current_score INTEGER,
  p_expenses INTEGER,
  p_tip INTEGER,
  p_startup_debt_deduction INTEGER,
  p_is_owner_retaining BOOLEAN,
  p_owner_retention INTEGER,
  p_coin_exchange INTEGER,
  p_gps JSONB,
  p_photo_url TEXT,
  p_ai_score INTEGER,
  p_anomaly_flag BOOLEAN,
  p_notes TEXT,
  p_expense_type TEXT,
  p_expense_category TEXT,
  p_reported_status TEXT,
  p_expense_description TEXT
) CASCADE;

-- Recreate with optional p_timestamp parameter (DEFAULT now())
CREATE OR REPLACE FUNCTION submit_collection_v2(
  p_tx_id TEXT,
  p_location_id TEXT,
  p_driver_id TEXT,
  p_current_score INTEGER,
  p_expenses INTEGER,
  p_tip INTEGER,
  p_startup_debt_deduction INTEGER,
  p_is_owner_retaining BOOLEAN,
  p_owner_retention INTEGER,
  p_coin_exchange INTEGER,
  p_gps JSONB,
  p_photo_url TEXT,
  p_ai_score INTEGER,
  p_anomaly_flag BOOLEAN,
  p_notes TEXT,
  p_expense_type TEXT,
  p_expense_category TEXT,
  p_reported_status TEXT,
  p_expense_description TEXT,
  p_timestamp TIMESTAMPTZ DEFAULT now()  -- NEW: allow custom timestamp for back-dating
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_previous_score INTEGER;
  v_location_name TEXT;
  v_driver_name TEXT;
  v_commission_rate NUMERIC;
  v_diff INTEGER;
  v_revenue INTEGER;
  v_commission INTEGER;
  v_net_payable INTEGER;
  v_new_last_score INTEGER;
  v_tx_idempotent BOOLEAN := FALSE;
  v_result JSONB;
  v_existing_tx RECORD;
  v_location_status TEXT;
  v_coin_value_tzs INTEGER := 10;  -- CONSTANTS.COIN_VALUE_TZS
BEGIN
  -- === Step 0: Idempotency check ===
  SELECT * INTO v_existing_tx FROM transactions WHERE id = p_tx_id;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'id', v_existing_tx.id,
      'timestamp', v_existing_tx.timestamp,
      'locationId', v_existing_tx."locationId",
      'locationName', v_existing_tx."locationName",
      'driverId', v_existing_tx."driverId",
      'driverName', v_existing_tx."driverName",
      'previousScore', v_existing_tx."previousScore",
      'currentScore', v_existing_tx."currentScore",
      'revenue', v_existing_tx."revenue",
      'commission', v_existing_tx."commission",
      'ownerRetention', v_existing_tx."ownerRetention",
      'isOwnerRetaining', v_existing_tx."isOwnerRetaining",
      'debtDeduction', v_existing_tx."debtDeduction",
      'startupDebtDeduction', v_existing_tx."startupDebtDeduction",
      'expenses', v_existing_tx."expenses",
      'tip', v_existing_tx."tip",
      'coinExchange', v_existing_tx."coinExchange",
      'extraIncome', v_existing_tx."extraIncome",
      'netPayable', v_existing_tx."netPayable",
      'gps', v_existing_tx."gps",
      'photoUrl', v_existing_tx."photoUrl",
      'dataUsageKB', v_existing_tx."dataUsageKB",
      'aiScore', v_existing_tx."aiScore",
      'isAnomaly', v_existing_tx."isAnomaly",
      'anomalyFlag', v_existing_tx."anomalyFlag",
      'isSynced', v_existing_tx."isSynced",
      'type', v_existing_tx."type",
      'approvalStatus', v_existing_tx."approvalStatus",
      'paymentStatus', v_existing_tx."paymentStatus",
      'reportedStatus', v_existing_tx."reportedStatus",
      'notes', v_existing_tx."notes",
      'expenseType', v_existing_tx."expenseType",
      'expenseCategory', v_existing_tx."expenseCategory",
      'expenseStatus', v_existing_tx."expenseStatus",
      'expenseDescription', v_existing_tx."expenseDescription",
      'tx_conflict', TRUE
    );
  END IF;

  -- === Step 1: Fetch location data ===
  SELECT 
    "lastScore", name, "commissionRate", status
  INTO 
    v_previous_score, v_location_name, v_commission_rate, v_location_status
  FROM locations WHERE id = p_location_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Location not found: ' || p_location_id);
  END IF;

  -- === Step 2: Fetch driver name ===
  SELECT name INTO v_driver_name FROM drivers WHERE id = p_driver_id;

  -- === Step 3: Calculate finance ===
  v_diff := GREATEST(0, p_current_score - v_previous_score);
  v_revenue := v_diff * v_coin_value_tzs;
  v_commission := FLOOR(v_revenue * v_commission_rate);
  v_net_payable := v_revenue 
    - COALESCE(p_owner_retention, v_commission)
    - p_expenses 
    - p_tip 
    + p_startup_debt_deduction;
  
  IF v_net_payable < 0 THEN v_net_payable := 0; END IF;

  v_new_last_score := GREATEST(v_previous_score, p_current_score);

  -- === Step 4: Insert transaction with optional custom timestamp ===
  INSERT INTO transactions (
    id, timestamp, "uploadTimestamp",
    "locationId", "locationName",
    "driverId", "driverName",
    "previousScore", "currentScore",
    revenue, commission,
    "ownerRetention", "isOwnerRetaining",
    "debtDeduction", "startupDebtDeduction",
    expenses, tip, "coinExchange", "extraIncome",
    "netPayable",
    gps, "photoUrl", "dataUsageKB",
    "aiScore", "isAnomaly", "anomalyFlag",
    "isSynced", type, "approvalStatus", "paymentStatus",
    "reportedStatus", notes,
    "expenseType", "expenseCategory", "expenseStatus", "expenseDescription"
  ) VALUES (
    p_tx_id, p_timestamp, p_timestamp,  -- USE p_timestamp instead of now()
    p_location_id, v_location_name,
    p_driver_id, v_driver_name,
    v_previous_score, p_current_score,
    v_revenue, v_commission,
    COALESCE(p_owner_retention, v_commission), p_is_owner_retaining,
    p_startup_debt_deduction, p_startup_debt_deduction,
    p_expenses, COALESCE(p_tip, 0), p_coin_exchange, 0,
    v_net_payable,
    p_gps, p_photo_url, 120,
    p_ai_score, p_anomaly_flag, p_anomaly_flag,
    TRUE, 'collection', 'approved', 'pending',
    p_reported_status, p_notes,
    p_expense_type, p_expense_category, 'pending', p_expense_description
  )
  ON CONFLICT (id) DO NOTHING
  RETURNING * INTO v_existing_tx;

  -- === Step 5: Update location lastScore ===
  UPDATE locations 
  SET 
    "lastScore" = v_new_last_score,
    "lastRevenueDate" = p_timestamp::date::text,  -- USE p_timestamp
    status = CASE 
      WHEN p_reported_status IN ('maintenance', 'broken') THEN p_reported_status 
      ELSE status 
    END
  WHERE id = p_location_id;

  -- === Step 6: Update site debt ===
  IF p_startup_debt_deduction > 0 THEN
    UPDATE locations
    SET "remainingStartupDebt" = GREATEST(0, "remainingStartupDebt" - p_startup_debt_deduction)
    WHERE id = p_location_id;
  END IF;

  -- === Step 7: Return constructed transaction ===
  RETURN jsonb_build_object(
    'id', v_existing_tx.id,
    'timestamp', v_existing_tx.timestamp,
    'locationId', v_existing_tx."locationId",
    'locationName', v_existing_tx."locationName",
    'driverId', v_existing_tx."driverId",
    'driverName', v_existing_tx."driverName",
    'previousScore', v_existing_tx."previousScore",
    'currentScore', v_existing_tx."currentScore",
    'revenue', v_existing_tx."revenue",
    'commission', v_existing_tx."commission",
    'ownerRetention', v_existing_tx."ownerRetention",
    'isOwnerRetaining', v_existing_tx."isOwnerRetaining",
    'debtDeduction', v_existing_tx."debtDeduction",
    'startupDebtDeduction', v_existing_tx."startupDebtDeduction",
    'expenses', v_existing_tx."expenses",
    'tip', v_existing_tx."tip",
    'coinExchange', v_existing_tx."coinExchange",
    'extraIncome', v_existing_tx."extraIncome",
    'netPayable', v_existing_tx."netPayable",
    'gps', v_existing_tx."gps",
    'photoUrl', v_existing_tx."photoUrl",
    'dataUsageKB', v_existing_tx."dataUsageKB",
    'aiScore', v_existing_tx."aiScore",
    'isAnomaly', v_existing_tx."isAnomaly",
    'anomalyFlag', v_existing_tx."anomalyFlag",
    'isSynced', v_existing_tx."isSynced",
    'type', v_existing_tx."type",
    'approvalStatus', v_existing_tx."approvalStatus",
    'paymentStatus', v_existing_tx."paymentStatus",
    'reportedStatus', v_existing_tx."reportedStatus",
    'notes', v_existing_tx."notes",
    'expenseType', v_existing_tx."expenseType",
    'expenseCategory', v_existing_tx."expenseCategory",
    'expenseStatus', v_existing_tx."expenseStatus",
    'expenseDescription', v_existing_tx."expenseDescription"
  );
END;
$$;
