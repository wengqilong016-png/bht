# 问题与风险记录

## 活跃问题
<!-- 当前未解决的 bug 或异常 -->
<!-- 格式：
- [ ] **问题描述** — 文件/位置 — 严重程度(P0/P1/P2) — 发现日期
  - 根因分析（如已知）
  - 临时规避方案（如有）
-->
- [ ] **Android `versionCode` 可能不递增且 manifest 已写成 `2`** — `.github/workflows/build-apk.yml` / `.github/workflows/release.yml` / `android/app/build.gradle` / `public/version.json` — P1 — 2026-06-02
  - 根因分析：CI 使用 `actions/checkout@v6` 默认浅克隆，随后以 `git rev-list --count HEAD` 生成 `versionCode`；浅克隆下计数通常为 1。`android/app/build.gradle` 还存在两段重复计数逻辑，第一段 `+1` 会被第二段覆盖。当前完整本地历史计数为 1213，但 `public/version.json` 为 `versionCode: 2`。
  - 影响：Android 覆盖更新依赖 `versionCode` 递增；若 APK 与远端 manifest 长期保持低值或不递增，未来安装/更新判断可能失败或混乱。
- [ ] **司机可更新 `drivers` 自己行的列面可能大于注释意图** — `supabase/schema.sql` / `repositories/driverRepository.ts` — P2 — 2026-06-02
  - 根因分析：RLS 注释称司机更新用于 GPS / lastActive，但策略允许司机更新自己的整行；schema 只撤销 `baseSalary`、`commissionRate`、`initialDebt`、`remainingDebt` 四个敏感列。Repository 的批量更新 payload 包含 `name`、`username`、`dailyFloatingCoins`、`status` 等字段。
  - 影响：若客户端路径或恶意请求以司机 JWT 调用 update，除被 REVOKE 的敏感字段外，可能改动超出 GPS/lastActive 的业务字段。需用真实 DB 权限验证后决定是否加列级 GRANT/REVOKE 或触发器约束。

## 已知风险
<!-- 不是 bug 但需要注意的技术风险 -->
<!-- 格式：
- **风险描述** — 影响范围 — 触发条件
-->
- **`drivers_select` 生产策略状态仍需 live DB 验证** — `supabase/migrations/20260601010000_fix_drivers_select_rls_leak.sql` — 本轮已将修复迁移纳入提交范围，但本机无 Supabase CLI/psql 且没有 live DB 只读查询授权；仍需部署后查询 `pg_policies` 确认生产策略已从过宽 `TO public` 收敛到 admin-or-self。
- **本机缺少 Java/adb/Playwright 浏览器二进制** — Android/浏览器级验证 — 无法本地执行 Gradle、APK 安装启动、logcat、Playwright CLI 首屏快照；前一轮仅完成 Node/Jest/Vite 与静态入口验证。
- **`tz_pulse_snapshots` / `tz_pulse_articles` 已有迁移但仍需生产迁移状态确认** — `GET /api/tz-pulse` / `supabase/migrations/20260601000000_add_tz_pulse_tables.sql` — 表结构已纳入 git；若生产未执行该迁移或远端迁移历史与仓库不一致，仍可能出现环境漂移。
- **无真实测试账号时的逐屏 live 验证不等同完整权限验证** — admin/driver shell — 本轮用缓存用户 + mock auth/profile 进入页面，业务数据请求仍打 live Supabase；因此可验证 schema 400，但不能验证真实用户 RLS/权限路径。

## 已解决（近期）
<!-- 最近解决的问题，保留 3-5 条供参考 -->
<!-- 格式：
- [x] **问题描述** — 解决日期 — 解决方案简述
-->
- [x] **远端更新 manifest 指向旧 APK** — 2026-06-01 — 发布 `v2.0.0`，正式 release APK 与 `main-latest` rolling APK 均已上传；远端 `version.json` 已指向 `v2.0.0` APK URL。
- [x] **`drivers` RLS 泄露修复迁移未纳入 git** — 2026-06-02 — 新增并审查 `20260601010000_fix_drivers_select_rls_leak.sql`，用于删除过宽 `drivers_select` 并重建为 `authenticated` admin-or-self 策略；生产执行结果仍需部署后验证。

## 最后更新
2026-06-02 — drivers RLS 迁移审查通过，保留生产策略验证风险
