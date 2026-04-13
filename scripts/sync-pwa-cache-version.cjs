#!/usr/bin/env node
'use strict';

/**
 * Keep `public/sw.js` cache name in sync with `public/version.json`.
 *
 * Why:
 * - PWA updates can get stuck in stale caches if the SW cache namespace never changes.
 * - We already publish `public/version.json` with `Cache-Control: no-store`.
 * - When `version.json` changes, bumping the SW cache name makes the update deterministic.
 *
 * Modes:
 * - default: write `public/sw.js` if out of date
 * - --check: verify only (no write), exit non-zero if mismatch
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CHECK_ONLY = process.argv.includes('--check');

function readJsonIfExists(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function fail(msg) {
  // eslint-disable-next-line no-console
  console.error(`sync-pwa-cache-version: ${msg}`);
  process.exit(1);
}

const versionJsonPath = path.join(ROOT, 'public', 'version.json');
const pkgJsonPath = path.join(ROOT, 'package.json');
const swPath = path.join(ROOT, 'public', 'sw.js');

const pkg = readJsonIfExists(pkgJsonPath);
const versionJson = readJsonIfExists(versionJsonPath);

const version = (versionJson && typeof versionJson.version === 'string' && versionJson.version) ||
  (pkg && typeof pkg.version === 'string' && pkg.version) ||
  '0.0.0';

const gitSha =
  (versionJson && typeof versionJson.gitSha === 'string' && versionJson.gitSha) ||
  process.env.APP_GIT_SHA ||
  process.env.GITHUB_SHA ||
  '';

const shortSha = gitSha ? String(gitSha).slice(0, 7) : 'local';
const desiredCacheName = `bahati-pro-${version}-${shortSha}`;

let swText;
try {
  swText = fs.readFileSync(swPath, 'utf8');
} catch (err) {
  fail(`could not read ${swPath}: ${err instanceof Error ? err.message : String(err)}`);
}

const re = /^const CACHE_NAME = '([^']+)';/m;
const match = swText.match(re);
if (!match) {
  fail(`could not find CACHE_NAME assignment in ${swPath}`);
}

const current = match[1];
if (current === desiredCacheName) {
  process.exit(0);
}

if (CHECK_ONLY) {
  fail(`CACHE_NAME mismatch: current="${current}", desired="${desiredCacheName}"`);
}

const nextText = swText.replace(re, `const CACHE_NAME = '${desiredCacheName}';`);
fs.writeFileSync(swPath, nextText, 'utf8');

// eslint-disable-next-line no-console
console.log(`sync-pwa-cache-version: updated CACHE_NAME -> ${desiredCacheName}`);

