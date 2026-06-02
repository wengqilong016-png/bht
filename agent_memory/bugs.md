# 问题与风险记录

## 活跃问题
<!-- 当前未解决的 bug 或异常 -->
<!-- 格式：
- [ ] **问题描述** — 文件/位置 — 严重程度(P0/P1/P2) — 发现日期
  - 根因分析（如已知）
  - 临时规避方案（如有）
-->
- [ ] **Android `versionCode` 不递增（CI 浅克隆致恒为 1）** — `.github/workflows/build-apk.yml` / `.github/workflows/release.yml` / `android/app/build.gradle` —（修复待部署）— P1 — 2026-06-02
  - 根因分析：CI `actions/checkout@v6` 默认浅克隆 → `git rev-list --count HEAD` 在 CI 恒为 1，被写入 APK 与 `public/version.json`（实测 versionCode=1）。build.gradle 另有两段重复计数，第一段 `+1` 被第二段覆盖（死代码）。本地完整历史计数为 1216。
  - 修复：三处 checkout 加 `fetch-depth: 0`（拉全历史 → 真实计数并递增）；build.gradle 删除重复 `+1` 死代码、统一为纯 count（与 CI 及 `__APP_VERSION_CODE__` 口径一致）。**待部署**；本机无 Android SDK，versionCode 实际产出需 CI 构建后看 `version.json` 确认。
- [ ] **司机可经直接 REST 篡改自己 `drivers` 行的敏感财务列** — `supabase/migrations/20260602000000_enforce_driver_self_update_columns.sql`（修复待部署）— **P1** — 2026-06-02
  - 根因分析（已 live DB 实证，纠正此前误记）：drivers 列级 UPDATE 权限是 **Supabase 平台默认全开**——anon/authenticated 对所有列（含 `baseSalary`/`commissionRate`/`initialDebt`/`remainingDebt`/`id`）均可 UPDATE，仓库内**从无任何列级 REVOKE**（此前「schema 已撤 4 敏感列」的记录与 schema 及生产 `information_schema.column_privileges` 均不符）。RLS UPDATE 策略又放行「driver AND id=get_my_driver_id()」。两层叠加 → 司机可 `PATCH /drivers?id=eq.<self>` 篡改自己的薪资/佣金/债务（财务作弊向量）。
  - 修复：已写 BEFORE UPDATE 触发器 migration——`get_my_role()<>'driver'` 守卫（postgres-owned DEFINER RPC 内 get_my_role 不为 'driver'，自动豁免，已实证）+ to_jsonb allowlist（仅放行 currentGps/lastActive/phone/backgroundPhotoUrl），对齐既有 `enforce_driver_location_update_fields` 模式。**待提交→部署**；行为正确性需 staging 真实 driver JWT 实测（GPS/资料/收款/日结无 403，且恶意改薪被拒）。

## 已知风险
<!-- 不是 bug 但需要注意的技术风险 -->
<!-- 格式：
- **风险描述** — 影响范围 — 触发条件
-->
- **本机缺少 Java/adb/Playwright 浏览器二进制** — Android/浏览器级验证 — 无法本地执行 Gradle、APK 安装启动、logcat、Playwright CLI 首屏快照；前一轮仅完成 Node/Jest/Vite 与静态入口验证。
- **`tz_pulse_snapshots` / `tz_pulse_articles` 已有迁移但仍需生产迁移状态确认** — `GET /api/tz-pulse` / `supabase/migrations/20260601000000_add_tz_pulse_tables.sql` — 表结构已纳入 git；若生产未执行该迁移或远端迁移历史与仓库不一致，仍可能出现环境漂移。
- **无真实测试账号时的逐屏 live 验证不等同完整权限验证** — admin/driver shell — 本轮用缓存用户 + mock auth/profile 进入页面，业务数据请求仍打 live Supabase；因此可验证 schema 400，但不能验证真实用户 RLS/权限路径。

## 已解决（近期）
<!-- 最近解决的问题，保留 3-5 条供参考 -->
<!-- 格式：
- [x] **问题描述** — 解决日期 — 解决方案简述
-->
- [x] **远端更新 manifest 指向旧 APK** — 2026-06-01 — 发布 `v2.0.0`，正式 release APK 与 `main-latest` rolling APK 均已上传；远端 `version.json` 已指向 `v2.0.0` APK URL。
- [x] **`drivers` RLS 泄露修复迁移未纳入 git** — 2026-06-02 — `20260601010000_fix_drivers_select_rls_leak.sql` 已提交并部署；**已 live DB 查 `pg_policies` 确认生产 `drivers` 的 3 条 SELECT 策略均为 admin-or-self，过宽 `TO public` 策略已消除**。

## 最后更新
2026-06-02 — drivers_select 已 live 验证生产收敛；新发现并修复 drivers 列级越权 P1（触发器 migration 待部署）
