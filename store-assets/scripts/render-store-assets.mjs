#!/usr/bin/env node
/**
 * ReMark Store Assets — final PNG renderer.
 *
 * Renders every editable layout at its exact final dimension with a local
 * headless browser, then writes an RGB PNG (no alpha) into exports/.
 *
 * Usage (repo root served on 127.0.0.1:4174):
 *   node store-assets/scripts/render-store-assets.mjs
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
function loadPlaywrightCore() {
  try { return require('playwright-core'); } catch (_) {}
  try {
    const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
    return require(path.join(globalRoot, 'playwright-core'));
  } catch (_) {}
  throw new Error('playwright-core is required. Run: npm i -g playwright-core');
}
const { chromium } = loadPlaywrightCore();

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const STORE_ROOT = process.env.STORE_ASSETS_ROOT
  ? path.resolve(process.env.STORE_ASSETS_ROOT)
  : path.resolve(SCRIPT_DIR, '..');
const SOURCE_PREFIX = process.env.SOURCE_PREFIX || '/store-assets';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4174';

const MANIFEST = [
  { source: 'screenshots/01-hero.html', output: 'exports/01-hero.png', width: 1280, height: 800 },
  { source: 'screenshots/02-text-mark.html', output: 'exports/02-text-mark.png', width: 1280, height: 800 },
  { source: 'screenshots/03-video-mark.html', output: 'exports/03-video-mark.png', width: 1280, height: 800 },
  { source: 'screenshots/04-note.html', output: 'exports/04-note.png', width: 1280, height: 800 },
  { source: 'screenshots/05-find-way-back.html', output: 'exports/05-find-way-back.png', width: 1280, height: 800 },
  { source: 'promo/small-promo.html', output: 'exports/small-promo.png', width: 440, height: 280 },
  { source: 'promo/marquee.html', output: 'exports/marquee.png', width: 1400, height: 560 }
];

async function main() {
  await mkdir(path.join(STORE_ROOT, 'exports'), { recursive: true });
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
  } catch (_) {
    browser = await chromium.launch({ headless: true });
  }

  const results = [];
  try {
    const context = await browser.newContext({ deviceScaleFactor: 1 });
    for (const item of MANIFEST) {
      const page = await context.newPage();
      await page.setViewportSize({ width: item.width, height: item.height });
      const url = `${BASE}${SOURCE_PREFIX}/${item.source}`;
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts?.ready);
      const outPath = path.join(STORE_ROOT, item.output);
      await page.screenshot({ path: outPath });
      await page.close();
      results.push({ ...item, ok: true });
      console.log(`rendered ${item.output} (${item.width}x${item.height})`);
    }
    await context.close();
  } finally {
    await browser.close();
  }

  await writeFile(
    path.join(STORE_ROOT, 'exports', 'export-manifest.json'),
    JSON.stringify(results.map(({ source, output, width, height }) => ({ source, output, width, height })), null, 2)
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
