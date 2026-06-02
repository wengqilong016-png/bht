# 当前任务进度

## 当前目标
审查并推送 drivers RLS 泄露修复迁移

## 状态
completed

## 已完成步骤
- [x] 接手 Claude 暂存的 `supabase/migrations/20260601010000_fix_drivers_select_rls_leak.sql`
- [x] 审查 staged diff，确认暂存区只包含新增 RLS 迁移
- [x] 对照 `schema.sql`，确认迁移重建的 `drivers_select` 与快照限制性定义一致
- [x] 确认 `public.is_admin()` / `public.get_my_driver_id()` 已定义并授权给 `authenticated`
- [x] 执行 `git pull --rebase --autostash origin main`，已同步远端 main 后重新审查 diff
- [x] 准备提交并推送：迁移 + 本次 agent_memory 审查记录

## 下一步
- 触发/执行 Supabase 生产迁移部署，并用 live DB 只读查询验证 `drivers_select` 当前策略。
- 继续单独处理 Android `versionCode` 不递增问题。
- 对司机更新 `drivers` 行的列级权限做真实 DB 验证，再决定是否收紧。

## 阻塞项
- 本机无 Supabase CLI/psql，且没有 live DB 查询授权；无法本地实跑迁移或确认生产策略状态。

## 最后更新
2026-06-02 — drivers RLS 迁移审查通过，准备提交推送
