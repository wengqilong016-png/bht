---
name: run-app
description: Use when asked to run, start, launch, or screenshot the BAHATI JACKPOTS (bahati-jackpots) app, or to confirm a change works in the real running app rather than only in tests. Covers the verified dev-server + headless-Chromium drive path on this Android chroot box.
---

# 运行 BAHATI JACKPOTS

## Overview
本仓库是 Vite v8 + React 19 + Supabase 的离线优先 PWA。「运行」= 启动 Vite dev server,
再用无头 Chromium 当真实用户访问首屏并截图——不是跑测试、不是 import 内部函数。
驱动脚本是 `.claude/skills/run-app/drive.mjs`(用 `@playwright/test` 的 chromium)。
下面是本机(Android Termux chroot Ubuntu)上**实测可用**的路径,路径都相对仓库根。

## 环境前置(必须)
- node v22 / npm 已在 PATH(`/usr/local/bin/node`、`/usr/local/bin/npm`)。
  > 根 CLAUDE.md 提到的 `. ~/.x-cmd.root/X` 在本容器**不存在**(source 会报 No such file),
  > 直接用 `npm`/`node` 即可,无需 x-cmd。
- **首次必须装依赖**(本机 `node_modules` 默认不存在):
  ```bash
  npm install --no-audit --no-fund      # 实测 ~15s,891 包;rolldown 自动选对 binding-linux-arm64-gnu
  ```
- 不需要 system chromium。`/usr/local/bin/chromium` 在本容器**不存在**;driver 会自动
  从 Playwright 缓存(`~/.cache/ms-playwright/chromium-*/chrome-linux/chrome`)里挑一个能用的。

## 配置 Supabase 连接(不配也能跑,但会显示 CONFIG MISSING)
没有 `.env.local` 时登录页照样渲染,但会盖一层 `FRONTEND CONFIG MISSING` 提示、状态是 `NO CONNECTION`。
要看到正常 `CONNECTED` 登录页,写入 `.env.local`(已被 .gitignore 忽略,anon key 是前端公开值):
```bash
cat > .env.local <<'EOF'
VITE_SUPABASE_URL=https://edohkcvzaisrxunwnlvk.supabase.co
VITE_SUPABASE_ANON_KEY=<anon/publishable key>
EOF
```
> URL 与 anon key 可从 Supabase 集成读取(项目 ref `edohkcvzaisrxunwnlvk`,名 `b-ht`),
> 或 Supabase Dashboard → Settings → API。改了 `.env.local` 要重启 dev server 才生效。

## 启动 dev server
```bash
npm run dev                       # Vite v8 → http://localhost:3000/（约 0.4s ready）
```
就绪标志:日志出现 `ready in` / `Local: http://localhost:3000/`。
探活:`curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/` → `200`。
> 端口以 `vite.config.ts` 的 `server.port: 3000` 为准。

## 驱动并截图(agent 主路径)
```bash
node .claude/skills/run-app/drive.mjs        # 访问 + 等 #root 挂载 + 截图 + 抓 console 错误
```
输出:截图 `/tmp/bht-screenshots/01-app.png`(390×844 移动端视口),并打印标题/可见文本/控制台错误。
可选环境变量:`BHT_URL`(默认 `http://localhost:3000/`)、`BHT_OUT`(截图目录)、`BHT_CHROMIUM`(强制指定 chromium 路径)。

**看截图**:配好 `.env.local` 后,首屏应是登录页——狮子 Logo、`BAHATI JACKPOTS`、
`FIELD OPERATIONS SYSTEM`、EMAIL/PASSWORD 表单、`Login Now`、中文/EN 切换、右上角 `CONNECTED`、
底部 `v2.0.0`。空白帧或只剩 `FRONTEND CONFIG MISSING` = 没配 env 或启动失败。

## 关键坑(都已在 drive.mjs 处理)
| 坑 | 处理 |
|----|------|
| 装的 `@playwright/test` 想要的 chromium build 号常和 `~/.cache/ms-playwright` 里的对不上(报 `Executable doesn't exist at .../chromium_headless_shell-XXXX`) | driver 不依赖 Playwright 默认解析,直接在缓存里 glob `chromium-*/chrome-linux/chrome` 当 `executablePath`(本机 1228 实测可用,Chromium 149) |
| README/旧 driver 写死 `/usr/local/bin/chromium` | 本容器没有该文件;driver 改成「环境变量 → 系统 chromium → 缓存 chromium」依次回退 |
| chromium 在 chroot 下需特殊 flag | `--no-sandbox --disable-dev-shm-usage --use-gl=swiftshader --disable-gpu`(已在 driver) |
| dbus / vaapi / Vulkan 报错刷屏 | 噪音,无害;查看时 `grep -vE 'dbus|vaapi|Vulkan'` 过滤 |
| 没配 `.env.local` | 登录页仍渲染,但显示 `FRONTEND CONFIG MISSING` + `NO CONNECTION`(见上「配置 Supabase」) |
| 首屏短暂 `CONNECTING.../CHECKING...` | 正常:`isOnline` 冷启动默认 false,有几秒离线误报窗口(见根 CLAUDE.md) |

## 停止
```bash
pkill -f 'vite/bin/vite.js'
```

## 更深的驱动(登录后界面)
登录需真实 Supabase 用户凭据。要截 driver/admin 界面,在 drive.mjs 里 `page.fill` 邮箱/密码后
点 `Login Now`,再等路由 shell 渲染——`role==='admin'` 进 admin shell,否则进 driver shell
(见 `shared/AppRouterShell`)。
