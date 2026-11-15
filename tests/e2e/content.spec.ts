// Checks what is *in* the exported video, not just its container: overlays appear only at their set
// times, the music plays and fades out. Needs ffmpeg on PATH.
import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { exportAndDownload, freshStart, importSample, inspectMp4, SAMPLE, seek } from './helpers';

const hasFfmpeg = (() => {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

/** Mean RGB of a centred 120×120 crop of the frame at time t, after scaling to 1920×1080. */
function centreColour(file: string, t: number): number[] {
  const raw = execFileSync('ffmpeg', [
    '-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1',
    '-vf', 'scale=1920:1080,crop=120:120:900:480', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-',
  ]);
  const sum = [0, 0, 0];
  for (let i = 0; i < raw.length; i += 3) for (let c = 0; c < 3; c++) sum[c] += raw[i + c];
  return sum.map((s) => s / (raw.length / 3));
}

/** RMS level (0..1) of the audio between t0 and t1. */
function rms(file: string, t0: number, t1: number): number {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-ss', String(t0), '-t', String(t1 - t0), '-i', file, '-vn', '-ac', '1', '-ar', '48000', '-f', 'f32le', '-']);
  const f = new Float32Array(raw.buffer, raw.byteOffset, Math.floor(raw.length / 4));
  let s = 0;
  for (const v of f) s += v * v;
  return Math.sqrt(s / Math.max(1, f.length));
}

const diff = (a: number[], b: number[]) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / 3;

test('1080p export contains the overlays at their times, muted original, music with fade-out', async ({ page, isMobile }, info) => {
  test.skip(!hasFfmpeg, 'ffmpeg not installed');
  test.skip(isMobile, 'content is engine-independent; the mobile projects cover the flow itself');
  await freshStart(page);
  await importSample(page);

  // Mute the original sound so only music remains.
  await page.locator('.clip .item-body').first().click();
  await page.getByLabel('Mute original sound').check();

  // Emoji from 0–3 s, sticker from 3 s (both centred).
  await page.getByRole('button', { name: 'Emoji', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search emoji' }).fill('grinning face');
  await page.locator('.emoji-btn').first().click();
  await seek(page, 3);
  await page.getByRole('button', { name: 'Stickers' }).click();
  await page.getByRole('button', { name: 'Heart' }).click();
  await expect(page.locator('.item.overlay')).toHaveCount(2);
  // The sticker is selected after adding: shorten it to 3–4.5 s so nothing is shown at the end.
  await page.getByLabel('Duration').fill('1.5');

  await page.getByRole('button', { name: 'Music', exact: true }).click();
  await page.locator('.track-list li', { hasText: 'Night Drive' }).getByRole('button', { name: 'Add' }).click();
  await expect(page.locator('.item.music')).toHaveCount(1);

  const out = info.outputPath('content.mp4');
  await exportAndDownload(page, '1080p', out);
  const mp4 = await inspectMp4(out);
  expect([mp4.width, mp4.height]).toEqual([1920, 1080]);

  // Overlays: the centre differs from the source video exactly while an overlay is shown.
  for (const [t, overlay] of [[1, true], [2.5, true], [4, true], [5.5, false]] as const) {
    const d = diff(centreColour(out, t), centreColour(SAMPLE, t));
    expect.soft(d > 25, `overlay at ${t}s (diff ${d.toFixed(1)})`).toBe(overlay);
  }
  // The emoji (yellow) shows in the first half, the heart (red) in the second.
  const [r1, g1] = centreColour(out, 1);
  const [r2, g2] = centreColour(out, 4);
  expect(r1 > 180 && g1 > 150, `yellow emoji at 1 s (${r1.toFixed(0)},${g1.toFixed(0)})`).toBe(true);
  expect(r2 > 180 && g2 < 120, `red heart at 4 s (${r2.toFixed(0)},${g2.toFixed(0)})`).toBe(true);

  // Audio: music plays and fades out at the end (the original track is muted above).
  const middle = rms(out, 1, 3);
  const tail = rms(out, 5.85, 6);
  expect(middle, 'music audible').toBeGreaterThan(0.02);
  expect(tail, 'faded out').toBeLessThan(middle * 0.25);
});
