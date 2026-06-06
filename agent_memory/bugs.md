# 问题与风险记录

## 活跃问题
<!-- 当前未解决的 bug 或异常 -->
<!-- 格式：
- [ ] **问题描述** — 文件/位置 — 严重程度(P0/P1/P2) — 发现日期
  - 根因分析（如已知）
  - 临时规避方案（如有）
-->
<!-- 当前无活跃 P0/P1 bug。 -->

## 已知风险
<!-- 不是 bug 但需要注意的技术风险 -->
<!-- 格式：
- **风险描述** — 影响范围 — 触发条件
-->
- **本机缺少 Java/adb/Playwright 浏览器二进制** — Android/浏览器级验证 — 无法本地执行 Gradle、APK 安装启动、logcat、Playwright CLI 首屏快照；前一轮仅完成 Node/Jest/Vite 与静态入口验证。
- **`tz_pulse_snapshots` / `tz_pulse_articles` 已有迁移但仍需生产迁移状态确认** — `GET /api/tz-pulse` / `supabase/migrations/20260601000000_add_tz_pulse_tables.sql` — 表结构已纳入 git；若生产未执行该迁移或远端迁移历史与仓库不一致，仍可能出现环境漂移。
- **无真实测试账号时的逐屏 live 验证不等同完整权限验证** — admin/driver shell — 本轮用缓存用户 + mock auth/profile 进入页面，业务数据请求仍打 live Supabase；因此可验证 schema 400，但不能验证真实用户 RLS/权限路径。
- **管理端快速补录的 admin actor 当前写入交易备注而非结构化列** — `admin/ManualCollectionEntryPage.tsx` / `transactions.notes` — 可用于人工审计检索，但若后续需要强审计、报表筛选或防篡改，需要新增结构化审计字段或独立事件表。

## 已解决（近期）
<!-- 最近解决的问题，保留 3-5 条供参考 -->
<!-- 格式：
- [x] **问题描述** — 解决日期 — 解决方案简述
-->
- [x] **远端更新 manifest 指向旧 APK** — 2026-06-01 — 发布 `v2.0.0`，正式 release APK 与 `main-latest` rolling APK 均已上传；远端 `version.json` 已指向 `v2.0.0` APK URL。
- [x] **`drivers` RLS 泄露修复迁移未纳入 git** — 2026-06-02 — `20260601010000_fix_drivers_select_rls_leak.sql` 已提交并部署；**已 live DB 查 `pg_policies` 确认生产 `drivers` 的 3 条 SELECT 策略均为 admin-or-self，过宽 `TO public` 策略已消除**。
- [x] **Android `versionCode` 不递增（CI 浅克隆致恒为 1）** — 2026-06-02 — `Build Android APK` run `26852464217` 成功；日志显示 `APP_VERSION_CODE=1222`、`APP_GIT_SHA=48b0f3b...`；远端 `public/version.json` 为 `versionCode=1222`，下载的 APK 主 JS 也含 `versionCode=1222` 与对应 gitSha。
- [x] **司机可经直接 REST 篡改自己 `drivers` 行的敏感财务列** — 2026-06-02 — 触发器迁移已在生产 up-to-date；新增 `Verify Driver RLS` workflow 并运行 `26855025407` 通过：事务中模拟 authenticated driver，验证本人可见、允许 `lastActive` 更新、拒绝 `baseSalary` 更新、跨司机更新为 0，并已 `ROLLBACK`。

## 最后更新
2026-06-02 — 管理端快速补录已实现；新增记录 admin actor 审计结构化程度的已知风险
