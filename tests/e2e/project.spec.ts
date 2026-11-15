import { test, expect } from '@playwright/test';
import { exportAndDownload, freshStart, importSample, inspectMp4, seek } from './helpers';

test.describe('desktop-only checks', () => {
  test.skip(({ isMobile }) => isMobile, 'keyboard shortcuts and fallbacks are covered on desktop');

  test('keyboard shortcuts, undo/redo and autosave across reload', async ({ page }) => {
    await freshStart(page);
    await importSample(page);
    await seek(page, 2);
    await page.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => null);
    await page.keyboard.press('s');
    await expect(page.locator('.clip')).toHaveCount(2);
    await page.keyboard.press('ControlOrMeta+z');
    await expect(page.locator('.clip')).toHaveCount(1);
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect(page.locator('.clip')).toHaveCount(2);

    // Select the second clip and delete it.
    await page.locator('.clip .item-body').nth(1).click();
    await page.keyboard.press('Delete');
    await expect(page.locator('.clip')).toHaveCount(1);
    await expect(page.locator('.timecode .total')).toContainText('0:02.0');

    // Autosave survives a reload.
    await page.waitForTimeout(1200);
    await page.reload();
    await expect(page.locator('.clip')).toHaveCount(1);
    await expect(page.locator('.timecode .total')).toContainText('0:02.0');
  });

  test('ffmpeg.wasm fallback produces an MP4', async ({ page, browserName }, info) => {
    test.skip(browserName !== 'chromium', 'one engine is enough for the slow fallback');
    await freshStart(page, '?encoder=ffmpeg');
    await importSample(page);
    await page.getByRole('button', { name: 'Text' }).click();
    await page.getByLabel('Your text').fill('Hello');
    await page.getByRole('button', { name: 'Add text' }).click();
    const out = info.outputPath('ffmpeg.mp4');
    await exportAndDownload(page, '720p', out);
    const mp4 = await inspectMp4(out);
    expect(mp4.videoCodec).toBe('avc');
    expect(mp4.audioCodec).toBe('aac');
    expect(Math.abs(mp4.duration - 6)).toBeLessThan(0.15);
  });
});
