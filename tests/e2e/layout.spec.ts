import { test, expect, type Page } from '@playwright/test';
import { freshStart, importSample } from './helpers';

const box = (page: Page, sel: string) => page.locator(sel).first().evaluate((e) => {
  const r = e.getBoundingClientRect();
  return { left: r.left, right: r.right, width: r.width, top: r.top };
});

const SIZES = [
  { name: 'small phone', width: 320, height: 568 },
  { name: 'phone', width: 360, height: 740 },
  { name: 'phone landscape', width: 740, height: 360 },
  { name: 'tablet', width: 810, height: 1080 },
  { name: 'desktop', width: 1440, height: 900 },
];

test.describe('layout fits the screen', () => {
  test.skip(({ isMobile, browserName }) => isMobile || browserName !== 'chromium', 'viewport sizes are set explicitly here');

  for (const size of SIZES) {
    test(`${size.name} ${size.width}×${size.height}: no sideways overflow, video centred, timeline starts left`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await freshStart(page);
      await importSample(page);
      await page.waitForTimeout(300);

      const docWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(docWidth, 'page is never wider than the screen').toBeLessThanOrEqual(size.width);
      for (const sel of ['.topbar', '.stage', '.timeline', '.tools', '.export-btn']) {
        const b = await box(page, sel);
        expect(b.left, `${sel} starts on screen`).toBeGreaterThanOrEqual(0);
        expect(b.right, `${sel} ends on screen`).toBeLessThanOrEqual(size.width + 0.5);
      }

      // The video is centred in the area it sits in.
      const stage = await box(page, '.stage');
      const preview = await box(page, '.preview');
      const leftGap = preview.left - stage.left;
      const rightGap = stage.right - preview.right;
      expect(Math.abs(leftGap - rightGap), `centred (gaps ${leftGap}/${rightGap})`).toBeLessThanOrEqual(2);

      // The timeline starts at the left edge and the whole clip fits the width.
      const timeline = await box(page, '.timeline');
      const clip = await box(page, '.clip');
      expect(clip.left - timeline.left).toBeGreaterThan(10);
      expect(clip.left - timeline.left).toBeLessThan(40);
      expect(clip.right).toBeLessThanOrEqual(timeline.right);
      expect(clip.width / timeline.width).toBeGreaterThan(0.75);
    });
  }
});

test('timeline: tap to seek, zoom keeps the playhead on screen, Fit restores the whole video', async ({ page, isMobile }) => {
  test.skip(isMobile, 'pointer details are the same on all projects');
  await freshStart(page);
  await importSample(page);
  const timeline = await box(page, '.timeline');
  const clip = await box(page, '.clip');

  // Tap three quarters of the way along the clip: the playhead jumps to ~4.5 s.
  await page.mouse.click(clip.left + clip.width * 0.75, timeline.top + 10);
  await expect(page.locator('.timecode .now')).toHaveText(/0:04\.[3-6]/);
  const ph = await box(page, '.playhead');
  expect(Math.abs(ph.left + 1.5 - (clip.left + clip.width * 0.75))).toBeLessThan(4);

  // Zoom in a lot: the edit no longer fits, Fit becomes available, the playhead stays visible.
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect(page.getByRole('button', { name: 'Fit' })).toBeEnabled();
  const ph2 = await box(page, '.playhead');
  expect(ph2.left).toBeGreaterThanOrEqual(timeline.left);
  expect(ph2.left).toBeLessThanOrEqual(timeline.right);
  expect((await box(page, '.clip')).width).toBeGreaterThan(timeline.width * 1.5);

  // Stepping to the end scrolls the view along.
  await page.getByTestId('timeline').focus();
  await page.keyboard.press('End');
  const ph3 = await box(page, '.playhead');
  expect(ph3.left).toBeLessThanOrEqual(timeline.right);
  expect(ph3.left).toBeGreaterThanOrEqual(timeline.left);

  // Fit: the whole clip is back on screen, starting at the left edge.
  await page.getByRole('button', { name: 'Fit' }).click();
  const fitted = await box(page, '.clip');
  expect(fitted.left - timeline.left).toBeLessThan(40);
  expect(fitted.right).toBeLessThanOrEqual(timeline.right);
  await expect(page.getByRole('button', { name: 'Fit' })).toBeDisabled();
});
