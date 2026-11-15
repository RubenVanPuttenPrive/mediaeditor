import { test, expect } from '@playwright/test';
import { freshStart, importSample } from './helpers';

test('remove overlays from the preview and the inspector, pick new music, start a new video', async ({ page }) => {
  await freshStart(page);
  await importSample(page);

  // Add two emoji and a sticker.
  for (const q of ['grinning face', 'party popper']) {
    await page.getByRole('button', { name: 'Emoji', exact: true }).click();
    await page.getByRole('searchbox', { name: 'Search emoji' }).fill(q);
    await page.locator('.emoji-btn').first().click();
  }
  await page.getByRole('button', { name: 'Stickers', exact: true }).click();
  await page.getByRole('button', { name: 'Heart' }).click();
  await expect(page.locator('.item.overlay')).toHaveCount(3);

  // The selected sticker has a delete button right on it in the preview.
  await page.getByTestId('overlay-delete').click();
  await expect(page.locator('.item.overlay')).toHaveCount(2);

  // Select an emoji on the timeline, remove it from the inspector.
  await page.locator('.item.overlay .item-body').first().click();
  await page.getByTestId('inspector-remove').click();
  await expect(page.locator('.item.overlay')).toHaveCount(1);

  // Undo brings it back.
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.item.overlay')).toHaveCount(2);

  // "Remove all" clears every overlay.
  await page.locator('.item.overlay .item-body').first().click();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Remove all emoji, stickers and text' }).click();
  await expect(page.locator('.item.overlay')).toHaveCount(0);

  // Ten bundled tracks, each with a style label; add one of the new ones.
  await page.getByRole('button', { name: 'Music', exact: true }).click();
  await expect(page.locator('.track-list li')).toHaveCount(10);
  await expect(page.locator('.track-list li', { hasText: 'Retro Arcade' })).toContainText('chiptune');
  await page.locator('.track-list li', { hasText: 'Retro Arcade' }).getByRole('button', { name: 'Add' }).click();
  await expect(page.locator('.item.music')).toContainText('Retro Arcade');

  // New video: confirm, and the editor is empty again (and stays empty after a reload).
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'New video' }).click();
  await expect(page.locator('.empty-state')).toBeVisible();
  await expect(page.locator('.clip, .item.music, .item.overlay')).toHaveCount(0);
  await page.waitForTimeout(800);
  await page.reload();
  await expect(page.locator('.empty-state')).toBeVisible();
});

test('every bundled music track loads and decodes', async ({ page, isMobile }) => {
  test.skip(isMobile, 'asset check, one run per engine is enough');
  await page.goto('');
  const results = await page.evaluate(async () => {
    const ids = ['sunny-loop', 'tropical-sunset', 'funky-groove', 'rock-drive', 'retro-arcade', 'night-drive',
      'lofi-steps', 'acoustic-morning', 'piano-reflections', 'cinematic-rise'];
    const ctx = new OfflineAudioContext(2, 1, 44100);
    const out: Record<string, number> = {};
    for (const id of ids) {
      const buf = await (await fetch(`music/${id}.mp3`)).arrayBuffer();
      out[id] = (await ctx.decodeAudioData(buf)).duration;
    }
    return out;
  });
  for (const [id, seconds] of Object.entries(results)) expect(seconds, id).toBeGreaterThan(60);
});
