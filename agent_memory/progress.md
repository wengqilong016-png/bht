# 当前任务进度

## 当前目标
发布 Android 2.0.0

## 状态
in_progress

## 已完成步骤
- [x] 同步远端 `main` 到 bot manifest commit `ed12d64`
- [x] 将 `package.json` / `package-lock.json` 版本升到 `2.0.0`
- [x] 修改 `.github/workflows/build-apk.yml`：main release 构建后发布/覆盖 `main-latest` rolling release，并将 main update manifest 的 `apkUrl` 指向 `releases/download/main-latest/bahati-latest-release.apk`
- [x] `main-latest` rolling release 标记为 prerelease，避免影响正式 GitHub Latest release
- [x] 本地验证：workflow YAML 可解析；`npm run build` 通过

## 下一步
- 提交并推送 release commit
- 创建并推送 `v2.0.0` tag，触发正式 release workflow
- 检查 `CI`、`Build Android APK`、`Release` workflow 结果，确认 APK 资产和 manifest URL

## 阻塞项
- 本机缺少 Android SDK/adb/Java，无法本地执行 `apksigner` 或真机安装启动；签名与真机安装结论依赖 GitHub Actions 和后续设备验证。

## 最后更新
2026-06-01 — 2.0.0 版本与 APK rolling release workflow 准备完成
