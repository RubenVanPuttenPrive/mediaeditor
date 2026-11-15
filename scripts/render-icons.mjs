// Renders public/icons/icon.svg to PNG app icons with Playwright's Chromium (run manually: node scripts/render-icons.mjs)
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
const svg = readFileSync('public/icons/icon.svg', 'utf8');
const maskable = svg.replace('rx="112"', 'rx="0"').replace(/(<svg[^>]*>)([\s\S]*)<\/svg>/, (_, open, body) =>
  `${open}<rect width="512" height="512" fill="#111318"/><g transform="translate(51 51) scale(0.8)">${body}</g></svg>`);
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, src, size] of [['icon-192', svg, 192], ['icon-512', svg, 512], ['icon-maskable-512', maskable, 512]]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}</style><img width="${size}" height="${size}" src="data:image/svg+xml,${encodeURIComponent(src)}">`);
  await page.screenshot({ path: `public/icons/${name}.png`, omitBackground: true });
}
await browser.close();
