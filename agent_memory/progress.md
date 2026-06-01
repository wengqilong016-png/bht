# 当前任务进度

## 当前目标
发布 Android 2.0.0

## 状态
completed

## 已完成步骤
- [x] 同步远端 `main` 到 bot manifest commit `ed12d64`
- [x] 将 `package.json` / `package-lock.json` 版本升到 `2.0.0`
- [x] 修改 `.github/workflows/build-apk.yml`：main release 构建后发布/覆盖 `main-latest` rolling release，并将 main update manifest 的 `apkUrl` 指向 `releases/download/main-latest/bahati-latest-release.apk`
- [x] `main-latest` rolling release 标记为 prerelease，避免影响正式 GitHub Latest release
- [x] 本地验证：workflow YAML 可解析；`npm run build` 通过
- [x] 推送 release commit `b0423ec821665945d217a1b07c9c9504ad5ff974`
- [x] 创建并推送 `v2.0.0` tag
- [x] GitHub Actions 通过：`CI`、`Build Android APK`、`Release`、`Deploy to Vercel`
- [x] 正式 release `v2.0.0` 已发布，APK asset `bahati-latest-release.apk` 大小 `4451631`
- [x] rolling release `main-latest` 已发布为 prerelease，APK asset `bahati-latest-release.apk` 大小 `4451631`
- [x] 远端 `public/version.json` 已回写到 `2.0.0`，`apkUrl` 指向 `https://github.com/wengqilong016-png/bht/releases/download/v2.0.0/bahati-latest-release.apk`

## 下一步
- 有 Android SDK/adb 或真机后，补跑安装、启动、登录、覆盖更新验证。

## 阻塞项
- 本机缺少 Android SDK/adb/Java，无法本地执行 `apksigner` 或真机安装启动；签名与真机安装结论依赖 GitHub Actions 和后续设备验证。

## 最后更新
2026-06-01 — Android 2.0.0 发布完成
