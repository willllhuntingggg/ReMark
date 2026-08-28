#!/usr/bin/env node
/**
 * ReMark Store Assets — demo harness builder.
 *
 * Generates sources/sidepanel-demo.html from the REAL product file
 * sidepanel/sidepanel.html. The only edits are:
 *   1. resource paths (absolute /sidepanel, /lib) so the demo works from a
 *      repo-root static server,
 *   2. two adapter scripts (chrome mock + seeded storage) so the real
 *      sidepanel logic can run in a plain browser page.
 * The product markup, styles, and behavior are untouched.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const STORE_ROOT = path.resolve(SCRIPT_DIR, '..');
const REPO_ROOT = path.resolve(STORE_ROOT, '..', '..');
const SOURCE = path.join(REPO_ROOT, 'sidepanel', 'sidepanel.html');
const TARGET = path.join(STORE_ROOT, 'sources', 'sidepanel-demo.html');

const replacements = [
  ['href="sidepanel.css"', 'href="/sidepanel/sidepanel.css"'],
  ['src="../lib/i18n.js"', 'src="/lib/i18n.js"'],
  ['src="../lib/storage.js"', 'src="/lib/storage.js"'],
  ['src="sidepanel.js"', 'src="/sidepanel/sidepanel.js"']
];

const adapters =
  '\n  <script src="mock-chrome.js"></script>\n' +
  '  <script src="demo-storage-bridge.js"></script>\n';

let html = await readFile(SOURCE, 'utf8');
for (const [from, to] of replacements) {
  if (!html.includes(from)) throw new Error(`Expected pattern not found in ${SOURCE}: ${from}`);
  html = html.split(from).join(to);
}
if (!html.includes('<body')) throw new Error('No <body> tag found in sidepanel.html');
html = html.replace('<body>', '<body>' + adapters);
html = html.replace(
  '<!DOCTYPE html>',
  '<!DOCTYPE html>\n<!-- Generated demo harness: real ReMark side-panel markup; only resource paths and presentation adapters changed. -->'
);

await mkdir(path.dirname(TARGET), { recursive: true });
await writeFile(TARGET, html);
console.log('Wrote', TARGET);
