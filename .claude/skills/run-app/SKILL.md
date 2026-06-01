---
name: run-app
description: Use when asked to run, start, launch, or screenshot the BAHATI JACKPOTS (bahati-jackpots) app, or to confirm a change works in the real running app rather than only in tests. Covers the verified dev-server + headless-Chromium drive path on this Android chroot box.
---

# 运行 BAHATI JACKPOTS

## Overview
本仓库是 Vite + React 19 + Supabase 的离线优先 PWA。「运行」= 启动 Vite dev server,再用无头 Chromium 当真实用户访问首屏并截图——不是跑测试、不是 import 内部函数。下面是本机(Android Termux chroot Ubuntu)上**实测可用**的路径。

## 环境前置(必须)
- 任何 `npm`/`node` 命令前先加载 x-cmd:`. ~/.x-cmd.root/X`
- rolldown 绑定用 `@rolldown/binding-linux-arm64-gnu`(已装),不要 android-arm64

## 启动 dev server
```bash
. ~/.x-cmd.root/X
npm run dev          # Vite v8 → http://localhost:3000/ （host 0.0.0.0，约 0.6s 就绪）
```
就绪标志:日志出现 `ready in` / `Local: http://localhost:3000/`。
探活:`curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/` → `200`。

> 端口以 `vite.config.ts` 的 `server.port: 3000` 为准。旧的 `bht-run-screenshot.*` 脚本写的 5175 已过时,勿用。

## 驱动并截图
```bash
. ~/.x-cmd.root/X
node .claude/skills/run-app/drive.mjs        # 访问 + 等 #root 挂载 + 截图 + 抓 console 错误
```
输出:截图 `/tmp/bht-screenshots/01-app.png`,并打印标题/可见文本/控制台错误。

**看截图**:首屏应是登录页(`App.tsx` 的 auth gate)——狮子 Logo、`BAHATI JACKPOTS`、`FIELD OPERATIONS SYSTEM`、EMAIL/PASSWORD 表单、Login Now、中文/EN 切换、`v1.0.15`。空白帧 = 启动失败。

## 关键坑(都已在 drive.mjs 处理)
| 坑 | 处理 |
|----|------|
| Playwright 自带 chromium 启动即崩 | `executablePath: '/usr/local/bin/chromium'` + `--no-sandbox --disable-dev-shm-usage --use-gl=swiftshader` |
| `@playwright/test` 直接给路径会命中 CJS 入口报错 | 在**项目根**运行,用裸标识符 `import pw from '@playwright/test'` 解构 `chromium` |
| dbus / vaapi 报错刷屏 | 噪音,无害;查看时 `grep -vE 'dbus|vaapi'` 过滤 |
| 首屏短暂显示 `CONNECTING.../CHECKING...` | 正常:`isOnline` 冷启动默认 false,5–10s 离线误报窗口(见根 CLAUDE.md) |

## 停止
```bash
pkill -f 'vite/bin/vite.js'
```

## 更深的驱动(登录后界面)
登录需真实 Supabase 凭据(`.env.local` 的 `VITE_SUPABASE_*`)。如要截 driver/admin 界面,在 drive.mjs 里 `page.fill` 邮箱/密码后点 Login Now,再等路由 shell 渲染——`role==='admin'` 进 admin shell,否则进 driver shell(见 `shared/AppRouterShell`)。
