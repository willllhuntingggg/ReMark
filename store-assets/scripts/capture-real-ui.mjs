#!/usr/bin/env node
/**
 * ReMark Store Assets — real UI capture.
 *
 * Renders the CURRENT ReMark product files with a presentation-state
 * adapter (mock chrome runtime + seeded storage) and captures:
 *   - the real text highlight from content/content.js
 *   - the real Side Panel from sidepanel/sidepanel.html/css/js
 *   - a live YouTube player page for the video context
 *
 * It never edits production extension files.
 *
 * Usage:
 *   python3 -m http.server 4180 --bind 127.0.0.1   (repo root)
 *   node store-assets/scripts/capture-real-ui.mjs
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
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
const OUT = path.join(STORE_ROOT, 'assets', 'raw');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4174';
const ARTICLE_URL = `${BASE}${SOURCE_PREFIX}/sources/reading-demo.html`;
const PANEL_URL = `${BASE}${SOURCE_PREFIX}/sources/sidepanel-demo.html`;
const YOUTUBE_URL = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function launchBrowser() {
  try {
    return await chromium.launch({ channel: 'chrome', headless: true });
  } catch (_) {
    return chromium.launch({ headless: true });
  }
}

async function captureArticle(page) {
  await page.setViewportSize({ width: 1100, height: 880 });
  await page.goto(ARTICLE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('mark.remark-highlight-mark', { timeout: 15000 });
  // Let highlight + note control settle.
  await sleep(900);
  await page.evaluate(() => {
    const mark = document.querySelector('mark.remark-highlight-mark');
    mark?.scrollIntoView({ block: 'center', inline: 'center' });
  });
  await sleep(500);

  // Wide contextual shot: the passage in its reading flow.
  await page.screenshot({ path: path.join(OUT, 'article-highlight.png') });

  // Tight passage crop for the Text Mark screenshot.
  const box = await page.evaluate(() => {
    const mark = document.querySelector('mark.remark-highlight-mark');
    const rect = mark.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const note = mark.querySelector('.remark-note-control');
    const noteRect = note ? note.getBoundingClientRect() : rect;
    const topPad = Math.max(70, rect.top - noteRect.top + 26);
    return {
      x: Math.max(0, rect.left - 110),
      y: Math.max(0, rect.top - topPad),
      width: Math.min(920, rect.right - rect.left + 240),
      height: rect.height + topPad + 150,
      dpr
    };
  });
  await page.screenshot({
    path: path.join(OUT, 'article-passage.png'),
    clip: {
      x: Math.round(box.x),
      y: Math.round(box.y),
      width: Math.round(box.width),
      height: Math.round(box.height)
    }
  });
  const markRect = await page.evaluate(() => {
    const r = document.querySelector('mark.remark-highlight-mark').getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  return { width: 1100, height: 880, dpr: box.dpr, scrollY: await page.evaluate(() => window.scrollY), markRect };
}

async function capturePanel(page) {
  await page.setViewportSize({ width: 440, height: 520 });
  await page.goto(PANEL_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.mark-card', { timeout: 15000 });
  await page.waitForFunction(() => document.querySelectorAll('.mark-card').length >= 2, { timeout: 15000 });
  await sleep(700);

  await page.screenshot({ path: path.join(OUT, 'sidepanel-text-note.png') });

  const videoCard = page.locator('.mark-card--video');
  if (await videoCard.count()) {
    await videoCard.screenshot({ path: path.join(OUT, 'sidepanel-video-card.png') });
  }
  const cardCount = await page.locator('.mark-card').count();
  const rectOf = async (sel) => {
    const el = await page.$(sel);
    if (!el) return null;
    const box = await el.boundingBox();
    return box ? { x: box.x, y: box.y, width: box.width, height: box.height } : null;
  };
  return {
    width: 440,
    height: 520,
    cards: cardCount,
    videoCardRect: await rectOf('.mark-card--video'),
    textCardRect: await rectOf('.mark-card--highlight')
  };
}

async function captureYouTube(page) {
  // Keep the player on its real cued thumbnail (poster + play button) so the
  // screenshot shows authentic YouTube UI instead of a blank headless frame.
  await page.route(/googlevideo\.com\//, (route) => route.abort());
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(YOUTUBE_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  try {
    await page.waitForSelector('#movie_player', { timeout: 30000 });
  } catch (_) {
    // Keep whatever rendered; the watch page itself is authentic context.
  }
  await sleep(9000);
  try {
    await page.waitForSelector('.ytp-cued-thumbnail-overlay-image:visible, .ytp-large-play-button:visible', { timeout: 12000 });
  } catch (_) {}
  const player = page.locator('#movie_player');
  if (await player.count()) {
    await player.screenshot({ path: path.join(OUT, 'youtube-video-mark.png') });
    return { shot: 'player' };
  }
  await page.screenshot({ path: path.join(OUT, 'youtube-video-mark.png') });
  return { shot: 'page' };
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await launchBrowser();
  const report = {
    extensionId: 'fignfifoniblkonapihmkfakmlgkbkcf',
    articleUrl: ARTICLE_URL,
    panelUrl: PANEL_URL,
    youtubeUrl: YOUTUBE_URL,
    generatedAt: new Date().toISOString(),
    source: 'current ReMark product files + live YouTube page'
  };
  try {
    const context = await browser.newContext({ deviceScaleFactor: 2 });
    const page = await context.newPage();
    report.article = await captureArticle(page);
    report.panel = await capturePanel(page);
    await context.close();

    const ytContext = await browser.newContext({ deviceScaleFactor: 2, locale: 'en-US' });
    const ytPage = await ytContext.newPage();
    report.youtube = await captureYouTube(ytPage);
    await ytContext.close();
  } finally {
    await browser.close();
  }

  await writeFile(path.join(STORE_ROOT, 'assets', 'capture-report.json'), JSON.stringify(report, null, 2));
  await writeFile(path.join(STORE_ROOT, 'assets', 'capture-manifest.json'), JSON.stringify({
    extensionId: report.extensionId,
    articleUrl: report.articleUrl,
    panelUrl: report.panelUrl,
    youtubeUrl: report.youtubeUrl,
    generatedAt: report.generatedAt,
    source: 'live ReMark product files (content.js, sidepanel.html/css/js) + YouTube'
  }, null, 2));
  console.log('Capture report:', JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
