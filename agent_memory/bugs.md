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
- **本机缺少 Java/adb/Playwright 浏览器二进制** — Android/浏览器级验证 — 无法本地执行 Gradle、APK 安装启动、logcat、Playwright CLI 首屏快照。
- **无真实测试账号时的逐屏 live 验证不等同完整权限验证** — admin/driver shell — 用缓存用户 + mock auth/profile 进入页面，业务数据请求仍打 live Supabase；可验证 schema 400，但不能验证真实用户 RLS/权限路径。
- **管理端快速补录的 admin actor 当前写入交易备注而非结构化列** — `admin/ManualCollectionEntryPage.tsx` / `transactions.notes` — 可用于人工审计检索，但若后续需要强审计、报表筛选或防篡改，需要新增结构化审计字段或独立事件表。

## 已解决（近期）
<!-- 最近解决的问题，保留 3-5 条供参考 -->
<!-- 格式：
- [x] **问题描述** — 解决日期 — 解决方案简述
-->
- [x] **所有 API 路由 404（`api/tz-pulse`, `api/scan-meter`, `api/translate`, `api/admin-ai`）** — 2026-06-06 — 根因为 Cloudflare Workers 格式 (`export default { fetch }`) Vercel 不识别；转为 Vercel Edge Functions 格式 (`export default async function handler` + `export const config = { runtime: 'edge' }`)，`vercel.json` 设 `framework: null` 绕过 Vite preset 使函数被正确检测。
- [x] **`tz_pulse_snapshots` / `tz_pulse_articles` 迁移生产状态确认** — 2026-06-06 — `supabase migration list` 确认 `20260601000000` / `20260604000000` 均已在远程记录；`api/tz-pulse` 端点已恢复并返回正确 JSON（数据空因为尚无 population）。
- [x] **远端更新 manifest 指向旧 APK** — 2026-06-01 — 发布 `v2.0.0`，正式 release APK 与 `main-latest` rolling APK 均已上传；远端 `version.json` 已指向 `v2.0.0` APK URL。
- [x] **`drivers` RLS 泄露修复迁移未纳入 git** — 2026-06-02 — `20260601010000_fix_drivers_select_rls_leak.sql` 已提交并部署；**已 live DB 查 `pg_policies` 确认生产 `drivers` 的 3 条 SELECT 策略均为 admin-or-self**。

## 最后更新
2026-06-06 — API 路由全部修复；tz_pulse 风险消除；登录页新增密码可见切换 + 记住我
