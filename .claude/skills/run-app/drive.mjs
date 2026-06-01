// 用无头 Chromium 驱动 BAHATI JACKPOTS 并截图。
// 用法（先确保 dev server 在 :3000 运行）：
//   . ~/.x-cmd.root/X && node .claude/skills/run-app/drive.mjs
// 可选环境变量：
//   BHT_URL    默认 http://localhost:3000/
//   BHT_OUT    截图输出目录，默认 /tmp/bht-screenshots
import pw from '@playwright/test'; // 在项目根运行时裸标识符可正确解析到 ESM 入口
const { chromium } = pw;
import { existsSync, mkdirSync } from 'fs';

const url = process.env.BHT_URL || 'http://localhost:3000/';
const outDir = process.env.BHT_OUT || '/tmp/bht-screenshots';
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

// 关键：Android chroot 下 Playwright 自带的 chromium 启动即崩，必须用 system chromium。
const browser = await chromium.launch({
  executablePath: '/usr/local/bin/chromium',
  args: [
    '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
    '--disable-gpu', '--use-gl=swiftshader', '--disable-software-rasterizer',
  ],
  headless: true,
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 } }); // 移动端 PWA 视口
const page = await context.newPage();

const errors = [];
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));

console.log('→ 访问', url);
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

// 等待闪屏(#app-loading)消失、React 真正挂载内容到 #root
await page.waitForFunction(() => {
  const root = document.getElementById('root');
  return root && root.children.length > 0;
}, { timeout: 20000 }).catch(() => console.log('⚠ #root 在 20s 内未挂载内容'));

await page.waitForTimeout(1500); // 首屏稳定
await page.screenshot({ path: `${outDir}/01-app.png`, fullPage: false });

console.log('标题:', await page.title());
console.log('URL :', page.url());
const bodyText = await page.locator('body').innerText().catch(() => '');
console.log('可见文本(前 600 字):\n' + bodyText.slice(0, 600));

if (errors.length) {
  console.log('\n控制台错误 (' + errors.length + '):');
  errors.slice(0, 15).forEach((e) => console.log('  -', e));
} else {
  console.log('\n✓ 无控制台错误');
}

await browser.close();
console.log('\n截图已保存到', outDir + '/01-app.png');
