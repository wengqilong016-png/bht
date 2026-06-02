-- 安全修复（P1）：阻止司机经直接 REST 篡改自己 drivers 行的敏感列。
--
-- 漏洞：anon/authenticated 对 drivers 拥有平台默认的全列 UPDATE 权限（含
-- baseSalary/commissionRate/initialDebt/remainingDebt/id 等），RLS 的 UPDATE 策略
-- 又放行「driver AND id = get_my_driver_id()」。两层叠加，PostgREST 即允许司机用
-- 自己的 JWT 执行 PATCH /drivers?id=eq.<self> 篡改薪资/佣金/债务。经
-- information_schema.column_privileges + pg_policies 实证（未写生产）。
-- RLS 只能做行级、无法做列级限制，故用 BEFORE UPDATE 触发器补列级约束。
--
-- 守卫与同类的 enforce_driver_location_update_fields（locations 表）保持一致：
--   SECURITY DEFINER + 仅当 get_my_role() = 'driver' 时检查。理由（经生产实证）：
--   submit_collection_v2 等司机触发的 postgres-owned SECURITY DEFINER RPC 内部，
--   get_my_role() 不返回 'driver'——否则 locations 上的同类触发器早已阻断收款：
--   submit_collection_v2 会 UPDATE locations.lastScore，而 lastScore 在该触发器的禁止
--   列内，收款在生产正常运行即反证。get_my_role() 只依赖 auth 上下文、与所在 RPC 写
--   哪张表无关，故该豁免对所有写 drivers 的 RPC 同样成立（均为 postgres-owned DEFINER
--   且不操纵 auth 上下文，已逐一核对）。admin（get_my_role()='admin'）经此豁免。
--   anon 在触发器层被豁免（'' <> 'driver'），改由 RLS 的 UPDATE 策略拦截（要求
--   admin/driver）——与 locations 触发器的选择一致。
--
-- 列检查刻意采用 to_jsonb allowlist（而非 sibling 的 blocklist 列举）：司机仅可改
-- 自己行的 currentGps/lastActive（GPS 心跳）与 phone/backgroundPhotoUrl（资料编辑，
-- 经司机端代码核对）；任何非 allowlist 列变化即拒绝。将来新增敏感列默认受保护，
-- 不随 schema 演进腐烂。请勿"修正"为 blocklist。
--
-- 与既有 AFTER UPDATE 审计触发器 audit_driver_changes 互不干扰（本触发器 BEFORE，
-- 拦在写入前；审计触发器 AFTER，记录已发生的合法变更）。

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_driver_self_update_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF COALESCE(public.get_my_role(), '') <> 'driver' THEN
    RETURN NEW;
  END IF;

  IF (to_jsonb(NEW) - 'currentGps' - 'lastActive' - 'phone' - 'backgroundPhotoUrl')
     IS DISTINCT FROM
     (to_jsonb(OLD) - 'currentGps' - 'lastActive' - 'phone' - 'backgroundPhotoUrl') THEN
    RAISE EXCEPTION '司机仅可更新自己行的 currentGps/lastActive/phone/backgroundPhotoUrl，禁止修改受保护列'
      USING ERRCODE = '42501'; -- insufficient_privilege → PostgREST 返回 403
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_driver_self_update_columns ON public.drivers;
CREATE TRIGGER trg_enforce_driver_self_update_columns
  BEFORE UPDATE ON public.drivers
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_driver_self_update_columns();

COMMIT;
