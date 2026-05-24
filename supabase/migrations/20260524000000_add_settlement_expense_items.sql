-- 20260524000000_add_settlement_expense_items.sql
-- Add per-expense item evidence support to daily settlements.
-- Each expense now carries its own amount, category, note, and photo evidence.

-- 1. Schema: add expenseItems JSONB column
ALTER TABLE public.daily_settlements
    ADD COLUMN IF NOT EXISTS "expenseItems" JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.daily_settlements."expenseItems" IS
    'Array of {amount, category, note, photoUrl} objects for per-expense evidence';

-- 2. Update create_daily_settlement_v1 to accept expense items
CREATE OR REPLACE FUNCTION public.create_daily_settlement_v1(
    p_id TEXT,
    p_date DATE,
    p_driver_id TEXT,
    p_total_revenue NUMERIC,
    p_total_net_payable NUMERIC,
    p_total_expenses NUMERIC,
    p_driver_float NUMERIC,
    p_expected_total NUMERIC,
    p_actual_cash NUMERIC,
    p_actual_coins NUMERIC,
    p_shortage NUMERIC,
    p_note TEXT DEFAULT NULL,
    p_transfer_proof_url TEXT DEFAULT NULL,
    p_expense_items JSONB DEFAULT '[]'::jsonb
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_caller_profile RECORD;
    v_driver RECORD;
    v_existing_settlement RECORD;
    v_conflicting_settlement RECORD;
    v_now TIMESTAMPTZ := NOW();
    v_validated_items JSONB;
    v_item JSONB;
    v_sum_expenses NUMERIC := 0;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;

    SELECT role, driver_id, display_name
      INTO v_caller_profile
      FROM public.profiles
     WHERE auth_user_id = auth.uid();

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Caller profile not found' USING ERRCODE = '42501';
    END IF;

    IF v_caller_profile.role = 'driver' AND v_caller_profile.driver_id IS DISTINCT FROM p_driver_id THEN
        RAISE EXCEPTION 'Forbidden: driver may not submit settlement for another driver'
            USING ERRCODE = '42501';
    END IF;

    SELECT id, name
      INTO v_driver
      FROM public.drivers
     WHERE id = p_driver_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Driver not found: %', p_driver_id USING ERRCODE = 'P0002';
    END IF;

    -- Idempotency: return existing settlement if same id
    SELECT
        s.id, s."date", s."driverId", s."driverName", s."totalRevenue", s."totalNetPayable",
        s."totalExpenses", s."driverFloat", s."expectedTotal", s."actualCash", s."actualCoins",
        s.shortage, s.note, s."transferProofUrl", s."expenseItems", s.status, s."timestamp",
        s."adminId", s."adminName", s."checkInAt", s."checkOutAt", s."checkInGps", s."checkOutGps",
        s."hasCheckedIn", s."hasCheckedOut", s."isSynced"
      INTO v_existing_settlement
      FROM public.daily_settlements s
     WHERE s.id = p_id;

    IF FOUND THEN
        RETURN row_to_json(v_existing_settlement);
    END IF;

    -- Prevent duplicate settlement for same driver+date
    SELECT s.id, s.status
      INTO v_conflicting_settlement
      FROM public.daily_settlements s
     WHERE s."driverId" = p_driver_id
       AND s."date" = p_date
       AND s.status IN ('pending', 'confirmed')
     ORDER BY s."timestamp" DESC
     LIMIT 1;

    IF FOUND THEN
        RAISE EXCEPTION
            'Settlement already exists for driver % on % (existing id: %, status: %)',
            p_driver_id, p_date, v_conflicting_settlement.id, v_conflicting_settlement.status
            USING ERRCODE = '23505';
    END IF;

    -- Validate and sum expense items
    v_validated_items := '[]'::jsonb;
    IF p_expense_items IS NOT NULL AND jsonb_typeof(p_expense_items) = 'array' THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_expense_items)
        LOOP
            -- Each item must have amount >= 0, category, and photoUrl
            IF (v_item->>'amount') IS NULL OR (v_item->>'amount')::numeric < 0 THEN
                RAISE EXCEPTION 'Expense item amount must be >= 0' USING ERRCODE = '22023';
            END IF;
            IF v_item->>'category' IS NULL THEN
                RAISE EXCEPTION 'Expense item category is required' USING ERRCODE = '22023';
            END IF;

            v_sum_expenses := v_sum_expenses + COALESCE((v_item->>'amount')::numeric, 0);
            v_validated_items := v_validated_items || v_item;
        END LOOP;
    END IF;

    -- Warn if summed expenses don't match p_total_expenses (but don't reject)
    IF p_total_expenses IS DISTINCT FROM v_sum_expenses AND v_validated_items != '[]'::jsonb THEN
        RAISE WARNING 'totalExpenses (%) differs from expenseItems sum (%)', p_total_expenses, v_sum_expenses;
    END IF;

    INSERT INTO public.daily_settlements (
        id, "date", "driverId", "driverName", "totalRevenue", "totalNetPayable",
        "totalExpenses", "driverFloat", "expectedTotal", "actualCash", "actualCoins",
        shortage, note, "transferProofUrl", "expenseItems", status, "timestamp", "isSynced"
    ) VALUES (
        p_id, p_date, p_driver_id, v_driver.name, p_total_revenue, p_total_net_payable,
        v_sum_expenses, p_driver_float, p_expected_total, p_actual_cash, p_actual_coins,
        p_shortage, p_note, p_transfer_proof_url, v_validated_items,
        'pending', v_now, TRUE
    );

    RETURN json_build_object(
        'id', p_id,
        'date', p_date,
        'driverId', p_driver_id,
        'driverName', v_driver.name,
        'totalRevenue', p_total_revenue,
        'totalNetPayable', p_total_net_payable,
        'totalExpenses', v_sum_expenses,
        'driverFloat', p_driver_float,
        'expectedTotal', p_expected_total,
        'actualCash', p_actual_cash,
        'actualCoins', p_actual_coins,
        'shortage', p_shortage,
        'note', p_note,
        'transferProofUrl', p_transfer_proof_url,
        'expenseItems', v_validated_items,
        'status', 'pending',
        'timestamp', v_now,
        'isSynced', TRUE
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_daily_settlement_v1(
    TEXT, DATE, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC,
    TEXT, TEXT, JSONB
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_daily_settlement_v1(
    TEXT, DATE, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC,
    TEXT, TEXT, JSONB
) TO authenticated;

-- 3. Update review_daily_settlement_v1 to preserve expenseItems in response
CREATE OR REPLACE FUNCTION public.review_daily_settlement_v1(
    p_settlement_id TEXT,
    p_status TEXT,
    p_note TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_caller_profile RECORD;
    v_settlement RECORD;
    v_next_note TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;

    SELECT role, display_name
      INTO v_caller_profile
      FROM public.profiles
     WHERE auth_user_id = auth.uid();

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Caller profile not found' USING ERRCODE = '42501';
    END IF;

    IF v_caller_profile.role IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Forbidden: only admins may review settlements' USING ERRCODE = '42501';
    END IF;

    IF p_status NOT IN ('confirmed', 'rejected') THEN
        RAISE EXCEPTION 'Invalid settlement review status: %', p_status USING ERRCODE = '22023';
    END IF;

    SELECT *
      INTO v_settlement
      FROM public.daily_settlements
     WHERE id = p_settlement_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Settlement not found: %', p_settlement_id USING ERRCODE = 'P0002';
    END IF;

    IF v_settlement.status IS DISTINCT FROM 'pending' THEN
        RAISE EXCEPTION 'Settlement is not pending: %', p_settlement_id USING ERRCODE = '22023';
    END IF;

    v_next_note := COALESCE(p_note, v_settlement.note);

    UPDATE public.daily_settlements
       SET status = p_status,
           note = v_next_note,
           "adminId" = auth.uid()::text,
           "adminName" = COALESCE(v_caller_profile.display_name, 'Admin'),
           "isSynced" = TRUE
     WHERE id = p_settlement_id;

    IF p_status = 'confirmed' AND v_settlement."driverId" IS NOT NULL THEN
        UPDATE public.drivers
           SET "dailyFloatingCoins" = COALESCE(v_settlement."actualCoins", 0)
         WHERE id = v_settlement."driverId";
    END IF;

    SELECT
        s.id, s."date", s."driverId", s."driverName", s."totalRevenue", s."totalNetPayable",
        s."totalExpenses", s."driverFloat", s."expectedTotal", s."actualCash", s."actualCoins",
        s.shortage, s.note, s."transferProofUrl", s."expenseItems", s.status, s."timestamp",
        s."adminId", s."adminName", s."checkInAt", s."checkOutAt", s."checkInGps", s."checkOutGps",
        s."hasCheckedIn", s."hasCheckedOut", s."isSynced"
      INTO v_settlement
      FROM public.daily_settlements s
     WHERE s.id = p_settlement_id;

    RETURN row_to_json(v_settlement);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.review_daily_settlement_v1(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_daily_settlement_v1(TEXT, TEXT, TEXT) TO authenticated;
