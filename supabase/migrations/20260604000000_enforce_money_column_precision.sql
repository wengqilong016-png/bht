-- 账目金额列精度与约束统一（优化清单第 1 项：金额精度约束）
--
-- 背景（经线上库 information_schema + 数据实证，只读核查，未改生产）：
-- transactions / daily_settlements / monthly_payrolls / drivers / finance_audit_log /
-- amount_validation_audit 的金额列此前为「裸 numeric」（无 precision/scale），且多为 nullable。
-- 问题：(1) 无标度无法保证金额精度统一；(2) NULL 与 0 语义混淆，会让 SUM/对账静默出错。
--
-- 货币为 TZS（坦桑尼亚先令，实务无小数）。实测现有数据：所有金额列 scale ≤ 0、无 NULL、
-- 最大值约 3,132,000（daily_settlements.shortage）。统一 numeric(14,2)（整数部 12 位，
-- 容量充足且预留小数余地）对现有数据零截断。已用 pg_depend 确认无任何 view/matview 引用这些列，
-- 故 ALTER TYPE 可直接执行（被视图引用的列改类型会被 PostgreSQL 拒绝）。
-- 已将完整变更在 BEGIN;…ROLLBACK; 事务内预跑一次，全部语句无报错。
--
-- 本 migration 刻意只做「精度统一 + 铁定非负列的 CHECK + 已带 DEFAULT 0 列的 NOT NULL」。
-- 以下三类高风险项【刻意推迟】，因其会拒绝未来合法写入：
--   1. 可能为负列的 CHECK：daily_settlements.shortage（已实测存在 -505，盈余/短缺可负）、
--      transactions.netPayable、daily_settlements.totalNetPayable、monthly_payrolls.netPayable
--      （司机可能倒欠）。
--   2. 边界列的 CHECK：transactions.ownerRetention、transactions.coinExchange、
--      drivers.remainingDebt —— financeCalculator 未见 floor 到 0 的证据，保守不加。
--   3. 审计表值列（finance_audit_log.old/new_value、amount_validation_audit.submitted_value/
--      allowed_max）—— append-only 日志须能记录任意值（含负），概念上不应加 CHECK，仅统一精度。
--   4. 无 DEFAULT 列（revenue/commission/ownerRetention/netPayable）及结算流程列
--      （actualCash/expectedTotal/checkIn…）的 NOT NULL —— 其 NULL 含「尚未计算/未填」语义，
--      强制 DEFAULT 0 会把「缺失」与「0」混为一谈。保持 nullable。

BEGIN;

-- ============ 1) 精度统一 numeric(14,2)（全部金额列） ============
ALTER TABLE public.transactions
  ALTER COLUMN revenue TYPE numeric(14,2),
  ALTER COLUMN commission TYPE numeric(14,2),
  ALTER COLUMN "ownerRetention" TYPE numeric(14,2),
  ALTER COLUMN "debtDeduction" TYPE numeric(14,2),
  ALTER COLUMN "startupDebtDeduction" TYPE numeric(14,2),
  ALTER COLUMN expenses TYPE numeric(14,2),
  ALTER COLUMN "coinExchange" TYPE numeric(14,2),
  ALTER COLUMN "netPayable" TYPE numeric(14,2),
  ALTER COLUMN "payoutAmount" TYPE numeric(14,2),
  ALTER COLUMN tip TYPE numeric(14,2),
  ALTER COLUMN "extraIncome" TYPE numeric(14,2);

ALTER TABLE public.daily_settlements
  ALTER COLUMN "totalRevenue" TYPE numeric(14,2),
  ALTER COLUMN "totalNetPayable" TYPE numeric(14,2),
  ALTER COLUMN "totalExpenses" TYPE numeric(14,2),
  ALTER COLUMN "driverFloat" TYPE numeric(14,2),
  ALTER COLUMN "expectedTotal" TYPE numeric(14,2),
  ALTER COLUMN "actualCash" TYPE numeric(14,2),
  ALTER COLUMN "actualCoins" TYPE numeric(14,2),
  ALTER COLUMN shortage TYPE numeric(14,2),
  ALTER COLUMN "settlementExpenseAmount" TYPE numeric(14,2);

ALTER TABLE public.monthly_payrolls
  ALTER COLUMN "baseSalary" TYPE numeric(14,2),
  ALTER COLUMN commission TYPE numeric(14,2),
  ALTER COLUMN "privateLoanDeduction" TYPE numeric(14,2),
  ALTER COLUMN "shortageDeduction" TYPE numeric(14,2),
  ALTER COLUMN "netPayable" TYPE numeric(14,2),
  ALTER COLUMN "totalRevenue" TYPE numeric(14,2);

ALTER TABLE public.drivers
  ALTER COLUMN "initialDebt" TYPE numeric(14,2),
  ALTER COLUMN "remainingDebt" TYPE numeric(14,2),
  ALTER COLUMN "dailyFloatingCoins" TYPE numeric(14,2),
  ALTER COLUMN "baseSalary" TYPE numeric(14,2);

-- 审计表：仅统一精度，不加 CHECK（须能记录任意值含负）
ALTER TABLE public.finance_audit_log
  ALTER COLUMN old_value TYPE numeric(14,2),
  ALTER COLUMN new_value TYPE numeric(14,2);

ALTER TABLE public.amount_validation_audit
  ALTER COLUMN submitted_value TYPE numeric(14,2),
  ALTER COLUMN allowed_max TYPE numeric(14,2);

-- ============ 2) NOT NULL（仅已带 DEFAULT 0 的列，先回填防御并发 NULL） ============
UPDATE public.transactions SET
  "debtDeduction"        = COALESCE("debtDeduction", 0),
  "startupDebtDeduction" = COALESCE("startupDebtDeduction", 0),
  expenses               = COALESCE(expenses, 0),
  "coinExchange"         = COALESCE("coinExchange", 0),
  "extraIncome"          = COALESCE("extraIncome", 0),
  "payoutAmount"         = COALESCE("payoutAmount", 0),
  tip                    = COALESCE(tip, 0)
WHERE "debtDeduction" IS NULL OR "startupDebtDeduction" IS NULL OR expenses IS NULL
   OR "coinExchange" IS NULL OR "extraIncome" IS NULL OR "payoutAmount" IS NULL OR tip IS NULL;

ALTER TABLE public.transactions
  ALTER COLUMN "debtDeduction" SET NOT NULL,
  ALTER COLUMN "startupDebtDeduction" SET NOT NULL,
  ALTER COLUMN expenses SET NOT NULL,
  ALTER COLUMN "coinExchange" SET NOT NULL,
  ALTER COLUMN "extraIncome" SET NOT NULL,
  ALTER COLUMN "payoutAmount" SET NOT NULL,
  ALTER COLUMN tip SET NOT NULL;

UPDATE public.drivers SET
  "initialDebt"        = COALESCE("initialDebt", 0),
  "remainingDebt"      = COALESCE("remainingDebt", 0),
  "dailyFloatingCoins" = COALESCE("dailyFloatingCoins", 0),
  "baseSalary"         = COALESCE("baseSalary", 300000)
WHERE "initialDebt" IS NULL OR "remainingDebt" IS NULL
   OR "dailyFloatingCoins" IS NULL OR "baseSalary" IS NULL;

ALTER TABLE public.drivers
  ALTER COLUMN "initialDebt" SET NOT NULL,
  ALTER COLUMN "remainingDebt" SET NOT NULL,
  ALTER COLUMN "dailyFloatingCoins" SET NOT NULL,
  ALTER COLUMN "baseSalary" SET NOT NULL;

-- ============ 3) CHECK (>= 0)（仅铁定非负列；命名约束便于将来单独放开） ============
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS chk_transactions_amounts_nonneg;
ALTER TABLE public.transactions ADD CONSTRAINT chk_transactions_amounts_nonneg CHECK (
  revenue >= 0 AND commission >= 0 AND expenses >= 0 AND "debtDeduction" >= 0
  AND "startupDebtDeduction" >= 0 AND "payoutAmount" >= 0 AND tip >= 0 AND "extraIncome" >= 0);

ALTER TABLE public.daily_settlements DROP CONSTRAINT IF EXISTS chk_daily_settlements_amounts_nonneg;
ALTER TABLE public.daily_settlements ADD CONSTRAINT chk_daily_settlements_amounts_nonneg CHECK (
  "totalRevenue" >= 0 AND "totalExpenses" >= 0 AND "actualCash" >= 0 AND "actualCoins" >= 0
  AND "driverFloat" >= 0 AND "expectedTotal" >= 0 AND "settlementExpenseAmount" >= 0);

ALTER TABLE public.monthly_payrolls DROP CONSTRAINT IF EXISTS chk_monthly_payrolls_amounts_nonneg;
ALTER TABLE public.monthly_payrolls ADD CONSTRAINT chk_monthly_payrolls_amounts_nonneg CHECK (
  "baseSalary" >= 0 AND commission >= 0 AND "privateLoanDeduction" >= 0
  AND "shortageDeduction" >= 0 AND "totalRevenue" >= 0);

ALTER TABLE public.drivers DROP CONSTRAINT IF EXISTS chk_drivers_amounts_nonneg;
ALTER TABLE public.drivers ADD CONSTRAINT chk_drivers_amounts_nonneg CHECK (
  "initialDebt" >= 0 AND "baseSalary" >= 0 AND "dailyFloatingCoins" >= 0);

COMMIT;
