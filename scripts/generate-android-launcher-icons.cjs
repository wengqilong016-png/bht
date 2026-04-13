#!/usr/bin/env node
'use strict';

/**
 * Generate Android launcher icons from the PWA icon so the APK icon matches the web icon.
 *
 * Source of truth (design): public/icons/icon-512.png
 *
 * Outputs:
 * - android/app/src/main/res/mipmap-<density>/ic_launcher.png
 * - android/app/src/main/res/mipmap-<density>/ic_launcher_round.png
 * - android/app/src/main/res/mipmap-<density>/ic_launcher_foreground.png
 *
 * Notes:
 * - We keep the existing adaptive icon XML (mipmap-anydpi-v26). It references ic_launcher_foreground.
 * - Foreground sizes match current project convention:
 *   mdpi 108, hdpi 162, xhdpi 216, xxhdpi 324, xxxhdpi 432
 */

const fs = require('fs');
const path = require('path');

const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'public', 'icons', 'icon-512.png');
const RES = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');

function fail(msg) {
  // eslint-disable-next-line no-console
  console.error(`generate-android-launcher-icons: ${msg}`);
  process.exit(1);
}

if (!fs.existsSync(SRC)) {
  fail(`missing source icon: ${SRC}`);
}

const DENSITIES = [
  { name: 'mdpi', icon: 48, fg: 108 },
  { name: 'hdpi', icon: 72, fg: 162 },
  { name: 'xhdpi', icon: 96, fg: 216 },
  { name: 'xxhdpi', icon: 144, fg: 324 },
  { name: 'xxxhdpi', icon: 192, fg: 432 },
];

async function writePng(outPath, size) {
  await fs.promises.mkdir(path.dirname(outPath), { recursive: true });
  const buf = await sharp(SRC).resize(size, size).png().toBuffer();
  await fs.promises.writeFile(outPath, buf);
}

async function main() {
  for (const d of DENSITIES) {
    const dir = path.join(RES, `mipmap-${d.name}`);
    await writePng(path.join(dir, 'ic_launcher.png'), d.icon);
    await writePng(path.join(dir, 'ic_launcher_round.png'), d.icon);
    await writePng(path.join(dir, 'ic_launcher_foreground.png'), d.fg);
  }
  // eslint-disable-next-line no-console
  console.log('generate-android-launcher-icons: updated mipmap assets from public/icons/icon-512.png');
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
