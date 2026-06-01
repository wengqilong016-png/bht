# 问题与风险记录

## 活跃问题
<!-- 当前未解决的 bug 或异常 -->
<!-- 格式：
- [ ] **问题描述** — 文件/位置 — 严重程度(P0/P1/P2) — 发现日期
  - 根因分析（如已知）
  - 临时规避方案（如有）
-->
- [ ] **远端更新 manifest 指向的 APK 不是最新 Actions APK** — `.github/workflows/build-apk.yml` / `public/version.json` — P1 — 2026-06-01
  - `main/public/version.json` 当前声明 `gitSha=892d098...`，但 `apkUrl=https://github.com/wengqilong016-png/bht/releases/latest/download/bahati-latest-release.apk` 实际下载到 2026-05-08 的 `v1.0.15` release asset。
  - 最新 `Build Android APK` run `26746589657` 的 artifact 是 `892d098...`，但它只是 Actions artifact，未发布到上述公开 release URL。
  - 影响：用户看到线上构建为最新，但点击更新会安装旧 release APK，可能更新后仍反复提示或业务代码不一致。
  - 验证：release URL APK SHA256 `fc42c145...`，Actions artifact APK SHA256 `b4dc8d4...`，两者不同。

## 已知风险
<!-- 不是 bug 但需要注意的技术风险 -->
<!-- 格式：
- **风险描述** — 影响范围 — 触发条件
-->
- **`tz_pulse_snapshots` / `tz_pulse_articles` 是 live 数据源里的 out-of-band 表** — `GET /api/tz-pulse` — 这两张表未出现在 `supabase/migrations/` 或 `supabase/schema.sql`；当前线上端点返回 200，说明不是缺失导致 502。若未来重建数据库或只按 migrations/schema 复制环境，端点可能缺表。
- **无真实测试账号时的逐屏 live 验证不等同完整权限验证** — admin/driver shell — 本轮用缓存用户 + mock auth/profile 进入页面，业务数据请求仍打 live Supabase；因此可验证 schema 400，但不能验证真实用户 RLS/权限路径。

## 已解决（近期）
<!-- 最近解决的问题，保留 3-5 条供参考 -->
<!-- 格式：
- [x] **问题描述** — 解决日期 — 解决方案简述
-->

## 最后更新
2026-06-01 — 记录 APK 分发 URL 指向旧 release asset 问题
