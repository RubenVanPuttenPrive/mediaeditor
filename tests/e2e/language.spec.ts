import { test, expect } from '@playwright/test';

test.describe('follows the device language', () => {
  test.use({ locale: 'nl-NL' });

  test('Dutch browser gets Dutch UI; About can switch language; emoji search is localised', async ({ page }) => {
    await page.goto('');
    await expect(page.locator('html')).toHaveAttribute('lang', 'nl');
    await expect(page.getByRole('heading', { name: 'Begin met een video' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Exporteren' })).toBeVisible();

    // Emoji search with a Dutch word (and English still works).
    await page.getByRole('button', { name: 'Emoji', exact: true }).click();
    await page.getByRole('searchbox', { name: 'Emoji zoeken' }).fill('rood hart');
    await expect(page.locator('.emoji-btn').first()).toHaveAttribute('aria-label', /hart/i);
    await page.getByRole('searchbox', { name: 'Emoji zoeken' }).fill('red heart');
    await expect(page.locator('.emoji-btn').first()).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Sluiten' }).click();

    // Pick German in About; it sticks after a reload.
    await page.getByRole('button', { name: 'Over' }).click();
    await page.getByLabel('Taal').selectOption('de');
    await expect(page.getByRole('heading', { name: 'Über MediaEditor' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Beginne mit einem Video' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');

    // Back to automatic: follows the browser (Dutch) again.
    await page.getByRole('button', { name: 'Info' }).click();
    await page.getByLabel('Sprache').selectOption('auto');
    await expect(page.getByRole('heading', { name: 'Over MediaEditor' })).toBeVisible();
  });
});

for (const [locale, heading] of [['fr-FR', 'Commencez par une vidéo'], ['es-ES', 'Empieza con un vídeo'], ['pt-BR', 'Comece com um vídeo'],
  ['it-IT', 'Inizia con un video'], ['pl-PL', 'Zacznij od filmu'], ['de-DE', 'Beginne mit einem Video'], ['ja-JP', 'Start with a video']] as const) {
  test.describe(`locale ${locale}`, () => {
    test.use({ locale });
    test(`opens in the right language (${locale})`, async ({ page, isMobile }) => {
      test.skip(isMobile, 'one engine pass per language is enough');
      await page.goto('');
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    });
  });
}
