-- 安全修复：drivers 表 RLS 越权读（跨司机泄露 baseSalary / initialDebt 等财务字段）。
--
-- 背景：生产库 drivers 表上存在一条 out-of-band 手工创建、从未纳入迁移的过宽策略：
--     CREATE POLICY drivers_select ON public.drivers FOR SELECT TO public
--         USING (auth.role() = 'authenticated');
-- PostgreSQL 多条 PERMISSIVE 策略按 OR 合并，该策略与限制性的
-- drivers_admin_or_self_select_* 策略 OR 后，使任何已登录司机可读取全体司机行
-- （含薪资、债务）。经以 driver 角色 JWT 直查 REST 实证：返回全部 10 名司机。
--
-- 修复：将 drivers_select 替换为「admin 或本人」的限制性定义（与 schema.sql 一致）。
-- 幂等：DROP IF EXISTS + CREATE；在不含该策略的全新库上 DROP 为 no-op。
-- 影响：driver 仅能读自己的 drivers 行；admin 经 is_admin() 仍可读全部。

DROP POLICY IF EXISTS drivers_select ON public.drivers;

CREATE POLICY drivers_select ON public.drivers FOR SELECT TO authenticated
    USING (public.is_admin() OR id = public.get_my_driver_id());
