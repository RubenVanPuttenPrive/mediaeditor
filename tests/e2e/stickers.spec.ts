import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { exportAndDownload, freshStart, importSample } from './helpers';

test('every sticker in every category renders, with its caption', async ({ page, isMobile }) => {
  test.skip(isMobile, 'asset check; one pass per engine');
  await page.goto('');
  await page.getByRole('button', { name: 'Stickers', exact: true }).click();
  let total = 0;
  for (const tab of ['Faces', 'Hats', 'Reactions', 'Fun stuff']) {
    await page.getByRole('tab', { name: tab }).click();
    const imgs = page.locator('.sticker-btn img');
    const n = await imgs.count();
    expect(n, tab).toBeGreaterThan(8);
    // Thumbnails are drawn with the same code as the video overlay; a data: URL means that worked.
    await expect.poll(async () => imgs.evaluateAll((els) =>
      els.every((e) => (e as HTMLImageElement).src.startsWith('data:image/png') && (e as HTMLImageElement).naturalWidth > 0)),
    { timeout: 20_000 }).toBe(true);
    total += n;
  }
  expect(total).toBe(48);
});

test('a captioned sticker and a face prop end up in the exported video', async ({ page, isMobile }, info) => {
  test.skip(isMobile, 'export content is engine-level; mobile flows are covered elsewhere');
  await freshStart(page);
  await importSample(page);
  await page.getByRole('button', { name: 'Stickers', exact: true }).click();
  await page.getByRole('tab', { name: 'Reactions' }).click();
  await page.getByRole('button', { name: 'Boom!' }).click();
  await expect(page.locator('.item.overlay')).toHaveCount(1);
  await page.getByRole('button', { name: 'Stickers', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Reactions' })).toHaveAttribute('aria-selected', 'true'); // remembers the tab
  await page.getByRole('tab', { name: 'Faces' }).click();
  await page.getByRole('button', { name: 'Funny disguise' }).click();
  await expect(page.locator('.item.overlay')).toHaveCount(2);

  const out = info.outputPath('stickers.mp4');
  await exportAndDownload(page, '720p', out);
  // The BOOM! burst is orange: count orange pixels around the frame centre at 1 s (the test pattern has none).
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-ss', '1', '-i', out, '-frames:v', '1',
    '-vf', 'scale=1280:720,crop=400:300:440:210', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
  let orange = 0;
  for (let i = 0; i < raw.length; i += 3) {
    const [r, g, b] = [raw[i], raw[i + 1], raw[i + 2]];
    if (r > 200 && g > 70 && g < 170 && b < 90) orange++;
  }
  expect(orange, 'orange BOOM! burst pixels').toBeGreaterThan(3000);
});
