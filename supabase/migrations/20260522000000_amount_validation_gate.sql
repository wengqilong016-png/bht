-- ============================================================================
-- 服务端金额校验加固 (Server-side Amount Validation Gate)
-- 
-- 设计原则:
--   1. 服务端是防线 — submit_collection_v2 在持久化前校验所有金额字段
--   2. 客户端校验是辅助 — 客户端 clamping 不能替代服务端拒绝
--   3. 校验失败 = 记录审计日志 + 拒绝操作（不静默接受）
--   4. 防御纵深 — DB CHECK 约束作为最后防线，防直接 upsert 绕过 RPC
--
-- 审计所有金额写入入口:
--   - submit_collection_v2 RPC (主要在线路径) ✓
--   - 离线队列 replay → submit_collection_v2 (也走 RPC) ✓
--   - 直接 upsert transactions (admin 编辑/legacy) → CHECK 约束兜底 ✓
--   - 结算创建 → CHECK 约束兜底 ✓
-- ============================================================================

-- ─── 1. 创建金额校验审计日志表 ────────────────────────────────────────────────
-- 记录所有校验失败事件，便于事后审查

CREATE TABLE IF NOT EXISTS public.amount_validation_audit (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source          TEXT NOT NULL              -- 'submit_collection_v2' | 'check_constraint' | 'client_gate'
        CHECK (source IN ('submit_collection_v2', 'check_constraint', 'client_gate')),
    field_name      TEXT NOT NULL,             -- 被拒绝的字段名
    submitted_value NUMERIC,                   -- 客户端提交的值
    allowed_max     NUMERIC,                   -- 允许的最大值
    caller_auth_uid UUID,                      -- auth.uid()
    caller_driver_id TEXT,                     -- 关联的 driver id
    location_id     UUID,                      -- 关联的 location id
    tx_id           TEXT,                      -- 关联的 tx id
    error_message   TEXT NOT NULL,             -- 完整的错误信息
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 索引: 按时间、来源、字段查询
CREATE INDEX IF NOT EXISTS idx_amount_validation_audit_time
    ON public.amount_validation_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_amount_validation_audit_source
    ON public.amount_validation_audit (source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_amount_validation_audit_driver
    ON public.amount_validation_audit (caller_driver_id, created_at DESC);

-- RLS: 仅 admin 可读，任何 authenticated user 可插
ALTER TABLE public.amount_validation_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY amount_validation_audit_admin_select ON public.amount_validation_audit
    FOR SELECT TO authenticated
    USING (public.get_my_role() = 'admin');

CREATE POLICY amount_validation_audit_insert ON public.amount_validation_audit
    FOR INSERT TO authenticated
    WITH CHECK (true);

-- ─── 2. 金额校验门控常量 ──────────────────────────────────────────────────────
-- 这些值定义在数据库层面，确保服务端是唯一权威

-- 分值上限: 1,000,000 分 (对应 TZS 200,000,000 收入 = 约 2 亿先令)
-- 正常老虎机计分器极少超过几十万分，1M 是极其宽松的上限
CREATE OR REPLACE FUNCTION public.MAX_CURRENT_SCORE() RETURNS NUMERIC
    LANGUAGE sql IMMUTABLE AS $$ SELECT 1000000::NUMERIC $$;

-- 费用上限: 10,000,000 TZS (1 千万先令)
CREATE OR REPLACE FUNCTION public.MAX_EXPENSES() RETURNS NUMERIC
    LANGUAGE sql IMMUTABLE AS $$ SELECT 10000000::NUMERIC $$;

-- 小费上限: 5,000,000 TZS
CREATE OR REPLACE FUNCTION public.MAX_TIP() RETURNS NUMERIC
    LANGUAGE sql IMMUTABLE AS $$ SELECT 5000000::NUMERIC $$;

-- 换币上限: 10,000,000 TZS
CREATE OR REPLACE FUNCTION public.MAX_COIN_EXCHANGE() RETURNS NUMERIC
    LANGUAGE sql IMMUTABLE AS $$ SELECT 10000000::NUMERIC $$;

-- 业主留存上限: 20,000,000 TZS
CREATE OR REPLACE FUNCTION public.MAX_OWNER_RETENTION() RETURNS NUMERIC
    LANGUAGE sql IMMUTABLE AS $$ SELECT 20000000::NUMERIC $$;

-- 启动债务扣除上限: 50,000,000 TZS
CREATE OR REPLACE FUNCTION public.MAX_STARTUP_DEBT_DEDUCTION() RETURNS NUMERIC
    LANGUAGE sql IMMUTABLE AS $$ SELECT 50000000::NUMERIC $$;

-- 提现金额上限: 50,000,000 TZS
CREATE OR REPLACE FUNCTION public.MAX_PAYOUT_AMOUNT() RETURNS NUMERIC
    LANGUAGE sql IMMUTABLE AS $$ SELECT 50000000::NUMERIC $$;

-- ─── 3. 辅助: 记录金额校验失败 ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.log_amount_validation_failure(
    p_source          TEXT,
    p_field_name      TEXT,
    p_submitted_value NUMERIC,
    p_allowed_max     NUMERIC,
    p_caller_auth_uid UUID,
    p_caller_driver_id TEXT,
    p_location_id     UUID,
    p_tx_id           TEXT,
    p_error_message   TEXT
) RETURNS void
    LANGUAGE plpgsql VOLATILE SECURITY DEFINER
    SET search_path = public, pg_temp
AS $$
BEGIN
    INSERT INTO public.amount_validation_audit (
        source, field_name, submitted_value, allowed_max,
        caller_auth_uid, caller_driver_id, location_id, tx_id,
        error_message
    ) VALUES (
        p_source, p_field_name, p_submitted_value, p_allowed_max,
        p_caller_auth_uid, p_caller_driver_id, p_location_id, p_tx_id,
        p_error_message
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_amount_validation_failure(TEXT, TEXT, NUMERIC, NUMERIC, UUID, TEXT, UUID, TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.log_amount_validation_failure(TEXT, TEXT, NUMERIC, NUMERIC, UUID, TEXT, UUID, TEXT, TEXT) TO authenticated;

-- ─── 4. 校验函数: 单一金额字段校验 ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.validate_amount_field(
    p_source          TEXT,
    p_field_name      TEXT,
    p_submitted_value NUMERIC,
    p_allowed_max     NUMERIC,
    p_caller_auth_uid UUID,
    p_caller_driver_id TEXT,
    p_location_id     UUID,
    p_tx_id           TEXT
) RETURNS void
    LANGUAGE plpgsql VOLATILE SECURITY DEFINER
    SET search_path = public, pg_temp
AS $$
DECLARE
    v_error_msg TEXT;
BEGIN
    -- 不能为负
    IF p_submitted_value < 0 THEN
        v_error_msg := format(
            'AMOUNT_VALIDATION_FAILED: %s 不能为负数 (提交值: %s)',
            p_field_name, p_submitted_value
        );
        PERFORM public.log_amount_validation_failure(
            p_source, p_field_name, p_submitted_value, 0,
            p_caller_auth_uid, p_caller_driver_id, p_location_id, p_tx_id,
            v_error_msg
        );
        RAISE EXCEPTION '%', v_error_msg USING ERRCODE = '23514';
    END IF;

    -- 不能超过上限
    IF p_submitted_value > p_allowed_max THEN
        v_error_msg := format(
            'AMOUNT_VALIDATION_FAILED: %s 超过上限 (提交值: %s, 上限: %s)',
            p_field_name, p_submitted_value, p_allowed_max
        );
        PERFORM public.log_amount_validation_failure(
            p_source, p_field_name, p_submitted_value, p_allowed_max,
            p_caller_auth_uid, p_caller_driver_id, p_location_id, p_tx_id,
            v_error_msg
        );
        RAISE EXCEPTION '%', v_error_msg USING ERRCODE = '23514';
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.validate_amount_field(TEXT, TEXT, NUMERIC, NUMERIC, UUID, TEXT, UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.validate_amount_field(TEXT, TEXT, NUMERIC, NUMERIC, UUID, TEXT, UUID, TEXT) TO authenticated;

-- ─── 5. 加固 submit_collection_v2 ══════════════════════════════════════════════
-- 在已有逻辑之前插入金额校验门控

CREATE OR REPLACE FUNCTION public.submit_collection_v2(
    p_tx_id              TEXT,
    p_location_id        UUID,
    p_driver_id          TEXT,
    p_current_score      INTEGER,
    p_expenses           INTEGER DEFAULT 0,
    p_tip                INTEGER DEFAULT 0,
    p_startup_debt_deduction INTEGER DEFAULT 0,
    p_is_owner_retaining BOOLEAN DEFAULT TRUE,
    p_owner_retention    NUMERIC DEFAULT NULL,
    p_coin_exchange      INTEGER DEFAULT 0,
    p_gps                JSONB   DEFAULT NULL,
    p_photo_url          TEXT    DEFAULT NULL,
    p_ai_score           INTEGER DEFAULT NULL,
    p_anomaly_flag       BOOLEAN DEFAULT FALSE,
    p_notes              TEXT    DEFAULT NULL,
    p_expense_type       TEXT    DEFAULT NULL,
    p_expense_category   TEXT    DEFAULT NULL,
    p_reported_status    TEXT    DEFAULT 'active',
    p_expense_description TEXT   DEFAULT NULL
)
RETURNS JSON LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_profile  RECORD;
    v_location        RECORD;
    v_driver          RECORD;
    v_diff            INTEGER;
    v_revenue         NUMERIC;
    v_commission      NUMERIC;
    v_final_retention NUMERIC;
    v_available_after_core_deductions NUMERIC;
    v_startup_debt_deduction NUMERIC;
    v_net_payable     NUMERIC;
    v_now             TIMESTAMPTZ := NOW();
    v_rows_inserted   INTEGER;
    v_existing_tx     RECORD;
    v_caller_uid      UUID;
    v_source          TEXT := 'submit_collection_v2';
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;

    v_caller_uid := auth.uid();

    SELECT role, driver_id INTO v_caller_profile
    FROM public.profiles WHERE auth_user_id = v_caller_uid;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Caller profile not found' USING ERRCODE = '42501';
    END IF;

    IF v_caller_profile.role = 'driver' THEN
        IF v_caller_profile.driver_id IS DISTINCT FROM p_driver_id THEN
            RAISE EXCEPTION 'Forbidden: driver may not submit on behalf of another driver'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    -- ─── AMOUNT VALIDATION GATE ═════════════════════════════════════════════════
    -- 所有金额必须在合理范围内。校验失败会先记录审计日志再抛出异常。
    -- 异常被客户端 submitCollectionV2 捕获并作为 RPC error 返回，
    -- 最终触发离线队列降级（不会静默接受越界值）。

    PERFORM public.validate_amount_field(
        v_source, 'currentScore', p_current_score::NUMERIC,
        public.MAX_CURRENT_SCORE(), v_caller_uid,
        p_driver_id, p_location_id, p_tx_id
    );

    PERFORM public.validate_amount_field(
        v_source, 'expenses', COALESCE(p_expenses, 0)::NUMERIC,
        public.MAX_EXPENSES(), v_caller_uid,
        p_driver_id, p_location_id, p_tx_id
    );

    PERFORM public.validate_amount_field(
        v_source, 'tip', COALESCE(p_tip, 0)::NUMERIC,
        public.MAX_TIP(), v_caller_uid,
        p_driver_id, p_location_id, p_tx_id
    );

    PERFORM public.validate_amount_field(
        v_source, 'coinExchange', COALESCE(p_coin_exchange, 0)::NUMERIC,
        public.MAX_COIN_EXCHANGE(), v_caller_uid,
        p_driver_id, p_location_id, p_tx_id
    );

    PERFORM public.validate_amount_field(
        v_source, 'startupDebtDeduction', COALESCE(p_startup_debt_deduction, 0)::NUMERIC,
        public.MAX_STARTUP_DEBT_DEDUCTION(), v_caller_uid,
        p_driver_id, p_location_id, p_tx_id
    );

    IF p_owner_retention IS NOT NULL THEN
        PERFORM public.validate_amount_field(
            v_source, 'ownerRetention', p_owner_retention,
            public.MAX_OWNER_RETENTION(), v_caller_uid,
            p_driver_id, p_location_id, p_tx_id
        );
    END IF;
    -- ─── END AMOUNT VALIDATION GATE ───────────────────────────────────────────

    -- Coerce expenses to 0 for collection transactions — expenses are
    -- recorded as separate type='expense' transactions.
    p_expenses := 0;

    SELECT id, name, "lastScore", "commissionRate", "machineId", "remainingStartupDebt" INTO v_location
    FROM public.locations WHERE id = p_location_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Location not found: %', p_location_id USING ERRCODE = 'P0002';
    END IF;

    SELECT id, name INTO v_driver FROM public.drivers WHERE id = p_driver_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Driver not found: %', p_driver_id USING ERRCODE = 'P0002';
    END IF;

    v_diff     := GREATEST(0, p_current_score - v_location."lastScore");
    v_revenue  := v_diff * 200;
    v_commission := FLOOR(v_revenue * COALESCE(v_location."commissionRate", 0.15));
    v_final_retention := GREATEST(0, COALESCE(p_owner_retention, v_commission));

    v_available_after_core_deductions := GREATEST(
        0,
        v_revenue - v_final_retention - ABS(COALESCE(p_expenses, 0)) - ABS(COALESCE(p_tip, 0))
    );

    v_startup_debt_deduction := LEAST(
        GREATEST(0, COALESCE(p_startup_debt_deduction, 0)),
        GREATEST(0, COALESCE(v_location."remainingStartupDebt", 0))
    );

    v_net_payable := GREATEST(0, v_available_after_core_deductions + v_startup_debt_deduction);

    INSERT INTO public.transactions (
        id, "timestamp", "uploadTimestamp",
        "locationId", "locationName", "driverId", "driverName",
        "previousScore", "currentScore",
        revenue, commission, "ownerRetention",
        "debtDeduction", "startupDebtDeduction",
        expenses, "coinExchange", "extraIncome", "netPayable",
        "paymentStatus", gps, "photoUrl",
        "aiScore", "isAnomaly", "isClearance", "isSynced",
        type, "dataUsageKB", "reportedStatus", notes,
        "expenseType", "expenseCategory", "expenseStatus", "approvalStatus"
    ) VALUES (
        p_tx_id, v_now, v_now,
        p_location_id, v_location.name, p_driver_id, v_driver.name,
        v_location."lastScore", p_current_score,
        v_revenue, v_commission, v_final_retention,
        0, v_startup_debt_deduction,
        COALESCE(p_expenses, 0), COALESCE(p_coin_exchange, 0), 0, v_net_payable,
        'pending', p_gps, p_photo_url,
        p_ai_score, COALESCE(p_anomaly_flag, FALSE), FALSE, TRUE,
        'collection', 120, COALESCE(p_reported_status, 'active'), p_notes,
        CASE WHEN COALESCE(p_expenses, 0) > 0 THEN p_expense_type     ELSE NULL END,
        CASE WHEN COALESCE(p_expenses, 0) > 0 THEN p_expense_category ELSE NULL END,
        CASE WHEN COALESCE(p_expenses, 0) > 0 THEN 'pending'          ELSE NULL END,
        'approved'
    )
    ON CONFLICT (id) DO NOTHING;

    GET DIAGNOSTICS v_rows_inserted = ROW_COUNT;

    IF v_rows_inserted = 1 THEN
        UPDATE public.locations
        SET "lastScore" = CASE
            WHEN "lastScore" IS NULL OR p_current_score >= "lastScore"
                THEN p_current_score
            ELSE "lastScore"
        END,
            "remainingStartupDebt" = GREATEST(
                0,
                COALESCE("remainingStartupDebt", 0) - v_startup_debt_deduction
            ),
            "dividendBalance" = CASE
                WHEN p_is_owner_retaining
                    THEN COALESCE("dividendBalance", 0) + v_final_retention
                ELSE COALESCE("dividendBalance", 0)
            END
        WHERE id = p_location_id;
    END IF;

    IF v_rows_inserted = 0 THEN
        SELECT
            t.id,
            t."timestamp",
            t."locationId",
            t."locationName",
            t."driverId",
            t."driverName",
            t."previousScore",
            t."currentScore",
            t.revenue,
            t.commission,
            t."ownerRetention",
            t."debtDeduction",
            t."startupDebtDeduction",
            t.expenses,
            t."coinExchange",
            t."extraIncome",
            t."netPayable",
            t."paymentStatus",
            t.gps,
            t."photoUrl",
            t."aiScore",
            t."isAnomaly",
            t."isSynced",
            t.type,
            t."approvalStatus",
            t."reportedStatus",
            t.notes,
            t."expenseType",
            t."expenseCategory",
            t."expenseStatus"
        INTO v_existing_tx
        FROM public.transactions t
        WHERE t.id = p_tx_id;
        RETURN row_to_json(v_existing_tx)::jsonb || jsonb_build_object('tx_conflict', true);
    END IF;

    RETURN json_build_object(
        'id',                   p_tx_id,
        'timestamp',            v_now,
        'locationId',           p_location_id,
        'locationName',         v_location.name,
        'driverId',             p_driver_id,
        'driverName',           v_driver.name,
        'previousScore',        v_location."lastScore",
        'currentScore',         p_current_score,
        'revenue',              v_revenue,
        'commission',           v_commission,
        'ownerRetention',       v_final_retention,
        'debtDeduction',        0,
        'startupDebtDeduction', v_startup_debt_deduction,
        'expenses',             COALESCE(p_expenses, 0),
        'coinExchange',         COALESCE(p_coin_exchange, 0),
        'extraIncome',          0,
        'netPayable',           v_net_payable,
        'paymentStatus',        'pending',
        'gps',                  p_gps,
        'photoUrl',             p_photo_url,
        'aiScore',              p_ai_score,
        'isAnomaly',            COALESCE(p_anomaly_flag, FALSE),
        'isSynced',             TRUE,
        'type',                 'collection',
        'approvalStatus',       'approved',
        'reportedStatus',       COALESCE(p_reported_status, 'active'),
        'notes',                p_notes,
        'expenseType',          CASE WHEN COALESCE(p_expenses, 0) > 0 THEN p_expense_type     ELSE NULL END,
        'expenseCategory',      CASE WHEN COALESCE(p_expenses, 0) > 0 THEN p_expense_category ELSE NULL END,
        'expenseStatus',        CASE WHEN COALESCE(p_expenses, 0) > 0 THEN 'pending'          ELSE NULL END
    );

EXCEPTION
    WHEN check_violation THEN
        -- Validation failures (ERRCODE '23514'): return structured error JSON
        -- so the client can handle it gracefully without crashing.
        RETURN json_build_object(
            'error', SQLERRM,
            'errcode', SQLSTATE
        );
    WHEN others THEN
        -- Non-validation errors (auth, not-found, etc.): re-raise so the
        -- client sees the real PostgreSQL error and can classify it correctly.
        RAISE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_collection_v2(TEXT, UUID, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, BOOLEAN, NUMERIC, INTEGER, JSONB, TEXT, INTEGER, BOOLEAN, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.submit_collection_v2(TEXT, UUID, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, BOOLEAN, NUMERIC, INTEGER, JSONB, TEXT, INTEGER, BOOLEAN, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ─── 6. 数据库 CHECK 约束: 防御纵深 ───────────────────────────────────────────
-- 即使 RPC 被绕过（直接 upsert、legacy replay 等），数据库层也会拒绝越界金额。
-- NOT VALID 避免扫描已有数据（可能包含少量关联数据不清的旧行），
-- 但所有新写入都会被强制执行。

DO $$
BEGIN
    -- transactions 表约束
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'transactions_current_score_check'
          AND conrelid = 'public.transactions'::regclass
    ) THEN
        ALTER TABLE public.transactions
            ADD CONSTRAINT transactions_current_score_check
            CHECK ("currentScore" >= 0 AND "currentScore" <= 1000000)
            NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'transactions_revenue_check'
          AND conrelid = 'public.transactions'::regclass
    ) THEN
        ALTER TABLE public.transactions
            ADD CONSTRAINT transactions_revenue_check
            CHECK (revenue >= 0 AND revenue <= 200000000)
            NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'transactions_expenses_check'
          AND conrelid = 'public.transactions'::regclass
    ) THEN
        ALTER TABLE public.transactions
            ADD CONSTRAINT transactions_expenses_check
            CHECK (expenses >= 0 AND expenses <= 10000000)
            NOT VALID;
    END IF;

    -- Ensure tip column exists before adding constraint (schema drift fix)
    ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS tip NUMERIC DEFAULT 0;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'transactions_tip_check'
          AND conrelid = 'public.transactions'::regclass
    ) THEN
        ALTER TABLE public.transactions
            ADD CONSTRAINT transactions_tip_check
            CHECK (tip IS NULL OR (tip >= 0 AND tip <= 5000000))
            NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'transactions_coin_exchange_check'
          AND conrelid = 'public.transactions'::regclass
    ) THEN
        ALTER TABLE public.transactions
            ADD CONSTRAINT transactions_coin_exchange_check
            CHECK ("coinExchange" >= 0 AND "coinExchange" <= 10000000)
            NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'transactions_owner_retention_check'
          AND conrelid = 'public.transactions'::regclass
    ) THEN
        ALTER TABLE public.transactions
            ADD CONSTRAINT transactions_owner_retention_check
            CHECK ("ownerRetention" >= 0 AND "ownerRetention" <= 20000000)
            NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'transactions_startup_debt_deduction_check'
          AND conrelid = 'public.transactions'::regclass
    ) THEN
        ALTER TABLE public.transactions
            ADD CONSTRAINT transactions_startup_debt_deduction_check
            CHECK ("startupDebtDeduction" >= 0 AND "startupDebtDeduction" <= 50000000)
            NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'transactions_net_payable_check'
          AND conrelid = 'public.transactions'::regclass
    ) THEN
        ALTER TABLE public.transactions
            ADD CONSTRAINT transactions_net_payable_check
            CHECK ("netPayable" >= 0 AND "netPayable" <= 200000000)
            NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'transactions_payout_amount_check'
          AND conrelid = 'public.transactions'::regclass
    ) THEN
        ALTER TABLE public.transactions
            ADD CONSTRAINT transactions_payout_amount_check
            CHECK ("payoutAmount" IS NULL OR ("payoutAmount" >= 0 AND "payoutAmount" <= 50000000))
            NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'transactions_debt_deduction_check'
          AND conrelid = 'public.transactions'::regclass
    ) THEN
        ALTER TABLE public.transactions
            ADD CONSTRAINT transactions_debt_deduction_check
            CHECK ("debtDeduction" >= 0 AND "debtDeduction" <= 50000000)
            NOT VALID;
    END IF;

    -- daily_settlements 表约束
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'daily_settlements_revenue_check'
          AND conrelid = 'public.daily_settlements'::regclass
    ) THEN
        ALTER TABLE public.daily_settlements
            ADD CONSTRAINT daily_settlements_revenue_check
            CHECK ("totalRevenue" IS NULL OR ("totalRevenue" >= 0 AND "totalRevenue" <= 500000000))
            NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'daily_settlements_net_payable_check'
          AND conrelid = 'public.daily_settlements'::regclass
    ) THEN
        ALTER TABLE public.daily_settlements
            ADD CONSTRAINT daily_settlements_net_payable_check
            CHECK ("totalNetPayable" IS NULL OR ("totalNetPayable" >= 0 AND "totalNetPayable" <= 500000000))
            NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'daily_settlements_expenses_check'
          AND conrelid = 'public.daily_settlements'::regclass
    ) THEN
        ALTER TABLE public.daily_settlements
            ADD CONSTRAINT daily_settlements_expenses_check
            CHECK ("totalExpenses" IS NULL OR ("totalExpenses" >= 0 AND "totalExpenses" <= 500000000))
            NOT VALID;
    END IF;
END;
$$;

-- ─── 7. 更新 schema.sql 中的 CHECK 注释 ────────────────────────────────────────
-- (schema.sql 通过后续迁移保持一致)
