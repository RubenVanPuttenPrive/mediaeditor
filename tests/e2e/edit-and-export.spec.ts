import { test, expect } from '@playwright/test';
import { exportAndDownload, freshStart, importSample, inspectMp4, SAMPLE_SECONDS, seek } from './helpers';

test('import, split, add emoji, sticker and music, export a playable MP4', async ({ page }, info) => {
  await freshStart(page);
  await importSample(page);

  // Split at 3 s → two clips, same total length.
  await seek(page, 3);
  await page.getByRole('button', { name: 'Split' }).click();
  await expect(page.locator('.clip')).toHaveCount(2);
  await expect(page.locator('.timecode .total')).toContainText('0:06.0');

  // Two emoji (at 0 s and 3 s) and one sticker.
  await page.getByRole('button', { name: 'Emoji', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search emoji' }).fill('grinning face');
  await page.locator('.emoji-btn').first().click();
  await seek(page, 0);
  await page.getByTestId('timeline').focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowLeft');
  await page.getByRole('button', { name: 'Emoji', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search emoji' }).fill('party popper');
  await page.locator('.emoji-btn').first().click();
  await page.getByRole('button', { name: 'Stickers', exact: true }).click();
  await page.getByRole('button', { name: 'Heart' }).click();
  await expect(page.locator('.item.overlay')).toHaveCount(3);

  // Bundled music with a fade-out.
  await page.getByRole('button', { name: 'Music', exact: true }).click();
  await page.locator('.track-list li', { hasText: 'Sunny Loop' }).getByRole('button', { name: 'Add' }).click();
  await expect(page.locator('.item.music')).toHaveCount(1);
  await expect(page.getByLabel('Fade out')).toHaveValue('2');

  const out = info.outputPath('export.mp4');
  await exportAndDownload(page, '720p', out);
  const mp4 = await inspectMp4(out);
  expect(mp4.container).toBe('MP4');
  expect(mp4.videoCodec).toBe('avc');
  expect(mp4.audioCodec).toBe('aac');
  expect(mp4.audioChannels).toBe(2);
  expect(mp4.width * mp4.height).toBe(1280 * 720);
  expect(Math.abs(mp4.duration - SAMPLE_SECONDS)).toBeLessThan(0.15);
});
